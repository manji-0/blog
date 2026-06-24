---
title: "Kamae Python ルール"
sidebar:
  order: 2
  label: "ルール"
---

`kamae-py` と `kamae-py-review` のプロジェクトごとの適用方法をカスタマイズします。ルールは YAML フロントマター付きの Markdown ファイルです。

## ルールの配置場所

優先度の高い順:

| ティア | パス |
| --- | --- |
| プロジェクト | `.claude/rules/*.md`、`.codex/rules/*.md` |
| ユーザー | `~/.claude/rules/*.md`、`~/.codex/rules/*.md` |
| プラグインデフォルト | `rules/defaults/*.md` |

同一 `name` は上位ティアが勝つ。同一ティア内の同一 `name` は、ファイル名の辞書順で最後のものが採用される。

## ルールスキーマ

```yaml
---
name: <kebab-case identifier>
description: <one-line summary>
applies-to: kamae-py | kamae-py-review | "*"
type: library-preference | check-toggle | convention | override
alwaysApply: false
---
```

必須フィールド:

| フィールド | スキーマ |
| --- | --- |
| `name` | kebab-case のルール識別子。同名ルールはティアで上書きされる |
| `description` | 人間とパッケージバリデータ向けの 1 行要約 |
| `applies-to` | `kamae-py`、`kamae-py-review`、または `"*"` |
| `type` | `library-preference`、`check-toggle`、`convention`、`override` |
| `alwaysApply` | ブール値。デフォルトは通常 `false` |

任意フィールド:

| フィールド | スキーマ |
| --- | --- |
| `check` | `check-toggle` 用の正規チェック ID またはエイリアス |
| `enabled` | `check-toggle` 用のブール値。`false` でチェックを無効化 |

## 正規チェック ID

レビューチェックリストの見出しが正規の数値チェック ID を定義します。ルールのトグルでは、プロジェクトが安定した意味名を使いたい場合に下記エイリアスも使えます。

