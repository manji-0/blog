---
title: "ストリームと継続クエリ"
sidebar:
  order: 10
---

イベントを購読する側は、少なくとも一度の配信と再起動を前提にする。メモリ上の broadcast だけに頼ると再接続でイベントを落とし、チェックポイントなしでは重複処理とスキップの両方が起きうる。

権威ある状態変更はコマンド経路に留め、投影は読み取りモデルとして扱う。保存形式は [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) と整合させる。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./aggregate-transactions.md -->

## event と変更フィードに Stream を使う

event-sourced または CQRS 設計では、consumer が one-shot クエリではなく集約変更の継続フィードを必要とすることが多い。ドメインコード内の ad-hoc `while (true)` poll ループではなく、adapter 境界で型付き stream port としてモデル化する。

```scala
import fs2.Stream

trait AggregateEventSource[F[_]]:
  def subscribe(
      aggregateId: RequestId,
      after: Option[EventSequence]
  ): Stream[F, Either[StreamError, DomainEvent]]
```

ドメイン遷移は同期のまま。Stream は read-side projection、outbox processor、ストレージを poll / subscribe する integration adapter に属する。

## スタックの選択

| スタック | Stream 型 | 典型的な用途 |
| --- | --- | --- |
| FS2 + Cats Effect | `fs2.Stream[F, A]` | 関数型バックエンド、outbox processor |
| ZIO | `zio.stream.ZStream[Any, E, A]` | ZIO ネイティブサービスと projection |
| Pekko | `org.apache.pekko.stream.scaladsl.Source[A, M]` | 既に Pekko 上の actor / streaming システム |

bounded context ごとに stream 抽象を 1 つ選ぶ。明示的な adapter 層なしに同一モジュールで 3 つの stream API を混ぜない。

## コマンドパスと read stream を分離

| 関心 | 形状 | 備考 |
| --- | --- | --- |
| Write use case | `F[Either[UseCaseError, Unit]]` | 1 コマンド、1 トランザクション境界 |
| Aggregate replay | `Stream[F, Either[_, DomainEvent]]` | 1 集約の順序付き event |
| Continuous query / projection | `Stream[F, Either[_, ReadModelRow]]` | 派生 state。write model より遅れうる |
| Outbox dispatch | `Stream[F, Either[_, OutboxMessage]]` | at-least-once 配送。handler は冪等 |

ドメイン遷移メソッドから `Stream` を公開しない。遷移から event を出し、原子的に永続化し、adapter が永続ログを stream として公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breaker など durable cursor から subscription を開始する。consumer 再接続時に event を落とす in-memory broadcast を避ける。

```scala
final case class EventCursor(
    aggregateId: RequestId,
    afterSequence: EventSequence
)

trait OutboxReader[F[_]]:
  def streamPending(batchSize: Int): Stream[F, Either[StreamError, OutboxRow]]
```

projection が追いついたら、projection テーブルと同じ persistence 技術に checkpoint を保存し、再起動時に安全再開する。

## バックプレッシャーとキャンセルを扱う

バックプレッシャーを無視する stream は、consumer が遅いとメモリを使い尽くしたり重複作業を起こす。

- poller と handler の間は bounded queue / channel（`fs2.concurrent.Channel`、ZIO の `Queue.bounded`）を使う。
- stream の寿命を effect のキャンセルに結びつける。HTTP リクエストや fiber が中断されたら poll を止め DB cursor を解放する。
- terminal な stream エラーは文書化されたリトライ意味論に従って扱う。重複排除なしに黙って再起動しない。

```scala
source
  .subscribe(requestId, cursor)
  .evalMap:
    case Left(err) => StreamErrorMapper.toF(err)
    case Right(event) => handler.apply(event)
  .interruptWhen(shutdownSignal)
```

## projection は決定論的かつ冪等

継続クエリは event stream から read model を再構築する。各 handler は:

1. payload を境界で型付き domain または integration event にパースする。
2. event ID または `(aggregateId, sequence)` で idempotent に更新を適用する。
3. スキーマ進化ポリシーに従い未知 type / version をスキップまたは dead-letter する。

projection から集約遷移メソッドを呼ばない。event に反応し、read path から権威ある write-model 集約を変更しない。

write 側のトランザクション、versioning、outbox の原子性は [永続化、集約、イベント](/docs/kamae-scala/persistence-events/) を参照する。

## 検出ヒント

`build.sbt` に `fs2`、`pekko-stream`、`zio-streams` があるとき、手動 sleep / poll ループより型付き stream port を優先する。subscription、projection、outbox processor に触れる diff では persistence および service-boundary ガイドも併せて読み込む。

classpath に FS2 があるときは [ライブラリガイド（FS2）](/docs/kamae-scala/library-guides/fs2/) を参照する。
