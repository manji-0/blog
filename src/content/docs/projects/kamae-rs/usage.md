---
title: "使い方"
description: "kamae-rs スキルのインストールと開発環境のセットアップ"
sidebar:
  order: 5
  label: "使い方"
---

## 範囲

Kamaeスキルをエージェントに入れ、アプリケーションcrateまたはスキルリポジトリをローカルで立ち上げる手順です。ドメイン設計の原則は[ドメインモデリング](/projects/kamae-rs/domain-modeling/)以降の実装ページ、チェックコマンドは[品質ゲート](/projects/kamae-rs/quality-gates/)を参照してください。

## スキルのインストール

実装時は`kamae-rs`、差分レビュー時は`kamae-rs-review`です。

```bash
npx skills add manji-0/kamae-rs -s kamae-rs -s kamae-rs-review -g -y
```

チームの命名やクレート好みは`.claude/rules/` / `.codex/rules/`で上書きできます。[kamae-rs リポジトリ](https://github.com/manji-0/kamae-rs)の`rules/`を正とします。

## アプリケーションcrateのブートストラップ

`npx skills`でインストールした場合、リポジトリルートの`Cargo.toml`、`rust-toolchain.toml`、`.github/workflows/ci.yml`などは同梱されません。[テンプレート](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/)をコピーまたはマージします。

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

既存リポジトリでは先に`--dry-run`を使います。`--force`なしでは既存ファイルを上書きしません。

## ツールチェーン

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

チームがMSRVまたはstableを共有するときは`rust-toolchain.toml`をpinします。テンプレートは[rust-toolchain.toml](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/rust-toolchain.toml)です。

## 推奨crateレイアウト

```text
my-service/
  Cargo.toml                 # workspace root
  crates/
    domain/                  # entities, value objects, transitions
    application/             # use cases, port traits
    infrastructure/          # SQL/HTTP adapters, outbox
    api/                     # handlers, DTOs, composition root
```

単一crateプロジェクトは`src/domain/`、`src/application/`などのmoduleに相当します。`domain`は`sqlx`、`axum`、`tonic`などI/O crateに依存しません。配線の詳細は[ドメインモデリング](/projects/kamae-rs/domain-modeling/)を参照してください。

## review probe

ブートストラップ後、ドメインディレクトリでreview probeを実行します。出力はレビューの手がかりであり、既定では失敗を伴うゲートにはしません。

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

## ローカルチェックループ

日常のコマンドは[品質ゲート](/projects/kamae-rs/quality-gates/)のベースラインに揃えます。編集中は触ったcrateだけ、PR前はworkspace全体を回します。

```bash
# 高速パス
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application

# フルパス
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
```

## スキルリポジトリでの開発

**kamae-rs**スキルリポジトリで作業するコントリビューター向けです。検証スクリプトと例crateが揃っていないと、スキル変更が再現できません。

前提： Rustツールチェーン（`rustfmt`、`clippy`）、Python 3。

```bash
git clone https://github.com/manji-0/kamae-rs.git
cd kamae-rs
python3 scripts/validate_package.py
cargo run -q -p kamae-review-probe -- skills/kamae-rs/examples/taxi-request.rs --json
```

コミット前は[品質ゲート](/projects/kamae-rs/quality-gates/)に加え、`python3 scripts/validate_package.py`と`cargo test --all-targets`を実行します。upstreamの[DEVELOPMENT.md](https://github.com/manji-0/kamae-rs/blob/main/DEVELOPMENT.md)が正です。

## ルールの上書き

`.claude/rules/*.md`や`.codex/rules/*.md`で振る舞いを上書きできます。優先は**プロジェクトルール > ユーザーグローバル > 同梱defaults**です。

## 次に読む

型の置き方は[ドメインモデリング](/projects/kamae-rs/domain-modeling/)から実装3本へ。依存クレートは[クレートガイド](/projects/kamae-rs/crate-guides/)、PR前の確認は[品質ゲート](/projects/kamae-rs/quality-gates/)です。
