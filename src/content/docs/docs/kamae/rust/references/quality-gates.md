---
title: "品質ゲート"
sidebar:
  order: 10
---

> **読むタイミング:** ドメイン、境界、PII、persistence、テスト、サンプルコードの変更を仕上げる前。**ローカルおよび CI チェックの正規コマンド一覧**。
> **関連:** [`local-validation.md`](/docs/kamae/rust/references/local-validation/)、[`ci-setup.md`](/docs/kamae/rust/references/ci-setup/)、[`dev-environment.md`](/docs/kamae/rust/references/dev-environment/)。

## ベースラインコマンド

リポジトリに既存コマンドがあればそれを優先する。なければ触った Rust コード向けに次のデフォルトを使う:

```bash
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

狭い変更では、触った crate をカバーする最小コマンドセットを実行し、制限を明記する:

```bash
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application
```

CI では `cargo fmt --check` を使う。ローカルでフォーマットチェックが失敗したら `cargo fmt --all` で適用する。

初回ローカルセットアップは [`local-validation.md`](/docs/kamae/rust/references/local-validation/) を読み、[`../assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) からテンプレートをコピーまたはマージする。インストール済みスキルにはスキルディレクトリ配下のファイルが含まれるが、このリポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/`、`scripts/` は確実にはインストールされない。

## スキルパッケージと review probe チェック

スキル/プラグインリポジトリでは追加で実行する:

```bash
python3 scripts/validate_package.py
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

**kamae-rs** リポジトリ本体では `scripts/validate_package.py` と `cargo run -p kamae-review-probe` を使う。例コードは `skills/kamae-rs/examples/` 配下の workspace crate `kamae-rs-taxi-request` にある。リポジトリルートから `cargo test --all-targets` を実行する。このリポジトリの開発ワークフローは [`development-setup.md`](/docs/kamae/rust/references/development-setup/) を参照。

スキルをインストールしたアプリケーション crate は、ドメインディレクトリが変わるとき CI または pre-push フックに probe を追加してよい:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

## ドメイン安全性で重要な Clippy シグナル

フォーマットは差分をレビュー可能に保ち、ドメイン、境界、PII、unsafe、persistence の変更を inspect しやすくする。

無効状態や運用上の失敗を隠しうるパターンに特に注意する:

- ドメイン/ユースケースコードの `unwrap`、`expect`、`panic!`、未チェック索引
- テストや証明済み不変条件以外の `todo!`、`unimplemented!`、`unreachable!`
- ドメイン enum 上の `wildcard_enum_match_arm` と広い `_` アーム
- 金額、数量、期間、単位コードの `float_cmp`、疑わしい算術、ロッシーキャスト
- 広い `#[allow(...)]`、`#![allow(warnings)]`、crate レベルの lint 抑制
- ユースケースや adapter の `await_holding_lock`、デタッチタスク、無視された `Result`

すべての lint をグローバル有効にする必要はない。触ったコードやローカル設定に現れたときのレビューシグナルとして使う。抑制ルールは [`fmt-lint.md`](/docs/kamae/rust/references/fmt-lint/) を参照。

## Rustdoc と型契約

公開ドメイン API を変更したら `-D warnings` 付きで `cargo doc` を実行する。公開コンストラクタ、遷移、repository ポート、unsafe 周りの safe wrapper には、不変条件、エラー、panic、安全義務を文書化する。

判別 state enum、port trait、`Result` エラー意味論、境界 DTO 変換、redaction 挙動の周辺で文書を弱めない。

## テスト

ドメインコンストラクタ、遷移、DTO 変換、PII redaction、unsafe wrapper、repository トランザクション、outbox 挙動、リトライ/idempotency パス向けに焦点を当てたテストを実行する。

| Concern | Where to test | Guide |
| --- | --- | --- |
| フィクスチャと遷移エッジ | unit/integration tests | [`test-data.md`](/docs/kamae/rust/references/test-data/) |
| 入力全体の不変条件 | `proptest!` または `quickcheck!` | [`property-based-tests.md`](/docs/kamae/rust/references/property-based-tests/) |
| コンパイル時 state 安全性 | `trybuild` | [`test-data.md`](/docs/kamae/rust/references/test-data/#test-compile-time-state-safety) |
| fake port とユースケース | `application` tests | [`dev-environment.md`](/docs/kamae/rust/references/dev-environment/#fake-ports-and-test-fixtures) |

生成バインディング、vendored コード、外部維持スナップショットはフル lint バーから免除してよいが、それらを包む safe wrapper は境界検証、PII、unsafe-boundary ガイダンスに従う。
