---
title: "Rust Boundary Defense"
sidebar:
  order: 10
---

## Treat Deserialization as Shape Parsing Only

`serde` proves that data has the requested shape, not that it satisfies domain meaning. Deserialize into DTOs first, then convert into domain types with `TryFrom`.

```rust
#[derive(serde::Deserialize)]
pub struct CreateRequestDto {
    passenger_id: String,
}

impl TryFrom<CreateRequestDto> for CreateRequestCommand {
    type Error = CreateRequestError;

    fn try_from(dto: CreateRequestDto) -> Result<Self, Self::Error> {
        Ok(Self {
            passenger_id: PassengerId::new(dto.passenger_id)?,
        })
    }
}
```

## Validate Every External Boundary

Apply DTO -> domain conversion for:

- HTTP and RPC requests
- DB rows and query results
- Queue messages and webhooks
- Files, env vars, and config
- CLI arguments

Do not directly construct domain types from raw `String`, `Value`, or DB row fields unless the constructor validates invariants.

## Keep API, DB, and Domain Types Separate

Do not add `Serialize`, `Deserialize`, `sqlx::FromRow`, or Diesel derives to domain entities by default. Use DTO/row structs when the external representation differs or can bypass invariants.

Exceptions are reasonable for small internal tools or truly invariant-free value objects; state the reason when it matters.

## Checklist Alignment

The review checklist maps to these practices:

