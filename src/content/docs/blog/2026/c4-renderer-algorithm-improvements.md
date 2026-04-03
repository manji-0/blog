---
title: C4レンダラ改善録 — 初版からの6つのアルゴリズム改善
description: 自作 C4 レンダラの初版実装から現行版への改善点を整理する
sidebar:
  order: 1
---

[前回の記事](/blog/2026/c4-diagram-render-algo/)では、Docattice に組み込んだ自作 C4 レンダラの設計と実装について、Sugiyama framework から VLSI 配線技術の転用まで一通り書いた。あの記事を公開してからもレンダラには手を入れ続けており、いくつかのアルゴリズム改善が積み重なったので、ここで整理しておく。

前回の記事を読んでいることを前提とするが、改善ごとに「何が問題だったか」「どう変えたか」を書いているので、これ単体でもそれなりに読めるはず。

## 改善の全体像

改善は大きく6つに分類できる。

| # | 改善 | 対象フェーズ | 概要 |
|---|------|------------|------|
| 1 | 全体 2 パスレイアウト | Place 〜 Route | Gap budgeting をフルレイアウト比較に昇格 |
| 2 | Corridor Hints | Optimize | 交差パターンから緩和ヒントを生成 |
| 3 | Relaxation パラメータ強化 | Optimize | イテレーション数・シフト量・ダンピングの調整 |
| 4 | Route Scoring の精緻化 | Route | Dual score + ピア近接・偏差ペナルティ導入 |
| 5 | 先読み修復付きラベル配置 | Label | 2-step lookahead による iterative repair |
| 6 | 形式的検証フレームワーク | 全体 | Hard/Soft 制約の階層的品質比較 |

以下、それぞれを詳しく見ていく。

## 1. 全体 2 パスレイアウト — Gap Budgeting の昇格

### 初版の問題

前回の記事では、Gap Budgeting を「推定→配線→回収」の 2 パスで解決すると書いた。Pass 1 で relation 密度と label サイズの見積もりから gap を確保し、Pass 2 で配線・ラベル配置後に未使用 gap を回収する、という構成だった。

```rust
// 初版: 単一レイアウト内の 2-pass gap budgeting
let gaps = estimate_gap_budget(&row, &relations, &node_sizes);
// ... routing + label placement ...
compact_gaps(&mut gaps, &row, &occupied_corridors);
```

これは概念としては正しいのだが、実際に運用すると「gap を回収した結果、ノード位置が変わり、routing の前提が崩れる」ケースが出てきた。gap の回収は局所的な圧縮であり、ノード間の相対位置を含む全体最適には至らない。

### 現行の設計

現行実装では、gap budgeting を **フルレイアウトの 2 パス比較**に昇格させた。

```rust
// Pass 1: デフォルト gap でフルレイアウト
let initial_scene = layout_c4_scene(
    &root_children, &nodes, &relations,
    &HashMap::new(), // gap override なし
);

// 初回レイアウト結果から gap 圧縮の余地を導出
let gap_overrides = derive_c4_gap_overrides(
    &root_children, &nodes, &relations,
    &initial_scene.layouts,
    &initial_scene.relation_work_items,
);

// Pass 2: 圧縮 gap でフルレイアウト（圧縮余地がある場合のみ）
let compact_scene = (!gap_overrides.is_empty())
    .then(|| layout_c4_scene(
        &root_children, &nodes, &relations, &gap_overrides
    ));

// 階層的品質比較で良い方を採用
if c4_scene_is_better_candidate(&compact, &initial, ...) {
    compact
} else {
    initial
}
```

ポイントは、gap を縮めた結果を **routing・label 配置・検証まで含めたフルパイプライン**で評価し、初回レイアウトと比較するところにある。gap 回収の副作用で routing が壊れるなら、初回レイアウトがそのまま採用される。

### 採用基準

2 つのレイアウト候補の比較は、以下の階層的な基準で行う。

