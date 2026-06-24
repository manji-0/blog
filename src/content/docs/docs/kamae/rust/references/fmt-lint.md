---
title: "Rust フォーマットと Lint"
sidebar:
  order: 10
---

## フォーマットのベースライン

変更を仕上げる前に触った Rust ファイルで `cargo fmt` または `rustfmt` を実行する。Kamae ではフォーマットはスタイル議論ではない。差分をレビュー可能に保ち、ドメイン、境界、PII、unsafe、persistence の変更を inspect しやすくする。

`rustfmt` が戻す手整列をしない。複雑条件を隠す formatting トリックより、小さな helper 関数または named value object を優先。

## Clippy ベースライン

Rust crate があるプロジェクトでは関連 package または workspace で `cargo clippy` を実行。既存コマンドがあればそれを使う。

推奨デフォルト:

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

feature、package、warning ポリシーはリポジトリに合わせて調整。無関係な変更でより厳しい global lint ポリシーを安易に導入しない。

## ワークスペース lint 統一

複数ドメイン crate の workspace では lint ポリシーを集中し、adapter と domain crate が同じバーを共有する。

### ルート `Cargo.toml` — 継承 lint（Rust 1.74+）

```toml
[workspace.lints.rust]
unsafe_code = "forbid"
missing_docs = "allow"  # enable per crate when ready

[workspace.lints.clippy]
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
wildcard_enum_match_arm = "warn"
float_cmp = "warn"

[package]
name = "booking-domain"
# ...

[lints]
workspace = true
```

メンバー crate は `[lints] workspace = true` で継承。1 crate（例: `booking-domain`）だけ追加 `deny` で引き締め、リスト全体をコピーしない。

### `clippy.toml` 推奨

ワークスペースルートに配置:

```toml
# Reject short, ambiguous names in public domain APIs
min-ident-chars-threshold = 2

# Catch accidental float usage in money-like names (project-specific)
disallowed-names = ["foo", "bar", "baz"]

# If the codebase standardizes on a money newtype:
# cognitive-complexity-threshold = 25
```

ドメイン crate で通貨に `f64` を禁止するとき `disallowed-methods` または `disallowed-types` を追加（nightly または review による規律）。

`clippy.toml` はローカル dev と同じフラグの CI とセット。[`ci-setup.md`](/docs/kamae/rust/references/ci-setup/) 参照。

## ドメイン安全性で重要な lint

無効状態や運用失敗を隠しうる lint とパターンに特に注意:

- ドメイン/ユースケースの `unwrap_used`、`expect_used`、`panic`、未チェック索引
- テストや証明済み不変条件外の `todo`、`unimplemented`、`unreachable`
- 不自然なドメイン境界を示す `large_enum_variant`、`result_large_err`、不要 clone
- 金額、数量、期間、単位の `float_cmp`、疑わしい算術、ロッシーキャスト
- ドメイン enum の `wildcard_enum_match_arm` と広い `_`
- 敏感または不変条件付き型の `derive_partial_eq_without_eq`、広い `derive(Debug)`、serialization derive
- ユースケース/adapter の `await_holding_lock`、デタッチタスク、無視 `Result`

上記すべてを global 有効にする必要はない。触ったコードやローカル設定に現れた review シグナルとして使う。

## 抑制ルール

`#[allow(...)]` は可能な限り狭く:

- crate レベルより item/expression レベルを優先
- 正確性、安全、PII、persistence、error handling に触れる lint 抑制には短い理由
- 本番コードで `#![allow(warnings)]`、`#![allow(clippy::all)]`、広い module allow を避ける

良い例:

```rust
#[allow(clippy::result_large_err, reason = "error enum preserves exhaustive domain handling")]
pub fn assign_driver(...) -> Result<..., AssignDriverError> { ... }
```

toolchain が `reason` 非対応なら近くにコメント。

## 生成コードと第三者コード

生成 binding、vendored、外部維持スナップショットをドメインと同じ lint バーに通さない。生成元を文書化し隔離。

生成コードは広い allow 可。生成/FFI 周りの safe wrapper は unsafe 境界と境界検証ガイダンスに従う。

## CI 期待

[`quality-gates.md`](/docs/kamae/rust/references/quality-gates/) のベースラインを CI job で実行:

- `cargo fmt --all -- --check`
- リポジトリ feature/package 行列での `cargo clippy`
- ドメイン constructor、遷移、境界変換、unsafe wrapper、persistence 挙動に関連するテスト

フル workspace チェックが速くないプロジェクトでは、変更コードをカバーする最小 package/feature を実行し制限を明記。workflow テンプレートと branch protection は [`ci-setup.md`](/docs/kamae/rust/references/ci-setup/) 参照。

## よくある crate 組み合わせ

| Goal | Approach |
| --- | --- |
| 均一な domain bar | `[workspace.lints]` + 各 member で `workspace = true` |
| domain crate のみ厳格 | `booking-domain/Cargo.toml` で `unwrap_used = "deny"` 上書き |
| 生成 prost/FFI | 生成 module に `#[allow(...)]`; safe wrapper crate を lint |

## レビュー観点

### 8.1 触った Rust コードはフォーマットされているか — Low

生成コードやベンダーコードを除き、`cargo fmt --check` や `rustfmt --check` に失敗する触った Rust ファイルをフラグする。

フォーマットの所見は、リスクのあるドメイン、unsafe、PII、永続化、境界変更を隠さない限り Low のままにする。

### 8.2 関連パッケージの lint 結果はクリーンか — Medium

リポジトリが通常 `cargo clippy`、`cargo check`、または同等の CI を触ったパッケージで走らせるのに、新しい警告やスキップされた lint ゲートがある場合はフラグする。

リポジトリが `-D warnings` を使っていないのに新しいグローバル方針を要求しない。既存のローカルコマンドを走らせ、触ったコードの警告を直すことを推奨する。

### 8.3 lint 抑制は狭く正当化されているか — Medium

広い `#![allow(warnings)]`、`#![allow(clippy::all)]`、モジュール全体の抑制、説明のないドメイン、境界、PII、unsafe、永続化、エラーハンドリング周辺の `#[allow(...)]` をフラグする。

生成、ベンダー、互換コードでソースが文書化され隔離されている場合は格下げする。

### 8.4 抑制された lint がドメイン安全性リスクを隠していないか — High

パニック、境界チェックなしインデックス、広い列挙 match、損失のあるキャスト、浮動小数点の金額 / 数量比較、無視された `Result`、`await_holding_lock`、unsafe ブロック、PII の `Debug`、境界デシリアライズに関する抑制や無視された警告をフラグする。

抑制が無効な状態の許容、データ損失、PII 漏洩、不健全性、永続化失敗の見逃しにつながる場合はエスカレートする。

### 8.5 フォーマット / lint ゲートは CI またはパッケージ検証に表れているか — Low

Rust ソース変更があるのにフォーマットと lint チェックの実行方法が文書化されていないパッケージをフラグする。`cargo fmt --check` とプロジェクトの関連 `cargo clippy` コマンドを提案する。

ドキュメントのみの小変更を Rust CI 欠如でブロックしない。
