---
title: "テストデータ"
sidebar:
  order: 10
---

テストがpublicフィールドリテラルや生ORM行で状態を組み立てると、本番では構築できない無効状態を「通る」と誤認する。フィクスチャは公開コンストラクタと本番と同じポート経路を通す。

遷移の期待は [状態遷移](/projects/kamae-scala/state-transitions/)、広い入力の法則は [プロパティベーステスト](/projects/kamae-scala/property-based-tests/)、観測のアサーションは [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) を参照する。

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./property-based-tests.md -->

## 公開経路でフィクスチャを組み立てる

フィクスチャは本番と同じコンストラクタ・遷移関数を通す。opaque type factoryを迂回する生case classリテラルは避ける。破損入力や移行互換を明示的に試すテストを除く。

```scala
def requestId(value: String = "req-1"): RequestId =
  RequestId(value).fold(
    err => throw new IllegalArgumentException(s"fixture request id: $err"),
    identity
  )
```

fixture helperが固定値を使うなら、helperまたはアサーションメッセージで不変条件を名指す。失敗経路では`.get`より`Either`アサーションを優先する。

helperは`src/test/scala/.../support/`またはパッケージローカルtestオブジェクトで共有する。fake portパターンは [開発環境](/projects/kamae-scala/dev-environment/) を参照。

## 状態機械のエッジをカバーする

重要ワークフローでは次を試す：

- 成功する遷移
- 拒否される遷移または前提条件
- 遷移前の認可とテナント拒否
- ハンドラまたはユースケース境界での網羅的errorマッピング
- 期待event typeとaggregate IDを持つドメインeventの発行

```scala
test("assignDriver rejects non-waiting state"):
  val err = enRouteFixture.assignDriver(driverId("d1"))
  assertEquals(err, Left(DomainError.InvalidState))
```

コンパイル時state安全性が中核なら`compileErrors`テストを追加する（下記参照）。

## 境界と観測可能性をテストする

境界テストには未知フィールドや不正DTOを含める。必須欠落、default付きフィールド、DB行の再水和も試す。

観測可能性テストではredacted log、安全errorメッセージ、安全metrics label、敏感データがあるときのresponse DTOエンコードを検証する。[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/)のtierルール：

- Tier A/B値はlog、trace、error、metric labelに出さない
- Tier C/D値は構造化フィールドのみ。logメッセージ文字列内に入れない
- metric exportはTier E labelのみ

```scala
test("api error does not echo email"):
  val body = mapDomainError(DomainError.DuplicateEmail(emailFixture)).render
  assert(!body.contains("user@example.com"))
```

## 永続化とリトライ挙動をテストする

永続化を変更するときはDB制約失敗や楽観的ロック競合をカバーする。重複コマンド、idempotency key、outbox insertも試す。

純粋ユースケースはfake repositoryで十分。トランザクションと制約はadapter統合テストで確認する。ドメインとユースケーステストからDockerを外し、コンテナはインフラモジュール向けに留める（[開発環境](/projects/kamae-scala/dev-environment/)のtest層参照）。

## コンパイル時state安全性をテストする

重要な状態機械保証には、munit`compileErrors`テストを追加する。プロジェクトがすでにmunitを使うか、不変条件が中核なら正当化できる。

```scala
test("EnRouteRequest is not WaitingRequest"):
  val errors = compileErrors("""
    import kamae.examples.*
    def onlyWaiting(request: WaitingRequest): Unit = ()
    onlyWaiting(enRouteFixture)
  """)
  assert(errors.nonEmpty)
```

例： [`CompileTimeSafetySuite.scala`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/examples/src/test/scala/kamae/examples/CompileTimeSafetySuite.scala)。

成功遷移、errorマッピング、DTO変換、PII redactionは通常の単体テストで扱う。

## 安定した不変条件にはプロパティベーステストを使う

多入力で成り立つ不変条件にはScalaCheck（またはmunit-scalacheck）を使う。Kamae Scalaでは遷移が純関数であり、不変条件も明示的なので相性がよい。

向いている対象：

- 値オブジェクトコンストラクタと検証ルール
- parser/formatterとDTO往復
- 状態機械遷移法則（[プロパティベーステスト](/projects/kamae-scala/property-based-tests/)参照）
- 金額算術、単位変換、タイムスタンプ境界ルール
- redaction helperと安全`Show`/`toString`契約

生成値も公開コンストラクタまたは境界adapterを通す。無効なopaque type内部を埋めるgeneratorは、本番が構築できない状態を誤って試す。

### 状態遷移の法則

| 法則 | 例 |
| --- | --- |
| 同一性の保持 | `result.requestId == source.requestId` |
| discriminatorの正しい変化 | `assignDriver(waiting, ...)`が`EnRouteRequest`を返す |
| 拒否経路は到達不能 | 非法source stateが遷移に到達しない |
| event数と形状 | eventは1つでaggregate IDがstateと一致 |

### 往復とadapterのproperty

```scala
property("waiting request round trip"):
  forAll(waitingRequestGen): state =>
    val dto = WaitingRequestDto.from(state)
    WaitingRequestDto.toDomain(dto) == Right(state)
```

明示generatorを公開コンストラクタから組み立てる。shrinking、regression file、CI予算は [プロパティベーステスト](/projects/kamae-scala/property-based-tests/) を参照。

## フィクスチャからPIIを除外する

コミット済みフィクスチャには合成identifierを使う。本番exportをリポジトリにコピーしない。[PII保護](/projects/kamae-scala/pii-protection/)を参照。

## テスト層

| 層 | 試すこと | I/O |
| --- | --- | --- |
| Domain unit | コンストラクタ、遷移、ドメインerror | なし |
| Use case | fake portでのオーケストレーション | なし |
| Adapter unit | SQLマッピング、DTO変換、redaction | fakeまたはin-memory |
| API/integration | handler → ユースケース → adapter | test DBまたはコンテナ任意 |
| Property | 入力全体の法則 | property本体にI/Oなし |

PR前に [品質ゲート](/projects/kamae-scala/quality-gates/) のテストコマンドを実行する。

## レビューで見るところ

public経路を迂回する無効状態の構築はないか。拒否遷移とDTO失敗のテストはあるか。フィクスチャに本番PIIはないか。永続化リトライとidempotencyのテストはあるか。境界変更に未知フィールドや破損行のカバレッジはあるか。
