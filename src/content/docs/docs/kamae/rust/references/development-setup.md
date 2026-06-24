---
title: "開発環境セットアップ"
sidebar:
  order: 10
---

> **対象読者:** **kamae-rs** スキルリポジトリで作業するコントリビュータ（汎用インストール先ではない）。
> **読むタイミング:** このスキルパッケージを開発・テストするローカルワークスペースをセットアップするとき。
> **関連:** [`quality-gates.md`](/docs/kamae/rust/references/quality-gates/)（正規チェックコマンド）、[`local-validation.md`](/docs/kamae/rust/references/local-validation/)、[`ci-setup.md`](/docs/kamae/rust/references/ci-setup/)。

## 前提条件

- `rustfmt`、`clippy`、`rustdoc` を含む [Rust](https://www.rust-lang.org/tools/install) ツールチェーン（スキルのみ編集する場合は rustdoc は任意）
- Python 3（パッケージ検証とテンプレート適用に使用）

## クローンとブートストラップ

```bash
git clone <repository-url>
cd kamae-rs
python3 scripts/validate_package.py
```

リポジトリに crate 配下の Rust ドメインコードもある場合は、ツールチェーンコンポーネントをインストールし `cargo check` を実行する。

## インストールの確認

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

変更前にパッケージ検証が通ること。

## ローカル品質ゲートの実行

[`quality-gates.md`](/docs/kamae/rust/references/quality-gates/) のベースラインコマンドを実行する。このリポジトリでは追加で次も実行する:

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

フォーマットチェックが失敗したら `cargo fmt --all` で適用する。

## スキルパッケージの作業

スキルは `skills/kamae-rs/` 配下にある:

- `SKILL.md` — ディスパッチガイドと frontmatter
- `references/` — 詳細リファレンス
- `scripts/` — `apply_templates.py` などのヘルパースクリプト
- `assets/templates/` — インストール可能なプロジェクトテンプレート

新しいリファレンスを追加したら `SKILL.md` からリンクし、スキルディスパッチャが拾えるようにする。`scripts/validate_package.py` がリンクを検査できるよう、相対リンクを優先する。

`crates/review-probe` または `scripts/validate_package.py` を変更したら、コミット前に `python3 scripts/validate_package.py` と `cargo test -p kamae-review-probe` を実行する。

## テスト用テンプレート適用

`skills/kamae-rs/scripts/apply_templates.py` はテンプレートをターゲットディレクトリにコピーする。テンプレート変更のテストには一時ディレクトリを使い、このリポジトリに影響を与えない:

```bash
mkdir -p /tmp/kamae-rs-test
python3 skills/kamae-rs/scripts/apply_templates.py --target /tmp/kamae-rs-test --ci backend --force
```

既存プロジェクトに適用するときは、先に `--dry-run` を使う。

## コミット前

1. 上記のローカル品質ゲート一式を実行する。
2. `git diff` で意図しないテンプレートや manifest 変更がないか確認する。
3. コミットは焦点を絞る: 1 論理変更 1 コミット。例: 新リファレンスと `SKILL.md` リンクを 1 コミットにし、無関係なツール更新は別コミットにする。

## トラブルシューティング

- **パッケージ検証が新リンクで失敗**: 対象ファイルが存在し、`#anchor` スラッグが見出しと一致すること（[`../../../DEVELOPMENT.md`](/docs/kamae/rust/../../../DEVELOPMENT/#cross-references) 参照）。
- **review probe が example で多数の lead を出す**: taxi 例は意図的に本番契約の一部を省略している。probe 変更の検証には実ドメインコードで probe を使う。
- **インストール後にテンプレート CI パスが誤る**: 生成 workflow の `path/to/kamae-rs` を vendored スクリプトパスまたは絶対インストール先に置き換える。

スキルに従うアプリケーション crate（このリポジトリではない）については [`dev-environment.md`](/docs/kamae/rust/references/dev-environment/) を読む。
