---
title: "Rust Application Wiring"
sidebar:
  order: 10
---

<!-- constrained-by ./aggregate-transactions.md -->
<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./persistence-events.md -->

## Default Stance

Keep domain transitions pure and small. Put orchestration in use-case types that
depend on ports, not on concrete databases or HTTP clients. Wire adapters only
at the composition root (`main`, test setup, or framework bootstrap).

Prefer explicit dependencies in struct fields over service locators, global
singletons, or heavy DI containers.

## Ports and Adapters

- **Port**: a small trait in the application or domain crate that states what a
  use case needs (`RequestResolver`, `RequestStore`, `PaymentGateway`).
- **Adapter**: an infrastructure implementation of that port (`SqlxRequestStore`,
  `StripePaymentGateway`).

Keep ports shaped by use-case needs, not by ORM tables or client SDK surfaces.

```rust
pub trait RequestResolver {
    async fn find_waiting(&self, id: &RequestId) -> Result<Option<WaitingRequest>, RepositoryError>;
}

pub trait RequestStore {
    async fn save_assigned(
        &self,
        state: &EnRouteRequest,
        events: &[TaxiRequestEvent],
    ) -> Result<(), RepositoryError>;
}
```

Do not leak `sqlx::Error`, HTTP status codes, or SDK types through port traits.

## Model Use Cases as Structs With Dependencies

Give each use case a struct and inject ports through fields. Static dispatch with
generics is the default; use `Arc<dyn Port + Send + Sync>` only when the project
needs runtime substitution and accepts the tradeoff.

```rust
pub struct AssignDriver<Resolver, Store> {
    resolver: Resolver,
    store: Store,
}

impl<Resolver, Store> AssignDriver<Resolver, Store>
where
    Resolver: RequestResolver,
    Store: RequestStore,
{
    pub fn new(resolver: Resolver, store: Store) -> Self {
        Self { resolver, store }
    }

    pub async fn execute(
        &self,
        request_id: RequestId,
        driver: DriverAssignment,
    ) -> Result<(), AssignDriverError> {
        let waiting = self
            .resolver
            .find_waiting(&request_id)
            .await
            .map_err(AssignDriverError::Repository)?
            .ok_or(AssignDriverError::RequestNotFound { request_id })?;

        let transition = waiting
            .assign_driver(driver)
            .map_err(AssignDriverError::Domain)?;

        self.store
            .save_assigned(&transition.state, &transition.events)
            .await
            .map_err(AssignDriverError::Repository)?;

        Ok(())
    }
}
```

Prefer this over passing many bare function arguments when the use case owns a
coherent transaction or workflow.

## Choose a Wiring Style Deliberately

| Style | Use when | Avoid when |
| --- | --- | --- |
| Generic fields (`Resolver: RequestResolver`) | Default for libraries, binaries, and tests | Every adapter type must be nameable at the call site anyway |
| `Arc<dyn Port + Send + Sync>` | Framework state, plugin-style substitution, large app graphs | Hot paths need monomorphization or ports are tiny and stable |
| Explicit function arguments | One-off scripts, very small handlers | The workflow grows past two dependencies |
| Reader-style environment passing | The whole codebase already uses it consistently | Introducing it only for aesthetic FP parity |

Do not introduce a DI container unless the project already standardizes on one.
Axum `State`, Shuttle, or manual wiring in `main` is usually enough.

## Wire at the Composition Root

Construct adapters and use cases in `main`, a `bootstrap` module, or test
fixtures. Handlers should receive ready-made use cases or application state, not
build infrastructure themselves.

```rust
// main.rs or bootstrap.rs
let pool = PgPool::connect(&database_url).await?;
let resolver = SqlxRequestResolver::new(pool.clone());
let store = SqlxRequestStore::new(pool);
let assign_driver = AssignDriver::new(resolver, store);

let app = Router::new().route(
    "/requests/{id}/assign",
    post({
        let assign_driver = assign_driver.clone();
        move |path, body| async move {
            assign_driver.execute(path.id, body.driver).await
        }
    }),
);
```

In tests, swap ports with fakes or in-memory adapters. Keep domain and use-case
tests free of real databases when a fake port is enough.

## Keep Side Effects Out of Domain Code

Domain transitions return `Transition<_, _>` or `Result<_, DomainError>`.
Use cases own I/O ordering: load, authorize, transition, persist, publish.
Repositories and clients stay behind ports.

If a handler starts calling SQL or HTTP directly, extract a port and move the
workflow into a use-case struct.
