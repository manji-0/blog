---
title: "Development Environment Setup"
sidebar:
  order: 10
---

> **Audience:** Contributors working in the **kamae-rs** skill repository (not generic install targets).
> **When to read:** Setting up a local workspace to develop or test this skill package.
> **Related:** [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/) (canonical check commands), [`local-validation.md`](/docs/kamae-rs/references/local-validation/), [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/).

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) toolchain with `rustfmt`, `clippy`, and `rustdoc` (optional for skill-only edits)
- Python 3 (used for package validation and template application)

## Clone and Bootstrap

```bash
git clone <repository-url>
cd kamae-rs
python3 scripts/validate_package.py
```

If the repository also contains Rust domain code under a crate, install the toolchain components and run `cargo check`.

## Verify the Installation

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

Package validation should pass before you make changes.

## Run the Local Quality Gates

Run the baseline commands in [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/). For this repository, also run:

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

Apply formatting with `cargo fmt --all` if the format check fails.

## Working on the Skill Package

The skill lives under `skills/kamae-rs/`:

- `SKILL.md` — the dispatching guide and frontmatter.
- `references/` — detailed reference documents.
- `scripts/` — helper scripts such as `apply_templates.py`.
- `assets/templates/` — installable project templates.

When you add a new reference document, link to it from `SKILL.md` so the skill dispatcher surfaces it. Prefer relative links so `scripts/validate_package.py` can check them.

When you change `crates/review-probe` or `scripts/validate_package.py`, run `python3 scripts/validate_package.py` and `cargo test -p kamae-review-probe` before committing.

## Apply Templates for Testing

`skills/kamae-rs/scripts/apply_templates.py` copies templates into a target directory. Use a temporary directory to test template changes without affecting this repository:

```bash
mkdir -p /tmp/kamae-rs-test
python3 skills/kamae-rs/scripts/apply_templates.py --target /tmp/kamae-rs-test --ci backend --force
```

Use `--dry-run` first when applying templates to an existing project.

## Before Committing

1. Run the full local quality gate list above.
2. Review `git diff` for accidental template or manifest changes.
3. Keep commits focused: one logical change per commit. For example, add the new reference document and its `SKILL.md` link in one commit; separate unrelated tooling updates into their own commit.

## Troubleshooting

- **Package validation fails on a new link**: Ensure the target file exists and any `#anchor` slug matches the heading (see [`../../../DEVELOPMENT.md`](/docs/kamae-rs/../../../DEVELOPMENT/#cross-references)).
- **Review probe shows many leads on the example file**: The taxi example intentionally omits some production contracts; use the probe on real domain code when validating probe changes.
- **Template CI path is wrong after install**: Replace `path/to/kamae-rs` in generated workflows with the vendored script path or absolute install location.

For application crates that follow the skill (not this repository), read [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/).
