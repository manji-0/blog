---
title: "Kamae Rust Rules"
sidebar:
  order: 2
  label: "Rules"
---

Customize how `kamae-rs` and `kamae-rs-review` apply per project. Rules are Markdown files with YAML frontmatter.

## Rule Locations

Highest priority first:

| Tier | Path |
| --- | --- |
| Project | `.claude/rules/*.md`, `.codex/rules/*.md` |
| User | `~/.claude/rules/*.md`, `~/.codex/rules/*.md` |
| Plugin defaults | `rules/defaults/*.md` |

Same `name` on a higher tier wins. Same `name` on the same tier is resolved by lexicographically last filename.

## Rule Schema

```yaml
---
name: <kebab-case identifier>
description: <one-line summary>
applies-to: kamae-rs | kamae-rs-review | "*"
type: library-preference | check-toggle | convention | override
alwaysApply: false
---
```

Required fields:

| Field | Schema |
| --- | --- |
| `name` | Kebab-case rule identifier. Same-name rules override by tier. |
| `description` | One-line summary for humans and package validators. |
| `applies-to` | `kamae-rs`, `kamae-rs-review`, or `"*"`. |
| `type` | `library-preference`, `check-toggle`, `convention`, or `override`. |
| `alwaysApply` | Boolean. Defaults should normally use `false`. |

Optional fields:

| Field | Schema |
| --- | --- |
| `check` | Canonical check ID or alias for `check-toggle` rules. |
| `enabled` | Boolean for `check-toggle`; use `false` to disable a check. |

## Canonical Check IDs

Review checklist headings define canonical numeric check IDs. Rule toggles may also use the aliases below when a project wants a stable semantic name.

| ID | Alias | Checklist |
| --- | --- | --- |
| `1.1` | `semantic-newtypes` | Domain modeling |
| `1.2` | `invariant-bypass` | Domain modeling |
| `1.3` | `explicit-states` | Domain modeling |
| `1.4` | `dto-row-domain-separation` | Domain modeling |
| `1.5` | `concept-organization` | Domain modeling |
| `1.6` | `explicit-money-time-units` | Domain modeling |
| `2.1` | `typed-source-state` | State transitions |
| `2.2` | `exhaustive-domain-match` | State transitions |
| `2.3` | `pure-transitions` | State transitions |
| `2.4` | `transition-ownership` | State transitions |
| `2.5` | `invariant-preserving-mutators` | State transitions |
| `2.6` | `auth-tenant-transition-guards` | State transitions |
| `2.7` | `concurrent-transition-protection` | State transitions |
| `3.1` | `no-domain-panics` | Error handling |
| `3.2` | `specific-domain-errors` | Error handling |
| `3.3` | `intentional-infra-error-mapping` | Error handling |
| `3.4` | `meaningful-error-variants` | Error handling |
| `4.1` | `boundary-dto-domain-conversion` | Boundary defense |
| `4.2` | `serde-is-not-validation` | Boundary defense |
| `4.3` | `external-format-overderive` | Boundary defense |
| `4.4` | `dto-defaults-unknown-fields` | Boundary defense |
| `4.5` | `auth-tenant-boundary-checks` | Boundary defense |
| `5.1` | `sensitive-wrapper` | PII protection |
| `5.2` | `pii-debug-log-redaction` | PII protection |
| `5.3` | `narrow-plaintext-exposure` | PII protection |
| `5.4` | `observability-redaction` | PII protection |
| `6.1` | `atomic-state-events` | Persistence and events |
| `6.2` | `use-case-repository-traits` | Persistence and events |
| `6.3` | `adapter-does-not-invent-events` | Persistence and events |
| `6.4` | `db-constraints-mirror-invariants` | Persistence and events |
| `6.5` | `idempotent-retry-handling` | Persistence and events |
| `6.6` | `event-versioning` | Persistence and events |
| `7.1` | `constructor-conversion-tests` | Tests |
| `7.2` | `invalid-transition-tests` | Tests |
| `7.3` | `compile-fail-safety-tests` | Tests |
| `7.4` | `mutator-invariant-tests` | Tests |
| `7.5` | `persistence-retry-tests` | Tests |
| `7.6` | `boundary-observability-tests` | Tests |
| `8.1` | `no-unsafe-domain-logic` | Unsafe boundaries |
| `8.2` | `safe-unsafe-abstraction` | Unsafe boundaries |
| `8.3` | `unsafe-safety-comments` | Unsafe boundaries |
| `8.4` | `unsafe-does-not-bypass-domain` | Unsafe boundaries |
| `8.5` | `unsafe-boundary-tests` | Unsafe boundaries |
| `9.1` | `rustfmt-clean` | Formatting and lints |
| `9.2` | `clippy-clean` | Formatting and lints |
| `9.3` | `narrow-lint-suppressions` | Formatting and lints |
| `9.4` | `lint-suppression-domain-risk` | Formatting and lints |
| `9.5` | `fmt-lint-ci-gates` | Formatting and lints |
| `10.1` | `rustdoc-public-contracts` | Rustdoc |
| `10.2` | `rustdoc-errors-panics-safety` | Rustdoc |
| `10.3` | `rustdoc-safe-examples` | Rustdoc |
| `10.4` | `rustdoc-links-doctests` | Rustdoc |
| `10.5` | `rustdoc-lint-scope` | Rustdoc |
| `11.1` | `ci-required-reviewer-checks` | CI setup |
| `11.2` | `ci-representative-matrix` | CI setup |
| `11.3` | `ci-risk-tied-safety-jobs` | CI setup |
| `11.4` | `ci-advisory-check-clarity` | CI setup |
| `11.5` | `ci-local-reproduction` | CI setup |

Example disabling a check:

```yaml
---
name: allow-anyhow-in-domain
description: Permit anyhow in this crate's domain layer while migrating errors.
applies-to: kamae-rs-review
type: check-toggle
check: specific-domain-errors
enabled: false
alwaysApply: false
---
```

Rule bodies may add the rationale, scope, replacement convention, and sunset condition. Keep examples project-specific in project-level rules rather than plugin defaults.
