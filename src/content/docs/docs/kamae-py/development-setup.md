---
title: "開発環境とセットアップ"
sidebar:
  order: 10
---

> **対象読者:** スキルテンプレートからプロジェクトを立ち上げる担当者、および **kamae-py** スキルリポジトリのコントリビューター。
> **いつ読むか:** ローカルツールチェーン、テンプレート適用、品質ゲートを整えるときに読む。

## プロジェクトのブートストラップ（テンプレートから）

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

pydantic-settings で `.env` を使う（[境界防御](/docs/kamae-py/boundary-defense/#environment-and-cli-boundaries) を参照）。`.env` を `.gitignore` に追加する。

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

ブートストラップ後、[品質ゲート](/docs/kamae-py/quality-gates/) のベースラインコマンドを実行する。スキル/プラグインリポジトリではさらに `uv run python scripts/validate_package.py` を実行する。

チームがコミット前の自動フォーマットを望むなら、[品質ゲート](/docs/kamae-py/quality-gates/#pre-commit-integration) から pre-commit フックをインストールする。

mypy と Pydantic プラグイン設定については、[`../assets/templates/pyproject.toml`](../assets/templates/pyproject.toml) をマージするか、[ドメインモデリング](/docs/kamae-py/domain-modeling/#configure-mypy-with-the-pydantic-plugin) に従う。

## Docker を追加するタイミング

次のときに Docker または Compose を使う:

- 本番同等性に正確なイメージバージョンが必要。
- オンボーディングで Postgres/Redis をローカルインストールさせたくない。
- CI が統合テストに同じ `docker compose up` を使う。

ドメイン単体テストはコンテナなしで `uv run pytest` 実行可能に保つ。統合テストはマーカー（`pytest -m integration`）または任意 compose プロファイルの背後に置く。

## kamae-py リポジトリでの開発

## 前提条件

- [uv](https://docs.astral.sh/uv/) がインストールされ `PATH` で利用可能であること。
- プロジェクトの範囲に合う Python バージョン。このリポジトリは [`.python-version`](/docs/kamae-py/../../../.python-version/) でローカル Python をピン留めしている。

## クローンとブートストラップ

```bash
git clone <repository-url>
cd kamae-py
uv python install
uv sync
```

`uv python install` は `.python-version` を読み、未インストールならピン留めパッチリリースをインストールする。`uv sync` は仮想環境を作成し、ロック済み依存関係をインストールする。

## インストールの検証

```bash
uv run python --version
uv run python -c "import pydantic; print(pydantic.__version__)"
uv run pytest
```

変更前にすべてのテストが通るべきである。

## ローカル品質ゲートの実行

[品質ゲート](/docs/kamae-py/quality-gates/) のベースラインコマンドを実行する。このリポジトリではさらに次を実行する:

```bash
uv run python scripts/validate_package.py
uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
uv run ruff format --check .
```

フォーマットチェックが失敗したら `uv run ruff format .` で適用する。

## スキルパッケージの作業

スキルは `skills/kamae-py/` にある:

- `SKILL.md` — ディスパッチガイドと frontmatter。
- `` — 詳細リファレンス文書。
- `scripts/` — `apply_templates.py`、`check_kamae_policy.py` などのヘルパースクリプト。
- `assets/templates/` — インストール可能なプロジェクトテンプレート。

新しいリファレンス文書を追加したら、`SKILL.md` からリンクし、スキルディスパッチャーが表面化できるようにする。`scripts/validate_package.py` がチェックできるよう相対リンクを優先する。

プロジェクト固有のルール形式は [kamae-py リポジトリ](https://github.com/manji-0/kamae-py) の `rules/` を参照。

`check_kamae_policy.py` を変更したら、`tests/test_check_kamae_policy.py` にテストを追加または更新する。

## テスト用テンプレート適用

`scripts/apply_templates.py` はテンプレートをターゲットディレクトリにコピーする。テンプレート変更をこのリポジトリに影響させずテストするには一時ディレクトリを使う:

```bash
mkdir -p /tmp/kamae-test
uv run python skills/kamae-py/scripts/apply_templates.py --target /tmp/kamae-test --ci backend --force
```

既存プロジェクトに適用するときは、まず `--dry-run` を使う。

## 依存関係の変更

依存関係を追加または削除したら `uv.lock` を更新する:

```bash
uv add <package>
# or
uv remove <package>
uv lock
```

CI は `uv sync --locked` を実行するため、古いロックファイルでビルドは失敗する。

## コミット前

1. 上記のローカル品質ゲート一式を実行する。
2. 意図しないテンプレートまたはロックファイル変更がないか `git diff` を確認する。
3. コミットは焦点を絞る: 1 論理変更 1 コミット。例: 新リファレンス文書とその `SKILL.md` リンクを 1 コミットに。依存関係更新は別コミットに分ける。

## トラブルシューティング

- **Mypy が `pydantic.mypy` プラグイン欠如を報告**: `[tool.mypy] plugins = ["pydantic.mypy"]` が設定され、仮想環境が `uv run` 経由で有効であることを確認する。
- **ロックファイルのドリフト**: `uv lock` を実行し、更新された `uv.lock` をコミットする。
- **新リファレンスでポリシーチェッカー失敗**: チェッカーはデフォルトで `src/` と `tests/` のみ検査する。スキルリポジトリは `--include-tests` でチェックされる。別の場所にコードを追加したら、`[tool.mypy].files` にパスを追加するか、適切なスコープでチェッカーを実行する。

## レビュー観点

### コミットされた env ファイルにシークレットと PII がないか — High

[PII と観測経路の保護](/docs/kamae-py/pii-protection/) と照合する。コミットされた `.env`、例の実認証情報、デバッグ用に生 PII をログするよう促すローカルセットアップ文書を指摘する。

### ドメインコードはフレームワークと ORM の import がないか — High

チームが Kamae スタイルの分離を主張しているのに、`domain` モジュールが FastAPI、Django モデル、SQLAlchemy セッション、boto3、その他インフラクレートを import する箇所を指摘する。

### テスト配置はレイヤー境界に合っているか — Medium

ユースケース層のフェイクやインフラ層のアダプターではなく、ドメインテストが HTTP サーバーや DB プールを直接引く配置を指摘する。

### ドメインとユースケースのテストは Docker なしで動くか — Medium

基本的な遷移やユースケーステストにフェイクポートで足りるのに、ライブ DB や外部サービスを要求するワークフローを指摘する。

### フィクスチャはコンストラクタ経由で組み立てられているか — Medium

[テストデータ](/docs/kamae-py/test-data/) と照合する。ドメイン/ユースケーステストで生 dict、`model_construct`、ORM 行により不変条件を迂回しているテストヘルパーを指摘する。

### 文書化されたローカルチェックループがあるか — Low

[CI セットアップ](/docs/kamae-py/ci-setup/) と整合するファストパスとフル pre-push コマンド一覧なしに Kamae 規約を採用するプロジェクトを指摘する。

