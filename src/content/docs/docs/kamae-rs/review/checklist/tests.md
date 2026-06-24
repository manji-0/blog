---
title: "Tests Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/test-data.md`](/docs/kamae-rs/../../kamae-rs/references/test-data/), [`../../kamae-rs/references/quality-gates.md`](/docs/kamae-rs/../../kamae-rs/references/quality-gates/).

## 19.1 Do tests exercise constructors and conversions? - Medium

Flag tests that create invalid domain states through public fields or raw literals instead of constructors/builders.

Do not flag invalid construction in tests whose purpose is migration compatibility, deserialization hardening, corrupted-row handling, property shrinking, or compile-fail coverage.

## 19.2 Are key invalid transitions covered? - Medium

Flag state-machine code without tests for rejected transitions, DTO conversion failures, and error mapping.

## 19.3 Is compile-time safety tested when central to the design? - Low

Suggest `trybuild` compile-fail tests only when compile-time state safety is a core promise and the added dependency is justified.

## 19.4 Are invariant-preserving mutators tested? - Medium

Flag new setters, patch commands, and update methods without tests for cross-field invariants, units, timestamps, and authorization/tenant rejection.

## 19.5 Are persistence and retry edges tested? - Medium

Flag repository/use-case changes without coverage for DB constraint failures, optimistic-lock conflicts, transaction rollback, duplicate commands, retry behavior, and outbox/event version compatibility.

## 19.6 Are boundary and observability failures tested? - Medium

Flag boundary changes without tests for unknown fields, defaulted fields, malformed DTOs, redacted logs/errors, and safe serialization of read models.

## 19.7 Are input-wide invariants covered with property tests? - Low

Cross-check [`../../kamae-rs/references/property-based-tests.md`](/docs/kamae-rs/../../kamae-rs/references/property-based-tests/). Suggest property tests when value-object validation, round trips, transition laws, or idempotency lack example-table coverage and generators can use public constructors.

Do not require property tests for small closed enums, trivial getters, or code already guarded by compile-time state types.