```
1. hard constraint 違反数（少ない方が勝ち）
2. soft penalty 合計（小さい方が勝ち）
3. soft constraint 数（少ない方が勝ち）
4. ラベル配置数（多い方が勝ち）
5. ルート品質（detour・bend・soft penalty の総合）
6. キャンバス幅（狭い方が勝ち、ただし差 0.1 以内は同等）
```

上位の基準で差がつけばそこで決定する。つまり、gap を圧縮して図が狭くなっても、hard constraint 違反が増えるなら採用しない。

## 2. Corridor Hints — 交差パターンからの緩和ヒント

### 初版の問題

前回の記事では、crossing minimization を barycenter + adjacent swap で行い、その後の row relaxation で weighted median により x 座標を微調整すると書いた。この 2 段構成は悪くないのだが、crossing minimization と relaxation の間に情報の断絶がある。crossing minimization が「この 2 ノードの順序を入れ替えると交差が減る」と判断しても、relaxation はその情報を知らずに独自の最適化を行う。

### Corridor Hints の導入

現行実装では、crossing minimization の過程で得られた知見を **corridor hint** として relaxation に渡す仕組みを導入した。

```rust
#[derive(Clone, Debug)]
struct C4CorridorHint {
    relation_index: usize,          // ヒントの根拠となった relation
    row_rank: usize,                // ヒントが適用される行
    column_ratio: f32,              // 隣接ノード間での理想位置比（0.0〜1.0）
    neighbor_left: Option<String>,  // 左隣ノード
    neighbor_right: Option<String>, // 右隣ノード
}
```

ヒント生成は crossing minimization と統合されている。

```rust
let corridor_hints = optimize_row_order_with_corridor_hints(
    &mut rows, &x_ranks, &inter_row_relations, 4  // max 4 sweeps
);
```

### Relaxation での利用

Corridor hints は relaxation phase で **soft attractor** として機能する。

```rust
relax_row_positions_with_corridor_hints(
    &layout,
    &mut positions,
    &relations,
    &corridor_hints,
    RowRelaxationConfig {
        base_anchor_weight: 1.4,
        corridor_hint_weight: 0.45,
        max_shift_x: 112.0,
        iterations: 8,
        blend: 0.6,
    },
)
```

各ノードの位置更新時に、corridor hint が示す「理想位置」を weighted median の入力に追加する。重みは以下のルールで決まる。

- ヒントの隣接ノード自身: participation weight = **1.0**
- ヒントの span 内にある他のノード: participation weight = **0.55**
- 最終 weight = `relation_weight × corridor_hint_weight(0.45) × participation_weight`

つまり corridor hint は anchor weight (1.4) より弱い力で位置を引っ張る。crossing 改善のために位置を動かしたいが、強すぎると relation 長の最小化を損なう。この重みバランスは実験的に調整した。

## 3. Relaxation パラメータの強化

前回の記事では以下の値を使っていた。

| パラメータ | 初版 | 現行 | 変更理由 |
|-----------|------|------|---------|
| iterations | 5 | 8 | Corridor hints の伝播に追加イテレーションが必要 |
| max_shift_x | 40.0 | 112.0 | Boundary 内部の大きなノードに対応するため緩和 |
| blend | (なし) | 0.6 | ダンピングなしだと振動が発生するケースがあった |
| anchor_weight | (暗黙 0.5) | 1.4 | Corridor hints との重みバランスのため明示化・増加 |

特に **blend factor** の導入が効いている。初版では weighted median の結果をそのまま新しい位置として採用していた。これは収束が速い反面、2 ノードが互いに引き合うケースで振動が起きることがあった。現行では `new_pos = 0.6 × median + 0.4 × old_pos` というダンピングを入れることで、振動を抑えつつ 8 イテレーションで安定的に収束する。

## 4. Route Scoring の精緻化

### 初版のスコア

前回の記事では、route のスコアを以下のように定義していた。

