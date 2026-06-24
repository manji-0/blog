---
title: "ローカル検証セットアップ"
sidebar:
  order: 10
---

> **対象読者:** スキルテンプレート（`gh skill`、`npx skills`）からブートストラップするプロジェクト。このリポジトリの開発ワークフローは [`development-setup.md`](/docs/kamae/rust/references/development-setup/) を参照。
> **読むタイミング:** ローカル `Cargo.toml`、`rust-toolchain.toml`、`.gitignore`、GitHub Actions、スキルパッケージ検証をブートストラップするとき。
> **関連:** [`quality-gates.md`](/docs/kamae/rust/references/quality-gates/)（正規チェックコマンド）、[`ci-setup.md`](/docs/kamae/rust/references/ci-setup/)。

## 同梱テンプレートを使う

`gh skill` または `npx skills` でインストールした場合、リポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などは同梱されない。プロジェクトブートストラップには [`../assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) 配下のテンプレートを使う。

最速の経路は同梱スクリプト:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

スキル/プラグインリポジトリ:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

`--force` なしでは既存ファイルを上書きしない。既存リポジトリに適用するときは先に `--dry-run` を使う。

## review probe の健全性チェック

ブートストラップ後、ドメインディレクトリで同梱 review probe を実行し、レビュー前に一般的な Kamae スタンス問題を捕捉する:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

probe はデフォルトで advisory。出力は panic、unsafe 境界、serde derive、PII 用語、rustdoc ギャップのレビューリードとして扱い、チームが配線しない限り失敗ゲートにしない。

推奨ローカルファイル:

- [`../assets/templates/Cargo.toml`](../assets/templates/Cargo.toml) -> `Cargo.toml` または既存 workspace manifest にマージ
- [`../assets/templates/rust-toolchain.toml`](../assets/templates/rust-toolchain.toml) -> チームが MSRV または stable pin を共有するとき `rust-toolchain.toml`
- [`../assets/templates/gitignore`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/gitignore/) -> `.gitignore` または既存ファイルにマージ
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> スキル/プラグインリポジトリのみ `scripts/validate_package.py`

コミット前に `package.name`、workspace members、`[workspace.dependencies]` を調整する。アプリケーションリポジトリでは単一 crate または [`dev-environment.md`](/docs/kamae/rust/references/dev-environment/#recommended-crate-layout) の workspace レイアウトから始める。

## 初回セットアップ

フォーマットと lint コンポーネント付きで Rust をインストール:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

`Cargo.toml` がまだないプロジェクトでは、先に同梱テンプレートをコピーしてから:

```bash
cargo check
cargo test
rustc --version
```

チームがバージョンを共有するときは toolchain を pin:

```bash
cp path/to/kamae-rs/skills/kamae-rs/assets/templates/rust-toolchain.toml .
```

## ローカルチェックループ

ブートストラップ後、[`quality-gates.md`](/docs/kamae/rust/references/quality-gates/) のベースラインコマンドを実行する。スキル/プラグインリポジトリでは `python3 scripts/validate_package.py` も実行する。

crate レイアウト、fake port、テスト層、fast vs full pre-push ループは [`dev-environment.md`](/docs/kamae/rust/references/dev-environment/) を参照。