| ID | エイリアス | チェックリスト |
| --- | --- | --- |
| `1.1` | `semantic-primitives` | ドメインモデリング |
| `1.2` | `invariant-bypass` | ドメインモデリング |
| `1.3` | `discriminated-unions` | ドメインモデリング |
| `1.4` | `dto-orm-domain-separation` | ドメインモデリング |
| `1.5` | `concept-organization` | ドメインモデリング |
| `1.6` | `explicit-money-time-units` | ドメインモデリング |
| `1.7` | `frozen-extra-forbid` | ドメインモデリング |
| `2.1` | `typed-source-state` | 状態遷移 |
| `2.2` | `exhaustive-domain-match` | 状態遷移 |
| `2.3` | `pure-transitions` | 状態遷移 |
| `2.4` | `injected-time-randomness` | 状態遷移 |
| `2.5` | `invariant-preserving-mutators` | 状態遷移 |
| `2.6` | `auth-tenant-transition-guards` | 状態遷移 |
| `2.7` | `concurrent-transition-protection` | 状態遷移 |
| `3.1` | `explicit-business-failures` | エラーハンドリング |
| `3.2` | `no-assert-for-business-rules` | エラーハンドリング |
| `3.3` | `specific-domain-errors` | エラーハンドリング |
| `3.4` | `intentional-infra-error-mapping` | エラーハンドリング |
| `3.5` | `async-use-case-layering` | エラーハンドリング |
| `3.6` | `no-lock-across-await` | エラーハンドリング |
| `3.7` | `meaningful-error-variants` | エラーハンドリング |
| `3.8` | `exception-chain-preservation` | エラーハンドリング |
| `3.9` | `error-message-redaction` | エラーハンドリング |
| `4.1` | `boundary-dto-domain-conversion` | 境界防御 |
| `4.2` | `pydantic-is-not-only-validator` | 境界防御 |
| `4.3` | `external-format-overconfigure` | 境界防御 |
| `4.4` | `dto-defaults-unknown-fields` | 境界防御 |
| `4.5` | `no-unchecked-casts` | 境界防御 |
| `4.6` | `auth-tenant-boundary-checks` | 境界防御 |
| `5.1` | `sensitive-wrapper` | PII 保護 |
| `5.2` | `pii-repr-log-redaction` | PII 保護 |
| `5.3` | `narrow-plaintext-exposure` | PII 保護 |
| `5.4` | `observability-redaction` | PII 保護 |
| `5.5` | `person-linked-id-policy` | PII 保護 |
| `6.1` | `meaningful-log-messages` | ログとメトリクス |
| `6.2` | `log-domain-object-state` | ログとメトリクス |
| `6.3` | `transition-logging` | ログとメトリクス |
| `6.4` | `structured-log-levels` | ログとメトリクス |
| `6.5` | `domain-outcome-metrics` | ログとメトリクス |
| `6.6` | `metric-cardinality` | ログとメトリクス |
| `6.7` | `observability-pii-redaction` | ログとメトリクス |
| `6.8` | `logged-id-classification` | ログとメトリクス |
| `6.9` | `error-chain-logging` | ログとメトリクス |
| `6.10` | `bounded-error-metrics` | ログとメトリクス |
| `7.1` | `no-native-domain-logic` | unsafe 境界 |
| `7.2` | `safe-native-abstraction` | unsafe 境界 |
| `7.3` | `native-safety-docs` | unsafe 境界 |
| `7.4` | `native-does-not-bypass-domain` | unsafe 境界 |
| `7.5` | `native-boundary-tests` | unsafe 境界 |
| `8.1` | `ruff-format-clean` | 品質ゲート |
| `8.2` | `lint-typecheck-clean` | 品質ゲート |
| `8.3` | `narrow-suppressions` | 品質ゲート |
| `8.4` | `suppression-domain-risk` | 品質ゲート |
| `8.5` | `quality-gates-in-ci` | 品質ゲート |
| `9.1` | `docstring-public-contracts` | API 契約 |
| `9.2` | `docstring-errors-native` | API 契約 |
| `9.3` | `docstring-safe-examples` | API 契約 |
| `9.4` | `docstring-maintenance` | API 契約 |
| `9.5` | `docstring-check-scope` | API 契約 |
| `10.1` | `ci-required-reviewer-checks` | CI セットアップ |
| `10.2` | `ci-representative-matrix` | CI セットアップ |
| `10.3` | `ci-risk-tied-safety-jobs` | CI セットアップ |
| `10.4` | `ci-advisory-check-clarity` | CI セットアップ |
| `10.5` | `ci-local-reproduction` | CI セットアップ |
| `11.1` | `domain-free-of-framework-imports` | 開発セットアップ |
| `11.2` | `domain-tests-without-docker` | 開発セットアップ |
| `11.3` | `fixtures-through-constructors` | 開発セットアップ |
| `11.4` | `documented-local-check-loop` | 開発セットアップ |
| `11.5` | `no-secrets-in-env-files` | 開発セットアップ |
| `11.6` | `test-layout-matches-layers` | 開発セットアップ |
| `12.1` | `atomic-state-events` | 永続化とイベント |
| `12.2` | `use-case-repository-protocols` | 永続化とイベント |
| `12.3` | `adapter-does-not-invent-events` | 永続化とイベント |
| `12.4` | `db-constraints-mirror-invariants` | 永続化とイベント |
| `12.5` | `idempotent-retry-handling` | 永続化とイベント |
| `12.6` | `event-versioning` | 永続化とイベント |
| `13.1` | `use-case-transaction-boundary` | 集約 |
| `13.2` | `root-only-invariant-changes` | 集約 |
| `13.3` | `optimistic-concurrency` | 集約 |
| `13.4` | `pessimistic-lock-scope` | 集約 |
| `13.5` | `cross-aggregate-coordination` | 集約 |
| `13.6` | `idempotent-command-boundary` | 集約 |
| `14.1` | `small-use-case-ports` | アプリケーション配線 |
| `14.2` | `use-cases-depend-on-ports` | アプリケーション配線 |
| `14.3` | `orchestration-in-use-cases` | アプリケーション配線 |
| `14.4` | `explicit-dependency-injection` | アプリケーション配線 |
| `14.5` | `tests-swap-ports` | アプリケーション配線 |
| `15.1` | `cpu-bound-off-event-loop` | 並行性 |
| `15.2` | `no-shared-mutable-domain-state` | 並行性 |
| `15.3` | `scoped-process-thread-pools` | 並行性 |
| `15.4` | `lock-session-scope` | 並行性 |
| `16.1` | `retries-in-infrastructure` | インフラの耐障害性 |
| `16.2` | `retries-with-idempotency` | インフラの耐障害性 |
| `16.3` | `explicit-timeouts-circuit-breakers` | インフラの耐障害性 |
| `16.4` | `resilience-hides-domain-failures` | インフラの耐障害性 |
| `17.1` | `orm-out-of-domain` | ORM アダプター |
| `17.2` | `mapper-validates-both-ways` | ORM アダプター |
| `17.3` | `session-owned-by-adapters` | ORM アダプター |
| `17.4` | `no-lazy-loading-in-domain` | ORM アダプター |
| `17.5` | `optimistic-lock-column-mapping` | ORM アダプター |
| `18.1` | `model-construct-trusted-only` | Pydantic パフォーマンス |
| `18.2` | `intentional-boundary-optimization` | Pydantic パフォーマンス |
| `18.3` | `performance-preserves-invariants` | Pydantic パフォーマンス |
| `19.1` | `boundaries-before-rewrite` | 移行戦略 |
| `19.2` | `thin-compatibility-shims` | 移行戦略 |
| `19.3` | `legacy-isolation` | 移行戦略 |
| `19.4` | `migration-preserves-observability-pii` | 移行戦略 |
| `20.1` | `constructor-conversion-tests` | テスト |
| `20.2` | `invalid-transition-tests` | テスト |
| `20.3` | `exhaustiveness-tests` | テスト |
| `20.4` | `mutator-invariant-tests` | テスト |
| `20.5` | `persistence-retry-tests` | テスト |
| `20.6` | `boundary-observability-tests` | テスト |
| `20.7` | `property-based-invariant-tests` | テスト |

チェックを無効化する例:

```yaml
---
name: allow-mutable-domain-during-migration
description: Permit mutable domain models while migrating one workflow to frozen states.
applies-to: kamae-py-review
type: check-toggle
check: invariant-bypass
enabled: false
alwaysApply: false
---
```

ルール本文には、根拠、スコープ、置き換え規約、廃止条件を書いてよい。例はプロジェクトレベルのルールに置き、プラグインデフォルトには入れない。
