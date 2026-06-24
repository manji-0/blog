---
title: "Local Validation Setup"
sidebar:
  order: 10
---

> **Audience:** Projects bootstrapping from skill templates (`gh skill`, `npx skills`). For this repository's dev workflow, read [`development-setup.md`](/docs/kamae-rs/references/development-setup/).
> **When to read:** Bootstrapping local `Cargo.toml`, `rust-toolchain.toml`, `.gitignore`, GitHub Actions, or skill-package validation.
> **Related:** [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/) (canonical check commands), [`ci-setup.md`](/docs/kamae-rs/references/ci-setup/).

## Use the Bundled Templates

When this skill is installed with `gh skill` or `npx skills`, repository-root files such as `Cargo.toml`, `rust-toolchain.toml`, `.github/workflows/ci.yml`, and `scripts/validate_package.py` are not installed with it. Use the templates under [`../assets/templates/`](/docs/kamae-rs/../assets/templates/) when bootstrapping a project.

The quickest path is the bundled script:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

For skill/plugin repositories:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

The script does not overwrite existing files unless `--force` is set. Use `--dry-run` first when applying it to an existing repository.

## Review Probe Sanity Check

After bootstrapping, run the bundled review probe on domain directories to catch common Kamae stance issues before they reach review:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

The probe is advisory by default. Treat its output as review leads for panics, unsafe boundaries, serde derives, PII terms, and rustdoc gaps — not as a failing gate unless your team wires it that way.

Recommended local files:

- [`../assets/templates/Cargo.toml`](../assets/templates/Cargo.toml) -> `Cargo.toml` or merge into the existing workspace manifest.
- [`../assets/templates/rust-toolchain.toml`](../assets/templates/rust-toolchain.toml) -> `rust-toolchain.toml` when the team shares an MSRV or stable pin.
- [`../assets/templates/gitignore`](/docs/kamae-rs/../assets/templates/gitignore/) -> `.gitignore` or merge into the existing file.
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> `scripts/validate_package.py` for skill/plugin repositories only.

Adjust `package.name`, workspace members, and `[workspace.dependencies]` before committing. For application repositories, start with a single crate or the workspace layout in [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/#recommended-crate-layout).

## First-Time Setup

Install Rust with formatting and lint components:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

If the project does not yet have a `Cargo.toml`, copy the bundled template first and then run:

```bash
cargo check
cargo test
rustc --version
```

Pin the toolchain when the team shares a version:

```bash
cp path/to/kamae-rs/skills/kamae-rs/assets/templates/rust-toolchain.toml .
```

## Local Check Loop

After bootstrap, run the baseline commands in [`quality-gates.md`](/docs/kamae-rs/references/quality-gates/). For skill/plugin repositories, also run `python3 scripts/validate_package.py`.

For crate layout, fake ports, test layers, and the fast vs full pre-push loop, read [`dev-environment.md`](/docs/kamae-rs/references/dev-environment/).
