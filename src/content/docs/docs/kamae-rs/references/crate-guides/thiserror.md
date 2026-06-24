---
title: "thiserror"
sidebar:
  order: 10
---

For full patterns, prefer [`../error-handling.md`](/docs/kamae-rs/../error-handling/). This
file covers crate-specific defaults only.

Use `thiserror` for domain-specific error enums when the crate already depends
on it or when introducing a small, conventional error derive is acceptable.

```rust
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("invalid request id")]
    InvalidRequestId,
}
```

Keep variants semantic. Avoid catch-all variants such as `Other(String)` in domain errors unless they wrap an infrastructure failure at an application boundary.

## Common Combinations

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `thiserror` + `serde` boundary | `TryFrom<Dto>` with `type Error = CommandError` | [`boundary-defense.md`](/docs/kamae-rs/../boundary-defense/) |
| `thiserror` + `sqlx` | `RepositoryError` wraps `sqlx::Error` at adapter edge | [`persistence-events.md`](/docs/kamae-rs/../persistence-events/) |
| `thiserror` + transitions | `AssignDriverError` separates domain vs not-found vs conflict | [`state-transitions.md`](/docs/kamae-rs/../state-transitions/), [`aggregate-transactions.md`](/docs/kamae-rs/../aggregate-transactions/) |
