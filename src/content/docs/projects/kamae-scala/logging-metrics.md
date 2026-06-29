---
title: "ロギングとメトリクス"
sidebar:
  order: 10
---

`log4cats` やメトリクスは障害調査の主経路である。関数名だけのログや、生IDをラベルにしたメトリクスは、原因特定を遅らせるうえ漏洩経路にもなる。

遷移の記録はユースケース境界で行う（[状態遷移](/projects/kamae-scala/state-transitions/)）。マスキングとID分類は [PII 保護](/projects/kamae-scala/pii-protection/)、エラーの一度きりの記録は [エラーハンドリング](/projects/kamae-scala/error-handling/) と整合させる。

<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->

## ドメインコンテキストで log する

各ログエントリは次の3点に答える。何が起きたか、どのドメインオブジェクトに関する事象か、なぜ重要か。ログはドメイン不変条件の内部ではなく、ユースケース、アプリケーションサービス、アダプターから出力する。

1. **意味のあるメッセージ**: 関数名ではなくdomain用語でイベントや判断を述べる。「`assignDriver called`」より「driver assigned to waiting request」。
2. **Domain オブジェクト state**: 判断理解に必要なidentifier、現state variant、値。structured fieldを優先する。
3. **遷移情報**: 操作目的がstate遷移なら、source state、target state、トリガー commandまたはevent。

```scala
import org.typelevel.log4cats.Logger
import org.typelevel.log4cats.syntax.*

final case class AssignDriverLog(
    requestId: RequestId,
    passengerId: PassengerId,
    driverId: DriverId,
    from: TaxiRequestState,
    to: TaxiRequestState,
    commandId: CommandId
)

def logAssignment[F[_]: Logger](log: AssignDriverLog): F[Unit] =
  Logger[F].info(
    s"driver assigned to waiting request" +
      s" requestId=${log.requestId.value}" +
      s" passengerId=${log.passengerId.value}" + // safe only for opaque surrogate IDs
      s" driverId=${log.driverId.value}" +
      s" from=${log.from}" +
      s" to=${log.to}" +
      s" commandId=${log.commandId.value}"
  )
```

structured logging API（log4cats、key-value marker付きSLF4J、OpenTelemetry log attribute）を、entity全体の文字列補間より優先する。

## 構造化ログを優先する

人間可読文から意味をparseせず、key-value fieldを使う。集約はmessageでグループ化し、fieldによるfilterができるようlogテンプレートを安定させる。

```scala
// Good: stable template, structured context map or MDC.
Logger[F].info(Map(
  "requestId" -> requestId.value,
  "state"     -> state.toString
))("request state persisted")

// Avoid: values baked only into free-form sentence text.
Logger[F].info(s"request ${requestId.value} persisted in state $state")
```

logレベルを意図的に選ぶ：

- `ERROR`: domain不変条件失敗、ユースケース完了不能、インフラ依存unhealthy。secretを漏らさず再現に足るcontext。
- `WARN`: リトライ可能timeoutなど回復可能異常、予期外だが処理済みedge case。
- `INFO`: 重要ビジネスイベントまたはライフサイクルstep。
- `DEBUG`: 特定問題診断向け詳細state。高コスト値はDEBUGでguard。

## log から PII 漏洩を防ぐ

logは長寿命で広くアクセス可能： 公開境界として扱う。[PII 保護](/projects/kamae-scala/pii-protection/) と [ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets) のルールに従う。

- raw氏名、メール、電話、住所、位置、token、資格情報をlogしない。
- opaque型とredacting wrapperで `toString` とstructured fieldのaccidental露出を防ぐ。
- identifierがsensitiveならhashまたはopaque referenceをlog。

