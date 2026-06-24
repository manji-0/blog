---
title: "Rust Logging and Metrics"
sidebar:
  order: 10
---

<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->

## Log with Domain Context

Every log entry should answer three questions: what happened, to which domain
object, and why it matters. Emit logs from use cases, application services, and
adapters rather than from deep inside domain invariants.

1. **Meaningful message**: describe the event or decision in domain terms, not
   the name of the function that emitted it. Prefer `"driver assigned to waiting
   request"` over `"assign_driver called"`.
2. **Domain object state**: include the identifiers, current state variant, and
   any values needed to understand the decision. Prefer structured fields over
   interpolated strings.
3. **Transition information**: when the operation's purpose is a state
   transition, log the source state, target state, and the command or event that
   triggered it.

```rust
#[derive(Clone, Debug)]
pub struct AssignDriverLog {
    request_id: RequestId,
    passenger_id: PassengerId,
    driver_id: DriverId,
    from: TaxiRequestState,
    to: TaxiRequestState,
    triggered_by: CommandId,
}

tracing::info!(
    request_id = %log.request_id,
    passenger_id = %log.passenger_id, // safe only for opaque surrogate IDs
    driver_id = %log.driver_id,
    from = ?log.from,
    to = ?log.to,
    triggered_by = %log.triggered_by,
    "driver assigned to waiting request"
);
```

## Prefer Structured Logging

Use key-value fields instead of parsing meaning out of human-readable sentences.
Keep log templates stable so aggregators can group by message and filter by
field.

```rust
// Good: stable template, structured fields.
tracing::info!(
    request_id = %request_id,
    state = ?state,
    "request state persisted"
);

// Avoid: values baked into the message text.
tracing::info!("request {} persisted in state {:?}", request_id, state);
```

Choose log levels deliberately:

- `ERROR`: a domain invariant failed, a use case could not complete, or an
  infrastructure dependency is unhealthy. Include enough context to reproduce
  the failure without leaking secrets.
- `WARN`: a recoverable anomaly, such as a retryable timeout or an unexpected
  but handled edge case.
- `INFO`: a significant business event or lifecycle step.
- `DEBUG`: detailed state useful while diagnosing a specific problem. Guard
  expensive values with `tracing::debug!` so they are only evaluated at the
  matching level.

## Protect Logs from PII Leaks

Logs are long-lived and broadly accessible: treat them as a public boundary.
Follow the rules in [`pii-protection.md`](/docs/kamae-rs/references/pii-protection/).

- Do not log raw names, emails, phone numbers, addresses, location, tokens, or
  credentials.
- Use newtypes and redacting wrappers so that accidentally deriving `Debug` or
  interpolating the value still produces a safe representation.
- When an identifier is sensitive, log a hash or opaque reference instead.

