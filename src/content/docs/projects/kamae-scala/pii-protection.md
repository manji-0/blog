---
title: "PII 保護"
sidebar:
  order: 10
---

`toString` やspan属性は、意図せず個人データや資格情報をログに載せてしまう。型でラップし、露出をアダプターで閉じる設計にしないと、可観測性がそのまま漏洩面になる。

ログとメトリクスの実装は [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/)、資格情報の扱いは [ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets)、テストでの検証は [テストデータ](/projects/kamae-scala/test-data/) を参照する。

<!-- constrained-by ./logging-metrics.md -->
<!-- constrained-by ./boundary-defense.md -->

## ログに載せにくい sensitive データにする

個人データはデフォルトでredacting wrapperまたは検証済みopaque型を使う。資格情報、API key、token、password、暗号materialには [ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets) のcredential wrapperに限定する。名前やメールなど一般PIIはsafe `toString` 付きdomain型が通常で、credential wrapperではない。

PIIの例： 氏名、メール、電話、住所、政府ID、支払識別子、健康データ、IP、精密位置。

```scala
final case class Patient(
    id: PatientId,
    email: EmailAddress,
    diagnosis: Redacted[DiagnosisCode]
)
```

raw PIIを含むcase classにデフォルト `toString` を使わない。opaque型、カスタム `toString`、`Redacted[T]` wrapperを使う。

資格情報とsecret:

```scala
final class ApiToken private (private val value: String):
  override def toString: String = "ApiToken(***)"
```

## `secrets` vs `Redacted[T]` — 使い分け

| 関心 | 推奨 | 理由 |
| --- | --- | --- |
| API key、password、token、private key | [ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets) の opaque wrapper | 狭い `expose`、非表示 `toString` |
| 氏名、メール、電話、住所、政府 ID | `Redacted[T]` または domain opaque 型 | PII は crypto 意味の secret ではないが log に出してはならない |
| ops log で安全な opaque surrogate ID | safe `toString` 付き plain opaque 型 | [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/#どの-id-を-log-に載せるか) 参照 |
| UI または audit export に表示する値 | domain 型 + 明示 `exposeFor*` | 露出は意図的かつ命名される |

すべてのメールをcredential型に包まない。長寿命PIIをデフォルトcase class `toString` だけで守らない。

## 露出は明示的に

メール配信、決済、暗号adapter、audit exportなど本当に必要な境界でのみsensitive値を露出する。

```scala
extension (patient: Patient)
  def exposeEmailForDelivery: EmailAddress = patient.email
```

domain errorやinfoレベルlogにsensitive値をformatしない。

## ログ前に識別子を分類

`userId` や `passengerId` というフィールド名がsafeを決めない。[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/#どの-id-を-log-に載せるか) のルール：

- **デフォルト safe**: opaque surrogate集約ID、correlation ID、内部job/transaction ID、有界domain enum
- **ログ禁止**: secret、政府ID、支払識別子、連絡先identity、人物記述、健康データ、精密位置、ネットワークtracking ID
- **条件付き**: プロジェクトがopaque surrogate、safe `toString`/`Show`、および文書化したperson-linked ID

決定を型に符号化。一般logに出してはならないIDは `Redacted[T]`、制限formatting、adapterのみ露出でaccidental emissionを防ぐ。

## Tracing と span フィールド

spanとlog属性はデフォルトでPIIを運ばない。

### sensitive 引数を auto-instrumentation から除外

マクロやAOPでメソッド引数をlogするとき、patient/user DTOを除外する。surrogate IDのみの明示attribute mapを優先する。

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

多モジュールが共有facade経由でlogするとき、OTLPやstdout前に既知sensitive key（`email`、`phone`、`ssn`）をstripするsanitizing appenderまたはexport filterを追加する。layerはソースredacted型の代わりにならない。

## JSON と API 出力 redaction

Circe/Play JSON出力を明示制御する。response DTOがredactしない限りraw PIIを含むdomain entityをencodeしない。

```scala
final case class PatientResponse(id: PatientId, emailRedacted: String)

object PatientResponse:
  def from(patient: Patient): PatientResponse =
    PatientResponse(patient.id, patient.email.redacted)
```

大半がsafeなstructでは、フィールドごとのcustom encoderより別のresponse DTOを優先する。

## `toString` vs 意図的表示

ユーザー向けテキストと開発者診断が異なるとき振る舞いを分ける：

```scala
final class EmailAddress private (private val raw: String):
  override def toString: String = "EmailAddress([redacted])"

  def exposeForDelivery: String = raw
```

- **`toString`**: PII型はデフォルトredact。logとtestを保護
- **意図的表示**: 命名メソッド経由のアダプター呼び出し箇所のみ

すべての `toString` がlogに漏れるならPII opaque型へpublic `.value` を付けない。adapterでは `exposeForDelivery` を優先する。

## Redaction のテスト

string形式にraw PIIが含まれないことをassertする：

```scala
test("patient toString does not leak email"):
  val patient = Patient.fixture(email = "patient@example.com")
  assert(!patient.toString.contains("patient@example.com"))
```

credential型：

```scala
test("api token toString is hidden"):
  val token = ApiToken.parse("super-secret").toOption.get
  assert(!token.toString.contains("super-secret"))
```

合成fixtureデータを使う。[テストデータ](/projects/kamae-scala/test-data/) を参照。

## よくあるスタック組み合わせ

| スタック | PII パターン |
| --- | --- |
| Opaque secret 型 + adapter | payment/auth module のみ `expose` |
| log4cats + redacted 型 | structured field、domain 型は safe `toString` |
| Circe + response DTOs | domain `Encoder` ではなく別 `PatientResponse` |
| `Either` error + PII | error variant は field 名のみ、raw 値なし |

レビューでは、errorメッセージ文字列へのraw email / phone / 政府ID、PII付きcase classのデフォルト `derives Codec` や未チェック `toString`、redaction方針なしのuser/patient DTO structured logを指摘する。非資格情報PIIへの一律credential wrapperやdomain entityへの無制限encoderも同様である。

[ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets) でcredential固有パターンも照合する。

## レビュー観点

### Debug やログで機密データが露出しないか — High

生の機密値を含む `toString`、`tracing` フィールド、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、例外メッセージ、検証エラーにも生のPIIやシークレットがないか確認する。

### PII とシークレットはラップされているか — High

メール、電話、住所、氏名、政府ID、決済データ、健康データ、IPアドレス、精密位置、トークン、パスワードを運ぶ素の `String`、プリミティブフィールドを指摘する。

opaque secret wrapperまたはプロジェクトローカルのマスキングラッパを提案する。

すべてのPII値にcredential wrapperを必須としない。表示名、メール、粗いIPなど非シークレット識別子は、`toString`、ログ、シリアライズがマスキングされるか意図的に公開されるならドメインnewtypeでよい。

### 人物に紐づく ID は条件付きで、自動的に安全とはみなさない — High

[ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) の「ログに載せるID」の節も照合する。不透明なサロゲートである根拠なしに `userId`、`passengerId`、`customerId`、`patientId`、`deviceId`、パートナー参照をログする箇所を指摘する。

### 可観測性はデフォルトでマスキングされているか — High

マスキング方針、許可リストフィールド、明示的な安全表示ラッパなしに、任意のドメインオブジェクトやDTOを受け取るログ / メトリクスヘルパを指摘する。

### 平文露出は狭く名前付きか — Medium

機密値向けの `email()` のような広いゲッターを指摘する。アダプタ専用の露出メソッドやラッパを提案する。
