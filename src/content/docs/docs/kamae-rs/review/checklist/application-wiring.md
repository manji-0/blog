---
title: "Application Wiring Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/application-wiring.md`](/docs/kamae-rs/../../kamae-rs/references/application-wiring/).

## 17.1 Are ports small and use-case shaped? - Medium

Flag repository or client traits that mirror ORM tables, SDK surfaces, or
framework handler signatures instead of the operations a use case actually needs.

## 17.2 Do use cases depend on ports, not concrete adapters? - High

Flag handlers, domain modules, or transition methods that call SQL, HTTP, queues,
or SDK functions directly when a port and adapter split would isolate the
workflow.

Do not flag composition-root wiring in `main`, bootstrap modules, or tests.

## 17.3 Is orchestration kept in use-case structs? - Medium

Flag business workflows spread across handlers, free functions, or repository
adapters when a named use-case type should own load -> authorize -> transition ->
persist ordering.

## 17.4 Are dependencies injected explicitly? - Low

Flag hidden globals, service locators, or new heavy DI containers introduced
without project precedent. Prefer struct fields, framework state, or composition
root wiring.

Do not flag generic bounds or `Arc<dyn Port + Send + Sync>` when the project
already uses that pattern consistently.

## 17.5 Do tests swap ports instead of hitting real infrastructure? - Low

Flag use-case tests that require a live database or remote service when a fake
port would exercise the workflow. Suggest in-memory or fake adapters for domain
and use-case coverage.
