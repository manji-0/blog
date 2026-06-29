---
title: "ストリームと継続クエリ"
sidebar:
  order: 10
---

イベントを購読する側は、少なくとも一度の配信と再起動を前提にする。メモリ上のbroadcastだけに頼ると再接続でイベントを落とし、チェックポイントなしでは重複処理とスキップの両方が起きうる。

権威ある状態変更はコマンド経路に留め、投影は読み取りモデルとして扱う。保存形式は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) と整合させる。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./aggregate-transactions.md -->

## event と変更フィードに Stream を使う

event-sourcedまたはCQRS設計では、consumerがone-shotクエリではなく集約変更の継続フィードを必要とすることが多い。ドメインコード内のad-hoc `while (true)` pollループではなく、adapter境界で型付きstream portとしてモデル化する。

```scala
import fs2.Stream

trait AggregateEventSource[F[_]]:
  def subscribe(
      aggregateId: RequestId,
      after: Option[EventSequence]
  ): Stream[F, Either[StreamError, DomainEvent]]
```

ドメイン遷移は同期のまま。Streamはread-side projection、outbox processor、ストレージをpoll / subscribeするintegration adapterに属する。

## スタックの選択

| スタック | Stream 型 | 典型的な用途 |
| --- | --- | --- |
| FS2 + Cats Effect | `fs2.Stream[F, A]` | 関数型バックエンド、outbox processor |
| ZIO | `zio.stream.ZStream[Any, E, A]` | ZIO ネイティブサービスと projection |
| Pekko | `org.apache.pekko.stream.scaladsl.Source[A, M]` | 既に Pekko 上の actor / streaming システム |

bounded contextごとにstream抽象を1つ選ぶ。明示的なadapter層なしに同一モジュールで3つのstream APIを混ぜない。

## コマンドパスと read stream を分離

| 関心 | 形状 | 備考 |
| --- | --- | --- |
| Write use case | `F[Either[UseCaseError, Unit]]` | 1 コマンド、1 トランザクション境界 |
| Aggregate replay | `Stream[F, Either[_, DomainEvent]]` | 1 集約の順序付き event |
| Continuous query / projection | `Stream[F, Either[_, ReadModelRow]]` | 派生 state。write model より遅れうる |
| Outbox dispatch | `Stream[F, Either[_, OutboxMessage]]` | at-least-once 配送。handler は冪等 |

ドメイン遷移メソッドから `Stream` を公開しない。遷移からeventを出し、原子的に永続化し、adapterが永続ログをstreamとして公開する。

## persist 後に subscribe

event sequence、LSN、または `occurred_at` + tie-breakerなどdurable cursorからsubscriptionを開始する。consumer再接続時にeventを落とすin-memory broadcastを避ける。

```scala
final case class EventCursor(
    aggregateId: RequestId,
    afterSequence: EventSequence
)

trait OutboxReader[F[_]]:
  def streamPending(batchSize: Int): Stream[F, Either[StreamError, OutboxRow]]
```

projectionが追いついたら、projectionテーブルと同じpersistence技術にcheckpointを保存し、再起動時に安全再開する。

## バックプレッシャーとキャンセルを扱う

バックプレッシャーを無視するstreamは、consumerが遅いとメモリを使い尽くしたり重複作業を起こす。

- pollerとhandlerの間はbounded queue / channel（`fs2.concurrent.Channel`、ZIOの `Queue.bounded`）を使う。
- streamの寿命をeffectのキャンセルに結びつける。HTTPリクエストやfiberが中断されたらpollを止めDB cursorを解放する。
- terminalなstreamエラーは文書化されたリトライ意味論に従って扱う。重複排除なしに黙って再起動しない。

```scala
source
  .subscribe(requestId, cursor)
  .evalMap:
    case Left(err) => StreamErrorMapper.toF(err)
    case Right(event) => handler.apply(event)
  .interruptWhen(shutdownSignal)
```

## projection は決定論的かつ冪等

継続クエリはevent streamからread modelを再構築する。各handlerは：

1. payloadを境界で型付きdomainまたはintegration eventにパースする。
2. event IDまたは `(aggregateId, sequence)` でidempotentに更新を適用する。
3. スキーマ進化ポリシーに従い未知type / versionをスキップまたはdead-letterする。

projectionから集約遷移メソッドを呼ばない。eventに反応し、read pathから権威あるwrite-model集約を変更しない。

write側のトランザクション、versioning、outboxの原子性は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) を参照する。

## 検出ヒント

`build.sbt` に `fs2`、`pekko-stream`、`zio-streams` があるとき、手動sleep / pollループより型付きstream portを優先する。subscription、projection、outbox processorに触れるdiffではpersistenceおよびservice-boundaryガイドも併せて読み込む。

classpathにFS2があるときは [ライブラリガイド（FS2）](/projects/kamae-scala/library-guides/fs2/) を参照する。
