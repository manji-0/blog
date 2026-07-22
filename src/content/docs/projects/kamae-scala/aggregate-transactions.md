---
title: "集約とトランザクション境界"
sidebar:
  order: 10
---

1つの集約ルートが一緒に変わるべき不変条件を所有する。ユースケースはその集約を読み、純粋遷移を走らせ、ストレージが許すなら1つのトランザクション境界で結果を永続化する。

状態の型と純粋遷移は [状態遷移](/projects/kamae-scala/state-transitions/) と [ドメインモデリング](/projects/kamae-scala/domain-modeling/)、保存とイベントは [永続化、集約、イベント](/projects/kamae-scala/persistence-events/)、配線は [アプリケーション配線](/projects/kamae-scala/application-wiring/) を参照する。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./application-wiring.md -->

## 既定のスタンス

クロス集約のルールはID、スナップショット、ドメインイベント、後続ユースケースで扱う。メモリ上で2ルートを変異し、呼び出し元が両方保存することを期待しない。

## 集約ルートの表し方

集約ごとに主表現を1つ選ぶ：

- **状態struct族** — 型付き遷移（`WaitingRequest`、`EnRouteRequest`、…）
- **集約 sealed trait** — ロード/保存とディスパッチ（`TaxiRequest`）
- **ルート case class** — 1エンティティがライフサイクルを明確に所有し、子値オブジェクトに独立mutation経路がないとき

ルートだけが集約不変条件を変えてよい。子はルートメソッドや消費する状態遷移経由で更新し、外部から直接変異しない。

## ユースケースがトランザクション境界を所有する

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

ドメインコードはトランザクションを開始・コミットしない。ポートが操作を公開し、adapterがアトミックに実装する。

```scala
def execute(cmd: AssignDriverCommand): F[Either[AssignDriverError, Unit]] =
  for
    waiting <- loadWaiting(cmd.requestId)
    _       <- authorize(cmd.actor, waiting)
    result  <- Monad[F].pure(waiting.assignDriver(cmd.driver))
    saved   <- result match
      case Left(err) =>
        Monad[F].pure(Left(AssignDriverError.Domain(err)))
      case Right(transition) =>
        store.saveAssigned(transition.state, transition.events)
  yield saved
```

状態とアウトボックス/イベント行の一貫性が必要なら、`save_*` ポートが同一DBトランザクションで両方書く。

## 楽観的並行性が既定

競合しうる集約には単調な `version` または `updated_at` チェックをルートに付ける。

```scala
final case class Versioned[T](value: T, version: AggregateVersion)

sealed trait SaveError
object SaveError:
  final case class ConcurrentModification(requestId: RequestId) extends SaveError
```

典型フロー:

1. `Versioned[WaitingRequest]` をロード
2. `value` 上で純粋遷移
3. `expectedVersion = version` でセーブ
4. 0行更新やversion不一致を `ConcurrentModification` にマップ

競合は型付きユースケースエラーとして露出する。呼び出し元がリトライや409にできる。

## 悲観ロックは狭く使う

`SELECT … FOR UPDATE` や行ロックは、楽観リトライが危険または高すぎる短い臨界区間向けである。

ルール：

- ロックはadapterトランザクション内で取得し、ドメインコードでは取らない
- ロック区間は小さくする。外部HTTPや長い計算をまたがない
- SQL詳細を上に漏らさず、`reserveInventoryForUpdate` のようなドメイン固有ポートを優先する

## 神集約なしでクロス集約を調整する

| 状況 | 好ましいアプローチ |
| --- | --- |
| 1ルートが決定を所有し、他は事実だけ必要 | IDでスナップショットやリードモデルを読む |
| 両方変え、片方失敗でもう片方もロールバック必須 | 単一ユースケース、明示順序、saga/outbox、または対応DBなら1トランザクション |
| 結果整合でよい | ドメインイベント + 下流consumer |

クロス集約のオーケストレーションをrepository adapterに隠さない。ユースケースが業務ステップに名前を付ける。

## 冪等性は境界の近くに置く

リトライしうるコマンドは `CommandId` または冪等キーを持つ。状態変更と一緒に、またはdedupe表に永続化し、重複配信で遷移を二重適用しない。詳細は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/)。

## レビューで見るところ

- 1ユースケースがアトミックな作業単位を調整しているか。
- version/CASなしの競合書き込みや、集約ルートを迂回する変更はないか。
- 楽観で足りるのに広い悲観ロックを外部I/Oまたぎで取っていないか。
- 冪等キーなしの二重適用は境界で塞がれているかも見る。

