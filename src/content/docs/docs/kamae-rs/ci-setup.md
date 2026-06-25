---
title: "CI セットアップ"
sidebar:
  order: 10
---

CIはローカルで再現できる品質ゲートをマージ前に強制する層である。`cargo fmt` / `clippy` / テストがPRで抜けると、ドメイン安全性のレビュー前提が崩れる。

正規コマンドは [品質ゲート](/docs/kamae-rs/quality-gates/)。`kamae-rs` スキルリポジトリ自体の開発は [スキルリポジトリの開発](/docs/kamae-rs/development-setup/)、アプリケーションcrateの日常開発は [開発環境](/docs/kamae-rs/dev-environment/) を読む。

## 基本方針

CIはレビュアが依存する安全シグナルを強制する。フォーマット、lint、テスト、rustdoc、パッケージ固有検証がそれに当たる。デフォルトのパイプラインは単純で高速に保ち、リスク低減の効果が見込める場合にのみ、負荷の高いチェックを追加する。

既存コマンドを先に使う。CIがなければ、変更したRustドメインコードをカバーする最小workflowから始める。

## デフォルト GitHub Actions workflow

CIは [品質ゲート](/docs/kamae-rs/quality-gates/) と同じチェックを実行する。`rust-toolchain.toml` または `dtolnay/rust-toolchain@...` でRust toolchainをpinし、ローカルとCIが同じcomponentを使う。

