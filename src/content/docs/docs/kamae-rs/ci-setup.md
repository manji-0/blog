---
title: "CI セットアップ"
sidebar:
  order: 10
---

CI はローカルで再現できる品質ゲートをマージ前に強制する層である。`cargo fmt` / `clippy` / テストが PR で抜けると、ドメイン安全性のレビュー前提が崩れる。

正規コマンドは [品質ゲート](/docs/kamae-rs/quality-gates/)。`kamae-rs` スキルリポジトリ自体の開発は [スキルリポジトリの開発](/docs/kamae-rs/development-setup/)、アプリケーション crate の日常開発は [開発環境](/docs/kamae-rs/dev-environment/) を読む。

## 基本方針

CI はレビュアが依存する安全シグナルを強制する。フォーマット、lint、テスト、rustdoc、パッケージ固有検証がそれに当たる。デフォルトのパイプラインは単純で高速に保ち、リスク低減の効果が見込める場合にのみ、負荷の高いチェックを追加する。

既存コマンドを先に使う。CI がなければ、変更した Rust ドメインコードをカバーする最小 workflow から始める。

## デフォルト GitHub Actions workflow

CI は [品質ゲート](/docs/kamae-rs/quality-gates/) と同じチェックを実行する。`rust-toolchain.toml` または `dtolnay/rust-toolchain@...` で Rust toolchain を pin し、ローカルと CI が同じ component を使う。

