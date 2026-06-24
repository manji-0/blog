---
title: "PII 保護"
sidebar:
  order: 10
---

> **いつ読むか:** PII・シークレットのラップ、`Debug` / ログ / シリアライズの redaction を設計するとき。
> **関連:** [`logging-metrics.md`](/docs/kamae/rust/logging-metrics/)、[`crate-guides/secrecy.md`](/docs/kamae/rust/crate-guides/secrecy/)、[`test-data.md`](/docs/kamae/rust/test-data/)。

## ログに載せにくい sensitive データにする

個人データはデフォルトで redacting wrapper または typed value object を使う。資格情報、API key、token、password、暗号 material には `secrecy::SecretString` または `SecretBox<T>` を reserve。名前やメールなど一般 PII は `Redacted<T>` または safe `Debug` 付き domain newtype が通常で、`secrecy` ではない。

PII の例: 氏名、メール、電話、住所、政府 ID、支払識別子、健康データ、IP、精密位置。

```rust
pub struct Redacted<T>(T);

pub struct Patient {
    id: PatientId,
    email: EmailAddress,
    diagnosis: Redacted<DiagnosisCode>,
}
```

raw PII を含む struct に `Debug` derive しない。`Debug` が必要なら sensitive field を手動 redact するか、redact する wrapper の `Debug` に依存。

