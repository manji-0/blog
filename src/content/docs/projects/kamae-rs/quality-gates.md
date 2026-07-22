---
title: "品質ゲート"
sidebar:
  order: 10
---

変更したcrateでは、`cargo fmt --check`、プロジェクトの `clippy` 方針、焦点を絞ったテストを、ローカルとCIで同じコマンドとして揃える。以下が品質ゲートの正規コマンド一覧である。

アプリケーションcrateのセットアップは [開発環境](/projects/kamae-rs/dev-environment/)、Actionsへの反映は [CI セットアップ](/projects/kamae-rs/ci-setup/)、スキルリポジトリ開発は [スキルリポジトリの開発](/projects/kamae-rs/development-setup/) を読む。

## ベースラインコマンド

リポジトリに既存コマンドがあればそれを優先する。なければ触ったRustコード向けに次のデフォルトを使う：

```bash
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

狭い変更では、触ったcrateをカバーする最小コマンドセットを実行し、制限を明記する：

```bash
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application
```

CIでは `cargo fmt --check` を使う。ローカルでフォーマットチェックが失敗したら `cargo fmt --all` で適用する。

初回ローカルセットアップは [開発環境](/projects/kamae-rs/dev-environment/#テンプレートからの初回ブートストラップ) を読み、[`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) からテンプレートをコピーまたはマージする。インストール済みスキルにはスキルディレクトリ配下のファイルが含まれるが、このリポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/`、`scripts/` は確実にはインストールされない。

## スキルパッケージと review probe チェック

スキル/プラグインリポジトリでは追加で実行する：

```bash
python3 scripts/validate_package.py
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

**kamae-rs** リポジトリ本体では `scripts/validate_package.py` と `cargo run -p kamae-review-probe` を使う。例コードは `skills/kamae-rs/examples/` 配下のworkspace crate `kamae-rs-taxi-request` にある。リポジトリルートから `cargo test --all-targets` を実行する。このリポジトリの開発ワークフローは [スキルリポジトリの開発](/projects/kamae-rs/development-setup/) を参照。

スキルをインストールしたアプリケーションcrateは、ドメインディレクトリが変わるときCIまたはpre-pushフックにprobeを追加してよい：

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

## フォーマットのベースライン

変更を仕上げる前に触ったRustファイルで `cargo fmt` または `rustfmt` を実行する。Kamaeではフォーマットはスタイルの好みの問題ではない。差分をレビューしやすく保ち、ドメイン、境界、PII、unsafe、永続化の変更を確認しやすくするための手段である。

`rustfmt` が戻す手整列をしない。複雑条件を隠すformattingトリックより、小さなhelper関数またはnamed value objectを優先。

## Clippy ベースライン

Rust crateがあるプロジェクトでは関連packageまたはworkspaceで `cargo clippy` を実行。既存コマンドがあればそれを使う。

推奨デフォルト：

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

feature、package、warningポリシーはリポジトリに合わせて調整。無関係な変更でより厳しいglobal lintポリシーを安易に導入しない。

## ワークスペース lint 統一

複数ドメインcrateのworkspaceではlintポリシーを集中し、adapterとdomain crateが同じバーを共有する。

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

メンバー crateは `[lints] workspace = true` で継承。1 crate（例： `booking-domain`）だけ追加 `deny` で引き締め、リスト全体をコピーしない。

### `clippy.toml` 推奨

ワークスペースルートに配置：

```toml
# Reject short, ambiguous names in public domain APIs
min-ident-chars-threshold = 2

# Catch accidental float usage in money-like names (project-specific)
disallowed-names = ["foo", "bar", "baz"]

# If the codebase standardizes on a money newtype:
# cognitive-complexity-threshold = 25
```

ドメインcrateで通貨に `f64` を禁止するとき `disallowed-methods` または `disallowed-types` を追加（nightlyまたはreviewによる規律）。

`clippy.toml` はローカルdevと同じフラグのCIとセット。[CI セットアップ](/projects/kamae-rs/ci-setup/) 参照。

## ドメイン安全性で重要な lint

無効状態や運用失敗を隠しうるlintとパターンに特に注意：

- ドメイン/ユースケースの `unwrap_used`、`expect_used`、`panic`、未チェック索引
- テストや証明済み不変条件外の `todo`、`unimplemented`、`unreachable`
- 不自然なドメイン境界を示す `large_enum_variant`、`result_large_err`、不要clone
- 金額、数量、期間、単位の `float_cmp`、疑わしい算術、ロッシーキャスト
- ドメインenumの `wildcard_enum_match_arm` と広い `_`
- 敏感または不変条件付き型の `derive_partial_eq_without_eq`、広い `derive(Debug)`、serialization derive
- ユースケース/adapterの `await_holding_lock`、デタッチタスク、無視 `Result`

