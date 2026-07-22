---
title: "スキルリポジトリの開発"
sidebar:
  order: 10
---

**kamae-rs** スキルリポジトリで作業するコントリビューター向けである（スキルをインストールした先のプロジェクト向けではない）。検証スクリプトや例crateのワークスペースが揃っていないと、スキル自体の変更が再現できない。

アプリケーション開発の手順は [開発環境](/projects/kamae-rs/dev-environment/)、チェックコマンドは [品質ゲート](/projects/kamae-rs/quality-gates/)、Actions配線は [CI セットアップ](/projects/kamae-rs/ci-setup/) を参照する。

## 前提条件

- `rustfmt`、`clippy`、`rustdoc` を含む [Rust](https://www.rust-lang.org/tools/install) ツールチェーン（スキルのみ編集する場合、rustdocは任意）
- Python 3（パッケージ検証とテンプレート適用に使用）

## クローンとブートストラップ

```bash
git clone <repository-url>
cd kamae-rs
python3 scripts/validate_package.py
```

リポジトリにcrate配下のRustドメインコードもある場合は、ツールチェーンコンポーネントをインストールし `cargo check` を実行する。

## インストールの確認

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

変更を加える前に、パッケージ検証が通ることを確認する。

## ローカル品質ゲートの実行

[品質ゲート](/projects/kamae-rs/quality-gates/) のベースラインコマンドを実行する。このリポジトリでは追加で次も実行する：

```bash
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
```

フォーマットチェックが失敗したら `cargo fmt --all` で適用する。

## スキルパッケージの作業

スキルは `skills/kamae-rs/` 配下にある：

- `SKILL.md` — ディスパッチガイドとfrontmatter
- `` — 詳細リファレンス
- `scripts/` — `apply_templates.py` などのヘルパースクリプト
- `assets/templates/` — インストール可能なプロジェクトテンプレート

新しいリファレンスを追加したら `SKILL.md` からリンクし、スキルディスパッチャが拾えるようにする。`scripts/validate_package.py` がリンクを検査できるよう、相対リンクを優先する。

`crates/review-probe` または `scripts/validate_package.py` を変更したら、コミット前に `python3 scripts/validate_package.py` と `cargo test -p kamae-review-probe` を実行する。

## テスト用テンプレート適用

`skills/kamae-rs/scripts/apply_templates.py` はテンプレートをターゲットディレクトリにコピーする。テンプレート変更のテストには一時ディレクトリを使い、このリポジトリに影響を与えない：

```bash
mkdir -p /tmp/kamae-rs-test
python3 skills/kamae-rs/scripts/apply_templates.py --target /tmp/kamae-rs-test --ci backend --force
```

既存プロジェクトに適用するときは、先に `--dry-run` を使う。

## コミット前

1. 上記のローカル品質ゲート一式を実行する。
2. `git diff` で意図しないテンプレートやmanifest変更がないか確認する。
3. コミットは焦点を絞る： 1論理変更1コミット。例： 新リファレンスと `SKILL.md` リンクを1コミットにし、無関係なツール更新は別コミットにする。

## トラブルシューティング

- **パッケージ検証が新リンクで失敗**: 対象ファイルが存在し、`#anchor` スラッグが見出しと一致すること（[`../../../DEVELOPMENT.md`](https://github.com/manji-0/kamae-rs/blob/main/DEVELOPMENT.md#cross-references) 参照）。
- **review probe が example で多数の lead を出す**: taxi例は意図的に本番契約の一部を省略している。probe変更の検証には実ドメインコードでprobeを使う。
- **インストール後にテンプレート CI パスが誤る**: 生成workflowの `path/to/kamae-rs` をvendoredスクリプトパスまたは絶対インストール先に置き換える。

スキルに従うアプリケーションcrate（このリポジトリではない）については [開発環境](/projects/kamae-rs/dev-environment/) を読む。
