---
title: "Logging and Metrics Checklist"
sidebar:
  order: 5
---

Reference: [`../../kamae-rs/references/logging-metrics.md`](/docs/kamae-rs/../../kamae-rs/references/logging-metrics/).
Also see [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/) for redaction rules.

## 6.1 Are log messages meaningful? - Medium

Flag log messages that only name the function or contain no domain context.

A good log message describes what happened in business terms: `"driver assigned
to waiting request"` rather than `"assign_driver called"`.

## 6.2 Does each log include the affected domain object's state? - Medium

Flag logs that omit identifiers, current state variant, or decision-relevant
values. Structured fields should carry the aggregate or entity ID and the state
needed to reconstruct the event.

Prefer `request_id = %request_id, state = ?state` over sentence interpolation.

## 6.3 Are state transitions logged explicitly? - Medium

Flag lifecycle changes that do not record both source and target state, or the
command/event that triggered the transition.

Look for missing `from`/`to` fields, missing event names, or logs emitted only
inside infrastructure rather than at the use-case boundary that owns the
transaction.

## 6.4 Are logs structured and level-appropriate? - Low

Flag `tracing::info!` or `println!` with interpolated values instead of
key-value fields. Flag verbose `INFO` logging in helpers or loops that should be
`DEBUG`.

Check that `ERROR` logs indicate a real failure path and include enough context
to diagnose it without leaking secrets.

## 6.5 Are metrics tied to domain outcomes? - Low

Flag metrics that only count HTTP status codes, thread counts, or generic
runtime values without a domain dimension. Prefer counters and histograms that
reflect business events and state durations, labeled with bounded domain values
such as state names or command names.

## 6.6 Is metric cardinality controlled? - Medium

Flag labels that use raw IDs, timestamps, email addresses, or unbounded strings.
High-cardinality labels can overwhelm time-series storage and leak identifiers
into metric backends.

## 6.7 Are PII and secrets kept out of logs, spans, and metrics? - High

Cross-check with `pii-protection.md`. Flag any log field, span attribute,
metric label, or error display string that carries raw sensitive values.

Also check that debug implementations, redacting wrappers, and allowlists are
applied consistently before domain objects reach observability helpers.

## 6.8 Are logged IDs classified correctly? - High

Cross-check with the "Which IDs Belong in Logs" section in
`logging-metrics.md`. Flag identifiers logged by field name assumption rather
than documented safety.

Escalate when logs, spans, or metric labels carry:

- secrets, session tokens, or API keys
- government, payment, health, or contact identity values
- person-linked IDs that are not opaque surrogates (email-as-key, provider
  subject, reversible hash of PII)
- raw user/customer/passenger IDs as metric labels

Do not flag opaque surrogate aggregate IDs (`request_id`, `order_id`,
`correlation_id`, internal `transaction_id`) when the type's formatting is
reviewed and the value is not derived from PII.

## 6.9 Are error chains logged once with domain context? - Medium

Cross-check [`../../kamae-rs/references/logging-metrics.md`](/docs/kamae-rs/../../kamae-rs/references/logging-metrics/#integrate-error-chains-with-structured-logging). Flag duplicate `tracing::error!` at every adapter layer for the same failure, or logs that stringify errors without `%error` / source chain formatting.

## 6.10 Do error metrics use bounded labels? - Low

Flag counters or histograms labeled with raw error text, SQL fragments, or
unbounded strings instead of enum variant names or stable `error_code` values.