See [Which IDs Belong in Logs](#which-ids-belong-in-logs) for classification rules.

```rust
// Good: only non-sensitive identifiers and states appear in logs.
// `passenger_id` is safe here only because it is an opaque surrogate, not email/phone.
tracing::info!(
    request_id = %request_id,
    passenger_id = %passenger_id,
    state = ?state,
    "request transitioned to en-route"
);

// Avoid: a raw email would leak into log storage.
tracing::info!("notification sent to {}", email);
```

## Which IDs Belong in Logs

Classify every identifier before it reaches logs, spans, metrics, or errors.
The field name does not decide safety; the identifier's meaning, derivation, and
re-identification risk do.

### Default: safe to log

Log these when they help operations correlate work without exposing secrets or
direct personal identity:

| Kind | Examples | Why it is usually safe |
| --- | --- | --- |
| Correlation / tracing | `correlation_id`, `trace_id`, `span_id`, `request_id` (HTTP) | Ephemeral or operational; not identity |
| Internal aggregate IDs | `order_id`, `request_id`, `shipment_id`, `command_id`, `event_id` | Opaque surrogate keys scoped to the service |
| Process / job IDs | `job_id`, `outbox_id`, `batch_id`, `transaction_id` (internal) | Infrastructure correlation |
| Tenant / org context | `tenant_id`, `organization_id`, `fleet_id` | Needed for multi-tenant ops when access is controlled |
| Bounded domain enums | `state`, `command_name`, `event_type`, `error_code` | Low cardinality; not personal data |

Requirements for "safe to log":

1. **Opaque surrogate**: randomly assigned or sequentially issued inside the
   system, not derived from email, phone, name, government ID, or card data.
2. **Not a secret**: not a session token, API key, password, or signed URL
   capability.
3. **Low standalone re-identification risk**: the value alone does not identify
   a natural person outside the application's controlled data store.
4. **Safe `Display` / `Debug`**: the newtype's formatting path is reviewed for
   logging and does not expose nested PII.

```rust
// Safe: opaque surrogate IDs with explicit logging newtypes.
tracing::info!(
    request_id = %request_id,
    command_id = %command_id,
    correlation_id = %correlation_id,
    state = ?state,
    "request transitioned to en-route"
);
```

### Default: do not log

Never log these in general-purpose application logs, spans, metrics labels, or
error strings:

| Kind | Examples | Why |
| --- | --- | --- |
| Secrets / auth material | API keys, passwords, session tokens, refresh tokens, HMAC secrets, signed download URLs | Credential disclosure |
| Government / regulated IDs | SSN, My Number, passport, driver's license, national health ID | Direct personal identity |
| Payment identifiers | PAN, CVV, full bank account, raw payment-method tokens from PSPs | PCI / financial exposure |
| Contact identity | email, phone, messenger handle when used as account identity | Direct PII |
| Person descriptors | legal name, birth date, address, free-text notes about a person | Direct PII |
| Health / special-category data | diagnosis, prescription, patient notes | Regulated sensitive data |
| Precise location | lat/long, full street address, room-level indoor position | Location privacy |
| Network identity | client IP, device fingerprint, advertising ID | Tracking / PII in many jurisdictions |
| External IDs that embed PII | `user@example.com` as key, hashed email in reversible scheme, provider subject that is an email | PII smuggled as an "ID" |

If an incident needs one of these values, route it through a restricted audit
export or support tool with explicit authorization. Do not widen general log
retention to carry them.

### Conditional: classify in the domain model

These are common and often logged, but only after an explicit project decision.
Encode the decision in the type and its `Display` / `Debug` contract.

| Kind | Log when | Do not log when |
| --- | --- | --- |
| `user_id`, `passenger_id`, `customer_id`, `patient_id` | Opaque surrogate UUID/ULID issued by your system | Value is email/phone, government ID, provider subject, or reversible hash of PII |
| `account_id`, `profile_id` | Internal account record key unrelated to login identifier | Same value is used as login name or public profile slug tied to a person |
| `driver_id`, `staff_id`, `provider_id` | Internal workforce/resource key for operations | Exposes personal identity directly or maps 1:1 to legal name in logs |
| `device_id`, `installation_id` | Opaque app-generated surrogate with low tracking risk policy | Vendor advertising ID or hardware serial |
| `external_id`, `partner_ref` | Opaque partner reference with contract allowing ops logging | Partner-supplied value contains email, phone, or national ID |
| Hashed identifier | Pepper/HMAC-based pseudonym approved by security review | Unsalted or fast hash of email/phone used across systems |

When conditional IDs are loggable, keep them in named newtypes such as
`PassengerId` or `CorrelationId`. Make non-loggable identifiers use
`Redacted<T>`, `SecretString`, or a type whose `Display` is intentionally
unavailable outside approved adapters.

### Metric and span rules for IDs

IDs safe for logs are not automatically safe as metric labels.

- **Do log**: aggregate IDs in log fields and trace attributes when cardinality
  per request is acceptable for the backend.
- **Do not label metrics with**: raw user/customer/passenger IDs, timestamps,
  email, phone, IP, or unbounded strings. Prefer bounded domain labels such as
  `state`, `command`, `error_code`, or `tenant_id` when cardinality is known.

```rust
// Good metric labels: bounded domain vocabulary.
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);

// Avoid: per-user metric labels explode cardinality and leak identity into TSDB.
metrics::counter!("notification.sent", "user_id" => user_id.as_str()).increment(1);
```

### Quick decision checklist

Before adding an ID to a log line, answer:

1. Is it a secret or auth token? If yes, do not log.
2. Is it direct PII or a regulated identifier? If yes, do not log.
3. Is it an opaque surrogate created by our system, with no embedded PII? If
   yes, it is usually safe to log.
4. Does logging it in this field (`Display` / span / metric label) expose more
   than intended? If yes, redact, hash with an approved scheme, or log only in
   restricted audit paths.
5. Is the type's formatting implementation reviewed for safe logging? If not,
   fix the type before logging it.

## Log State Transitions Explicitly

State transitions are central to domain behavior. Log them with both the before
and after state so traces, audit records, and incident investigations can
reconstruct the lifecycle.

When a transition emits events, include the event names or types, not the full
payload, unless the payload is already safe and useful for operations.

```rust
let outcome = waiting_request.assign_driver(driver)?;

tracing::info!(
    request_id = %outcome.state.request_id,
    from = "waiting",
    to = "en-route",
    events = ?outcome.events.iter().map(|e| e.name()).collect::<Vec<_>>(),
    "driver assignment completed"
);
```

Keep domain-level logging close to the use case that owns the transaction. Do
not scatter log statements inside every getter or validation helper.

## Keep Errors Actionable

Log domain errors with enough context to trace the failing path and the affected
objects. Reuse the structured identifiers from the surrounding use case rather
than creating ad-hoc labels.

```rust
match repository.find_by_id(&request_id).await {
    Ok(Some(request)) => request,
    Ok(None) => {
        tracing::warn!(request_id = %request_id, "request not found");
        return Err(AssignDriverError::RequestNotFound { request_id });
    }
    Err(e) => {
        tracing::error!(request_id = %request_id, error = %e, "repository lookup failed");
        return Err(AssignDriverError::Repository(e));
    }
}
```

Avoid logging the same failure at every layer. Let the use case or application
service own the authoritative log line and propagate the typed error upward.

## Integrate Error Chains with Structured Logging

`thiserror` source chains and `tracing` fields should work together so a single
log line exposes both domain context and the underlying cause.

```rust
if let Err(error) = self.execute(request_id, driver).await {
    tracing::error!(
        request_id = %request_id,
        driver_id = %driver.id,
        error = %error,           // full Display chain via thiserror
        error.debug = ?error,     // optional: Debug for support tooling
        "assign driver use case failed"
    );
    return Err(error);
}
```

Guidelines:

- Prefer `%error` on `thiserror` enums so `#[source]` causes appear in order.
- Add domain fields (`request_id`, `command`, `error_code`) alongside the error,
  not inside its `Display` string.
- Record the error on the active span when the failure aborts a use case:

```rust
tracing::Span::current().record("error", tracing::field::display(&error));
```

- Map infrastructure failures to semantic variants before logging when the raw
  client error would leak endpoints, SQL, or secrets.
- Increment metrics with bounded labels such as `error_code` derived from the
  enum variant, not the full error text.

Cross-check error enum design in [`error-handling.md`](/docs/kamae-rs/references/error-handling/).
Do not duplicate logging in repository adapters if the use case already logs
the same failure with richer domain context.

## Use `tracing` Only When Helpful

`tracing` is a convenient implementation of these guidelines, but it is not a
required dependency. Use it when the project already needs structured logs,
spans, or correlation. Otherwise, apply the same principles with whatever
logging facade or custom writer the project uses.

When `tracing` is used:

- Keep spans around use-case or application-service boundaries, not every
  internal helper. A span names the operation and carries the aggregate
  identifier.
- Prefer `#[instrument]` with explicit field lists over broad auto-derived
  fields. Avoid instrumenting functions that receive raw DTOs or sensitive
  payloads unless those values are excluded.
- Use field value syntax that matches your redaction policy. `%field` records
  `Display`, `?field` records `Debug`; both must produce a safe representation
  for domain objects that contain PII.

```rust
#[tracing::instrument(
    name = "use_case.assign_driver",
    skip(driver), // skip fields that need manual redaction
    fields(request_id = %request_id, driver_id = %driver.id)
)]
pub async fn assign_driver(
    &self,
    request_id: RequestId,
    driver: DriverAssignment,
) -> Result<Transition<EnRouteRequest, TaxiRequestEvent>, AssignDriverError> {
    // ...
}
```

Do not treat `tracing` spans as domain events or audit records. They are
observability aids; persist business events through domain event types or an
outbox when durability is required.

## Measure Domain Outcomes

Metrics should reflect business outcomes, not only runtime machinery. Keep
counters, histograms, and gauges aligned with the domain concepts this skill
already models.

- **Counters**: domain events such as transitions, commands accepted/rejected,
  or published events.
- **Histograms**: durations and sizes with meaningful dimensions, such as time
  spent in each aggregate state or the latency of a use-case execution.
- **Gauges**: point-in-state values such as the number of currently waiting
  requests.

```rust
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);
metrics::histogram!("taxi_request.state_duration_seconds", "from" => "waiting", "to" => "en-route")
    .record(duration.as_secs_f64());
```

Use consistent labels derived from domain types, and keep cardinality low
enough for time-series storage. Prefer a bounded set of state names or command
names over raw IDs or timestamps as label values.

## Export Telemetry Through OpenTelemetry

Use OpenTelemetry as the default application-level path for exporting logs,
metrics, and traces to observability backends. Keep domain and use-case code on
facade APIs (`tracing`, `metrics`) and wire exporters only at application
startup.

Facades do not connect to OpenTelemetry automatically. Install bridge crates at
startup:

- `tracing` spans/traces: `tracing-opentelemetry` or an equivalent project choice
- `metrics` instruments: `metrics-exporter-otel`, `metrics-opentelemetry`, or
  another recorder that forwards to an OpenTelemetry `Meter`

Pull-style `/metrics` endpoints for Prometheus scraping are optional. Prefer
OTLP export through the OpenTelemetry SDK when the deployment supports it; add a
Prometheus text exporter only when scraping is required. The legacy
`opentelemetry-prometheus` crate is deprecated; for Prometheus text exposition,
prefer `opentelemetry-prometheus-text-exporter` or route OTLP metrics through a
collector.

Do not design the domain or application layer around a specific exporter.

```rust
// Application startup, not domain code.
use opentelemetry::global;
use opentelemetry::metrics::MeterProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_prometheus_text_exporter::PrometheusExporter;

// Bridge `metrics` facade recordings into OpenTelemetry.
use metrics_exporter_otel::OpenTelemetryRecorder;

let exporter = PrometheusExporter::builder().build();
let provider = SdkMeterProvider::builder()
    .with_reader(exporter)
    .build();

let meter = provider.meter(env!("CARGO_PKG_NAME"));
let recorder = OpenTelemetryRecorder::new(meter);
metrics::set_global_recorder(recorder).expect("install metrics recorder");

global::set_meter_provider(provider.clone());

// For `tracing`, install a `tracing-opentelemetry` layer separately.
```

## Correlate Logs and Metrics

Carry a correlation identifier through the request, command, or transaction.
Include it in structured logs and, when practical, expose it as a metric label
or trace attribute so operations can pivot between logs, metrics, and traces.

```rust
let correlation_id = CorrelationId::generate();
tracing::Span::current().record("correlation_id", correlation_id.as_str());
```

Keep tracing spans around use-case boundaries rather than every internal call.
The span should name the operation and carry the aggregate identifier, not the
thread of execution details.
