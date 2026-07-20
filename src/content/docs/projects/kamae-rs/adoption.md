---
title: "段階的導入"
sidebar:
  order: 10
---

レガシー Rustコードベースを一括置換すると、境界・エラー・永続化の穴が同時に広がる。Kamaeでは触れたワークフローごとに、DTOパース → 型付き状態 → ポート分離 → 原子性永続化の順で段階的に締める。

各段の詳細は [境界防御](/projects/kamae-rs/boundary-defense/)、[ドメインモデリング](/projects/kamae-rs/domain-modeling/)、[アプリケーション配線](/projects/kamae-rs/application-wiring/) を参照する。

## 基本方針

Kamaeはまず新しいコードパスに適用する。既存コードは、機能追加やバグ修正で触る箇所から段階的に引き締める。ドメイン全体の書き直しでリリースを止めない。

レガシーな慣習と衝突する場合、触っていないコードはローカルな慣習に従い、新旧の境界では新しい境界を明示的に文書化する。

## レガシーな形を認識する

Rustサーバーコードベースでよくある出発点：

- 貧血モデル（anemic struct）とfree functionやserviceモジュール
- ORMの行型をドメインエンティティとして使う
- newtypeの代わりに `String` のIDやstatus文字列
- ビジネスロジック中の `anyhow` や `unwrap`
- ハンドラがSQLやHTTPを直接呼ぶ

これらは移行の出発点であり、失敗ではない。次に起きそうなバグを取り除く最小の変更を選ぶ。

## 導入ラダー

一度に一段ずつ進める。各ステップは単独でレビューできること。

| Step | 変更 | 典型的な触りどころ | リスク |
| --- | --- | --- | --- |
| 0. 境界のみ | DTO/row -> 新エンドポイントやコンシューマ向け `TryFrom` | handlers, message consumers | 低 |
| 1. ID と値オブジェクト | `RequestId`, `Money`, `OccurredAt` などの newtype | 変更フローで使う models | 低 |
| 2. ドメインエラー | 新ユースケースでの `thiserror` enum | application layer | 低 |
| 3. 型付き状態 | 重要な集約 1 つ分の state struct/enum | その集約の domain module | 中 |
| 4. ポート | 新ユースケースの背後に小さな repository trait | application + infrastructure | 中 |
| 5. トランザクションとバージョン | 原子的 save、outbox、楽観的バージョンチェック | persistence adapter | 中〜高 |

コードベースがすでに満たしているステップだけスキップする。

## クレート全体ではなく機能で絞り込む（Strangler Fig）

レガシーモジュールに対して：

1. 変更したワークフロー用に新しいuse-case structを追加する。
2. 新パスが実証されるまで、旧エントリポイントはレガシーコードを呼び続ける。
3. 新APIバージョン、フラグ、コマンドを新ユースケースへルーティングする。
4. パリティテストが通ったら旧パスを削除する。

```text
legacy handler -> legacy service -> DB
new handler    -> AssignDriver use case -> port -> adapter -> DB
```

移行スライスは集約1つ、またはエンドポイント1つを優先する。

## レガシー移行の段階的ロードマップ

例：axum + sqlxのモノリスサービスで `POST /requests/{id}/assign` を移行する。Phaseは完了条件の並びであり、カレンダー週ではない。

### Phase 1 — 挙動を固定し、テストを追加

1. 統合テストで現行HTTP契約を記録する（ステータスコード、JSON形状）。
2. レガシーパス周辺にlogging/metricsを追加し、トラフィックを計測する。
3. まだ挙動は変えない。

### Phase 2 — 境界 DTO

1. `api` モジュールに `AssignDriverBody` と `AssignDriverDto` を導入する。
2. ハンドラの直接フィールドアクセスを `AssignDriverCommand::try_from(dto)` に置き換える。
3. レガシーサービスはまだ文字列を受け取る。検証は `TryFrom` に移る。
4. 同じルートのまま出荷する。テストは緑のまま。

[境界防御](/projects/kamae-rs/boundary-defense/) を参照。

### Phase 3 — 触った ID の newtype

1. `domain` crateまたはmoduleに `RequestId`, `DriverId` newtypeを追加する。
2. `TryFrom` をnewtype構築に変更する。レガシーサービスは境界で `.as_str()` を受け取る。
3. 新しい `domain` モジュールだけに追加clippyを有効化する。

[ドメインモデリング](/projects/kamae-rs/domain-modeling/) を参照。

### Phase 4 — ユースケース抽出

1. レガシー SQLをprivateメソッドにインラインした `AssignDriverUseCase` を作成する。
2. ハンドラは `use_case.execute(cmd)` のみ呼ぶ。
3. このパスの `anyhow` を `AssignDriverError`（`thiserror`）に置き換える。

[エラーハンドリング](/projects/kamae-rs/error-handling/) を参照。

### Phase 5 — 1 集約の型付き状態

1. `WaitingRequest` と `EnRouteRequest` をモデル化し、割当ロジックを `WaitingRequest::assign_driver(self, ...)` に移す。
2. DBのレガシー `status: String` は残す。adapterがrow <-> state structをマップする。
3. HTTPなしで遷移の単体テストを追加する。

[状態遷移](/projects/kamae-rs/state-transitions/) を参照。

### Phase 6 — リポジトリポート

1. `RequestResolver` と `RequestStore` traitを定義する。
2. ユースケースからSQLを `SqlxRequestStore` に移す。
3. ユースケースはtraitのみに依存する。`main` で配線する。

[永続化、集約、イベント](/projects/kamae-rs/persistence-events/) と [アプリケーション配線](/projects/kamae-rs/application-wiring/) を参照。

### Phase 7 — トランザクション、バージョン、outbox

1. `version` 列と条件付き `UPDATE` を追加する。
2. state saveとoutbox insertを1トランザクションに包む。
3. リトライクライアント向けにidempotency keyを追加する。

[永続化、集約、イベント](/projects/kamae-rs/persistence-events/) を参照。

### Phase 8 — レガシーパス削除

1. feature flagまたはルートトラフィックが新パス100% であることを確認する。
2. レガシーサービス関数と死んだ `status` 文字列チェックを削除する。
3. 移行モジュールに `kamae-rs-review` を実行する。

ペースはチーム規模に合わせて調整する。可能なら各フェーズを独立PRにする。

## 差分をレビュー可能に保つ

チーム展開の実践ルール：

- 避けられる限り、機械的リファクタと挙動変更を1 PRに混ぜない。
- 旧パスを削除する前に、新境界にテストを追加する。
- 触ったフィールドだけnewtypeとDTO変換を導入し、後で広げる。
- 強化するcrateまたはmoduleで追加clippy/rustdocチェックを有効化する。
- 新旧の意味論が異なる場合のみ、短いコメントまたはADRを残す。

## ラダーを登り止めるタイミング

すべてのstructにstate machineやrepository traitは不要。次の場合は現段階で止める：

- コードが安定し、低リスクで、めったに変わらない
- 集約に意味のあるライフサイクルや不変条件がない
- チームがpersistenceや並行性の挙動をまだ十分にテストできない

バグ、コンプライアンス要件、並行性が現状の形では弱すぎると示したら、一段上げる。

## エージェントとレビュアーの期待

移行時：

- スコープ判断に [段階的導入](/projects/kamae-rs/adoption/) を読み込む
- 実装する段のトピックガイドを読み込む
- 周囲がレガシーでも、変更パスに `kamae-rs-review` を使う
- crate全体が移行済みのふりをせず、残るレガシーリスクを明示する
