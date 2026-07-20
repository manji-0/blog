---
title: "ストリームと継続クエリ"
sidebar:
  order: 10
---

イベントを購読する側は、少なくとも一度の配信と再起動を前提にする。メモリ上のbroadcastだけに頼ると再接続でイベントを落とし、チェックポイントなしでは重複処理とスキップの両方が起きうる。

権威ある状態変更はコマンド経路（[状態遷移](/projects/kamae-rs/state-transitions/)）に留め、投影は読み取りモデルとして扱う。保存形式は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/)、スキーマ進化は [サービス境界](/projects/kamae-rs/service-boundaries/) と整合させる。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./persistence-events.md -->

## event と変更フィードに Stream を使う

event-sourcedまたはCQRS設計では、consumerがone-shotクエリではなく集約変更の継続フィードを必要とすることが多い。adapter内のad-hoc callbackループではなく、port境界で `futures::Stream`（あるいは `tokio_stream::StreamExt` ヘルパー）としてモデル化する。

```rust
use futures::Stream;
use std::pin::Pin;

pub type EventStream<E> = Pin<Box<dyn Stream<Item = Result<E, StreamError>> + Send>>;

pub trait AggregateEventSource {
    fn subscribe(
        &self,
        aggregate_id: RequestId,
        after: Option<EventSequence>,
    ) -> EventStream<DomainEvent>;
}
```

ドメイン遷移は同期のまま。Streamはread-side projection、outbox processor、ストレージをpoll/subscribeするintegration adapterに属する。

## コマンドパスと read stream を分離

| 関心 | 形状 | 備考 |
| --- | --- | --- |
| Write use case | `async fn -> Result<(), E>` | 1 コマンド、1 トランザクション境界 |
| Aggregate replay | `Stream<Item = Result<DomainEvent, E>>` | 1 集約の順序付き event |
| Continuous query / projection | `Stream<Item = Result<ReadModelRow, E>>` | 派生 state。write model より遅れうる |
| Outbox dispatch | `Stream<Item = Result<OutboxMessage, E>>` | at-least-once 配送。handler は冪等 |

ドメイン遷移メソッドから `Stream` を公開しない。遷移からeventを出し、原子的に永続化し、adapterが永続ログをstreamとして公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breakerなどdurable cursorからsubscriptionを開始する。consumer再接続時にeventを落とすin-memory broadcastを避ける。

```rust
pub struct EventCursor {
    aggregate_id: RequestId,
    after_sequence: EventSequence,
}

impl OutboxReader {
    pub fn stream_pending(&self, batch_size: usize) -> EventStream<OutboxRow> {
        // Adapter polls DB or message log and yields rows as a Stream.
        self.poll_pending(batch_size)
    }
}
```

projectionが追いついたら、projectionテーブルと同じpersistence技術にcheckpointを保存し、再起動時に安全再開する。

## バックプレッシャーとキャンセルを扱う

バックプレッシャーを適用しないstreamは、consumerが遅いとメモリを使い尽くしたり重複作業を起こす。

- ストレージpollとhandlerの間は明示容量のbounded channel（`tokio::sync::mpsc`）
- キャンセルを伝播： `JoinHandle` またはHTTPリクエストdrop時にpollを止めDB cursorまたはlockを解放
- `Stream::poll_next` エラーは、adapterがリトライ意味論を文書化しない限りそのsubscriptionではterminal

```rust
use futures::StreamExt;
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel(128);

tokio::spawn(async move {
    let mut stream = source.subscribe(request_id, cursor).await;
    while let Some(item) = stream.next().await {
        if tx.send(item).await.is_err() {
            break; // consumer dropped; stop reading
        }
    }
});
```

## projection は決定論的かつ冪等

継続クエリはevent streamからread modelを再構築する。各handlerは：

1. event payloadを型付きdomainまたはintegration eventにパース
2. event IDまたは `(aggregate_id, sequence)` でidempotentに更新適用
3. スキーマ進化ポリシーに従い未知type/versionをスキップまたはdead-letter（[サービス境界](/projects/kamae-rs/service-boundaries/) 参照）

```rust
async fn apply_event(
    store: &mut ProjectionStore,
    event: StoredEvent,
) -> Result<(), ProjectionError> {
    if store.already_applied(&event.id)? {
        return Ok(());
    }

    match event.kind {
        EventKind::DriverAssigned(payload) => store.mark_en_route(payload)?,
        EventKind::Unknown { version, name } => return Err(ProjectionError::Unsupported { version, name }),
    }

    store.record_checkpoint(event.id)?;
    Ok(())
}
```

## CQRS 境界を明示

read model（投影）はクエリを速くするための非正規化ビューであり、第二のwrite modelではない。投影ハンドラ内で他集約を直接変更すると、コマンド経路を迂回した状態変更が増え、リトライや並行更新の見通しが立たなくなる。集約横断の変更が必要なら、ドメインイベントを発行し、別のユースケースまたはコマンドが反応する形にする。

write側のトランザクションスコープ、楽観的versioning、outboxの原子性は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) を参照する。

## 検出ヒント

`Cargo.toml` に `futures`、`tokio-stream`、`async-stream`、event-store clientがあるとき、手動 `loop { sleep; poll }` workerより型付き `Stream` portを優先。subscription、projection、outbox processorに触れるdiffではpersistenceおよびservice-boundaryガイドも併せて読み込む。

レビューでは、型付き `Stream` で足りるのに手書きpollループを使うこと、チェックポイントなしの購読、重複排除なしの副作用、無制限バッファ、コマンド経路外の遷移呼び出し、未対応イベント型でのパニックを指摘する。

## レビューで見るところ

プロジェクションがイベントIDや `(aggregate_id, sequence)` で冪等か。リード側ストリームが集約遷移や権威ある状態の永続化をしていないかも見る。再起動後に再開できる永続カーソルはあるか。無制限バッファやコンシューマ脱落後も読み続けるストリームはないか。手書きの `loop { sleep; query }` より型付き `Stream<Item = Result<_, _>>` ポートの方が明確でないか。未対応イベント版でパニックや黙殺していないか（[サービス境界](/projects/kamae-rs/service-boundaries/)）。