分類ルールは [どの ID を log に載せるか](#どの-id-を-log-に載せるか) 参照。

## どの ID を log に載せるか

identifierを分類してからlog、span、metrics、errorへ到達させる。フィールド名はsafeを決めない。identifierの意味、 derivation、再識別リスクが決める。

### デフォルト: log してよい

運用相関に役立ちsecretや直接個人identityを露出しないとき：

| 種別 | 例 | 通常安全な理由 |
| --- | --- | --- |
| Correlation / tracing | `correlationId`, `traceId`, `spanId`, HTTP `requestId` | 一時的または運用向け。identity ではない |
| Internal aggregate IDs | `orderId`, `requestId`, `shipmentId`, `commandId`, `eventId` | サービス内 opaque surrogate key |
| Process / job IDs | `jobId`, `outboxId`, `batchId`, internal `transactionId` | インフラ相関 |
| Tenant / org context | `tenantId`, `organizationId`, `fleetId` | アクセス制御下 multi-tenant ops に必要 |
| Bounded domain enums | `state`, `commandName`, `eventType`, `errorCode` | 低 cardinality。個人データではない |

「logしてよい」の要件：

1. **Opaque surrogate**: システム内ランダムまたはsequential。email、phone、氏名、政府ID、カードデータ由来でない。
2. **Secret ではない**: session token、API key、password、signed URL capabilityではない。
3. **単体再識別リスク低**: 値単体がアプリ制御datastore外で自然人を特定しない。
4. **Safe `toString` / `Show`**: opaque型のformatting経路がlog向けにreview済みでnested PIIを露出しない。

### デフォルト: log しない

一般application log、span、metrics label、error文字列に載せない：

| 種別 | 例 | 理由 |
| --- | --- | --- |
| Secrets / auth material | API keys, passwords, session tokens, signed URLs | 資格情報漏洩 |
| Government / regulated IDs | SSN, passport, national health ID | 直接個人 identity |
| Payment identifiers | PAN, CVV, full bank account | PCI exposure |
| Contact identity | email, phone used as account identity | 直接 PII |
| Person descriptors | legal name, birth date, address, notes about a person | 直接 PII |
| Health data | diagnosis, prescription | 規制 sensitive data |
| Precise location | lat/long, full street address | 位置プライバシー |
| Network identity | client IP, device fingerprint | tracking / PII |

インシデントでこれらが必要なら、明示認可付きrestricted audit exportへ。一般log retentionを広げて載せない。

### 条件付き: domain model で分類

| 種別 | ログしてよいとき | ログしないとき |
| --- | --- | --- |
| `userId`, `passengerId`, `customerId` | 自システム発行 opaque surrogate UUID/ULID | 値が email/phone、政府 ID、provider subject、PII 可逆 hash |
| `deviceId`, `installationId` | tracking リスク方針が低い opaque app 生成 surrogate | vendor advertising ID または hardware serial |
| `externalId`, `partnerRef` | 契約上 ops log 可な opaque partner reference | partner 供給値に email、phone、national ID |

条件付きIDをlog可能にするときnamed opaque型。log不可は `Redacted[T]`、adapter-only `expose`（[PII 保護](/projects/kamae-scala/pii-protection/) 参照）。

### metric と span の ID ルール

log safeなIDがmetric labelで自動safeではない。

- **Log する**: backendが許容するrequestあたりcardinalityならlog fieldとtrace attributeにaggregate ID
- **metric label にしない**: raw user/customer/passenger ID、timestamp、email、phone、IP、無界string。`state`、`command`、`errorCode`、有界 `tenantId` など有界domain label

```scala
// Good: bounded domain vocabulary.
metrics.counter("taxi_request.driver_assigned", "fleet" -> fleet.value).increment()

// Avoid: per-user labels explode cardinality and leak identity.
metrics.counter("notification.sent", "userId" -> userId.value).increment()
```

### クイック判断チェックリスト

log行にIDを足す前：

1. secretまたはauth tokenか。Yesならlogしない。
2. 直接PIIまたは規制identifierか。Yesならlogしない。
3. 埋め込みPIIなし自システムopaque surrogateか。Yesなら通常log可。
4. このfield（`toString`/span/metric label）で意図以上を露出しないか。Yesならredact、restricted auditのみ。
5. 型のformattingがsafe logging向けreview済みか。Noならlog前に型を直す。

## state 遷移を明示的に log

state遷移はdomain振る舞いの中心。before/after stateをlogしtrace、audit、インシデント調査でライフサイクル再構築可能に。

遷移がeventを出すとき、payload全体ではなくevent名またはtype（payloadがsafeでopsに有用な場合を除く）。

```scala
Logger[F].info(Map(
  "requestId" -> outcome.state.requestId.value,
  "from"      -> "waiting",
  "to"        -> "en-route",
  "events"    -> outcome.events.map(_.name).mkString(",")
))("driver assignment completed")
```

domainレベルlogはトランザクションを所有するユースケース近く。getterやvalidation helper各所に散らさない。

## error を actionable に

domain errorに失敗経路と影響objectを追跡できるcontext。周囲ユースケースのstructured identifierを再利用。ad-hocラベルを作らない。

```scala
repository.findWaiting(requestId).flatMap {
  case None =>
    Logger[F].warn(Map("requestId" -> requestId.value))("request not found") >>
      ME.raiseError(AssignDriverError.RequestNotFound(requestId))
  case Some(waiting) =>
    ME.pure(waiting)
}
```

各層で同一失敗をlogしない。ユースケースまたはapplication serviceが権威log行を所有しtyped errorを上へ。

## 構造化ログと error chain 統合

`Either` error ADTとloggingを連携し、1 log行でdomain contextと根因を見せる。

```scala
execute(requestId, driver).flatMap {
  case Left(error) =>
    Logger[F].error(Map(
      "requestId" -> requestId.value,
      "driverId"  -> driver.id.value,
      "error"     -> error.toString // ADT with safe Display, not raw PII
    ))("assign driver use case failed") >>
      ME.raiseError(error)
  case Right(value) =>
    ME.pure(value)
}
```

ガイドライン：

- error ADTの `toString` はnested error経由で `cause` を含める
- domain field（`requestId`、`command`、`errorCode`）をerrorの `toString` 内ではなく横に
- raw client errorを意味論variantへマップしてからendpoint、SQL、secretを漏らさない
- enum variant由来 `errorCode` 等bounded labelでmetric increment。full error textではない

error ADT設計は [エラーハンドリング](/projects/kamae-scala/error-handling/) と照合。ユースケースがricher domain contextで同一失敗をlog済みならrepository adapterで重複logしない。

## Tracing と span（trace4cats / OpenTelemetry）

trace4catsまたはOpenTelemetryを使うプロジェクトでは：

- spanはユースケース/application service境界。internal helper各所ではない
- span名は操作（`use_case.assign_driver`）、aggregate IDを運ぶ
- attributeは明示追加。raw DTOやpatient/user struct全体をauto-serializeしない
- logと同じID分類ルールを適用

```scala
import trace4cats.Span

Span[F].trace("use_case.assign_driver") {
  Span[F].putAll(
    "requestId" -> requestId.value,
    "driverId"  -> driver.id.value
  ) >> /* ... */
}
```

spanをdomain eventやaudit記録と混同しない。observability補助。耐久性はdomain event型またはoutbox。

## domain outcome を計測

metricsはruntime機構だけでなくビジネスoutcomeを反映。

- **Counters**: 遷移、command受理/拒否、published event等
- **Histograms**: 各aggregate state滞在時間、ユースケース実行latency等
- **Gauges**: 現在waiting request数等point-in-state

domain型由来の一貫label。TSDB向けcardinality低く。raw IDやtimestampより有界state/command名セット。

## OpenTelemetry で telemetry export

exporterはapplication startupのみ。domain/use-caseはfacade API（log4cats、Micrometer）に留める。

一般的なScalaスタック：

- **Metrics**: Micrometer + OTLP、またはOpenTelemetry Java SDKをCats Effectアプリのcomposition rootでbridge
- **Tracing**: trace4cats OTLP exporter、またはJVMサービス向けOpenTelemetry agent
- **Logs**: logback JSON appenderまたはOTLP log exporter

domain/application層を特定vendor backend向けに設計しない。

## log と metrics を相関

request、command、transaction全体でcorrelation identifierを運ぶ。structured logに含め、実用的ならtrace attributeでlog/metrics/trace間pivot。

```scala
val correlationId = CorrelationId.generate()
// MDC, span attribute, or log context map
```

spanはinternal call各所ではなくユースケース境界。操作名とaggregate identifier。実行thread詳細ではない。

レビューでは、意味のないログメッセージ、ドメイン文脈の欠如、遷移ログの不足、非構造化ログ、ドメイン次元のないメトリクス、高カーディナリティラベル、PII漏洩、誤分類ID、重複エラーログを指摘する。

## レビュー観点

マスキングルールは [PII 保護](/projects/kamae-scala/pii-protection/) も参照。

### PII とシークレットはログ、スパン、メトリクスから除外されているか — High

[PII 保護](/projects/kamae-scala/pii-protection/) も照合する。生の機密値を載せるログフィールド、スパン属性、メトリクスラベル、エラー表示文字列を指摘する。

### ログに載せる ID は正しく分類されているか — High

本文の「ログに載せるID」節も参照。文書化された安全性ではなくフィールド名の仮定でIDをログする箇所を指摘する。

型の整形がレビュー済みでPII由来でない場合、不透明サロゲート集約ID（`requestId`、`orderId`、`correlationId`、内部 `transactionId`）には指摘しない。

### エラーチェーンはドメイン文脈付きで一度だけログされているか — Medium

同一失敗を各アダプタ層で重複logする、またはerror ADTのsafe `toString` なしにエラーを文字列化するログを指摘する。

### メトリクスのカーディナリティは制御されているか — Medium

生ID、タイムスタンプ、メールアドレス、無制限文字列をラベルに使う箇所を指摘する。

### ログメッセージは意味があるか — Medium

関数名だけ、またはドメイン文脈のないログメッセージを指摘する。

### 各ログに影響を受けたドメインオブジェクトの状態が含まれるか — Medium

識別子、現在の状態バリアント、判断に必要な値を欠くログを指摘する。

### 状態遷移は明示的にログされているか — Medium

ソースとターゲットの両方の状態、または遷移を起こしたコマンド / イベントを記録しないライフサイクル変更を指摘する。

### エラーメトリクスは境界のあるラベルを使っているか — Low

生エラーテキスト、SQL断片、無制限文字列をラベルにするカウンタやヒストグラムを指摘する。

### メトリクスはドメイン結果に結びついているか — Low

HTTPステータスコード、スレッド数、汎用ランタイム値だけを数え、ドメイン次元のないメトリクスを指摘する。

### ログは構造化され、レベルは適切か — Low

補間値のみの `Logger[F].info(s"...")` や `println` を指摘する。
