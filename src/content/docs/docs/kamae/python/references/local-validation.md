---
title: "ローカル検証セットアップ"
sidebar:
  order: 10
---

> **対象読者:** スキルテンプレート（`gh skill`、`npx skills`）からブートストラップするプロジェクト。このリポジトリの開発ワークフローは [`development-setup.md`](/docs/kamae/python/references/development-setup/) を読む。
> **いつ読むか:** ローカル `pyproject.toml`、`.gitignore`、mypy/Pydantic プラグイン設定、Ruff、pytest、スキルパッケージ検証のブートストラップ。
> **関連:** [`quality-gates.md`](/docs/kamae/python/references/quality-gates/)（正規チェックコマンド）、[`ci-setup.md`](/docs/kamae/python/references/ci-setup/)。

## 同梱テンプレートを使う

このスキルを `gh skill` または `npx skills` でインストールしたとき、リポジトリルートの `pyproject.toml`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などはスキルと一緒にはインストールされない。プロジェクトをブートストラップするときは [`../assets/templates/`](https://github.com/manji-0/kamae-py/blob/main/skills/kamae-py/assets/templates/) のテンプレートを使う。

最短経路は同梱スクリプト:

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci backend
```

スキル/プラグインリポジトリ向け:

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci skill-package
```

スクリプトは `--force` がない限り既存ファイルを上書きしない。既存リポジトリに適用するときはまず `--dry-run` を使う。

## ポリシーサニティチェック

ブートストラップ後、同梱ポリシーチェッカーを実行し、CI に到達する前に一般的な Kamae 方針の問題を検出する:

```bash
python path/to/kamae-py/scripts/check_kamae_policy.py --target .
```

`tests/` もスキャンするには `--include-tests` を追加する。警告をエラー扱いするには `--strict` を使う。チェッカーはプロジェクト設定、禁止パッケージマネージャーファイル、frozen ドメインモデル、`kind` 判別共用体、純粋遷移、広い `except` や `typing.cast` などのリスクパターンをカバーする。

推奨ローカルファイル:

- [`../assets/templates/pyproject.toml`](../assets/templates/pyproject.toml) -> `pyproject.toml` または既存ファイルへマージ。
- [`../assets/templates/gitignore`](https://github.com/manji-0/kamae-py/blob/main/skills/kamae-py/assets/templates/gitignore/) -> `.gitignore` または既存ファイルへマージ。
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> スキル/プラグインリポジトリのみ `scripts/validate_package.py`。

コミット前に `project.name`、`description`、`[tool.mypy].files` を調整する。アプリケーションリポジトリでは `[tool.mypy].files` は通常 `src` と `tests` を指す。スキルリポジトリでは `scripts`、examples、tests を含める。

## 初回セットアップ

uv と Python 3.12+ を使う。**Docker は任意** — デフォルトはローカル Python ツールチェーンと、必要なときだけの任意コンテナ依存（例: Postgres 統合テスト）。

### 1. uv をインストールし Python をピン留め

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # or brew install uv
cd your-project
uv python pin 3.13
```

### 2. テンプレートからブートストラップ（新規プロジェクト）

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci backend --dry-run
python path/to/kamae-py/scripts/apply_templates.py --target . --ci backend
```

### 3. 依存関係を同期

```bash
uv sync
uv lock
uv run python --version
uv run python -c "import pydantic; print(pydantic.__version__)"
```

プロジェクトにまだ `pyproject.toml` がないなら、まず同梱テンプレートをコピーしてから `uv sync` を実行する。

### 4. Docker なしのローカルサービス（任意）

統合テストに Postgres または Redis が必要なとき:

| サービス | macOS (Homebrew) | Linux (apt) |
| --- | --- | --- |
| PostgreSQL | `brew install postgresql@16 && brew services start postgresql@16` | `sudo apt install postgresql` |
| Redis | `brew install redis && brew services start redis` | `sudo apt install redis-server` |

開発用データベースを作成し、設定をそこに向ける:

```bash
createdb myapp_dev
export DB_HOST=localhost DB_PORT=5432 DB_NAME=myapp_dev DB_USER=$USER DB_PASSWORD=
```

pydantic-settings で `.env` を使う（[`boundary-defense.md`](/docs/kamae/python/references/boundary-defense/#environment-and-cli-boundaries) を参照）。`.env` を `.gitignore` に追加する。

### 5. ツールチェーンの検証

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy .
uv run pytest
python path/to/kamae-py/scripts/check_kamae_policy.py --target . --include-tests
```

### 6. エディタ統合

- IDE で Ruff をフォーマット/リントプロバイダーとして有効化する。
- `uv sync` 後、インタープリタを `.venv/bin/python` に設定する。
- Pydantic mypy プラグインが解決されるよう、プロジェクトルートから `uv run mypy` を実行する。

## ローカルチェックループ

ブートストラップ後、[`quality-gates.md`](/docs/kamae/python/references/quality-gates/) のベースラインコマンドを実行する。スキル/プラグインリポジトリではさらに `uv run python scripts/validate_package.py` を実行する。

チームがコミット前の自動フォーマットを望むなら、[`quality-gates.md`](/docs/kamae/python/references/quality-gates/#pre-commit-integration) から pre-commit フックをインストールする。

mypy と Pydantic プラグイン設定については、[`../assets/templates/pyproject.toml`](../assets/templates/pyproject.toml) をマージするか、[`domain-modeling.md`](/docs/kamae/python/references/domain-modeling/#configure-mypy-with-the-pydantic-plugin) に従う。

## Docker を追加するタイミング

次のときに Docker または Compose を使う:

- 本番同等性に正確なイメージバージョンが必要。
- オンボーディングで Postgres/Redis をローカルインストールさせたくない。
- CI が統合テストに同じ `docker compose up` を使う。

ドメイン単体テストはコンテナなしで `uv run pytest` 実行可能に保つ。統合テストはマーカー（`pytest -m integration`）または任意 compose プロファイルの背後に置く。