| Item | Topic | Section |
| --- | --- | --- |
| 4.1 | DTO -> domain on every boundary | [Validate Every External Boundary](#validate-every-external-boundary) |
| 4.2 | `serde` is shape parsing, not validation | [Treat Deserialization as Shape Parsing Only](#treat-deserialization-as-shape-parsing-only) |
| 4.3 | No over-derived domain entities | [Keep API, DB, and Domain Types Separate](#keep-api-db-and-domain-types-separate) |
| 4.4 | DTO defaults and unknown fields | [DTO Defaults and Unknown Fields](#dto-defaults-and-unknown-fields) |
| 4.5 | Auth and tenant boundaries | [Authorization and Tenant Checks](#authorization-and-tenant-checks) |
| 4.6 | Validated leaf deserialization | [`serde(try_from)` for Value Objects](#serde-try_from-for-value-objects) |

## Authorization and Tenant Checks

Path, query, body, and message fields that name a tenant, actor, or resource owner are untrusted until compared to authenticated context. Validate in the use case or a dedicated policy port before loading or mutating domain state.

```rust
pub struct AuthenticatedActor {
    pub tenant_id: TenantId,
    pub actor_id: ActorId,
}

impl AssignDriverUseCase {
    pub async fn execute(
        &self,
        actor: &AuthenticatedActor,
        cmd: AssignDriverCommand,
    ) -> Result<(), AssignDriverError> {
        if cmd.tenant_id != actor.tenant_id {
            return Err(AssignDriverError::TenantMismatch);
        }

        let waiting = self
            .resolver
            .find_waiting(&cmd.request_id)
            .await?
            .ok_or(AssignDriverError::NotFound)?;

        if waiting.tenant_id() != actor.tenant_id {
            return Err(AssignDriverError::Forbidden);
        }

        // transition and persist ...
        Ok(())
    }
}
```

Rules:

- Do not trust `tenant_id` from the request body when the session or token already carries tenant scope.
- Compare aggregate ownership after load, not only at the HTTP layer.
- Map authorization failures to typed domain or use-case errors; do not leak whether a resource exists across tenants unless product policy requires it.

## DTO Defaults and Unknown Fields

`#[serde(default)]` and `Default::default()` on inbound DTOs can silently change business meaning when a client omits a field or a proxy strips it.

```rust
// Risky: omitted `cancel_fee_waived` becomes false, not "unspecified"
#[derive(serde::Deserialize)]
pub struct CancelRequestDto {
    #[serde(default)]
    cancel_fee_waived: bool,
}
```

Prefer:

- `Option<T>` or an explicit enum (`Unspecified | Yes | No`) when omission is meaningful.
- Required fields without `default` when the client must send them.
- Separate create vs update DTOs when partial updates differ from full replacement.

### When to use `deny_unknown_fields`

Add `#[serde(deny_unknown_fields)]` on inbound DTOs when:

- The API is versioned and typos should fail fast (`passengerId` vs `passenger_id`).
- A misspelled field would otherwise be ignored and the request would succeed with wrong semantics.
- You control both producer and consumer, or compatibility policy allows strict parsing.

Skip `deny_unknown_fields` when:

- Public APIs must accept forward-compatible client extensions.
- Webhooks or third-party payloads may add undocumented fields you must preserve or ignore gracefully.
- You use explicit `#[serde(alias = "...")]` for migration and still want unknown keys rejected only after aliases are exhausted.

For outbound DTOs, `deny_unknown_fields` is rarely needed; focus on stable field names and explicit optional fields.

## `serde(try_from)` for Value Objects

For leaf types with a single invariant-bearing field, delegate deserialization to the same constructor used by normal code. See also [`crate-guides/serde.md`](/docs/kamae-rs/references/crate-guides/serde/).

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Deserialize)]
#[serde(try_from = "String")]
pub struct EmailAddress(String);

impl TryFrom<String> for EmailAddress {
    type Error = EmailAddressError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        EmailAddress::new(value)
    }
}
```

Use `try_from` for IDs, emails, slugs, and bounded quantities. Prefer DTO -> `TryFrom` for commands, aggregates, and multi-field validation. Do not use `try_from` on aggregates just to avoid a DTO; cross-field rules belong in `TryFrom<CreateRequestDto>`.

## HTTP Extractors (axum / actix-web)

Keep handlers thin: extract wire shape, convert to domain command, call the use case.

### axum

```rust
#[derive(serde::Deserialize)]
pub struct AssignDriverBody {
    driver_id: String,
}

pub async fn assign_driver(
    Auth(actor): Auth,
    Path(request_id): Path<String>,
    Json(body): Json<AssignDriverBody>,
    State(app): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let cmd = AssignDriverCommand::try_from(AssignDriverDto {
        tenant_id: actor.tenant_id,
        request_id,
        driver_id: body.driver_id,
    })?;

    app.assign_driver.execute(&actor, cmd).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

### actix-web

```rust
#[derive(serde::Deserialize)]
pub struct AssignDriverBody {
    driver_id: String,
}

#[post("/requests/{request_id}/assign")]
pub async fn assign_driver(
    actor: AuthenticatedActor,
    path: web::Path<String>,
    body: web::Json<AssignDriverBody>,
    app: web::Data<AppState>,
) -> Result<HttpResponse, ApiError> {
    let cmd = AssignDriverCommand::try_from(AssignDriverDto {
        tenant_id: actor.tenant_id.clone(),
        request_id: path.into_inner(),
        driver_id: body.driver_id.clone(),
    })?;

    app.assign_driver.execute(&actor, cmd).await?;
    Ok(HttpResponse::NoContent().finish())
}
```

Extractors prove transport shape (JSON, path segment). `TryFrom` proves domain meaning. Map `TryFrom` and use-case errors to HTTP status in one adapter module.

## Database Rows (`sqlx::FromRow`)

Map rows to row structs, then convert to domain types. Do not derive `FromRow` on domain entities.

```rust
#[derive(sqlx::FromRow)]
struct WaitingRequestRow {
    request_id: String,
    passenger_id: String,
    tenant_id: String,
    version: i64,
}

impl TryFrom<WaitingRequestRow> for Versioned<WaitingRequest> {
    type Error = RepositoryError;

    fn try_from(row: WaitingRequestRow) -> Result<Self, Self::Error> {
        Ok(Versioned {
            value: WaitingRequest::new(
                RequestId::new(row.request_id)?,
                PassengerId::new(row.passenger_id)?,
                TenantId::new(row.tenant_id)?,
            )?,
            version: AggregateVersion::new(row.version)?,
        })
    }
}
```

Repository adapters run `query_as::<_, WaitingRequestRow>` and call `try_into()`. Invalid stored data becomes `RepositoryError::CorruptRow`, not a panic in domain code.

## Config and Environment Variables

Parse env/config into a settings DTO or `config` crate struct, then convert to domain configuration types with validated ranges and units.

```rust
#[derive(serde::Deserialize)]
pub struct BookingSettingsDto {
    max_passengers: u32,
    currency_code: String,
    assignment_timeout_secs: u64,
}

impl TryFrom<BookingSettingsDto> for BookingSettings {
    type Error = ConfigError;

    fn try_from(dto: BookingSettingsDto) -> Result<Self, Self::Error> {
        if dto.max_passengers == 0 {
            return Err(ConfigError::InvalidMaxPassengers);
        }
        Ok(Self {
            max_passengers: PassengerCount::new(dto.max_passengers)?,
            currency: CurrencyCode::new(dto.currency_code)?,
            assignment_timeout: DurationSeconds::new(dto.assignment_timeout_secs)?,
        })
    }
}

pub fn load_booking_settings() -> Result<BookingSettings, ConfigError> {
    let dto: BookingSettingsDto = config::Config::builder()
        .add_source(config::Environment::default().separator("__"))
        .build()?
        .try_deserialize()?;
    dto.try_into()
}
```

Environment variables are strings with implicit defaults (`0`, empty string). Treat them like any other external boundary.

## gRPC Messages (tonic / prost)

Generated prost types are wire DTOs. Convert them to domain commands before the use case.

```rust
impl TryFrom<proto::AssignDriverRequest> for AssignDriverCommand {
    type Error = AssignDriverError;

    fn try_from(req: proto::AssignDriverRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            tenant_id: TenantId::new(req.tenant_id)?,
            request_id: RequestId::new(req.request_id)?,
            driver_id: DriverId::new(req.driver_id)?,
            idempotency_key: req
                .idempotency_key
                .map(IdempotencyKey::new)
                .transpose()?,
        })
    }
}

pub async fn assign_driver(
    auth: Request<AuthenticatedActor>,
    request: Request<proto::AssignDriverRequest>,
) -> Result<Response<proto::AssignDriverResponse>, Status> {
    let actor = auth.into_inner();
    let cmd = AssignDriverCommand::try_from(request.into_inner())
        .map_err(|e| Status::invalid_argument(e.to_string()))?;

    if cmd.tenant_id != actor.tenant_id {
        return Err(Status::permission_denied("tenant mismatch"));
    }

    // use case ...
    Ok(Response::new(proto::AssignDriverResponse {}))
}
```

Keep prost types out of domain modules. If a field is added to the `.proto`, the DTO layer compiles and you update `TryFrom` explicitly rather than silently accepting invalid domain state.

## Common Crate Combinations

| Stack | Boundary pattern |
| --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`, `TryFrom` returns typed error enum |
| `garde` + `serde` + axum | Validate DTO with `garde` before or inside `TryFrom`; see [`crate-guides/garde.md`](/docs/kamae-rs/references/crate-guides/garde/) |
| `sqlx` + `thiserror` | `FromRow` on row struct, `TryFrom` into domain, map row errors in adapter |
| `config` + `serde` | Settings DTO from env/file, `TryFrom` into domain settings |
| `tonic` + `prost` | Generated message -> `TryFrom` -> use case |

## Review Signals

Flag during review when:

- Handlers pass `String` IDs directly into use cases.
- Domain structs derive `Deserialize`, `FromRow`, or unrestricted `Serialize`.
- Inbound DTOs use `default` on fields that change fee, consent, or ownership semantics.
- Tenant or actor IDs from the wire are used without comparison to authenticated context.
- `serde_json::Value` or `prost` types reach domain transition methods.
