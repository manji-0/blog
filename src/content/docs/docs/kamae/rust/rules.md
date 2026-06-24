---
title: "Kamae Rust ルール"
sidebar:
  order: 2
  label: "ルール"
---

`kamae-rs` と `kamae-rs-review` のプロジェクトごとの適用方法をカスタマイズします。ルールは YAML frontmatter 付きの Markdown ファイルです。

## ルールの配置場所

優先度が高い順:

| 階層 | パス |
| --- | --- |
| プロジェクト | `.claude/rules/*.md`、`.codex/rules/*.md` |
| プラグイン既定 | `rules/defaults/*.md` |

同一 `name` は上位階層が勝ちます。同一階層の同一 `name` は、ファイル名の辞書順で最後のものが採用されます。

## ルールスキーマ

```yaml
---
name: <kebab-case identifier>
description: <one-line summary>
applies-to: kamae-rs | kamae-rs-review | "*"
type: library-preference | check-toggle | convention | override
alwaysApply: false
---
```

必須フィールド:

| フィールド | スキーマ |
| --- | --- |
| `name` | kebab-case のルール識別子。同名ルールは階層で上書きされる。 |
| `description` | 人間とパッケージ検証器向けの 1 行要約。 |
| `applies-to` | `kamae-rs`、`kamae-rs-review`、または `"*"`。 |
| `type` | `library-preference`、`check-toggle`、`convention`、または `override`。 |
| `alwaysApply` | ブール値。既定値は通常 `false`。 |

任意フィールド:

| フィールド | スキーマ |
| --- | --- |
| `check` | `check-toggle` ルール用の正規チェック ID またはエイリアス。 |
| `enabled` | `check-toggle` 用のブール値。`false` でチェックを無効化。 |

## 正規チェック ID

レビューチェックリストの見出しが正規の数値チェック ID を定義します。ルールのトグルでは、プロジェクトが安定した意味名を望む場合、下記のエイリアスも使えます。

| ID | エイリアス | チェックリスト |
| --- | --- | --- |
| `1.1` | `semantic-newtypes` | ドメインモデリング |
| `1.2` | `invariant-bypass` | ドメインモデリング |
| `1.3` | `explicit-states` | ドメインモデリング |
| `1.4` | `dto-row-domain-separation` | ドメインモデリング |
| `1.5` | `concept-organization` | ドメインモデリング |
| `1.6` | `explicit-money-time-units` | ドメインモデリング |
| `2.1` | `typed-source-state` | 状態遷移 |
| `2.2` | `exhaustive-domain-match` | 状態遷移 |
| `2.3` | `pure-transitions` | 状態遷移 |
| `2.4` | `transition-ownership` | 状態遷移 |
| `2.5` | `invariant-preserving-mutators` | 状態遷移 |
| `2.6` | `auth-tenant-transition-guards` | 状態遷移 |
| `2.7` | `concurrent-transition-protection` | 状態遷移 |
| `3.1` | `no-domain-panics` | エラーハンドリング |
| `3.2` | `specific-domain-errors` | エラーハンドリング |
| `3.3` | `intentional-infra-error-mapping` | エラーハンドリング |
| `3.4` | `meaningful-error-variants` | エラーハンドリング |
| `4.1` | `boundary-dto-domain-conversion` | 境界防御 |
| `4.2` | `serde-is-not-validation` | 境界防御 |
| `4.3` | `external-format-overderive` | 境界防御 |
| `4.4` | `dto-defaults-unknown-fields` | 境界防御 |
| `4.5` | `auth-tenant-boundary-checks` | 境界防御 |
| `5.1` | `sensitive-wrapper` | PII 保護 |
| `5.2` | `pii-debug-log-redaction` | PII 保護 |
| `5.3` | `narrow-plaintext-exposure` | PII 保護 |
| `5.4` | `observability-redaction` | PII 保護 |
| `6.1` | `atomic-state-events` | 永続化とイベント |
| `6.2` | `use-case-repository-traits` | 永続化とイベント |
| `6.3` | `adapter-does-not-invent-events` | 永続化とイベント |
| `6.4` | `db-constraints-mirror-invariants` | 永続化とイベント |
| `6.5` | `idempotent-retry-handling` | 永続化とイベント |
| `6.6` | `event-versioning` | 永続化とイベント |
| `7.1` | `constructor-conversion-tests` | テスト |
| `7.2` | `invalid-transition-tests` | テスト |
| `7.3` | `compile-fail-safety-tests` | テスト |
| `7.4` | `mutator-invariant-tests` | テスト |
| `7.5` | `persistence-retry-tests` | テスト |
| `7.6` | `boundary-observability-tests` | テスト |
| `8.1` | `no-unsafe-domain-logic` | unsafe 境界 |
| `8.2` | `safe-unsafe-abstraction` | unsafe 境界 |
| `8.3` | `unsafe-safety-comments` | unsafe 境界 |
| `8.4` | `unsafe-does-not-bypass-domain` | unsafe 境界 |
| `8.5` | `unsafe-boundary-tests` | unsafe 境界 |
| `9.1` | `rustfmt-clean` | フォーマットと lint |
| `9.2` | `clippy-clean` | フォーマットと lint |
| `9.3` | `narrow-lint-suppressions` | フォーマットと lint |
| `9.4` | `lint-suppression-domain-risk` | フォーマットと lint |
| `9.5` | `fmt-lint-ci-gates` | フォーマットと lint |
| `10.1` | `rustdoc-public-contracts` | rustdoc |
| `10.2` | `rustdoc-errors-panics-safety` | rustdoc |
| `10.3` | `rustdoc-safe-examples` | rustdoc |
| `10.4` | `rustdoc-links-doctests` | rustdoc |
| `10.5` | `rustdoc-lint-scope` | rustdoc |
| `11.1` | `ci-required-reviewer-checks` | CI 設定 |
| `11.2` | `ci-representative-matrix` | CI 設定 |
| `11.3` | `ci-risk-tied-safety-jobs` | CI 設定 |
| `11.4` | `ci-advisory-check-clarity` | CI 設定 |
| `11.5` | `ci-local-reproduction` | CI 設定 |

チェックを無効化する例:

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

ルール本文には、根拠、スコープ、置き換え慣習、廃止条件を書けます。例はプロジェクトレベルのルールに置き、プラグイン既定には含めないでください。
