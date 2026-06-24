---
title: "nutype"
sidebar:
  order: 10
---

For full patterns, prefer [`../domain-modeling.md`](/docs/kamae-rs/../domain-modeling/). This
file covers crate-specific defaults only.

Use `nutype` for newtypes when the project already uses it or when many validated newtypes would otherwise repeat boilerplate.

Prefer private fields and generated constructors. Keep the type name semantic (`EmailAddress`, `OrderId`, `MoneyAmount`) and avoid generic wrappers that blur meaning.
