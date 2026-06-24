---
title: "Rust 集約とトランザクション境界"
sidebar:
  order: 10
---

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./application-wiring.md -->

## 基本方針

1 つの集約ルートが、まとめて変わる必要のある不変条件を所有する。ユースケースはその集約をロードし、純粋遷移を実行し、ストレージモデルが許す範囲で 1 トランザクション境界内に結果を永続化する。

集約横断ルールは ID、スナップショット、ドメインイベント、または後続ユースケースを使う。2 つの集約ルートをメモリ上で変更し、呼び出し側が両方 save してくれることを期待しない。

## 集約ルートを表現する

集約ごとに主要表現を 1 つ選ぶ:

- **State struct ファミリー** — 型付き遷移（`WaitingRequest`、`EnRouteRequest` など）
- **集約 enum** — ロード/セーブと dispatch（`TaxiRequest`）
- **Root struct** — 1 エンティティがライフサイクルを明確に所有し、子 value object に独立した変更経路がない

ルートだけが集約不変条件を変更できる。集約内の子エンティティは root メソッドまたは consuming state 遷移経由で更新し、外部から直接変更しない。

## ユースケースをトランザクション境界とする

ユースケースは次の順序を所有する:

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

ドメインコードはトランザクションを begin/commit しない。port は adapter が原子的に実装する操作を公開する。

```rust
pub async fn execute(&self, cmd: AssignDriverCommand) -> Result<(), AssignDriverError> {
    let waiting = self.load_waiting(&cmd.request_id).await?;
    self.authorize(&cmd.actor, &waiting)?;

    let transition = waiting
        .assign_driver(cmd.driver)
        .map_err(AssignDriverError::Domain)?;

    self.store
        .save_assigned(&transition.state, &transition.events)
        .await?;

    Ok(())
}
```

state と outbox/event 行の一貫性が必要なら、`save_*` port メソッドは 1 DB トランザクションで両方を書く。

## 楽観的並行性がデフォルト

競合する集約には、集約ルートに単調増加 `version` または `updated_at` チェックを付ける。load port は現行 version を返し、save port は古い書き込みを拒否する。

```rust
pub struct Versioned<T> {
    pub value: T,
    pub version: AggregateVersion,
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("concurrent modification for request {request_id}")]
    ConcurrentModification { request_id: RequestId },
}
```

典型的フロー:

1. `Versioned<WaitingRequest>` をロード
2. `value` 上で純粋遷移
3. `expected_version = version` で save
4. 0 行更新または version 不一致を `ConcurrentModification` にマップ

競合は型付きユースケースエラーとして公開し、呼び出し側がリトライまたは 409 を返せるようにする。

## 悲観的ロックは限定的に

`SELECT ... FOR UPDATE`、行ロックなどは、在庫予約、座席ホールド、台帳記帳のように短く境界の明確なクリティカルセクション向け。楽観的リトライが unsafe または高コストな場合。

ルール:

- ロックは adapter トランザクション内で取得。ドメインコードではない。
- ロック区間は小さく。ランタイムと pool 戦略が明示的に設計されていない限り、`.await` 越しにロックを保持しない。
- SQL ロック詳細を上に漏らすより、`reserve_inventory_for_update` のようなドメイン固有 port を優先。

## 神集約なしで集約横断を調整する

1 コマンドが複数ルートに触れるとき:

| Situation | Preferred approach |
| --- | --- |
| 1 ルートが決定を所有し、他は事実だけ必要 | ID でスナップショットまたは read model をクエリ |
| 両ルート変更が必要で、一方失敗時に他方をロールバック | 単一ユースケース、明示順序、saga/outbox、または datastore が許す 1 トランザクション境界 |
|  eventual consistency で足りる | ドメインイベント + 下流 consumer |

集約横断オーケストレーションを repository adapter 内に隠さない。ユースケースがビジネスステップを名指しする。

## Idempotency は境界付近に属する

リトライされうるコマンド（HTTP クライアント、queue consumer、outbox processor）は `CommandId` または idempotency key を持つ。state 変更と一緒、または dedupe テーブルに永続化し、重複配送が遷移を二重適用しないようにする。

idempotency は handler の後付けではなく、トランザクションストーリーの一部として扱う。

## レビュー観点

### 18.1 1 ユースケースがトランザクション境界を所有しているか — High

単一ユースケースが原子作業単位を調整せず、無関係な複数呼び出し元から状態保存、イベント発行、メッセージ公開を行うワークフローをフラグする。

### 18.2 集約不変条件はルート経由でのみ変更されるか — High

集約ルートの遷移メソッドや型付き状態構造体を迂回して、子エンティティやライフサイクル状態を変更するコードをフラグする。

### 18.3 競合書き込みには楽観的並行性が扱われているか — High

残高、ライフサイクル状態、在庫、その他高競合集約の load / modify / save に、バージョンチェック、compare-and-swap、または同等の DB 制約がない場合はフラグする。

ゼロ行更新とバージョン不一致は、黙った成功ではなく `ConcurrentModification` のような型付きエラーへマップする。

### 18.4 悲観的ロックはスコープが限定され正当化されているか — Medium

楽観的並行性や DB 制約で足りるのに、特に `.await` をまたぐ広いまたは長時間のロックをフラグする。ロックスコープが不明瞭、またはドメイン不変条件がまだ競合しうる場合はエスカレートする。

### 18.5 集約横断の調整は明示的か — Medium

メモリ上で 2 つの集約ルートを変更し、呼び出し元の両方永続化に頼るユースケースやリポジトリをフラグする。イベント、saga、スナップショット、文書化された単一トランザクション戦略を提案する。

### 18.6 リトライと重複コマンドは境界で冪等か — High

[永続化とイベント](/docs/kamae/rust/references/persistence-events/) と [テストデータ](/docs/kamae/rust/references/test-data/) も参照。冪等キーや重複排除レコードなしに同一遷移を二重適用しうるコマンドハンドラやコンシューマをフラグする。
