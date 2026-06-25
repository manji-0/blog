---
title: "ロギングとメトリクス"
sidebar:
  order: 10
---

`log4cats` やメトリクスは障害調査の主経路である。関数名だけのログや、生 ID をラベルにしたメトリクスは、原因特定を遅らせるうえ漏洩経路にもなる。

遷移の記録はユースケース境界で行う（[状態遷移](/docs/kamae-scala/state-transitions/)）。マスキングと ID 分類は [PII 保護](/docs/kamae-scala/pii-protection/)、エラーの一度きりの記録は [エラーハンドリング](/docs/kamae-scala/error-handling/) と整合させる。

<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->

## ドメインコンテキストで log する

各ログエントリは次の 3 点に答える。何が起きたか、どのドメインオブジェクトに関する事象か、なぜ重要か。ログはドメイン不変条件の内部ではなく、ユースケース、アプリケーションサービス、アダプターから出力する。

1. **意味のあるメッセージ**: 関数名ではなく domain 用語でイベントや判断を述べる。「`assignDriver called`」より「driver assigned to waiting request」。
2. **Domain オブジェクト state**: 判断理解に必要な identifier、現 state variant、値。structured field を優先する。
3. **遷移情報**: 操作目的が state 遷移なら、source state、target state、トリガー command または event。

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

structured logging API（log4cats、key-value marker 付き SLF4J、OpenTelemetry log attribute）を、entity 全体の文字列補間より優先する。

## 構造化ログを優先する

人間可読文から意味を parse せず key-value field を使う。集約が message でグループ化し field で filter できるよう log テンプレートを安定させる。

```scala
// Good: stable template, structured context map or MDC.
Logger[F].info(Map(
  "requestId" -> requestId.value,
  "state"     -> state.toString
))("request state persisted")

// Avoid: values baked only into free-form sentence text.
Logger[F].info(s"request ${requestId.value} persisted in state $state")
```

log レベルを意図的に選ぶ:

- `ERROR`: domain 不変条件失敗、ユースケース完了不能、インフラ依存 unhealthy。secret を漏らさず再現に足る context。
- `WARN`: リトライ可能 timeout など回復可能異常、予期外だが処理済み edge case。
- `INFO`: 重要ビジネスイベントまたはライフサイクル step。
- `DEBUG`: 特定問題診断向け詳細 state。高コスト値は DEBUG で guard。

## log から PII 漏洩を防ぐ

