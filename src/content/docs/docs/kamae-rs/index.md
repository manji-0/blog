---
title: "kamae-rs"
sidebar:
  order: 0
  label: "Overview"
---

> Source: [https://github.com/manji-0/kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae (構え) - a stance of readiness._

Rust skills for designing and reviewing robust server-side domain code. This is a Rust-oriented sibling of [`kamae-ts`](https://github.com/iwasa-kosui/kamae-ts): it keeps the same thin-skill, topic-guide, and review-checklist shape while translating the principles into Rust idioms.

## Provided Skills

### `kamae-rs`

Use when implementing, modifying, refactoring, or fixing Rust domain models, use cases, repositories, state transitions, boundary DTO parsing, typed errors, PII handling, or validation/review-adjacent code.

Core principles:

- Model domain meaning with enums, structs, private-field newtypes, and validated constructors.
- Make invalid state transitions fail at compile time where practical.
- Use `Result<T, E>` with domain-specific error enums.
- Convert external data through DTO/row/config structs before constructing domain types.
- Wire use cases through small ports and inject adapters at the composition root.
- Keep aggregate changes inside one transaction boundary per use case when practical.
- Keep PII and secrets behind redacting wrappers.
- Keep `unsafe` out of domain logic by default; when unavoidable, hide it behind small safe APIs with documented safety invariants.
- Keep formatting and lint gates clean for touched Rust code; treat lint suppressions as narrow, justified design decisions.
- Use rustdoc to document public domain contracts: invariants, errors, transition rules, examples, and safety sections where relevant.
- Align CI with review assumptions: package validation, format, lint, tests, rustdoc, and risk-tied unsafe/security jobs.

### `kamae-rs-review`

Use during Rust code review. It walks severity-tagged checklist files for domain modeling, transitions, error handling, application wiring, aggregate transactions, boundary validation, PII protection, unsafe boundaries, formatting/lints, rustdoc, CI setup, persistence/events, streams and continuous queries, domain macros, service boundaries, and tests.

## Packaging

The package includes both Claude and Codex manifests:

- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` describe the Claude plugin package.
- `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` describe the Codex plugin package and point Codex at `./skills/`.

Run `python3 scripts/validate_package.py` before publishing or sharing a package archive. The smoke test validates JSON manifests, skill frontmatter, relative Markdown links, manifest skill paths, and crate-guide references.

## Review Tools

Run `cargo run -p kamae-review-probe -- <path>` to collect review leads from Rust files before walking the review checklist. The probe parses source with `syn` and is intentionally conservative: it highlights patterns for human/agent inspection and does not produce findings by itself.

For implementing and testing domain code in application crates, see [`skills/kamae-rs/references/dev-environment.md`](/docs/kamae-rs/references/dev-environment/).

## Customization
Rules live under `.claude/rules/`, `.codex/rules/`, user-level rule directories, or this repo's `rules/defaults/`. See [`rules/README.md`](/docs/kamae-rs/rules/README/).

## Repository Layout

```text
skills/kamae-rs/          Implementation guidance
skills/kamae-rs-review/   Review procedure and checklist
rules/                    Project/user override format
```

## License

MIT