```rust
// 初版
fn route_score(polyline: &Polyline) -> f64 {
    let length = polyline.total_length();
    let bends = polyline.bend_count() as f64;
    let label_penalty = estimate_label_penalty(polyline);
    length + bends * BEND_PENALTY + label_penalty * LABEL_PENALTY_WEIGHT
}
```

スカラー 1 つで route の良し悪しを判定する設計だった。

### Dual Score の導入

現行実装では、route のスコアを **repair_score** と **soft_penalty** の 2 値に分離した。

```rust
fn score_c4_routed_candidate(
    ctx: &C4RoutingContext<'_>,
    routed: &C4RoutedRelation,
) -> Option<(f32, f32)> {
    // repair_score: route 自体の幾何学的品質 + ラベル配置品質
    let repair_candidate = best_c4_route_label_repair_candidate(
        ctx.relation, routed, ctx.display_label,
        &label_env, ctx.occupied_label_rects, ctx.occupied_segments,
    );

    // soft_penalty: 周辺環境との干渉
    let assessment = assess_c4_route_candidate(ctx, &routed.points);
    let corridor_penalty = relation_route_corridor_hint_penalty(
        ctx, &routed.points
    );

    // hard constraint 違反があれば候補自体を棄却
    (assessment.hard_issue_count == 0).then_some((
        repair_candidate.score,
        assessment.soft_penalty + corridor_penalty,
    ))
}
```

repair_score は route 自体の品質（経路長 + bend 数 × 28.0 + ラベル配置ペナルティ）を表す。soft_penalty は周辺環境との干渉（obstacle 干渉 + corridor hint 違反）を表す。

この分離により、「route としては悪くないが環境が混雑している」ケースと「route 自体の形が悪い」ケースを区別できるようになった。

### ピア近接ペナルティ

同じソースノードから複数の relation が出る場合、stub（ノードからの引き出し線）が近接するとビジュアルが崩れる。現行実装では **18px** のクリアランスを確保するペナルティを導入した。

```
penalty = 0.0                          (gap ≥ 18.0 のとき)
penalty = 96.0 + (18.0 - gap) × 4.0   (gap < 18.0 のとき)
```

96.0 という不連続なジャンプは、18px 未満のクリアランスを強く忌避するための設計判断である。

### 偏差ペナルティ

同一ソースから複数の relation が扇状に出るとき、「ordered axis」（均等配分した理想軸）からの偏差にペナルティを課す。

```
penalty = |actual_axis - ordered_axis| × 1.8
```

これにより、同一ノードからの fanout が視覚的に整列する。

## 5. 先読み修復付きラベル配置

### 初版のアプローチ

前回の記事では、ラベル配置の失敗に対する修復を 3 段階で行うと書いた。

1. Relation priority 順に route を greedy に確定し、仮の label placement を試す
2. 全 route が出揃った後、label candidate を全 relation について再計算し、conflict-aware に詰め直す
3. 未配置の relation だけを取り出し、local reroute repair を試す

この設計自体は維持しているが、段階 2 のアルゴリズムが大きく変わった。

### Priority Queue による Global Assignment

現行のラベル配置は、まず全 relation のラベル候補を列挙し、**候補数の少ない relation から先に配置する**戦略を取る。

```rust
// 候補数昇順 → スコア昇順 → priority 降順でソート
pending.sort_by(|left, right|
    compare_assignment_priority(&left.priority, &right.priority)
);

// Greedy assignment: 配置済み rect との衝突を避けつつ順に割り当て
let mut assigned_rects = Vec::<C4Rect>::new();
for item in pending {
    let candidate = select_c4_relation_label_candidate(
        item.candidates, &assigned_rects
    );
    if let Some(c) = candidate {
        assigned_rects.push(c.placement.rect);
        assigned.insert(item.relation_index, c.placement);
    }
}
```

