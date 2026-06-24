---
title: "Rust PII Protection"
sidebar:
  order: 10
---

## Make Sensitive Data Hard to Log

Use a redacting wrapper or a typed value object by default for personal data.
Reserve `secrecy::SecretString` or `SecretBox<T>` for credentials, API keys,
tokens, passwords, and cryptographic material. General PII such as names or
email addresses usually belongs in `Redacted<T>` or a domain newtype with a
safe `Debug` implementation, not in `secrecy`.

PII examples include names, email addresses, phone numbers, addresses, government IDs, payment identifiers, health data, IP addresses, and precise location data.

```rust
pub struct Redacted<T>(T);

pub struct Patient {
    id: PatientId,
    email: EmailAddress,
    diagnosis: Redacted<DiagnosisCode>,
}
```

Avoid deriving `Debug` on structs that contain raw PII. If `Debug` is needed,
redact sensitive fields manually or rely on a wrapper whose `Debug`
implementation redacts.

For credentials and secrets, prefer a secrecy type:

```rust
use secrecy::SecretString;

pub struct PaymentGatewayCredentials {
    api_key: SecretString,
}
```

## `secrecy` vs `Redacted<T>` — When to Use Which

| Concern | Prefer | Rationale |
| --- | --- | --- |
| API keys, passwords, tokens, private keys | `secrecy::SecretString` / `SecretBox` | Zeroization on drop; `Debug` hidden by default |
| Names, email, phone, address, government ID | `Redacted<T>` or domain newtype | PII is not a "secret" in the crypto sense but must not appear in logs |
| Opaque surrogate IDs safe for ops logs | Plain newtype with safe `Display` | See [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/#which-ids-belong-in-logs) |
| Values shown in UI or audit export | Domain type + explicit `expose_for_*` | Exposure is deliberate and named |

`secrecy` optimizes for credential handling and memory hygiene. `Redacted<T>` optimizes for preventing accidental log emission of personal data. Do not wrap every email in `SecretString`; do not store long-lived PII only behind `Debug` derive.

## Keep Exposure Explicit

Expose sensitive values only at boundaries that genuinely need them, such as
email delivery, payment processors, encryption adapters, or audit export jobs.
Prefer methods named to communicate exposure:

```rust
pub fn expose_for_delivery(&self) -> &EmailAddress {
    &self.email
}
```

Never format sensitive values into domain errors or logs.

## Classify Identifiers Before Logging

Field names such as `user_id` or `passenger_id` do not make an identifier safe.
Apply the rules in [`logging-metrics.md`](/docs/kamae-rs/references/logging-metrics/#which-ids-belong-in-logs):

- **Safe by default**: opaque surrogate aggregate IDs, correlation IDs, internal
  job/transaction IDs, and bounded domain enums.
- **Never log**: secrets, government IDs, payment identifiers, contact identity,
  person descriptors, health data, precise location, and network tracking IDs.
- **Conditional**: person-linked IDs (`user_id`, `customer_id`, `patient_id`,
  `device_id`, partner references) only when the project documents them as opaque
  surrogates with safe `Display` / `Debug`.

Encode the decision in the type. If an ID must not appear in general logs,
prevent accidental emission through `Redacted<T>`, restricted formatting, or
adapter-only exposure.

## Tracing and Span Fields

`tracing` records field values attached to spans and events. PII must not enter spans by default.

### Skip sensitive fields

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

Use `skip` for whole structs or arguments that contain PII. Log only surrogate IDs you have classified as safe.

### Custom `Display` / `Value` for redacted types

```rust
impl std::fmt::Display for Redacted<EmailAddress> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[redacted email]")
    }
}
```

Implement `tracing::Value` only when you need structured fields; default to redacted `Display` for human-readable traces.

### Custom `Layer` for defense in depth

When many crates log through `tracing`, add a subscriber layer that strips or hashes known sensitive keys (`email`, `phone`, `ssn`) before export to OTLP or stdout. Layers are not a substitute for redacted types at the source; use both when compliance requires belt-and-suspenders.

## Serde Output Redaction

For API responses and audit exports, control serialization explicitly. Do not serialize domain structs that contain raw PII unless the response DTO redacts fields.

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

Prefer separate response DTOs over `serialize_with` on every field when most of the struct is safe. Use `serialize_with` when one field in an otherwise safe struct needs redaction.

## `Display` vs `Debug`

Split implementations when user-facing text and developer diagnostics differ:

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

- **`Debug`**: redact by default for PII types; this protects `{:?}` in logs, tests, and `tracing` debug output.
- **`Display`**: use for intentional user-visible or adapter output; keep call sites narrow.

Do not derive `Display` on PII types if every `to_string()` would leak into logs. Prefer `expose_for_delivery()` returning `&str` at the adapter.

## Testing Redaction

Assert that debug output does not contain raw PII:

```rust
#[test]
fn patient_debug_does_not_leak_email() {
    let patient = Patient::fixture_with_email("patient@example.com");
    let debug = format!("{patient:?}");
    assert!(!debug.contains("patient@example.com"));
    assert!(debug.contains("redacted") || !debug.contains('@'));
}
```

For `secrecy` types:

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

Use fixture builders with known values so assertions are deterministic. See [`test-data.md`](/docs/kamae-rs/references/test-data/) for synthetic data conventions.

## Common Crate Combinations

| Stack | PII pattern |
| --- | --- |
| `secrecy` + adapter | `ExposeSecret` only in payment/auth adapter |
| `tracing` + redacted newtypes | `skip` on spans; safe `Debug` on domain types |
| `serde` + response DTOs | `serialize_with` or separate `PatientResponse` |
| `thiserror` + PII | Error variants carry field names, not raw values |

## Review Signals

Flag when:

- Domain errors include raw email, phone, or government ID in `#[error(...)]` strings.
- `#[derive(Debug)]` on structs with PII fields and no redaction.
- `tracing::instrument` without `skip` on patient/user structs.
- `SecretString` used for non-credential personal data everywhere.
- Response serialization uses unrestricted `Serialize` on domain entities.
