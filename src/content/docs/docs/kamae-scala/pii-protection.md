---
title: "PII 保護"
sidebar:
  order: 10
---

`toString` や span 属性は、意図せず個人データや資格情報をログに載せてしまう。型でラップし、露出はアダプターに閉じる設計にしないと、可観測性がそのまま漏洩面になる。

ログとメトリクスの実装は [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/)、資格情報の扱いは [ライブラリガイド（secrets）](/docs/kamae-scala/library-guides/#secrets)、テストでの検証は [テストデータ](/docs/kamae-scala/test-data/) を参照する。

<!-- constrained-by ./logging-metrics.md -->
<!-- constrained-by ./boundary-defense.md -->

## ログに載せにくい sensitive データにする

個人データはデフォルトで redacting wrapper または検証済み opaque 型を使う。資格情報、API key、token、password、暗号 material には [ライブラリガイド（secrets）](/docs/kamae-scala/library-guides/#secrets) の credential wrapper に限定する。名前やメールなど一般 PII は safe `toString` 付き domain 型が通常で、credential wrapper ではない。

PII の例: 氏名、メール、電話、住所、政府 ID、支払識別子、健康データ、IP、精密位置。

```scala
final case class Patient(
    id: PatientId,
    email: EmailAddress,
    diagnosis: Redacted[DiagnosisCode]
)
```

raw PII を含む case class にデフォルト `toString` を使わない。opaque 型、カスタム `toString`、`Redacted[T]` wrapper を使う。

資格情報と secret:

```scala
final class ApiToken private (private val value: String):
  override def toString: String = "ApiToken(***)"
```

## `secrets` vs `Redacted[T]` — 使い分け

| 関心 | 推奨 | 理由 |
| --- | --- | --- |
| API key、password、token、private key | [ライブラリガイド（secrets）](/docs/kamae-scala/library-guides/#secrets) の opaque wrapper | 狭い `expose`、非表示 `toString` |
| 氏名、メール、電話、住所、政府 ID | `Redacted[T]` または domain opaque 型 | PII は crypto 意味の secret ではないが log に出してはならない |
| ops log で安全な opaque surrogate ID | safe `toString` 付き plain opaque 型 | [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/#どの-id-を-log-に載せるか) 参照 |
| UI または audit export に表示する値 | domain 型 + 明示 `exposeFor*` | 露出は意図的かつ命名される |

すべてのメールを credential 型に包まない。長寿命 PII をデフォルト case class `toString` だけで守らない。

## 露出は明示的に

メール配信、決済、暗号 adapter、audit export など本当に必要な境界でのみ sensitive 値を露出する。

```scala
extension (patient: Patient)
  def exposeEmailForDelivery: EmailAddress = patient.email
```

domain error や info レベル log に sensitive 値を format しない。

## ログ前に識別子を分類

`userId` や `passengerId` というフィールド名が safe を決めない。[ロギングとメトリクス](/docs/kamae-scala/logging-metrics/#どの-id-を-log-に載せるか) のルール:

- **デフォルト safe**: opaque surrogate 集約 ID、correlation ID、内部 job/transaction ID、有界 domain enum
- **ログ禁止**: secret、政府 ID、支払識別子、連絡先 identity、人物記述、健康データ、精密位置、ネットワーク tracking ID
- **条件付き**: プロジェクトが opaque surrogate と safe `toString`/`Show` と文書化した person-linked ID

決定を型に符号化。一般 log に出してはならない ID は `Redacted[T]`、制限 formatting、adapter のみ露出で accidental emission を防ぐ。

## Tracing と span フィールド

span と log 属性はデフォルトで PII を運ばない。

### sensitive 引数を auto-instrumentation から除外

マクロや AOP でメソッド引数を log するとき、patient/user DTO を除外する。surrogate ID のみの明示 attribute map を優先する。

### redacted 型向け custom `toString`

```scala
opaque type EmailAddress = String

object EmailAddress:
  extension (email: EmailAddress)
    def redacted: String =
      val local = email.value
      val at = local.indexOf('@')
      if at <= 1 then "[redacted email]" else s"${local.head}***${local.substring(at)}"

    private def value: String = email // module-private; no public .value
```

### 多層防御

多モジュールが共有 facade 経由で log するとき、OTLP や stdout 前に既知 sensitive key（`email`、`phone`、`ssn`）を strip する sanitizing appender または export filter を追加する。layer はソース redacted 型の代わりにならない。

## JSON と API 出力 redaction

Circe/Play JSON 出力を明示制御する。response DTO が redact しない限り raw PII を含む domain entity を encode しない。

```scala
final case class PatientResponse(id: PatientId, emailRedacted: String)

object PatientResponse:
  def from(patient: Patient): PatientResponse =
    PatientResponse(patient.id, patient.email.redacted)
```

大半が safe な struct では、フィールドごとの custom encoder より別の response DTO を優先する。

## `toString` vs 意図的表示

ユーザー向けテキストと開発者診断が異なるとき振る舞いを分ける:

```scala
final class EmailAddress private (private val raw: String):
  override def toString: String = "EmailAddress([redacted])"

  def exposeForDelivery: String = raw
```

- **`toString`**: PII 型はデフォルト redact。log と test を保護
- **意図的表示**: 命名メソッド経由のアダプター呼び出し箇所のみ

すべての `toString` が log に漏れるなら PII opaque 型に public `.value` を付けない。adapter では `exposeForDelivery` を優先する。

## Redaction のテスト

string 形式に raw PII が含まれないことを assert する:

```scala
test("patient toString does not leak email"):
  val patient = Patient.fixture(email = "patient@example.com")
  assert(!patient.toString.contains("patient@example.com"))
```

credential 型:

```scala
test("api token toString is hidden"):
  val token = ApiToken.parse("super-secret").toOption.get
  assert(!token.toString.contains("super-secret"))
```

合成 fixture データを使う。[テストデータ](/docs/kamae-scala/test-data/) を参照。

## よくあるスタック組み合わせ

| スタック | PII パターン |
| --- | --- |
| Opaque secret 型 + adapter | payment/auth module のみ `expose` |
| log4cats + redacted 型 | structured field、domain 型は safe `toString` |
| Circe + response DTOs | domain `Encoder` ではなく別 `PatientResponse` |
| `Either` error + PII | error variant は field 名のみ、raw 値なし |

レビューでは、error メッセージ文字列への raw email / phone / 政府 ID、PII 付き case class のデフォルト `derives Codec` や未チェック `toString`、redaction 方針なしの user/patient DTO 全体の structured log、非資格情報 PII への一律 credential wrapper、domain entity への無制限 encoder を指摘する。

[ライブラリガイド（secrets）](/docs/kamae-scala/library-guides/#secrets) で credential 固有パターンも照合する。

## レビュー観点

### Debug やログで機密データが露出しないか — High

生の機密値を含む `toString`、`tracing` フィールド、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、例外メッセージ、検証エラーにも生の PII やシークレットがないか確認する。

### PII とシークレットはラップされているか — High

メール、電話、住所、氏名、政府 ID、決済データ、健康データ、IP アドレス、精密位置、トークン、パスワードを運ぶ素の `String`、プリミティブフィールドを指摘する。

opaque secret wrapper またはプロジェクトローカルのマスキングラッパを提案する。

すべての PII 値に credential wrapper を必須としない。表示名、メール、粗い IP など非シークレット識別子は、`toString`、ログ、シリアライズがマスキングされるか意図的に公開されるならドメイン newtype でよい。

### 人物に紐づく ID は条件付きで、自動的に安全とはみなさない — High

[ロギングとメトリクス](/docs/kamae-scala/logging-metrics/) の「ログに載せる ID」の節も照合する。不透明なサロゲートである根拠なしに `userId`、`passengerId`、`customerId`、`patientId`、`deviceId`、パートナー参照をログする箇所を指摘する。

### 可観測性はデフォルトでマスキングされているか — High

マスキング方針、許可リストフィールド、明示的な安全表示ラッパなしに、任意のドメインオブジェクトや DTO を受け取るログ / メトリクスヘルパを指摘する。

### 平文露出は狭く名前付きか — Medium

機密値向けの `email()` のような広いゲッターを指摘する。アダプタ専用の露出メソッドやラッパを提案する。
