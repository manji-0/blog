---
title: "開発環境セットアップ"
sidebar:
  order: 10
---

> **対象読者:** **kamae-py** スキルリポジトリで作業するコントリビューター（汎用インストール先ではない）。
> **いつ読むか:** このスキルパッケージを開発またはテストするローカルワークスペースのセットアップ。
> **関連:** [`quality-gates.md`](/docs/kamae/python/references/quality-gates/)（正規チェックコマンド）、[`local-validation.md`](/docs/kamae/python/references/local-validation/)、[`ci-setup.md`](/docs/kamae/python/references/ci-setup/)。

## 前提条件

- [uv](https://docs.astral.sh/uv/) がインストールされ `PATH` で利用可能であること。
- プロジェクトの範囲に合う Python バージョン。このリポジトリは [`.python-version`](/docs/kamae/python/../../../.python-version/) でローカル Python をピン留めしている。

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

[`quality-gates.md`](/docs/kamae/python/references/quality-gates/) のベースラインコマンドを実行する。このリポジトリではさらに次を実行する:

```bash
uv run python scripts/validate_package.py
uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
uv run ruff format --check .
```

フォーマットチェックが失敗したら `uv run ruff format .` で適用する。

## スキルパッケージの作業

スキルは `skills/kamae-py/` にある:

- `SKILL.md` — ディスパッチガイドと frontmatter。
- `references/` — 詳細リファレンス文書。
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

### 11.1 ドメインコードはフレームワークと ORM の import がないか — High

チームが Kamae スタイルの分離を主張しているのに、`domain` モジュールが FastAPI、Django モデル、SQLAlchemy セッション、boto3、その他インフラクレートを import する箇所を指摘する。

### 11.2 ドメインとユースケースのテストは Docker なしで動くか — Medium

基本的な遷移やユースケーステストにフェイクポートで足りるのに、ライブ DB や外部サービスを要求するワークフローを指摘する。

### 11.3 フィクスチャはコンストラクタ経由で組み立てられているか — Medium

[`tests.md`](/docs/kamae/python/references/test-data/) と突き合わせる。ドメイン/ユースケーステストで生 dict、`model_construct`、ORM 行により不変条件を迂回するテストヘルパーを指摘する。

### 11.4 文書化されたローカルチェックループがあるか — Low

[`ci-setup.md`](/docs/kamae/python/references/ci-setup/) と整合するファストパスとフル pre-push コマンド一覧なしに Kamae 規約を採用するプロジェクトを指摘する。

### 11.5 コミットされた env ファイルにシークレットと PII がないか — High

[`pii-protection.md`](/docs/kamae/python/references/pii-protection/) と突き合わせる。コミットされた `.env`、例の実認証情報、デバッグ用生 PII ログを促すローカルセットアップ文書を指摘する。

### 11.6 テスト配置はレイヤー境界に合っているか — Medium

ユースケース層のフェイクやインフラ層のアダプターではなく、ドメインテストが HTTP サーバーや DB プールを直接引く配置を指摘する。