候補数が少ない relation は配置の自由度が低いため、先に確定させる方が全体の配置率が上がる。これは制約充足問題における **most constrained variable** ヒューリスティックの応用である。

### 2-Step Lookahead Repair

Global assignment の後、未配置のラベルに対して **iterative repair** を行う。ここが初版から最も変わった部分である。

```rust
fn run_c4_repair_iteration(
    relation_work_items: &mut Vec<C4RelationWorkItem>,
    assigned_labels: &mut HashMap<usize, C4RelationLabelPlacement>,
    env: &C4RepairEnvironment<'_>,
) -> bool {
    // 1. 修復候補を収集
    let mut first_step_candidates = collect_c4_repair_iteration_candidates(
        relation_work_items, assigned_labels, env
    );

    let Some(mut best_candidate) = first_step_candidates.first().cloned()
    else { return false; };

    // 2. 上位候補に対して 2 手先を読む
    for candidate in first_step_candidates.drain(..).take(C4_REPAIR_LOOKAHEAD_WIDTH) {
        let second_step_candidates = collect_c4_repair_iteration_candidates(
            &candidate.relation_work_items,
            &candidate.assigned_labels,
            env,
        );
        if let Some(second_step_best) = second_step_candidates.into_iter().next() {
            if compare_c4_repair_state_summary(
                second_step_best.summary, best_candidate.summary
            ) == std::cmp::Ordering::Less {
                best_candidate = second_step_best;
            }
        }
    }

    // 3. 最良の 2 手先状態を採用
    *relation_work_items = best_candidate.relation_work_items;
    *assigned_labels = best_candidate.assigned_labels;
    true
}
```

`C4_REPAIR_LOOKAHEAD_WIDTH = 3` で、上位 3 候補に対して 1 手先の最善手を評価する。これは前回の記事で書いた「label が付かなかった relation だけを local reroute する」アプローチに比べて、**reroute の副作用を評価してから採用する**点で改善されている。

修復の状態は以下の 3 値で評価する。

```rust
struct C4RepairStateSummary {
    unlabeled_count: usize,   // 未配置ラベル数
    total_penalty: f32,       // ペナルティ合計
    total_route_cost: f32,    // ルートコスト合計
}
```

修復イテレーションは改善がなくなるまで（最大で relation 数回）繰り返す。最後に全 relation のラベルを再度 global assignment する。この「修復→再割り当て」のループにより、1 つの relation の reroute が他の relation のラベル配置を改善するような間接的効果も拾える。

## 6. 形式的検証フレームワーク

### 初版の問題

前回の記事では、検証について明示的には書いていなかった。実際のところ、初版には体系的な検証がなく、ビジュアルな確認に頼っていた。

### Hard/Soft 制約体系

現行実装では、12 種類の検証 issue を定義し、それぞれを hard constraint と soft constraint に分類している。

**Hard constraints（違反は許容しない）:**

| Issue | 内容 |
|-------|------|
| `MissingRoute` | ルートが見つからない |
| `RouteCrossesNodeBody` | ルートがノード本体を横切る |
| `RouteCrossesBoundaryHeader` | ルートが boundary ヘッダを横切る |
| `RouteLeavesAllowedRegion` | ルートが許容領域外に出る |
| `PortDirectionMismatch` | 接続面の方向が不正 |
| `ArrowHeadDirectionMismatch` | 矢印の向きが不正 |
| `LabelOverlapsHardObstacle` | ラベルがノード/boundary に重なる |
| `LabelLeavesAllowedRegion` | ラベルが許容領域外に出る |
| `LabelCrossesForeignRoute` | ラベルが他の relation のルートに重なる |
| `ScopeTransitionMismatch` | Boundary 跨ぎの整合性不正 |

**Soft constraints（ペナルティで評価）:**

| Issue | ペナルティ | 内容 |
|-------|----------|------|
| `LabelOverlapsSoftObstacle` | 120.0 | ラベルが他のルートに近すぎる |
| `DetourTooLarge` | 96.0 | 迂回が大きすぎる |

