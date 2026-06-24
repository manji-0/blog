---
title: "anyhow / eyre"
sidebar:
  order: 10
---

For full patterns, prefer [`../error-handling.md`](/docs/kamae-rs/../error-handling/). This
file covers crate-specific defaults only.

Use `anyhow` or `eyre` at application edges: command handlers, main functions, migration tools, and glue code.

Do not use `anyhow::Result<T>` as the return type of domain entities, value-object constructors, or use cases that callers must handle exhaustively. Convert domain-specific errors into `anyhow` only at the reporting boundary.