資格情報と secret には secrecy 型:

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
| ops log で安全な opaque surrogate ID | safe `Display` 付き plain newtype | [`logging-metrics.md`](/docs/kamae/rust/logging-metrics/#which-ids-belong-in-logs) 参照 |
| UI または audit export に表示する値 | domain 型 + 明示 `expose_for_*` | 露出は意図的かつ命名される |

`secrecy` は資格情報処理とメモリ衛生向け。`Redacted<T>` は個人データの accidental log 防止向け。すべてのメールを `SecretString` に包まない。長寿命 PII を `Debug` derive だけで守らない。

## 露出は明示的に

メール配信、決済、暗号 adapter、audit export など本当に必要な境界でのみ sensitive 値を露出。露出を伝えるメソッド名を優先:

```rust
pub fn expose_for_delivery(&self) -> &EmailAddress {
    &self.email
}
```

domain error や log に sensitive 値を format しない。

## ログ前に識別子を分類

`user_id` や `passenger_id` というフィールド名が safe を決めない。[`logging-metrics.md`](/docs/kamae/rust/logging-metrics/#which-ids-belong-in-logs) のルール:

- **デフォルト safe**: opaque surrogate 集約 ID、correlation ID、内部 job/transaction ID、有界 domain enum
- **ログ禁止**: secret、政府 ID、支払識別子、連絡先 identity、人物記述、健康データ、精密位置、ネットワーク tracking ID
- **条件付き**: プロジェクトが opaque surrogate と safe `Display`/`Debug` と文書化した person-linked ID（`user_id`、`customer_id`、`patient_id`、`device_id`、partner ref）

決定を型に符号化。一般 log に出してはならない ID は `Redacted<T>`、制限 formatting、adapter のみ露出で accidental emission を防ぐ。

## Tracing と span フィールド

`tracing` は span/event に付いた field 値を記録する。PII はデフォルトで span に入れない。

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

PII を含む struct や引数全体は `skip`。safe と分類した surrogate ID のみ log。

### redacted 型向け custom `Display` / `Value`

```rust
impl std::fmt::Display for Redacted<EmailAddress> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[redacted email]")
    }
}
```

structured field が必要なときだけ `tracing::Value` を impl。human-readable trace では redacted `Display` をデフォルト。

### 多層防御の custom `Layer`

多 crate が `tracing` 経由で log するとき、OTLP や stdout 前に subscriber layer で既知 sensitive key（`email`、`phone`、`ssn`）を strip または hash。layer はソース redacted 型の代わりにならない。コンプライアンスで belt-and-suspenders が必要なら両方。

## Serde 出力 redaction

API response と audit export ではシリアライズを明示制御。raw PII を含む domain struct を response DTO が redact しない限り serialize しない。

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

大半が safe な struct では field ごと `serialize_with` より別 response DTO。otherwise safe struct の 1 field だけ redaction が必要なとき `serialize_with`。

## `Display` vs `Debug`

ユーザー向けテキストと開発者診断が異なるとき impl を分ける:

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

- **`Debug`**: PII 型はデフォルト redact。log、test、`tracing` debug 出力の `{:?}` を保護
- **`Display`**: 意図的用户 visible または adapter 出力。call site を狭く

すべての `to_string()` が log に漏れるなら PII 型に `Display` derive しない。adapter では `expose_for_delivery()` が `&str` を返す形を優先。

## Redaction のテスト

debug 出力に raw PII が含まれないことを assert:

```rust
#[test]
fn patient_debug_does_not_leak_email() {
    let patient = Patient::fixture_with_email("patient@example.com");
    let debug = format!("{patient:?}");
    assert!(!debug.contains("patient@example.com"));
    assert!(debug.contains("redacted") || !debug.contains('@'));
}
```

`secrecy` 型:

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

assert が決定論的になるよう既知値の fixture builder。[`test-data.md`](/docs/kamae/rust/test-data/) で合成データ慣習。

## よくある crate 組み合わせ

| スタック | PII パターン |
| --- | --- |
| `secrecy` + adapter | payment/auth adapter のみ `ExposeSecret` |
| `tracing` + redacted newtypes | span で `skip`、domain 型は safe `Debug` |
| `serde` + response DTOs | `serialize_with` または別 `PatientResponse` |
| `thiserror` + PII | error variant は field 名のみ、raw 値なし |


レビューでは、error の `#[error(...)]` への raw email / phone / 政府 ID、redaction なしの `#[derive(Debug)]`、patient / user struct への `skip` なし `tracing::instrument`、非資格情報 PII への一律 `SecretString`、ドメイン entity への無制限 `Serialize` を指摘する。

## レビュー観点

### 5.1 PII とシークレットはラップされているか — High

メール、電話、住所、氏名、政府 ID、決済データ、健康データ、IP アドレス、精密位置、トークン、パスワードを運ぶ素の `String`、`Vec<u8>`、プリミティブフィールドを指摘する。

`secrecy::SecretString`、`SecretBox<T>`、またはプロジェクトローカルのマスキングラッパを提案する。

すべての PII 値に `SecretString` を必須としない。表示名、メール、粗い IP など非シークレット識別子は、`Debug`、ログ、シリアライズがマスキングされるか意図的に公開されるならドメイン newtype でよい。

### 5.2 Debug やログで機密データが露出しないか — High

生の機密値を含む `#[derive(Debug)]`、`tracing` フィールド、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、パニックメッセージ、検証エラーにも生の PII やシークレットがないか確認する。

### 5.3 平文露出は狭く名前付きか — Medium

機密値向けの `email(&self) -> &str` のような広いゲッターを指摘する。アダプタ専用の露出メソッドやラッパを提案する。

### 5.4 可観測性はデフォルトでマスキングされているか — High

マスキング方針、許可リストフィールド、明示的な安全表示ラッパなしに、任意のドメインオブジェクトや DTO を受け取るログ / メトリクスヘルパを指摘する。

### 5.5 人物に紐づく ID は条件付きで、自動的に安全とはみなさない — High

[`logging-metrics.md`](/docs/kamae/rust/logging-metrics/) の「ログに載せる ID」の節も照合する。不透明なサロゲートである根拠なしに `user_id`、`passenger_id`、`customer_id`、`patient_id`、`device_id`、パートナー参照をログする箇所を指摘する。

`request_id`、`order_id`、`correlation_id` のような内部集約 ID で、明らかにサロゲートキーかつ安全な整形である場合は指摘しない。
