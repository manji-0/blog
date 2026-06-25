---
title: "段階的導入"
sidebar:
  order: 10
---

レガシー Scala コードベースを一括置換すると、境界・エラー・永続化の穴が同時に広がる。Kamae では触れたワークフローごとに、DTO パース → 型付き状態 → ポート分離 → 原子性永続化の順で段階的に締める。

各段の詳細は [境界防御](/docs/kamae-scala/boundary-defense/)、[アプリケーション配線](/docs/kamae-scala/application-wiring/)、[ORM アダプタ](/docs/kamae-scala/orm-adapters/) を参照する。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./application-wiring.md -->
<!-- constrained-by ./orm-adapters.md -->

## 基本方針

Kamae はまず新しいコードパスに適用する。既存コードは、機能追加やバグ修正で触る箇所から段階的に引き締める。ドメイン全体の書き直しでリリースを止めない。

レガシーな慣習と衝突する場合、触っていないコードはローカルな慣習に従い、新旧の境界では新しい境界を明示的に文書化する。

## レガシーな形を認識する

Scala サーバーコードベースでよくある出発点:

- 貧血 case class と service object や implicit extension の乱立
- Slick / doobie の行型をドメインエンティティとして使う
- opaque type の代わりに `String` の ID や status 文字列
- ビジネスロジック中の `throw`、`.get`、素の `Exception`
- controller や route が JDBC / HTTP を直接呼ぶ

これらは移行の出発点であり、失敗ではない。次に起きそうなバグを取り除く最小の変更を選ぶ。

## 導入ラダー

一度に一段ずつ進める。各ステップは単独でレビューできること。

| Step | 変更 | 典型的な触りどころ | リスク |
| --- | --- | --- | --- |
| 0. 境界のみ | DTO/row → 新エンドポイント向け `Either` パース | http4s / Pekko route、consumer | 低 |
| 1. ID と値オブジェクト | `RequestId`、`Money`、`OccurredAt` などの opaque type | 変更フローで使う models | 低 |
| 2. ドメインエラー | 新ユースケースでの error ADT | application layer | 低 |
| 3. 型付き状態 | 重要な集約 1 つ分の sealed state | domain module | 中 |
| 4. ポート | 新ユースケースの背後に小さな repository trait | application + infrastructure | 中 |
| 5. トランザクションとバージョン | 原子的 save、outbox、楽観的バージョンチェック | persistence adapter | 中〜高 |

コードベースがすでに満たしているステップだけスキップする。

## サービス全体ではなく機能で絞り込む（Strangler Fig）

レガシーモジュールに対して:

1. 変更したワークフロー用に新しい use-case クラスを追加する。
2. 新パスが実証されるまで、旧エントリポイントはレガシーコードを呼び続ける。
3. 新 API バージョン、フラグ、コマンドを新ユースケースへルーティングする。
4. パリティテストが通ったら旧パスを削除する。

```text
legacy route -> legacy service -> JDBC
new route    -> AssignDriver use case -> port -> adapter -> JDBC
```

移行スライスは集約 1 つ、またはエンドポイント 1 つを優先する。

## レガシー移行の段階的ロードマップ

例: http4s + doobie のモノリスサービスで `POST /requests/{id}/assign` を移行する。

### Phase 1 — 挙動を固定し、テストを追加（1 週目）

1. 統合テストで現行 HTTP 契約を記録する（ステータスコード、JSON 形状）。
2. レガシーパス周辺に logging / metrics を追加し、トラフィックを計測する。
3. まだ挙動は変えない。

### Phase 2 — 境界 DTO（1〜2 週目）

1. `interfaces` モジュールに `AssignDriverBody` と `AssignDriverDto` を導入する。
2. route の直接フィールドアクセスを `AssignDriverCommand` の `Either` パースに置き換える。
3. レガシーサービスはまだ文字列を受け取る。検証は境界に移る。
4. 同じ route のまま出荷する。テストは緑のまま。

[境界防御](/docs/kamae-scala/boundary-defense/) を参照。

### Phase 3 — 触った ID の opaque type（2 週目）

1. `domain` モジュールに `RequestId`、`DriverId` opaque type を追加する。
2. 境界パースを opaque type 構築に変更する。レガシーサービスは境界で `.value` を受け取る。
3. 新しい `domain` モジュールだけに厳格な scalafix / scalac オプションを有効化する。

[ドメインモデリング](/docs/kamae-scala/domain-modeling/) を参照。

### Phase 4 — ユースケース抽出（3 週目）

1. レガシー SQL を private メソッドにインラインした `AssignDriver` を作成する。
2. ハンドラは `useCase.execute(cmd)` のみ呼ぶ。
3. このパスの例外を `AssignDriverError` ADT と `Either` に置き換える。

[エラーハンドリング](/docs/kamae-scala/error-handling/) を参照。

### Phase 5 — 1 集約の型付き状態（3〜4 週目）

1. `WaitingRequest` と `EnRouteRequest` をモデル化し、割当を `WaitingRequest.assignDriver` に移す。
2. DB のレガシー `status: String` は残す。adapter が row ↔ state type をマップする。
3. HTTP なしで遷移の単体テストを追加する。

[状態遷移](/docs/kamae-scala/state-transitions/) と [ORM アダプタ](/docs/kamae-scala/orm-adapters/) を参照。

### Phase 6 — リポジトリポート（4〜5 週目）

1. `TaxiRequestRepository[F]` と関連 port trait を定義する。
2. SQL をユースケースから `DoobieTaxiRequestRepository` に移す。
3. ユースケースは trait のみに依存する。`main` またはコンポジションルートで配線する。

[永続化、集約、イベント](/docs/kamae-scala/persistence-events/) と [アプリケーション配線](/docs/kamae-scala/application-wiring/) を参照。

### Phase 7 — トランザクション、バージョン、outbox（5〜6 週目）

1. `version` 列と条件付き `UPDATE` を追加する。
2. state save と outbox insert を 1 トランザクションに包む。
3. リトライクライアント向けに idempotency key を追加する。

[永続化、集約、イベント](/docs/kamae-scala/persistence-events/) を参照。

### Phase 8 — レガシーパス削除（6 週目以降）

1. feature flag または route トラフィックが新パス 100% であることを確認する。
2. レガシーサービス関数と死んだ `status` 文字列チェックを削除する。
3. 移行モジュールに `kamae-scala-review` を実行する。

ペースはチーム規模に合わせて調整する。可能なら各フェーズを独立 PR にする。

## 差分をレビュー可能に保つ

- 避けられる限り、機械的リファクタと挙動変更を 1 PR に混ぜない。
- 旧パスを削除する前に、新境界にテストを追加する。
- 触ったフィールドだけ opaque type と DTO 変換を導入し、後で広げる。
- 強化するモジュールで追加 scalafix ルールを有効化する。
- 新旧の意味論が異なる場合のみ、短いコメントまたは ADR を残す。

## ラダーを登り止めるタイミング

すべての struct に state machine や repository trait は不要。次の場合は現段階で止める:

- コードが安定し、低リスクで、めったに変わらない
- 集約に意味のあるライフサイクルや不変条件がない
- チームが persistence や並行性の挙動をまだ十分にテストできない

バグ、コンプライアンス要件、並行性が現状の形では弱すぎると示したら、一段上げる。

## エージェントとレビュアーの期待

移行時:

- スコープ判断に [段階的導入](/docs/kamae-scala/adoption/) を読み込む
- 実装する段のトピックガイドを読み込む
- 周囲がレガシーでも、変更パスに `kamae-scala-review` を使う
- サービス全体が移行済みのふりをせず、残るレガシーリスクを明示する
