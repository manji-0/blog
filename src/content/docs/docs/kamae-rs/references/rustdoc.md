---
title: "Rustdoc Contracts"
sidebar:
  order: 10
---

## Default Stance

Use rustdoc to document domain contracts, not implementation narration. Public domain APIs should explain what callers may rely on: invariants, valid construction paths, transition rules, errors, side effects, and safety boundaries.

Prefer concise docs on public items over long module essays. Private helpers usually do not need rustdoc unless they encode a subtle invariant.

## What to Document

Document these public items when they are part of domain or adapter contracts:

- Newtypes and value objects: meaning, validation rules, units, ranges, privacy/redaction expectations
- Constructors and `TryFrom`/`FromStr`: accepted inputs, rejected inputs, and returned error variants
- State structs and enums: valid lifecycle states and when each variant is produced
- Transition methods: source state, target state, preconditions, emitted events, and failure modes
- Repository traits: transactional expectations, consistency guarantees, idempotency, and error mapping
- DTO conversion functions: external shape assumptions and validation boundaries
- Unsafe wrappers: safe API guarantees and `# Safety` contracts for `unsafe fn`

Avoid docs that merely repeat the name:

```rust
/// Creates a request id.
pub fn new(value: String) -> Result<RequestId, RequestIdError> { ... }
```

Prefer contract-oriented docs:

```rust
/// A non-empty identifier for a taxi request.
///
/// `RequestId` is created only after boundary validation. Empty or whitespace-only
/// input returns [`RequestIdError::Empty`].
pub struct RequestId(String);
```

## Required Sections When Relevant

Use standard rustdoc headings when they add concrete contract value:

- `# Errors` for functions returning `Result` when callers need to handle variants
- `# Panics` when a function can panic in production code
- `# Safety` for every `unsafe fn`, `unsafe trait`, and caller-upheld unsafe contract
- `# Examples` for constructors, transitions, and DTO conversion paths that are easy to misuse

Do not add empty boilerplate sections. If there are no panics, prefer not to add `# Panics`.

## Examples and Doctests

Examples should compile when practical and should demonstrate the safe construction path, not private-field shortcuts.

For examples that need crate setup, external services, feature flags, or intentionally fail to compile, use the appropriate rustdoc fence:

```rust
/// ```no_run
/// # async fn example(repo: impl RequestStore) -> Result<(), RepositoryError> {
/// #   Ok(())
/// # }
/// ```
```

Use `compile_fail` examples sparingly for important type-state guarantees. Keep them small and stable.

### Doctest error handling

Show how callers should handle `Result` variants — doctests are contracts for failure paths too.

```rust
/// ```
/// use booking_domain::RequestId;
///
/// let id = RequestId::new("req-1".into())?;
/// assert_eq!(id.as_str(), "req-1");
/// # Ok::<(), booking_domain::RequestIdError>(())
/// ```
```

Rules:

- End fallible doctests with `# Ok::<(), ErrorType>(())` so `?` works inside the example.
- Prefer one happy path per example; document error variants in `# Errors` with links to enum variants.
- For `compile_fail`, keep the failing line minimal (e.g. calling a transition on the wrong state type).

```rust
/// # Errors
///
/// Returns [`AssignDriverError::InvalidState`] when the request is not waiting.
```

Do not use `unwrap()` in public doctests unless the example explicitly documents panic-oriented APIs.

## `#[doc(hidden)]` — When to Use

Hide items from the public rustdoc index while keeping them available for macros, tests, or internal crates:

- **Sealed traits** and trait impl hooks used only to prevent downstream impls.
- **Macro expansion helpers** not meant for direct use.
- **Test-only re-exports** when `cfg(test)` is not enough for doc visibility.
- **FFI shims** when the safe wrapper is the documented surface.

Do not use `#[doc(hidden)]` to avoid documenting public API the team actually ships. Hidden items still appear in rustdoc with `--document-hidden-items` and are part of the semver story if public.

Prefer `pub(crate)` for truly internal items. Use `#[doc(hidden)]` when something must be `pub` for technical reasons but should not appear in the default docs index.

## Link Domain Types

Use rustdoc intra-doc links for nearby domain concepts and error variants:

- [`RequestId`]
- [`AssignDriverError::DriverNotAvailable`]
- [`WaitingRequest::assign_driver`]

Broken intra-doc links are documentation bugs because they rot the contract map.

## Redaction and Public Docs

Do not put real secrets, tokens, emails, personal data, production IDs, or customer examples in rustdoc. Use synthetic values and show redaction behavior where it matters.

If a type intentionally redacts `Debug` or serialization, mention that contract in the type docs.

## Lints and CI

Prefer enabling `#![deny(rustdoc::broken_intra_doc_links)]` for library crates. Consider `#![warn(missing_docs)]` only for public library APIs where the team is ready to maintain docs; do not impose it casually on application crates.

Generated, vendored, or FFI binding modules may be exempt, but safe wrappers around them should still document the domain and safety contract.

## Common Crate Combinations

| Stack | Rustdoc focus |
| --- | --- |
| `thiserror` enums | `# Errors` links to `#[error]` variants |
| State transitions | `# Examples` with `?` and `Transition` outcome |
| `unsafe` adapters | `# Safety` on `unsafe fn`; safe fn documents preconditions |
