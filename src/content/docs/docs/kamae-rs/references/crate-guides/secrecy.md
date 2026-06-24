---
title: "secrecy"
sidebar:
  order: 10
---

For full patterns, prefer [`../pii-protection.md`](/docs/kamae-rs/../pii-protection/). This
file covers crate-specific defaults only.

Use `secrecy` for credentials and other secrets that must not appear in `Debug`
output or linger in memory longer than necessary. Prefer `Redacted<T>` or domain
newtypes with custom `Debug` for personal data (see `pii-protection.md`).

Store secrets as `SecretString` or project-specific wrappers around
`SecretBox`. Expose values only through narrow adapter functions via
`ExposeSecret`.

Avoid including exposed secret values in error variants.

## Common Combinations

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `secrecy` + adapter | `ExposeSecret` only in payment/auth module | [`pii-protection.md`](/docs/kamae-rs/../pii-protection/) |
| `secrecy` + `tracing` | Never log `SecretString`; use `skip` on credential structs | [`pii-protection.md`](/docs/kamae-rs/../pii-protection/#tracing-and-span-fields) |
| PII vs secrets | Personal data in `Redacted<T>`, credentials in `secrecy` | [`pii-protection.md`](/docs/kamae-rs/../pii-protection/#secrecy-vs-redactedt--when-to-use-which) |
