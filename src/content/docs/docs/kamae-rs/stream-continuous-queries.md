---
title: "ストリームと継続クエリ"
sidebar:
  order: 10
---

> **いつ読むか:** イベントフィード、継続クエリ、projection、backpressure を `Stream` でモデル化するとき。
> **関連:** [`persistence-events.md`](/docs/kamae-rs/persistence-events/)、[`persistence-events.md`](/docs/kamae-rs/persistence-events/)、[`service-boundaries.md`](/docs/kamae-rs/service-boundaries/)。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./persistence-events.md -->

## event と変更フィードに Stream を使う

event-sourced または CQRS 設計では、consumer が one-shot クエリではなく集約変更の継続フィードを必要とすることが多い。adapter 内の ad-hoc callback ループではなく、port 境界で `futures::Stream`（または `tokio_stream::StreamExt` ヘルパー）としてモデル化する。

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

ドメイン遷移は同期のまま。Stream は read-side projection、outbox processor、ストレージを poll/subscribe する integration adapter に属する。

## コマンドパスと read stream を分離

| 関心 | 形状 | 備考 |
| --- | --- | --- |
| Write use case | `async fn -> Result<(), E>` | 1 コマンド、1 トランザクション境界 |
| Aggregate replay | `Stream<Item = Result<DomainEvent, E>>` | 1 集約の順序付き event |
| Continuous query / projection | `Stream<Item = Result<ReadModelRow, E>>` | 派生 state。write model より遅れうる |
| Outbox dispatch | `Stream<Item = Result<OutboxMessage, E>>` | at-least-once 配送。handler は冪等 |

ドメイン遷移メソッドから `Stream` を公開しない。遷移から event を出し、原子的に persist し、adapter が永続ログを stream として公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breaker など durable cursor から subscription を開始する。consumer 再接続時に event を落とす in-memory broadcast を避ける。

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

projection が追いついたら、projection テーブルと同じ persistence 技術に checkpoint を保存し、再起動時に安全再開する。

## バックプレッシャーとキャンセルを扱う

バックプレッシャーを適用しない stream は、consumer が遅いとメモリを使い尽くしたり重複作業を起こす。

- ストレージ poll と handler の間は明示容量の bounded channel（`tokio::sync::mpsc`）
- キャンセルを伝播: `JoinHandle` または HTTP リクエスト drop 時に poll を止め DB cursor または lock を解放
- `Stream::poll_next` エラーは、adapter がリトライ意味論を文書化しない限りその subscription では terminal

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

継続クエリは event stream から read model を再構築する。各 handler は:

1. event payload を型付き domain または integration event にパース
2. event ID または `(aggregate_id, sequence)` で idempotent に更新適用
3. スキーマ進化ポリシーに従い未知 type/version をスキップまたは dead-letter（[`service-boundaries.md`](/docs/kamae-rs/service-boundaries/) 参照）

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

read model はクエリ向けに非正規化してよいが、第二の write model になってはならない。projection 内の集約横断更新は event に反応し、他集約を直接 mutate しない。

write 側のトランザクションスコープ、楽観的 versioning、outbox 原子性は [`persistence-events.md`](/docs/kamae-rs/persistence-events/) と [`persistence-events.md`](/docs/kamae-rs/persistence-events/) 参照。

## 検出ヒント

`Cargo.toml` に `futures`、`tokio-stream`、`async-stream`、event-store client があるとき、手動 `loop { sleep; poll }` worker より型付き `Stream` port を優先。subscription、projection、outbox processor に触れる diff では persistence と service-boundary ガイドと併せて読み込む。

レビューでは、型付き `Stream` で足りるのに手書き poll ループを使うこと、チェックポイントなしの購読、重複排除なしの副作用、無制限バッファ、コマンド経路外の遷移呼び出し、未対応イベント型でのパニックを指摘する。

## レビュー観点

### プロジェクションハンドラは冪等か — High

イベント ID、`(aggregate_id, sequence)`、または同等の冪等キーで重複排除せず副作用を適用する継続クエリやイベントハンドラを指摘する。

### リード側ストリームは書き込みモデル集約を変更しないか — High

コマンド経路外で集約遷移メソッドを呼ぶ、または権威ある状態を永続化するプロジェクションを指摘する。

### 購読は永続カーソルから開始されるか — High

再起動後にイベントを再処理またはスキップせず再開できない、メモリのみのブロードキャストや購読を指摘する。

### バックプレッシャは処理されているか — Medium

ポーラとハンドラ間の無制限バッファ、またはコンシューマがドロップした後も読み続けるストリームを指摘する。

### 変更フィードは Stream ポートとしてモデル化されているか — Medium

バックプレッシャ、キャンセル、テストダブルを明確にする型付き `Stream<Item = Result<_, _>>` ポートで足りるのに、手書きの `loop { sleep; query }` ワーカーを指摘する。

### 未知のイベントバージョンは明示的に扱われるか — Medium

[`service-boundaries.md`](/docs/kamae-rs/service-boundaries/) も照合する。イベントを非同期保存するとき、未対応イベント型でパニックする、または黙って無視するハンドラを指摘する。