### ルート品質サマリ

検証フレームワークは個々の issue だけでなく、レイアウト全体のルート品質をサマリとして集計する。

```rust
struct C4RouteQualitySummary {
    unroutable_count: usize,   // ルーティング失敗数
    total_detour: f32,         // 迂回量合計（実経路長 − マンハッタン距離）
    total_bends: usize,        // 屈曲数合計
    total_soft_penalty: f32,   // soft penalty 合計
}
```

このサマリが前述の 2 パスレイアウト比較や、repair の状態評価で使われる。初版では「見た目がきれいか」という暗黙的な基準だったものが、定量的な比較基準になった。

## 定数の変遷

改善に伴い、レイアウト定数もかなり変わっている。主要なものを整理しておく。

| 定数 | 初版 | 現行 | 備考 |
|------|------|------|------|
| `ROW_GAP` | (未記載) | 116.0 | 行間の垂直スペース |
| `COL_GAP` | `COL_GAP_BASE` | 30.0 | 列間の基本水平 gap |
| `MAX_RELAX_SHIFT_X` | 40.0 | 112.0 | 緩和の最大シフト量 |
| `RELAX_ITERATIONS` | 5 | 8 | 緩和イテレーション数 |
| `BEND_PENALTY` | (未記載) | 28.0 | 屈曲 1 回あたりのコスト |
| `C4_ROW_LANE_PITCH` | — | 34.0 | マルチレーンルーティングのピッチ |
| `CONTAINER_PADDING_X` | 20.0 | 24.0 | Boundary 水平パディング |
| `CONTAINER_PADDING_Y` | 20.0 | 22.0 | Boundary 垂直パディング |
| `CONTAINER_HEADER_H` | 30.0 | 62.0 | Boundary ヘッダ高さ（大幅増） |
| `C4_REPAIR_LOOKAHEAD_WIDTH` | — | 3 | 修復の先読み幅 |

`CONTAINER_HEADER_H` が 30 → 62 に倍増しているのは、boundary ラベルのテキスト表示を改善した結果である。

## まとめ

### やったこと

- Gap budgeting を単一パイプライン内の局所操作からフルレイアウト比較に昇格させ、gap 圧縮の副作用を検出可能にした
- Crossing minimization の知見を corridor hints として relaxation に渡し、フェーズ間の情報断絶を解消した
- Relaxation に blend factor を導入し、振動を抑制しつつ収束速度を維持した
- Route scoring を dual score に分離し、route の幾何学的品質と環境干渉を独立に評価できるようにした
- ラベル配置に 2-step lookahead repair を導入し、reroute の副作用を評価してから採用するようにした
- 12 種類の検証 issue を hard/soft に分類し、レイアウト品質を定量的に比較可能にした

### 思ったこと

1. **2 パスレイアウトは意外と安い。** C4 図の規模（10〜50 ノード）なら、フルパイプラインを 2 回走らせても体感できるほどの遅延はない。「まず解いてみて、結果を見て調整する」というアプローチは、推定精度を上げるよりも堅実だった。
2. **フェーズ間の情報伝達は重要。** Corridor hints の導入前は、crossing minimization がせっかく見つけた改善を relaxation が台無しにすることがあった。異なるフェーズが同じ目的関数の異なる側面を最適化している以上、知見の共有は自然な改善方向である。
3. **Lookahead は効果的だが、幅 3 で十分。** 修復の先読み幅を 3 から 5 に増やしても、改善はほぼなかった。C4 図の規模では、局所的な修復の波及効果は 2 手先でほぼ収束する。
4. **検証フレームワークは改善のインフラ。** 定量的な品質基準がなければ、「この変更で良くなったか」を判断できない。検証フレームワークを先に整備したことで、その後の改善サイクルが速くなった。これはソフトウェアテストと同じ構造である。
