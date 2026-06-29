---
title: "PII 保護"
sidebar:
  order: 10
---

`Debug` deriveやspanフィールドは、意図せず個人データや資格情報をログに載せてしまう。型でラップし、露出をアダプターで閉じる設計にしないと、可観測性がそのまま漏洩面になる。

ログとメトリクスの実装は [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/)、資格情報の扱いは [クレートガイド（secrecy）](/projects/kamae-rs/crate-guides/#secrecy)、テストでの検証は [テストデータ](/projects/kamae-rs/test-data/) を参照する。

## ログに載せにくい sensitive データにする

個人データはデフォルトでredacting wrapperまたはtyped value objectを使う。資格情報、API key、token、password、暗号materialには `secrecy::SecretString` または `SecretBox<T>` に限定する。名前やメールなど一般PIIは `Redacted<T>` またはsafe `Debug` 付きdomain newtypeが通常で、`secrecy` ではない。

PIIの例： 氏名、メール、電話、住所、政府ID、支払識別子、健康データ、IP、精密位置。

```rust
pub struct Redacted<T>(T);

pub struct Patient {
    id: PatientId,
    email: EmailAddress,
    diagnosis: Redacted<DiagnosisCode>,
}
```

raw PIIを含むstructに `Debug` deriveしない。`Debug` が必要ならsensitive fieldを手動redactするか、redactするwrapperの `Debug` に依存。

資格情報とsecretにはsecrecy型：

```rust
use secrecy::SecretString;

pub struct PaymentGatewayCredentials {
    api_key: SecretString,
}
```

## `secrecy` vs `Redacted<T>` — 使い分け

| 関心 | 推奨 | 理由 |
| --- | --- | --- |
| API key、password、token、private key | `secrecy::SecretString` / `SecretBox` | drop 時 zeroize。`Debug` はデフォルト非表示 |
| 氏名、メール、電話、住所、政府 ID | `Redacted<T>` または domain newtype | PII は crypto 意味の secret ではないが log に出してはならない |
| ops log で安全な opaque surrogate ID | safe `Display` 付き plain newtype | [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/#which-ids-belong-in-logs) 参照 |
| UI または audit export に表示する値 | domain 型 + 明示 `expose_for_*` | 露出は意図的かつ命名される |

`secrecy` は資格情報処理とメモリ衛生向け。`Redacted<T>` は個人データのaccidental log防止向け。すべてのメールを `SecretString` に包まない。長寿命PIIを `Debug` deriveだけで守らない。

## 露出は明示的に

メール配信、決済、暗号adapter、audit exportなど本当に必要な境界でのみsensitive値を露出。露出を伝えるメソッド名を優先：

```rust
pub fn expose_for_delivery(&self) -> &EmailAddress {
    &self.email
}
```

domain errorやlogにsensitive値をformatしない。

## ログ前に識別子を分類

`user_id` や `passenger_id` というフィールド名がsafeを決めない。[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/#which-ids-belong-in-logs) のルール：

- **デフォルト safe**: opaque surrogate集約ID、correlation ID、内部job/transaction ID、有界domain enum
- **ログ禁止**: secret、政府ID、支払識別子、連絡先identity、人物記述、健康データ、精密位置、ネットワークtracking ID
- **条件付き**: プロジェクトがopaque surrogate、safe `Display`/`Debug`、および文書化したperson-linked ID（`user_id`、`customer_id`、`patient_id`、`device_id`、partner ref）

決定を型に符号化。一般logに出してはならないIDは `Redacted<T>`、制限formatting、adapterのみ露出でaccidental emissionを防ぐ。

## Tracing と span フィールド

`tracing` はspan/eventに付いたfield値を記録する。PIIはデフォルトでspanに入れない。

### sensitive field を skip

```rust
#[tracing::instrument(
    name = "send_receipt",
    skip(patient),
    fields(patient_id = %patient.id())
)]
pub async fn send_receipt(patient: &Patient) -> Result<(), SendError> {
    // ...
    Ok(())
}
```

PIIを含むstructや引数全体は `skip`。safeと分類したsurrogate IDのみlog。

### redacted 型向け custom `Display` / `Value`

```rust
impl std::fmt::Display for Redacted<EmailAddress> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[redacted email]")
    }
}
```

structured fieldが必要なときだけ `tracing::Value` をimpl。human-readable traceではredacted `Display` をデフォルト。

### 多層防御の custom `Layer`

多crateが `tracing` 経由でlogするとき、OTLPやstdout前にsubscriber layerで既知sensitive key（`email`、`phone`、`ssn`）をstripまたはhash。layerはソースredacted型の代わりにならない。コンプライアンスでbelt-and-suspendersが必要なら両方。

## Serde 出力 redaction

API responseとaudit exportではシリアライズを明示制御。raw PIIを含むdomain structをresponse DTOがredactしない限りserializeしない。

```rust
fn redact_email<S>(value: &EmailAddress, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str("[redacted]")
}

#[derive(serde::Serialize)]
pub struct PatientResponse {
    id: PatientId,
    #[serde(serialize_with = "redact_email")]
    email: EmailAddress,
}
```

大半がsafeなstructでは、フィールドごとの `serialize_with` より別のresponse DTOを優先する。それ以外はsafeなstructのうち1フィールドだけマスキングが必要なときに `serialize_with` を使う。

## `Display` vs `Debug`

ユーザー向けテキストと開発者診断が異なるときimplを分ける：

```rust
impl std::fmt::Debug for EmailAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("EmailAddress([redacted])")
    }
}

impl std::fmt::Display for EmailAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Only used at boundaries that intentionally show the address
        f.write_str(self.as_str())
    }
}
```

- **`Debug`**: PII型はデフォルトredact。log、test、`tracing` debug出力の `{:?}` を保護
- **`Display`**: 意図的なユーザー向け表示、またはアダプター出力用。呼び出し箇所を狭く保つ

すべての `to_string()` がlogに漏れるならPII型へ `Display` deriveしない。adapterでは `expose_for_delivery()` が `&str` を返す形を優先。

## Redaction のテスト

debug出力にraw PIIが含まれないことをassert:

```rust
#[test]
fn patient_debug_does_not_leak_email() {
    let patient = Patient::fixture_with_email("patient@example.com");
    let debug = format!("{patient:?}");
    assert!(!debug.contains("patient@example.com"));
    assert!(debug.contains("redacted") || !debug.contains('@'));
}
```

`secrecy` 型：

```rust
#[test]
fn credentials_debug_is_hidden() {
    let creds = PaymentGatewayCredentials {
        api_key: SecretString::new("super-secret".into()),
    };
    let debug = format!("{creds:?}");
    assert!(!debug.contains("super-secret"));
}
```

assertが決定論的になるよう既知値のfixture builder。[テストデータ](/projects/kamae-rs/test-data/) で合成データ慣習。

## よくある crate 組み合わせ

| スタック | PII パターン |
| --- | --- |
| `secrecy` + adapter | payment/auth adapter のみ `ExposeSecret` |
| `tracing` + redacted newtypes | span で `skip`、domain 型は safe `Debug` |
| `serde` + response DTOs | `serialize_with` または別 `PatientResponse` |
| `thiserror` + PII | error variant は field 名のみ、raw 値なし |


レビューでは、errorの `#[error(...)]` へのraw email / phone / 政府IDやredactionなしの `#[derive(Debug)]` を指摘する。patient / user structへの `skip` なし `tracing::instrument`、非資格情報PIIへの一律 `SecretString`、ドメインentityへの無制限 `Serialize` も同様である。

## レビュー観点

### Debug やログで機密データが露出しないか — High

生の機密値を含む `#[derive(Debug)]`、`tracing` フィールド、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、パニックメッセージ、検証エラーにも生のPIIやシークレットがないか確認する。

### PII とシークレットはラップされているか — High

メール、電話、住所、氏名、政府ID、決済データ、健康データ、IPアドレス、精密位置、トークン、パスワードを運ぶ素の `String`、`Vec<u8>`、プリミティブフィールドを指摘する。

`secrecy::SecretString`、`SecretBox<T>`、またはプロジェクトローカルのマスキングラッパを提案する。

すべてのPII値に `SecretString` を必須としない。表示名、メール、粗いIPなど非シークレット識別子は、`Debug`、ログ、シリアライズがマスキングされるか意図的に公開されるならドメインnewtypeでよい。

### 人物に紐づく ID は条件付きで、自動的に安全とはみなさない — High

[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) の「ログに載せるID」の節も照合する。不透明なサロゲートである根拠なしに `user_id`、`passenger_id`、`customer_id`、`patient_id`、`device_id`、パートナー参照をログする箇所を指摘する。

`request_id`、`order_id`、`correlation_id` のような内部集約IDで、明らかにサロゲートキーかつ安全な整形である場合は指摘しない。

### 可観測性はデフォルトでマスキングされているか — High

マスキング方針、許可リストフィールド、明示的な安全表示ラッパなしに、任意のドメインオブジェクトやDTOを受け取るログ / メトリクスヘルパを指摘する。

### 平文露出は狭く名前付きか — Medium

機密値向けの `email(&self) -> &str` のような広いゲッターを指摘する。アダプタ専用の露出メソッドやラッパを提案する。