スキルインストール時は [`../assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) 配下の同梱テンプレート：

- [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) -> 通常Rust backend向け `.github/workflows/ci.yml`
- [`../assets/templates/github-ci-skill-package.yml`](../assets/templates/github-ci-skill-package.yml) -> スキル/プラグイン向け `.github/workflows/ci.yml`
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> skill-package workflow使用時 `scripts/validate_package.py`

同梱スクリプトでコピー:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

スクリプトはデフォルト非破壊。プレビューは `--dry-run`、意図的置換のみ `--force`。

Kamae review probeをCIまたはpre-pushに追加可能：

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/ --json
```

probeはデフォルトadvisory。panic、unsafe、serde derive、PII用語のreview leadとして使い、チームが方針化しない限り必須merge gateにしない。

テンプレートコピー後、workflow内 `path/to/kamae-rs` をインストール先またはvendored `crates/review-probe` に置き換える。

スキル/プラグイン向け推奨workflow:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  package:
    name: Skill package checks
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Validate skill package
        run: python3 scripts/validate_package.py

  rust:
    name: Rust checks
    runs-on: ubuntu-latest
    timeout-minutes: 15
    if: hashFiles('Cargo.toml') != ''

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Smoke review probe
        run: cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json

      - name: Format
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Test
        run: cargo test --all-targets --all-features

      - name: Docs
        run: RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

スキルパッケージでない通常backendでは `Validate skill package` を省略するか [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) を使用。

## 最小 Rust チェック

Rust crateまたはworkspaceでは次を優先：

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

既知feature行列があるプロジェクトでは `--all-features`、package、warningポリシーを調整。レガシー workspace全体に `-D warnings` を安易に導入しない。

このスキルパッケージでは追加：

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

例crate `kamae-rs-taxi-request` は [`skills/kamae-rs/examples/Cargo.toml`](../examples/Cargo.toml) で `path = "taxi-request.rs"` とし、ソース重複なしでCIでコンパイル・テスト。

## CI が守るべきもの

domain、boundary、PII、persistence、event、test、skillファイルに触れるPRでは次を必須：

- プラグインmanifest、skill frontmatter、link、Python script構文のpackage検証（skill/plugin repo）
- 触ったRustの `cargo fmt --check`
- workspaceまたは変更crate向けrelevant `cargo clippy`
- constructor、遷移、boundary parsing、redaction、persistence retry、event互換をカバーするテスト
- 公開domain API契約変更時の `-D warnings` 付き `cargo doc`

## マトリクス戦略

次にわたってdomain挙動が変わるときmatrix:

- feature flag
- workspace内crate
- MSRVとstable Rust
- database adapterまたはpersistence backend
- FFI/unsafe向けtarget OSまたはarchitecture

高コストmatrixエントリは、すべてのPRがコストを払う正当性がない限りscheduledまたは手動trigger。

## unsafe とセキュリティチェック

unsafe多めcrate、FFI wrapper、memory layoutコードではoptional job:

- undefined behavior向け `cargo miri test`
- memory/thread向けsanitizer build
- parser、boundary変換、unsafe wrapper向けfuzz/property
- 資格情報/PIIを扱うrepoでは `cargo deny` 等の依存ポリシー、secret scan、dependency audit

すべてのapplication crateをデフォルト必須としない。unsafe所有、raw pointer、FFI lifetime、parser trust boundary、コンプライアンスsensitive dataなどリスクに紐付ける。

## Pinning と更新

セキュリティ方針に従いaction majorまたはimmutable SHAをpin。より高いsupply-chain保証ではthird-party actionをfull commit SHAでpinし、versionコメントを隣に。

action pinの更新は意図的に。無関係domain変更でのdrive-by churnにしない。

## Branch protection

merge前にCI jobを必須化。フルtestが遅すぎるならfast domain checkとslow integrationを分割し、fast jobは必須のまま。

adapterあるbackendではDB integration、migration、outbox relayなどスコープ内リスク向けに別job。

## CI レビュールール

CI追加・レビュー時：

- チェック名は、曖昧な品質ラベルではなく、守るべきリスクが分かる名前にする
- フォーマットとpackage検証はfail fast
- lint出力がactionableなときだけlint後にtest（方針次第）
- cache keyが十分specificでstale feature/toolchainを避けるときだけartifact cache
- advisoryでない限り `continue-on-error` で失敗を隠さない。advisoryならworkflowで明示
- required checkがreview方針と一致するよう `main` を保護

## ローカル parity

CIに近いローカルコマンドを文書化。push前にレビュアが同じcore checkを実行できること：

```bash
python3 scripts/validate_package.py
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

フルparityが遅すぎるならfast pathとfull pathを分けて文書化。[開発環境](/docs/kamae-rs/dev-environment/) と [品質ゲート](/docs/kamae-rs/quality-gates/) でtoolchain、test層、推奨ローカルcheck loop。

レビューでは、必須チェックの欠如、偏ったfeature / パッケージ行列、unsafeクレート向け追加検証の未計画、`continue-on-error` による必須チェックの無効化、ローカル再現困難なCIを指摘する。

## レビュー観点

### 必須チェックはレビュアの前提をカバーしているか — High

レビュアが依存するチェックなしにドメインコードのマージを許すCIを指摘する： パッケージ検証、`cargo fmt --check`、関連 `cargo clippy`、関連テスト、公開API契約が変わったときのrustdoc。

リポジトリがRustクレートでない、または変更がドキュメントのみの場合は格下げする。

### feature / パッケージマトリクスは代表的か — Medium

ドメイン挙動、検証、永続化、unsafeコードがワークスペースメンバー、featureフラグ、MSRV、DBアダプタ、ターゲットプラットフォームをまたぐのに、デフォルトクレートまたはデフォルトfeatureだけをテストするワークフローを指摘する。

ローカルコードパスがfeature非依存なら巨大マトリクスは不要。

### unsafe / セキュリティジョブは実リスクに結びついているか — Medium

unsafe多め、FFI、パーサ、認証情報 / PII敏感クレートに、Miri、サニタイザ、ファジ / プロパティテスト、依存監査、シークレットスキャンの文書化された計画がない場合は指摘する。

すべてのPRに任意の安全ジョブを要求しない。リスクとコストのバランスが取れていれば、スケジュール、手動、パスフィルタジョブでよい。

### 参考チェックは参考であることが明確か — Low

ワークフロー名やREADMEで必須に見える `continue-on-error`、無視された終了コード、非必須チェックを指摘する。

参考チェックがunsafe健全性、PII漏洩、永続化整合性、公開APIドキュメントの唯一のガードである場合はエスカレートする。

### 開発者は CI をローカルで再現できるか — Low

コアチェックの文書化されたローカル相当がなく、失敗出力の再現が難しいCIを指摘する。

触ったクレート向けにパッケージ検証、フォーマット、lint、テストを走らせる短いローカルコマンド一覧またはスクリプトを提案する。正規コマンドは [品質ゲート](/docs/kamae-rs/quality-gates/)、推奨の高速パスとフルpre-pushループは [開発環境](/docs/kamae-rs/dev-environment/) を照合する。
