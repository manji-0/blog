---
title: "Error Handling Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/error-handling.md`](/docs/kamae-rs/../../kamae-rs/references/error-handling/).

## 3.1 Are panics avoided in domain and use-case code? - High

Flag `panic!`, `todo!`, `unimplemented!`, `unwrap()`, and `expect()` outside tests, fixtures, startup code, or truly unreachable branches.

Do not flag fail-fast startup/configuration panics, test/fixture panics, migration assertions, or `expect` messages guarding invariants already proven in the same expression.

## 3.2 Are domain errors specific enums? - Medium

Flag `anyhow::Result`, `eyre::Result`, `Box<dyn Error>`, `String`, or opaque catch-all errors returned from domain constructors and use cases.

## 3.3 Are infrastructure errors converted intentionally? - Medium

Flag leaking `sqlx::Error`, `diesel::result::Error`, HTTP client errors, or config errors directly through public domain/use-case APIs.

## 3.4 Are async use cases layered correctly? - Medium

Cross-check [`../../kamae-rs/references/error-handling.md`](/docs/kamae-rs/../../kamae-rs/references/error-handling/). Flag async domain transitions that perform I/O, `Result<impl Future<...>, E>`-style APIs, or infrastructure error types leaking through `async fn` boundaries without mapping.

## 3.5 Are locks held across await points? - High

Flag mutex guards, database row locks, or other exclusive resources held across
`.await` in use cases or adapters unless the project explicitly designs for it.

## 3.6 Are error variants meaningful to callers? - Low

Flag vague variants such as `Other(String)` or `InvalidInput(String)` when callers need to branch exhaustively.

## 3.7 Are errors chained with `#[source]` / `#[from]`? - Medium

Cross-check [`../../kamae-rs/references/error-handling.md`](/docs/kamae-rs/../../kamae-rs/references/error-handling/). Flag use-case errors that stringify inner failures with `format!` instead of preserving `thiserror` source chains.

## 3.8 Do error messages avoid PII and secrets? - High

Cross-check [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/). Flag error `Display` text that embeds email, phone, tokens, or raw SQL/HTTP bodies.
