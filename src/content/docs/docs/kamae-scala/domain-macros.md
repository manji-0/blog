---
title: "ドメインマクロ"
sidebar:
  order: 10
---

Scala 3のopaque type、`given` / `using`、コンパイル時derivationは繰り返しパターンの**符号化**に使う道具であり、欠けているドメインモデリングを隠すためのものではない。同型が3つ以上あり、手書きがdriftしうるときだけ導入を検討する。

不変条件の本体は [ドメインモデリング](/docs/kamae-scala/domain-modeling/)、境界での検証は [境界防御](/docs/kamae-scala/boundary-defense/) と整合させる。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./boundary-defense.md -->

## 型を先に、マクロは次

Scala 3はopaque type、`given` / `using`、コンパイル時derivationを提供する。繰り返しで安定したパターンにだけ使う — 欠けているドメインモデリングを隠すためではない。マクロライブラリや包括的な `derives Codec` を追加する前に、同型が3つ以上あり、手書きがdriftしうることを確認する。

derivation向き：

- フィールド名とdefaultが文書化された境界DTO codec
- outbox向けに安定した `name` / `version` メタデータが必要なドメインevent case class
- companionで共有するnon-empty / format検証付きID newtype

derivation向きでない：

- 一度きりのビジネスルールやフィールド横断検証
- state machine遷移 — state type上の明示メソッドとして保つ
- 生成コードやマクロ展開内の `throw`、`.get`、panicの隠蔽

## 内部マクロの前に既存ライブラリを使う

| ニーズ | 推奨 | 備考 |
| --- | --- | --- |
| 検証付きプリミティブ | [ライブラリガイド（refined）](/docs/kamae-scala/library-guides/refined/)、`iron` | 不変条件をソースで可視に保つ |
| 境界での JSON | [ライブラリガイド（circe）](/docs/kamae-scala/library-guides/circe/) と明示 codec | ドメイン ID に `derives Decoder` を避ける |
| 単純ボイラープレート | Scala 3 `derives Eq, Show`（**境界** DTO のみ） | 不変条件を持つ domain state には使わない |
| 繰り返し event メタデータ | `domain` モジュール内の internal `inline given` または小さなマクロ | event が同一形状を共有するときのみ |

チームがパターンを所有し、ライブラリがserdeやORMの懸念をドメイン型へ漏らさない形で契約を表現できないとき、`myapp.domain.macros` のような内部マクロまたはメタプログラミングモジュールを導入する。

## ID にはマクロより opaque type

マクロの前に、検証付きcompanionを持つモジュールスコープopaque typeを優先する：

```scala
object TaxiRequestDomain:
  opaque type RequestId = String

  object RequestId:
    def apply(raw: String): Either[DomainError, RequestId] =
      if raw.trim.isEmpty then Left(DomainError.EmptyId("request_id"))
      else Right(raw.trim)

    extension (id: RequestId) def value: String = id
```

[ドメインモデリング](/docs/kamae-scala/domain-modeling/) を参照。検証なしのpublicコンストラクタを生成するマクロは、レビューで明示companionより悪い。

## 推奨内部パターン

### event メタデータヘルパー

outboxとprojectionパイプラインで使うeventレコードを標準化する：

```scala
trait DomainEvent:
  def name: String
  def version: Int

final case class DriverAssigned(
    requestId: RequestId,
    driverId: DriverId,
    occurredAt: OccurredAt
) extends DomainEvent:
  def name = "taxi.driver_assigned"
  def version = 1
```

多くのeventが同一形状を共有するとき、小さな `inline def eventName[T <: DomainEvent]` または内部マクロで `name` / `version` を生成してよい — ただしpayloadフィールドは明示的でレビュー可能に保つ。スキーマ進化が文書化されていない限り、event payloadに無制限Circe codecをderiveしない（[サービス境界](/docs/kamae-scala/service-boundaries/) 参照）。

### 繰り返し match アーム向け宣言ヘルパー

フルマクロが重いとき、projection handlerの重複を減らすローカル `inline` ヘルパー:

```scala
inline def dispatchEvent[E <: DomainEvent](
    event: StoredEvent,
    handlers: PartialFunction[String, StoredEvent => Either[ProjectionError, Unit]]
): Either[ProjectionError, Unit] =
  handlers.lift(event.name).toRight(ProjectionError.UnknownEvent(event.name)).flatMap(_(event))
```

ヘルパーはeventを所有するcrate内に留める。サービス境界越しにmacro DSLをexportしない。

## Circe / Config derivation ルール

- **DTO** とwire formatにcodecをderiveし、`Either` でドメイン型にマップする。
- プロジェクトがleaf検証を文書化していない限り、opaque domain IDやstate structに `derives Decoder` しない（[境界防御](/docs/kamae-scala/boundary-defense/) 参照）。
- ドメイン不変条件を持つ型への `Configuration.derive` に注意 — configは境界であり、ドメインfactoryは依然として検証すべき。

## 生成コードのレビュー期待

- 生成またはderiveされたinstanceはpublic mutableフィールド、`null` default、不変条件を迂回する黙示coercionを追加しない。
- eventとIDの `toString` / `Show` はログ安全のまま（[ロギングとメトリクス](/docs/kamae-scala/logging-metrics/) 参照）。
- 型にどの挙動がderiveされ、構築時にどの検証が走るかを文書化する — 特にマクロ展開companionについて。

## derive やマクロを使わない場合

- フィールド横断検証（amount + currency、日付範囲）
- state machine遷移 — `WaitingRequest`、`EnRouteRequest` などへの明示メソッド
- ORM rowマッピング — インフラで明示mapperを使う（[ORM アダプタ](/docs/kamae-scala/orm-adapters/) 参照）
- JNI / native structマッピング — 境界での明示変換
