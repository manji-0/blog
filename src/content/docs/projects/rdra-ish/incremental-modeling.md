---
title: "段階的モデリング"
description: "rdra-ish の Stage 0–7 モデリングフロー"
sidebar:
  order: 3
---

このページは、Stage 0–7で要件モデルを段階的に精緻化する手順です。各段階のあと `check` やdiagramでレビューします。実践ウォークスルーは [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) へ。

## 原則

- 早期段階はビジネス言語（価値ストリーム、アクター、ユーザー可視の仕事）に近い
- 後半段階でデータ、UI/API境界、アクセス、永続化構造、ライフサイクル、ルールを追加
- **warning** はレビュー信号（探索中は意図的に残してよい）
- **error** はモデル信頼性を損なうためブロッカー
- `--buc` フィルタで1スライスだけ検証できる

## Stage一覧

| Stage | 関心 | 主な追加 | あとで確認すること |
|---|---|---|---|
| **0** | スコープ | `business`、候補 `buc`、候補 `actor`、`belongs` | スライスの切り方 |
| **1** | BUC 骨格 | `usecase`、`performs`、`contains`（順序が要るなら `flow` / `step`） | アクターとUCがBUCに束ねられているか |
| **2** | 画面 | `screen`、`displays`、`navigates` | UCごとにアクターが見る画面（`diagram --kind screen`） |
| **3** | データ接点 | 粗い `entity`、CRUD 述語、`shows` | UCごとにCRUDが説明可能か（`csv --kind matrix`） |
| **4** | API・アクセス境界 | 必要なら `api` / `invokes`、`system`、`permission`、`medium`、`has_permission`、`requires_*` | API/権限のギャップ（`csv --kind screen-constraints`、`csv --kind actor-permission-audit`） |
| **5** | エンティティ構造 | カラム詳細、`relate(..., N:1)`、カーディナリティ、`coordinates` | ER整合、外部キー、所有関係 |
| **6** | ライフサイクル | Enum / Bool / `@null` 列、`transitions(UC, Entity.col, …)`、`sets`、`event`、`raises`、`triggers`、`timer` | 到達不能状態、未消費イベント（`states`, `diagram --kind state`, `diagram --kind event`） |
| **7A** | ルール（任意） | `forbidden` / `exclusive` | 同時に成り立ってはいけない状態（`states`） |
| **7B** | ルール（任意） | `invariant`、`required` | 状態が要求する事実（`states`） |
| **7C** | ルール（任意） | 比較式、マルチエンティティの `forbidden` / `invariant` | `check` と `states` で確かめる |

必須はStage 0–6です。Stage 7A–7Cは任意で、ライフサイクルまで書いてルールがないBUCも完了扱いです。

各段階のあと実行する検証例：

```bash
rdra-ish check src/
rdra-ish next src/
rdra-ish lint src/
rdra-ish diagram src/ --kind rdra --format mermaid --buc <BucId>
```

Stage 2以降は `--kind screen`、Stage 6以降は `--kind state` や `--kind event` も有効です。

## 現在のStageを調べる

v0.4.0で追加された `rdra-ish next` は、各BUCがどのStageまで進んだかを判定します。次のStageについて、主な問い、ギャップ（足りない要素）、ユーザーに聞く質問、検証コマンドを表示します。

```bash
rdra-ish next src/
rdra-ish next src/ --buc BucOrder
```

BUCごとに進み具合が違ってかまいません。1つのBUCを1段階進めるたびに `next` を実行し、残りと次の問いを確認します。gateを満たすのは要素がそろったという意味で、次へ進むかはレビューで決めます。

## ディレクトリ配置

```text
src/
  shared/
    actors.rdra      # module shared.actors
    biz.rdra         # module shared.biz
    entities.rdra    # module shared.entities
  buc/
    buc_<name>.rdra  # module buc.<name>
```

### 配置ルール

| 要素 | 置き場所 |
|---|---|
| `actor`, `extsystem` | `shared/actors.rdra` |
| `business`, 安定した `requirement`, 再利用する `timer` / `medium` / `permission` | `shared/biz.rdra` 等 |
| `entity`, `relate`, 共有 lifecycle イベント | `shared/entities.rdra` |
| `buc`, `usecase`, `screen`, BUCローカル `api` / イベント | `buc/buc_<name>.rdra` |
| BUC固有の述語（CRUD, `displays`, `invokes`, アクセス制約, `raises`, `sets` 等） | そのBUCファイル（sharedに置かない） |
| クロスBUC `event`, `transitions` | 所有エンティティ近くの shared |
| 制約述語（`forbidden`, `invariant`, `required`, `exclusive`） | 制約するエンティティ近くの shared |
| UCを名指す `condition` / `property`（`applies_to(Cond, UseCase)`、`.fair(UseCase)`） | そのUCのBUCファイル（`holds` 本体ごと）。`shared/rules.rdra` に置くと循環importになる |

成長したら `shared/entities/order.rdra`、`shared/lifecycle/`、`shared/rules.rdra` へ分割します。

## BUCとフローとUC

1. **BUC** — いまどの価値スライスをレビューするかを決める
2. **ビジネスフロー** — `flow` / `step` / `precedes` で時間順・分岐
3. **UC** —「注文する」のような **一つの操作**。混ざったら分割

BUCは **ビジネス価値** から名付けます。

## サンプル

`samples/incremental-order/` にStage 0から7まで、8段階で増やした成果物があります。diffしながら各段階の追加量を確認できます。要求分析からルールまでの読み物としてのウォークスルーは [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) です。

## 次に読む

- [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
