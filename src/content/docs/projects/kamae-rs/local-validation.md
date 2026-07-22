---
title: "ローカル検証セットアップ"
sidebar:
  order: 10
---

スキルテンプレートからプロジェクトを立ち上げる担当者向けの手順である。`Cargo.toml` やActions、検証スクリプトが揃っていないと、以降のドメイン規約をローカルで再現できない。

スキルパッケージ本体の編集は [スキルリポジトリの開発](/projects/kamae-rs/development-setup/)、日常のcrate作業は [開発環境](/projects/kamae-rs/dev-environment/)、正規コマンドは [品質ゲート](/projects/kamae-rs/quality-gates/) を読む。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./dev-environment.md -->

## 同梱テンプレートを使う

`gh skill` または `npx skills` でインストールしたとき、リポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などはスキルと一緒には入らない。ブートストラップでは [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) を使う。

最短経路：

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

スキル/プラグインリポジトリ向け：

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

`--force` を付けない限り既存ファイルを上書きしない。既存リポジトリでは先に `--dry-run` する。

## Review probe の健全性確認

ブートストラップ後、ドメインディレクトリに同梱review probeを走らせ、レビュー前の典型的なスタンス問題を拾う：

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

probeはデフォルトadvisory。panic、unsafe境界、serde derive、PII用語、rustdocギャップのleadとして扱い、チームが方針化しない限り必須ゲートにしない。

推奨ローカルファイル：

- [`Cargo.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/Cargo.toml) → `Cargo.toml` または既存ワークスペースへマージ
- [`rust-toolchain.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/rust-toolchain.toml) → チームでMSRV/stable pinを共有するとき
- [`gitignore`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/gitignore) → `.gitignore` へマージ
- [`validate_package.py`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/validate_package.py) → スキル/プラグインのみ `scripts/validate_package.py`

コミット前に `package.name`、workspace members、`[workspace.dependencies]` を合わせる。アプリケーションは単一crateか [開発環境](/projects/kamae-rs/dev-environment/) のレイアウトから始める。

## 初回セットアップ

フォーマットとlint component付きでRustを入れる：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

まだ `Cargo.toml` がなければテンプレをコピーしてから：

```bash
cargo check
cargo test
rustc --version
```

チームでバージョンを共有するときはtoolchainをpinする：

```bash
cp path/to/kamae-rs/skills/kamae-rs/assets/templates/rust-toolchain.toml .
```

## ローカルチェックループ

ブートストラップ後は [品質ゲート](/projects/kamae-rs/quality-gates/) のベースラインを走らせる。スキル/プラグインでは `python3 scripts/validate_package.py` も実行する。

crateレイアウト、fake port、テスト層、高速/フルのpre-pushループは [開発環境](/projects/kamae-rs/dev-environment/) を読む。フォーマット方針は [フォーマットと lint](/projects/kamae-rs/fmt-lint/)、Actionsは [CI セットアップ](/projects/kamae-rs/ci-setup/) へ。

## レビューで見るところ

テンプレ適用後に `package.name` とworkspaceがプロジェクト実態とずれていないか。`rustfmt` / `clippy` componentと品質ゲートコマンドがローカルで再現できるか。review probeを必須ゲートに誤ってしていないかも確認する。