上記すべてをglobal有効にする必要はない。触ったコードやローカル設定に現れたreviewシグナルとして使う。

## 抑制ルール

`#[allow(...)]` は可能な限り狭く：

- crateレベルよりitem/expressionレベルを優先
- 正確性、安全、PII、persistence、error handlingに触れるlint抑制には短い理由
- 本番コードで `#![allow(warnings)]`、`#![allow(clippy::all)]`、広いmodule allowを避ける

良い例：

```rust
#[allow(clippy::result_large_err, reason = "error enum preserves exhaustive domain handling")]
pub fn assign_driver(...) -> Result<..., AssignDriverError> { ... }
```

toolchainが `reason` 非対応なら近くにコメント。

## 生成コードと第三者コード

生成binding、vendored、外部維持スナップショットをドメインと同じlintバーに通さない。生成元を文書化し隔離。

生成コードは広いallow可。生成/FFI周りのsafe wrapperはunsafe境界と境界検証ガイダンスに従う。

## CI 期待

[品質ゲート](/projects/kamae-rs/quality-gates/) のベースラインをCI jobで実行：

- `cargo fmt --all -- --check`
- リポジトリfeature/package行列での `cargo clippy`
- ドメインconstructor、遷移、境界変換、unsafe wrapper、persistence挙動に関連するテスト

フルworkspaceチェックが速くないプロジェクトでは、変更コードをカバーする最小package/featureを実行し制限を明記。workflowテンプレートとbranch protectionは [CI セットアップ](/projects/kamae-rs/ci-setup/) 参照。

## よくある crate 組み合わせ

| 目的 | アプローチ |
| --- | --- |
| 均一な domain bar | `[workspace.lints]` + 各 member で `workspace = true` |
| domain crate のみ厳格 | `booking-domain/Cargo.toml` で `unwrap_used = "deny"` 上書き |
| 生成 prost/FFI | 生成 module に `#[allow(...)]`; safe wrapper crate を lint |

レビューでは、未フォーマットの変更、新規clippy警告、広いlint抑制、ドメイン安全性リスクを隠す抑制、CIに表れないフォーマット / lintゲートを指摘する。


## Rustdoc と型契約

公開ドメインAPIを変更したら `-D warnings` 付きで `cargo doc` を実行する。公開コンストラクタ、遷移、repositoryポート、unsafe周りのsafe wrapperには、不変条件、エラー、panic、安全義務を文書化する。

判別state enum、port trait、`Result` エラー意味論、境界DTO変換、redaction挙動の周辺で文書を弱めない。

## テスト

ドメインコンストラクタ、遷移、DTO変換、PII redaction、unsafe wrapper、repositoryトランザクション、outbox挙動、リトライ/idempotencyパス向けに焦点を当てたテストを実行する。

| 関心 | テスト場所 | ガイド |
| --- | --- | --- |
| フィクスチャと遷移エッジ | unit/integration tests | [テストデータ](/projects/kamae-rs/test-data/) |
| 入力全体の不変条件 | `proptest!` または `quickcheck!` | [プロパティベーステスト](/projects/kamae-rs/property-based-tests/) |
| アサーション強度 / 静かなギャップ | ドメインパッケージへの `cargo mutants` | [ミューテーションテスト](/projects/kamae-rs/mutation-testing/) |
| コンパイル時 state 安全性 | `trybuild` | [テストデータ](/projects/kamae-rs/test-data/#compile-time-state-安全性をテストする) |
| fake port とユースケース | `application` tests | [開発環境](/projects/kamae-rs/dev-environment/#fake-port-とテストフィクスチャ) |

生成バインディング、vendoredコード、外部維持スナップショットはフルlintバーから免除してよいが、それらを包むsafe wrapperは境界検証、PII、unsafe-boundaryガイダンスに従う。

## レビューで見るところ

パニック、境界チェックなしインデックス、`await_holding_lock`、unsafe、PIIの `Debug`、境界デシリアライズまわりのlint抑制がリスクを隠していないか。広い `#![allow(warnings)]` や説明のない `#[allow(...)]` はないか。触ったパッケージで `cargo clippy` / `cargo check` の警告が増え、`cargo fmt --check` に失敗していないかも見る。フォーマットとlintの走らせ方が文書化されているか。

