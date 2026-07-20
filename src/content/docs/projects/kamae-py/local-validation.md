---
title: "ローカル検証セットアップ"
sidebar:
  order: 10
---

スキルテンプレートから新規プロジェクトを立ち上げるとき、`pyproject.toml`、Ruff、pytest、ポリシーチェッカーを揃えてからドメインコードに入る。既存リポジトリの日常開発は [開発セットアップ](/projects/kamae-py/development-setup/) を優先する。

チェックコマンドの正本は [品質ゲート](/projects/kamae-py/quality-gates/)、CIの形は [CI セットアップ](/projects/kamae-py/ci-setup/) を参照する。

## 同梱テンプレートを使う

`gh skill` または `npx skills` でスキルを入れただけでは、リポジトリルートの `pyproject.toml` や `.github/workflows/ci.yml` は付いてこない。ブートストラップには `assets/templates/` 配下のテンプレートを使う。

最短経路は同梱スクリプト：

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci backend
```

スキル / プラグインリポジトリ向け：

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci skill-package
```

既存ファイルは `--force` がない限り上書きしない。既存リポジトリでは先に `--dry-run` を実行する。

## ポリシーの健全性チェック

ブートストラップ後、同梱ポリシーチェッカーでKamaeのよくある逸脱をCI前に拾う：

```bash
python path/to/kamae-py/scripts/check_kamae_policy.py --target .
```

`tests/` も含めるなら `--include-tests`。警告をエラーにするなら `--strict`。`pyproject.toml`、禁止パッケージマネージャファイル、凍結ドメインモデル、`kind` 判別共用体、純粋遷移、広い `except` と `typing.cast` などを走査する。

推奨ローカルファイル：

- `assets/templates/pyproject.toml` → `pyproject.toml` または既存へマージ
- `assets/templates/gitignore` → `.gitignore` または既存へマージ
- `assets/templates/validate_package.py` → スキル / プラグインリポジトリのみ `scripts/validate_package.py`

コミット前に `project.name`、`description`、`[tool.pyrefly].project-includes` を調整する。アプリケーションは通常 `src` と `tests` を指す。スキルリポジトリは `scripts`、examples、testsを含める。

## 初回セットアップ

uvとPython 3.12+を使う。Dockerは任意で、デフォルトはローカルPythonツールチェーン。Postgres統合テストなど必要なときだけコンテナ依存を足す。

### 1. uvを入れPythonを固定

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # or brew install uv
cd your-project
uv python pin 3.13
```

### 2. テンプレートからブートストラップ（新規）

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

`pyproject.toml` がまだないなら、先にテンプレートをコピーしてから `uv sync` する。

### 4. Dockerなしのローカルサービス（任意）

統合テストでPostgresまたはRedisが必要なとき：

| Service | macOS（Homebrew） | Linux（apt） |
| --- | --- | --- |
| PostgreSQL | `brew install postgresql@16 && brew services start postgresql@16` | `sudo apt install postgresql` |
| Redis | `brew install redis && brew services start redis` | `sudo apt install redis-server` |

開発DBを作り設定を向ける：

```bash
createdb myapp_dev
export DB_HOST=localhost DB_PORT=5432 DB_NAME=myapp_dev DB_USER=$USER DB_PASSWORD=
```

`.env` はpydantic-settingsで読む（[境界防御](/projects/kamae-py/boundary-defense/) の環境変数境界）。`.env` は `.gitignore` に入れる。

### 5. ツールチェーンを確認

```bash
uv run ruff format --check .
uv run ruff check .
uv run pyrefly check .
uv run pytest
python path/to/kamae-py/scripts/check_kamae_policy.py --target . --include-tests
```

### 6. エディタ連携

- IDEでRuffをformat/lintプロバイダにする
- `uv sync` 後はインタプリタを `.venv/bin/python` にする
- プロジェクトルートから `uv run pyrefly check` を実行し、組み込みPydanticサポートを解決する

## ローカルチェックループ

ブートストラップ後は [品質ゲート](/projects/kamae-py/quality-gates/) のベースラインコマンドを回す。スキル / プラグインリポジトリは `uv run python scripts/validate_package.py` も実行する。

チームがコミット前フォーマットを望むなら [品質ゲート](/projects/kamae-py/quality-gates/) のpre-commit連携を入れる。

pyreflyとPydantic設定はテンプレート `pyproject.toml` をマージするか、[ドメインモデリング](/projects/kamae-py/domain-modeling/) のpyrefly節に従う。

## Dockerを足すとき

次のときにDockerまたはComposeを使う：

- 本番と同じイメージ版が必要
- オンボーディングでPostgres/Redisのローカルインストールを避けたい
- CIが `docker compose up` で統合テストを回す

ドメイン単体テストは `uv run pytest` だけで動くように保つ。統合テストはマーカー（`pytest -m integration`）または任意composeプロファイルの後ろに置く。

## レビューで見るところ

テンプレート適用後に `check_kamae_policy.py` が通るか。`pyproject.toml` の `project-includes` が実際のソースレイアウトと一致しているか。`.env` や例に実シークレットがコミットされていないか（[PII と観測経路の保護](/projects/kamae-py/pii-protection/)）。ローカル手順は [品質ゲート](/projects/kamae-py/quality-gates/)、[CI セットアップ](/projects/kamae-py/ci-setup/) と矛盾していないか。
