---
title: "フォーマットと lint"
sidebar:
  order: 10
---

`cargo fmt` と `clippy` はスタイル論争ではなく、ドメイン・境界・PII・unsafe・永続化の差分を読みやすくするための前提である。触ったRustファイルでは仕上げ前に揃える。

正規コマンド一覧は [品質ゲート](/projects/kamae-rs/quality-gates/)、CIへの載せ方は [CI セットアップ](/projects/kamae-rs/ci-setup/) を参照する。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./ci-setup.md -->

## フォーマットのベースライン

変更したRustには `cargo fmt` または `rustfmt` を走らせる。`rustfmt` が戻す手揃えはしない。複雑な条件は小さなヘルパや名前付き値オブジェクトに切り出す。

## Clippy のベースライン

プロジェクトにRust crateがあるときは、既存コマンドがあればそれで `cargo clippy` を走らせる。推奨既定：

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

features、パッケージ、警告方針はリポジトリに合わせる。無関係な変更でグローバルlintを急に厳しくしない。

## ワークスペースでの lint 統一

複数ドメインcrateがあるときは、adapterとdomainで同じバーになるよう方針を集約する。

### ルート `Cargo.toml` — 継承lint（Rust 1.74+）

```toml
[workspace.lints.rust]
unsafe_code = "forbid"
missing_docs = "allow"  # 準備できたらcrate単位で有効化

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

メンバは `[lints] workspace = true` で継承する。`booking-domain` だけ追加の `deny` で締められる。一覧の丸コピーは不要。

### `clippy.toml` の推奨

ワークスペースルートに置く：

```toml
min-ident-chars-threshold = 2
disallowed-names = ["foo", "bar", "baz"]
```

ドメインcrateで通貨に `f64` を禁じるなら `disallowed-methods` / `disallowed-types` を検討する（nightly、あるいはレビュー規律を要する場合がある）。ローカル実行とCIは同じフラグにする。[CI セットアップ](/projects/kamae-rs/ci-setup/) を参照。

## ドメイン安全性に効く lint

無効状態や運用失敗を隠しうるパターンに特に注意する：

- ドメイン/ユースケースでの `unwrap_used`、`expect_used`、`panic`、無検査インデックス
- テストや証明済み不変条件外の `todo`、`unimplemented`、`unreachable`
- `large_enum_variant`、`result_large_err`、不自然なclone（境界のぎこちなさの兆候）
- 金額・数量・時間・単位での `float_cmp`、怪しい算術、lossy cast
- ドメインenumへの `wildcard_enum_match_arm` と広い `_`
- 機密や不変条件付き型への広い `derive(Debug)` / シリアライズderive
- ユースケースやadapterでの `await_holding_lock`、detached task、無視された `Result`

上記をすべてグローバル必須にはしない。触ったコードやローカル設定に現れたときのレビュー信号として使う。

## 抑制のルール

`#[allow(...)]` はできるだけ狭くする：

- crate全体よりitem/式レベルを優先する
- 正しさ、安全、PII、永続化、エラー処理に効く抑制には短い理由を付ける
- 本番での `#![allow(warnings)]`、`#![allow(clippy::all)]`、広いモジュールallowは避ける

```rust
#[allow(clippy::result_large_err, reason = "error enum preserves exhaustive domain handling")]
pub fn assign_driver(...) -> Result<..., AssignDriverError> { ... }
```

toolchainが `reason` を未対応なら近傍コメントで足りる。

## 生成コードと第三者コード

生成バインディング、vendored、外部維持スナップショットにドメインと同じlintバーを強制しない。隔離し生成元を文書化する。広いallowは許容するが、それを包むsafe wrapperは [unsafe 境界](/projects/kamae-rs/unsafe-boundaries/) と [境界防御](/projects/kamae-rs/boundary-defense/) に従う。

## CI での期待

[品質ゲート](/projects/kamae-rs/quality-gates/) のベースラインをCIでも走らせる：

- `cargo fmt --all -- --check`
- リポジトリのfeature/パッケージmatrixでの `cargo clippy`
- ドメインconstructor、遷移、境界変換、unsafe wrapper、persistence向けテスト

フルワークスペースが遅いときは、変更をカバーする最小集合を走り制限を明記する。

## よくある組み合わせ

| 目的 | アプローチ |
| --- | --- |
| ドメイン全体で均一 | `[workspace.lints]` + 各メンバ `workspace = true` |
| ドメインcrateだけ厳格 | `unwrap_used = "deny"` を当該 `Cargo.toml` で上書き |
| 生成prost/FFI | 生成モジュールに `#[allow(...)]`。safe wrapper crateをlint |

## レビューで見るところ

触ったパッケージで `cargo fmt --check` やプロジェクトのclippy方針に失敗していないか。正しさやPIIに効く `#[allow]` へ理由を付けているか。広い `#![allow(warnings)]` や説明のない抑制でリスクを隠していないかも見る。ワークスペースlint継承とローカル/CIのフラグ一致は文書化されているか。