スキルインストール時は [`../assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) 配下の同梱テンプレート:

- [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) -> 通常 Rust backend 向け `.github/workflows/ci.yml`
- [`../assets/templates/github-ci-skill-package.yml`](../assets/templates/github-ci-skill-package.yml) -> スキル/プラグイン向け `.github/workflows/ci.yml`
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> skill-package workflow 使用時 `scripts/validate_package.py`

同梱スクリプトでコピー:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

スクリプトはデフォルト非破壊。プレビューは `--dry-run`、意図的置換のみ `--force`。

Kamae review probe を CI または pre-push に追加可能:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/ --json
```

probe はデフォルト advisory。panic、unsafe、serde derive、PII 用語の review lead として使い、チームが方針化しない限り必須 merge gate にしない。

テンプレートコピー後、workflow 内 `path/to/kamae-rs` をインストール先または vendored `crates/review-probe` に置き換える。

スキル/プラグイン向け推奨 workflow:

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

スキルパッケージでない通常 backend では `Validate skill package` を省略するか [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) を使用。

## 最小 Rust チェック

Rust crate または workspace では次を優先:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

既知 feature 行列があるプロジェクトでは `--all-features`、package、warning ポリシーを調整。レガシー workspace 全体に `-D warnings` を安易に導入しない。

このスキルパッケージでは追加:

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

例 crate `kamae-rs-taxi-request` は [`skills/kamae-rs/examples/Cargo.toml`](../examples/Cargo.toml) で `path = "taxi-request.rs"` とし、ソース重複なしで CI でコンパイル・テスト。

## CI が守るべきもの

domain、boundary、PII、persistence、event、test、skill ファイルに触れる PR では次を必須:

- プラグイン manifest、skill frontmatter、link、Python script 構文の package 検証（skill/plugin repo）
- 触った Rust の `cargo fmt --check`
- workspace または変更 crate 向け relevant `cargo clippy`
- constructor、遷移、boundary parsing、redaction、persistence retry、event 互換をカバーするテスト
- 公開 domain API 契約変更時の `-D warnings` 付き `cargo doc`

## マトリクス戦略

次にわたって domain 挙動が変わるとき matrix:

- feature flag
- workspace 内 crate
- MSRV と stable Rust
- database adapter または persistence backend
- FFI/unsafe 向け target OS または architecture

高コスト matrix エントリは、すべての PR がコストを払う正当性がない限り scheduled または手動 trigger。

## unsafe とセキュリティチェック

unsafe 多め crate、FFI wrapper、memory layout コードでは optional job:

- undefined behavior 向け `cargo miri test`
- memory/thread 向け sanitizer build
- parser、boundary 変換、unsafe wrapper 向け fuzz/property
- 資格情報/PII を扱う repo では `cargo deny` 等の依存ポリシー、secret scan、dependency audit

すべての application crate をデフォルト必須としない。unsafe 所有、raw pointer、FFI lifetime、parser trust boundary、コンプライアンス sensitive data などリスクに紐付ける。

## Pinning と更新

セキュリティ方針に従い action major または immutable SHA を pin。より高い supply-chain 保証では third-party action を full commit SHA で pin し、version コメントを隣に。

action pin の更新は意図的に。無関係 domain 変更での drive-by churn にしない。

## Branch protection

merge 前に CI job を必須化。フル test が遅すぎるなら fast domain check と slow integration を分割し、fast job は必須のまま。

adapter ある backend では DB integration、migration、outbox relay などスコープ内リスク向けに別 job。

## CI レビュールール

CI 追加・レビュー時:

- チェック名は、曖昧な品質ラベルではなく、守るべきリスクが分かる名前にする
- フォーマットと package 検証は fail fast
- lint 出力が actionable なときだけ lint 後に test（方針次第）
- cache key が十分 specific で stale feature/toolchain を避けるときだけ artifact cache
- advisory でない限り `continue-on-error` で失敗を隠さない。advisory なら workflow で明示
- required check が review 方針と一致するよう `main` を保護

## ローカル parity

CI に近いローカルコマンドを文書化。push 前にレビュアが同じ core check を実行できること:

```bash
python3 scripts/validate_package.py
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

フル parity が遅すぎるなら fast path と full path を分けて文書化。[開発環境](/docs/kamae-rs/dev-environment/) と [品質ゲート](/docs/kamae-rs/quality-gates/) で toolchain、test 層、推奨ローカル check loop。

レビューでは、必須チェックの欠如、偏った feature / パッケージ行列、unsafe クレート向け追加検証の未計画、`continue-on-error` による必須チェックの無効化、ローカル再現困難な CI を指摘する。

## レビュー観点

### 必須チェックはレビュアの前提をカバーしているか — High

レビュアが依存するチェックなしにドメインコードのマージを許す CI を指摘する: パッケージ検証、`cargo fmt --check`、関連 `cargo clippy`、関連テスト、公開 API 契約が変わったときの rustdoc。

リポジトリが Rust クレートでない、または変更がドキュメントのみの場合は格下げする。

### feature / パッケージマトリクスは代表的か — Medium

ドメイン挙動、検証、永続化、unsafe コードがワークスペースメンバー、feature フラグ、MSRV、DB アダプタ、ターゲットプラットフォームをまたぐのに、デフォルトクレートまたはデフォルト feature だけをテストするワークフローを指摘する。

ローカルコードパスが feature 非依存なら巨大マトリクスは不要。

### unsafe / セキュリティジョブは実リスクに結びついているか — Medium

unsafe 多め、FFI、パーサ、認証情報 / PII 敏感クレートに、Miri、サニタイザ、ファジ / プロパティテスト、依存監査、シークレットスキャンの文書化された計画がない場合は指摘する。

すべての PR に任意の安全ジョブを要求しない。リスクとコストのバランスが取れていれば、スケジュール、手動、パスフィルタジョブでよい。

### 参考チェックは参考であることが明確か — Low

ワークフロー名や README で必須に見える `continue-on-error`、無視された終了コード、非必須チェックを指摘する。

参考チェックが unsafe 健全性、PII 漏洩、永続化整合性、公開 API ドキュメントの唯一のガードである場合はエスカレートする。

### 開発者は CI をローカルで再現できるか — Low

コアチェックの文書化されたローカル相当がなく、失敗出力の再現が難しい CI を指摘する。

触ったクレート向けにパッケージ検証、フォーマット、lint、テストを走らせる短いローカルコマンド一覧またはスクリプトを提案する。正規コマンドは [品質ゲート](/docs/kamae-rs/quality-gates/)、推奨の高速パスとフル pre-push ループは [開発環境](/docs/kamae-rs/dev-environment/) を照合する。