log は長寿命で広くアクセス可能: 公開境界として扱う。[PII 保護](/docs/kamae-scala/pii-protection/) と [ライブラリガイド（secrets）](/docs/kamae-scala/library-guides/#secrets) のルールに従う。

- raw 氏名、メール、電話、住所、位置、token、資格情報を log しない。
- opaque 型と redacting wrapper で `toString` と structured field の accidental 露出を防ぐ。
- identifier が sensitive なら hash または opaque reference を log。

分類ルールは [どの ID を log に載せるか](#どの-id-を-log-に載せるか) 参照。

## どの ID を log に載せるか

log、span、metrics、error に到達する前に identifier を分類。フィールド名は safe を決めない。identifier の意味、 derivation、再識別リスクが決める。

### デフォルト: log してよい

運用相関に役立ち secret や直接個人 identity を露出しないとき:

| 種別 | 例 | 通常安全な理由 |
| --- | --- | --- |
| Correlation / tracing | `correlationId`, `traceId`, `spanId`, HTTP `requestId` | 一時的または運用向け。identity ではない |
| Internal aggregate IDs | `orderId`, `requestId`, `shipmentId`, `commandId`, `eventId` | サービス内 opaque surrogate key |
| Process / job IDs | `jobId`, `outboxId`, `batchId`, internal `transactionId` | インフラ相関 |
| Tenant / org context | `tenantId`, `organizationId`, `fleetId` | アクセス制御下 multi-tenant ops に必要 |
| Bounded domain enums | `state`, `commandName`, `eventType`, `errorCode` | 低 cardinality。個人データではない |

「log してよい」の要件:

1. **Opaque surrogate**: システム内ランダムまたは sequential。email、phone、氏名、政府 ID、カードデータ由来でない。
2. **Secret ではない**: session token、API key、password、signed URL capability ではない。
3. **単体再識別リスク低**: 値単体がアプリ制御 datastore 外で自然人を特定しない。
4. **Safe `toString` / `Show`**: opaque 型の formatting 経路が log 向けに review 済みで nested PII を露出しない。

### デフォルト: log しない

一般 application log、span、metrics label、error 文字列に載せない:

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

インシデントでこれらが必要なら、明示認可付き restricted audit export へ。一般 log retention を広げて載せない。

### 条件付き: domain model で分類

| 種別 | ログしてよいとき | ログしないとき |
| --- | --- | --- |
| `userId`, `passengerId`, `customerId` | 自システム発行 opaque surrogate UUID/ULID | 値が email/phone、政府 ID、provider subject、PII 可逆 hash |
| `deviceId`, `installationId` | tracking リスク方針が低い opaque app 生成 surrogate | vendor advertising ID または hardware serial |
| `externalId`, `partnerRef` | 契約上 ops log 可な opaque partner reference | partner 供給値に email、phone、national ID |

条件付き ID を log 可能にするとき named opaque 型。log 不可は `Redacted[T]`、adapter-only `expose`（[PII 保護](/docs/kamae-scala/pii-protection/) 参照）。

### metric と span の ID ルール

log safe な ID が metric label で自動 safe ではない。

- **Log する**: backend が許容する request あたり cardinality なら log field と trace attribute に aggregate ID
- **metric label にしない**: raw user/customer/passenger ID、timestamp、email、phone、IP、無界 string。`state`、`command`、`errorCode`、有界 `tenantId` など有界 domain label

```scala
// Good: bounded domain vocabulary.
metrics.counter("taxi_request.driver_assigned", "fleet" -> fleet.value).increment()

// Avoid: per-user labels explode cardinality and leak identity.
metrics.counter("notification.sent", "userId" -> userId.value).increment()
```

### クイック判断チェックリスト

log 行に ID を足す前:

1. secret または auth token か。Yes なら log しない。
2. 直接 PII または規制 identifier か。Yes なら log しない。
3. 埋め込み PII なし自システム opaque surrogate か。Yes なら通常 log 可。
4. この field（`toString`/span/metric label）で意図以上を露出しないか。Yes なら redact、restricted audit のみ。
5. 型の formatting が safe logging 向け review 済みか。No なら log 前に型を直す。

## state 遷移を明示的に log

state 遷移は domain 振る舞いの中心。before/after state を log し trace、audit、インシデント調査でライフサイクル再構築可能に。

遷移が event を出すとき、payload 全体ではなく event 名または type（payload が safe で ops に有用な場合を除く）。

```scala
Logger[F].info(Map(
  "requestId" -> outcome.state.requestId.value,
  "from"      -> "waiting",
  "to"        -> "en-route",
  "events"    -> outcome.events.map(_.name).mkString(",")
))("driver assignment completed")
```

domain レベル log はトランザクションを所有するユースケース近く。getter や validation helper 各所に散らさない。

## error を actionable に

domain error に失敗経路と影響 object を追跡できる context。周囲ユースケースの structured identifier を再利用。ad-hoc ラベルを作らない。

```scala
repository.findWaiting(requestId).flatMap {
  case None =>
    Logger[F].warn(Map("requestId" -> requestId.value))("request not found") >>
      ME.raiseError(AssignDriverError.RequestNotFound(requestId))
  case Some(waiting) =>
    ME.pure(waiting)
}
```

各層で同一失敗を log しない。ユースケースまたは application service が権威 log 行を所有し typed error を上へ。

## 構造化ログと error chain 統合

`Either` error ADT と logging を連携し、1 log 行で domain context と根因を見せる。

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

ガイドライン:

- error ADT の `toString` は nested error 経由で `cause` を含める
- domain field（`requestId`、`command`、`errorCode`）を error の `toString` 内ではなく横に
- raw client error が endpoint、SQL、secret を漏らす前に意味論 variant にマップ
- enum variant 由来 `errorCode` 等 bounded label で metric increment。full error text ではない

error ADT 設計は [エラーハンドリング](/docs/kamae-scala/error-handling/) と照合。ユースケースが richer domain context で同一失敗を log 済みなら repository adapter で重複 log しない。

## Tracing と span（trace4cats / OpenTelemetry）

trace4cats または OpenTelemetry を使うプロジェクトでは:

- span はユースケース/application service 境界。internal helper 各所ではない
- span 名は操作（`use_case.assign_driver`）、aggregate ID を運ぶ
- attribute は明示追加。raw DTO や patient/user struct 全体を auto-serialize しない
- log と同じ ID 分類ルールを適用

```scala
import trace4cats.Span

Span[F].trace("use_case.assign_driver") {
  Span[F].putAll(
    "requestId" -> requestId.value,
    "driverId"  -> driver.id.value
  ) >> /* ... */
}
```

span を domain event や audit 記録と混同しない。observability 補助。耐久性は domain event 型または outbox。

## domain outcome を計測

metrics は runtime 機構だけでなくビジネス outcome を反映。

- **Counters**: 遷移、command 受理/拒否、published event 等
- **Histograms**: 各 aggregate state 滞在時間、ユースケース実行 latency 等
- **Gauges**: 現在 waiting request 数等 point-in-state

domain 型由来の一貫 label。TSDB 向け cardinality 低く。raw ID や timestamp より有界 state/command 名セット。

## OpenTelemetry で telemetry export

exporter は application startup のみ。domain/use-case は facade API（log4cats、Micrometer）に留める。

一般的な Scala スタック:

- **Metrics**: Micrometer + OTLP、または OpenTelemetry Java SDK を Cats Effect アプリの composition root で bridge
- **Tracing**: trace4cats OTLP exporter、または JVM サービス向け OpenTelemetry agent
- **Logs**: logback JSON appender または OTLP log exporter

domain/application 層を特定 vendor backend 向けに設計しない。

## log と metrics を相関

request、command、transaction 全体で correlation identifier を運ぶ。structured log に含め、実用的なら trace attribute で log/metrics/trace 間 pivot。

```scala
val correlationId = CorrelationId.generate()
// MDC, span attribute, or log context map
```

span は internal call 各所ではなくユースケース境界。操作名と aggregate identifier。実行 thread 詳細ではない。

レビューでは、意味のないログメッセージ、ドメイン文脈の欠如、遷移ログの不足、非構造化ログ、ドメイン次元のないメトリクス、高カーディナリティラベル、PII 漏洩、誤分類 ID、重複エラーログを指摘する。

## レビュー観点

マスキングルールは [PII 保護](/docs/kamae-scala/pii-protection/) も参照。

### PII とシークレットはログ、スパン、メトリクスから除外されているか — High

[PII 保護](/docs/kamae-scala/pii-protection/) も照合する。生の機密値を載せるログフィールド、スパン属性、メトリクスラベル、エラー表示文字列を指摘する。

### ログに載せる ID は正しく分類されているか — High

本文の「ログに載せる ID」節も参照。文書化された安全性ではなくフィールド名の仮定で ID をログする箇所を指摘する。

型の整形がレビュー済みで PII 由来でない場合、不透明サロゲート集約 ID（`requestId`、`orderId`、`correlationId`、内部 `transactionId`）には指摘しない。

### エラーチェーンはドメイン文脈付きで一度だけログされているか — Medium

同一失敗を各アダプタ層で重複 log する、または error ADT の safe `toString` なしにエラーを文字列化するログを指摘する。

### メトリクスのカーディナリティは制御されているか — Medium

生 ID、タイムスタンプ、メールアドレス、無制限文字列をラベルに使う箇所を指摘する。

### ログメッセージは意味があるか — Medium

関数名だけ、またはドメイン文脈のないログメッセージを指摘する。

### 各ログに影響を受けたドメインオブジェクトの状態が含まれるか — Medium

識別子、現在の状態バリアント、判断に必要な値を欠くログを指摘する。

### 状態遷移は明示的にログされているか — Medium

ソースとターゲットの両方の状態、または遷移を起こしたコマンド / イベントを記録しないライフサイクル変更を指摘する。

### エラーメトリクスは境界のあるラベルを使っているか — Low

生エラーテキスト、SQL 断片、無制限文字列をラベルにするカウンタやヒストグラムを指摘する。

### メトリクスはドメイン結果に結びついているか — Low

HTTP ステータスコード、スレッド数、汎用ランタイム値だけを数え、ドメイン次元のないメトリクスを指摘する。

### ログは構造化され、レベルは適切か — Low

補間値のみの `Logger[F].info(s"...")` や `println` を指摘する。
