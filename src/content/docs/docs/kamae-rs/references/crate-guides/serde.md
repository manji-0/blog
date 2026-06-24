---
title: "serde"
sidebar:
  order: 10
---

For full patterns, prefer [`../boundary-defense.md`](/docs/kamae-rs/../boundary-defense/).
This file covers crate-specific defaults only.

Use `serde` DTOs for external shapes and convert them into domain types.

Avoid putting `Deserialize` directly on domain entities when deserialization can bypass validation or allow impossible states.

`Serialize` on domain read models can be acceptable when the output is intentional and contains no secrets. For PII, serialize explicit response DTOs that control redaction.

## Use `try_from` for Validated Value Objects

For small invariant-bearing value objects, `Deserialize` can be acceptable when
the serde path delegates to the same validation constructor as normal code:

```rust
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(try_from = "String")]
pub struct EmailAddress(String);

impl TryFrom<String> for EmailAddress {
    type Error = EmailAddressError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        EmailAddress::new(value)
    }
}
```

Use this for leaf value objects such as IDs, email addresses, slugs, and
bounded quantities. Prefer DTO -> `TryFrom` for aggregates, entities, state
types, commands, and anything where multiple fields must be validated together.

Do not derive unrestricted `Serialize` or `Deserialize` on invariant-bearing
types just because it is convenient for tests or persistence. If the serialized
form is not a public contract, keep it in a DTO or row type.

## Common Combinations

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`, `TryFrom` returns typed error enum | [`boundary-defense.md`](/docs/kamae-rs/../boundary-defense/) |
| `serde` + `sqlx` | `FromRow` on row struct only; `TryFrom` into domain | [`boundary-defense.md`](/docs/kamae-rs/../boundary-defense/#database-rows-sqlxfromrow), [`persistence-events.md`](/docs/kamae-rs/../persistence-events/) |
| `serde` + events | `#[serde(tag = "event_type")]` on domain event enum | [`persistence-events.md`](/docs/kamae-rs/../persistence-events/#event-serde-representation) |
| `serde` + `garde` | Validate DTO with `garde` before `TryFrom` | [`crate-guides/garde.md`](/docs/kamae-rs/references/garde/) |
