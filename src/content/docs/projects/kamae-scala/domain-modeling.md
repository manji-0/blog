---
title: "ドメインモデリング"
sidebar:
  order: 10
---

意味の異なる値を同じ `String` や `Long` のまま置くと、コンパイラは区別できず、境界をすり抜けた値がドメイン深部まで届く。Kamaeではopaque types、value class、sealed trait、明示的なコンストラクタで意図を型に刻む。

ライフサイクル上の変化は [状態遷移](/projects/kamae-scala/state-transitions/)、外部データの取り込みは [境界防御](/projects/kamae-scala/boundary-defense/)、保存単位は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) と揃える。

## ドメイン概念を明示的に表現する

プリミティブのままだと、単位の混同やIDの取り違えはコンパイル時に検出できない。opaque typeのコストはボイラープレートより、誤った組み合わせを早く落とす効果の方が大きい。

次の例は、空文字を拒否する `RequestId` による典型的なopaque typeである。

```scala
object RequestIds:
  opaque type RequestId = String

  object RequestId:
    def apply(value: String): Either[RequestIdError, RequestId] =
      val trimmed = value.trim
      if trimmed.isEmpty then Left(RequestIdError.Empty)
      else Right(trimmed)

    extension (id: RequestId) def value: String = id

export RequestIds.RequestId
```

opaque typeはobject（またはclass）モジュール内で定義し、基底层の表現をファイル横断で抽象化する。トップレベルのopaqueエイリアスは同一ソースファイル内でのみ不透明である。

値が意図的に透明で不変条件がない場合を除き、opaque typeの内部表現はprivateとする。

時刻・金額・単位は明示的な概念としてモデル化する。単位・タイムゾーン・精度・丸めが暗黙の裸のプリミティブより、`OccurredAt`、`ServiceDate`、`Money`、`CurrencyCode`、`DistanceMeters`、`DurationSeconds` を優先する。金額には `Double` を使わない。

## 状態のバリアントには enum と sealed trait を優先する

閉じた状態集合やドメイン上の代替にはScala 3の `enum` またはsealed traitを使う。各状態が異なるデータを持つなら、ケースクラス風のバリアントとする。

```scala
enum TaxiRequest:
  case Waiting(value: WaitingRequest)
  case EnRoute(value: EnRouteRequest)
  case InTrip(value: InTripRequest)
  case Completed(value: CompletedRequest)
  case Cancelled(value: CancelledRequest)
```

特定のソース状態だけが遷移を受け付けるときは、別の状態型とする（[状態遷移](/projects/kamae-scala/state-transitions/)）。

## 集約境界を定義する

集約は、まとめて原子的に変わる必要のある不変条件を所有する。ルールを所有する状態または集約に遷移メソッドを置き、他集約はIDで参照する。判断用に安定したスナップショットをロードするユースケースは除く。

トランザクションスコープ・バージョニング・集約横断の調整は [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) を参照する。

アクセス都合だけで無関係なエンティティを集めた「神」集約は避ける。2つの集約ルートをメモリ上で変更し、呼び出し側の両方のsaveに頼る遷移も避け、ユースケースと明示的なドメインイベントで集約をまたぐ変更する。

## 構築を正直に保つ

`apply`、`from`、検証付きファクトリで構築時に不変条件を強制する。publicな `copy` 経路やミュータブルフィールドを公開すると、呼び出し元が検証を迂回して無効な組み合わせを作れてしまう。

不変条件のない単純データ、またはテスト専用のbuilderだけがcase classリテラルを許容する。本番経路と同じコンストラクタをテストでも使う方針はスキルリポジトリの `references/test-data.md` を参照する。

## derive と振る舞いは意図的に選ぶ

不変条件を持つドメイン型に、本当のドメインdefaultがない限りデフォルト値を与えない。空ID・ゼロ金額・最初のenumケースは、通常invalidまたはmisleadingなdefaultになる。

`case class` は不変に保つ。広くmutableな集約は古いコピーをそのまま永続化する経路を隠しやすい。

private不変条件があるドメイン型に無制限のJSON codec deriveを付けない。DTO・行ケースクラス、またはリーフvalue object上の検証付きデコーダでデシリアライズも検証を通す（[境界防御](/projects/kamae-scala/boundary-defense/)）。

## リポジトリポートを trait で定義する

永続化はドメインまたはアプリケーション層の小さなtraitの背後に置く。

```scala
trait TaxiRequestRepository[F[_]]:
  def findWaiting(id: RequestId): F[Option[WaitingRequest]]
  def saveAssigned(state: EnRouteRequest, events: List[TaxiRequestEvent]): F[Unit]
```

アダプタはdoobie、slickなどでこれらを実装する。ドメインコードはドライバ固有の型をimportしない。

## 概念ごとに整理する

`taxi.request`、`taxi.driver`、`taxi.assignment` のようなモジュール単位で概念を分け、型・コンストラクタ・メソッド・テストを同じ場所に置く。`models` や `domain` といったcatch-allパッケージに無関係な概念を混在させ、振る舞いだけ別モジュールに分離する構成は、変更のたびにファイルを行き来させ、不変条件のレビューも難しくする。

## エンドツーエンドの例

[kamae-scala リポジトリ](https://github.com/manji-0/kamae-scala) の `examples/src/main/scala/kamae/examples/TaxiRequest.scala` で、opaque ID、分離した状態型、型付き遷移を一通り追える。

## レビューで見るところ

不変条件のある型でpublicフィールドやpublicな `copy`、ミュータブルフィールドが残っていないか。ID・金額・メールなどが素の `String` / 整数 / `Double` のまま混ざっていないかも見る（opaque typeや検証付き `apply` へ）。codec deriveがドメインエンティティに張り付いていないか。`status: String` ＋ Optionalの巨大case classより状態ごとの型の方が明確でないかも確認する。単位・通貨・タイムゾーンが型で分かれているか。`models` / `domain` パッケージに無関係な概念が溜まっていないかも見る。
