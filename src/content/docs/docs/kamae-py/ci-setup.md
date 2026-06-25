---
title: "CI セットアップ"
sidebar:
  order: 10
---

CIはローカルで再現できる品質ゲートを、マージ前に機械的に強制する層である。人間のレビューが前提にしているチェックがCIに無いと、ドメイン方針のドリフトは気づきにくい。

実行すべきコマンドの正規一覧は [品質ゲート](/docs/kamae-py/quality-gates/) にある。`kamae-py` スキルリポジトリ自体を開発するときは [開発環境とセットアップ](/docs/kamae-py/development-setup/) を読む。

## デフォルトの GitHub Actions ワークフロー

`uv sync --locked` でロックファイルのドリフトを検知し、依存の再現性を保つ。

このスキルをインストールしたときは、同梱テンプレート [`../assets/templates/`](https://github.com/manji-0/kamae-py/blob/main/skills/kamae-py/assets/templates/) を使う：

- [`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) -> 通常のPythonバックエンドリポジトリ向け `.github/workflows/ci.yml`。
- [`../assets/templates/github-ci-skill-package.yml`](../assets/templates/github-ci-skill-package.yml) -> スキル/プラグインリポジトリ向け `.github/workflows/ci.yml`。
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> スキルパッケージワークフロー使用時の `scripts/validate_package.py`。

同梱スクリプトでコピーできる：

```bash
python path/to/kamae-py/scripts/apply_templates.py --target . --ci backend
python path/to/kamae-py/scripts/apply_templates.py --target . --ci skill-package
```

スクリプトはデフォルトで非破壊的。`--dry-run` でプレビューし、意図的に置き換えるときだけ `--force` を使う。

CIにKamaeポリシーチェックを追加できる：

```bash
python path/to/kamae-py/scripts/check_kamae_policy.py --target . --include-tests
```

警告でもビルドを失敗させるにはCIで `--strict` を使う。通常のバックエンドリポジトリでは `uv sync --locked` の後に追加。スキル/プラグインリポジトリでは `scripts/validate_package.py` と並行して実行。

`apply_templates.py --no-policy-checker` でポリシーチェッカーのインストールをオプトアウトした場合は、生成ワークフローから該当ステップを削除する。

スキル/プラグインリポジトリ向け推奨ワークフロー:

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
  checks:
    name: Python 3.12+ checks
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Install uv
        uses: astral-sh/setup-uv@08807647e7069bb48b6ef5acd8ec9567f424441b # v8.1.0
        with:
          enable-cache: true

      - name: Install Python
        run: uv python install

      - name: Sync dependencies
        run: uv sync --locked

      - name: Validate skill package
        run: uv run python scripts/validate_package.py

      - name: Check Kamae policy
        run: uv run python scripts/check_kamae_policy.py --include-tests --strict

      - name: Check formatting
        run: uv run ruff format --check .

      - name: Lint
        run: uv run ruff check .

      - name: Type check
        run: uv run mypy .

      - name: Test
        run: uv run pytest
```

`uv python install` は `.python-version` を尊重するため、ジョブはローカル開発と同じPythonパッチバージョンを使う。`uv sync --locked` は `pyproject.toml` と `uv.lock` がずれたときCIを失敗させる。

スキルパッケージではない通常のバックエンドリポジトリでは `Validate skill package` ステップを省略するか、[`../assets/templates/github-ci.yml`](../assets/templates/github-ci.yml) を使う。

## CI が保護すべきもの

ドメイン、境界、PII、永続化、イベント、テスト、スキルファイルに触れるプルリクエストでは、次のチェックを必須に保つ：

- プラグインマニフェスト、スキルfrontmatter、リンク、Python構文のパッケージ検証。
- Ruffフォーマットとリント。
- `plugins = ["pydantic.mypy"]` 付きMypy strictモード。
- コンストラクタ、遷移、境界パース、マスキング、永続化リトライ、イベント互換性のPytestカバレッジ。

## ピン留めと更新

リポジトリのセキュリティ方針に応じて、アクションのメジャーまたは不変SHAをピン留めする。サプライチェーン保証を高めるには、サードパーティアクションを完全なコミットSHAでピン留めし、バージョンコメントを横に置く。

無関係なドメイン変更でのついで更新ではなく、意図的にアクションピンを更新する。

## ブランチ保護

マージ前にCIジョブを必須にする。フルテストスイートが遅すぎるなら、高速ドメインチェックと遅い統合テストに分割するが、高速ジョブは必須のままにする。

アダプター付きバックエンドサービスでは、スコープにリスクがあるとき、データベース統合テスト、マイグレーションチェック、アウトボックスリレーテスト用の別ジョブを追加する。

## レビュー観点

### 必須チェックはレビュアーの前提をカバーしているか — High

レビュアーが依存するチェックなしにドメインコードがマージできるCIを指摘する： パッケージ検証、`uv run ruff format --check`、`uv run ruff check`、関連mypy/pyright、関連pytest、ドメイン方針が重要ならポリシーチェック。

リポジトリがPythonパッケージでない、または変更がドキュメントのみの場合は格下げする。

### ジョブマトリクスは代表的か — Medium

ドメイン挙動、バリデーション、永続化、ネイティブコードがPythonバージョン、オプション依存、DBアダプター、デプロイターゲットで変わるのにデフォルト環境だけをテストするワークフローを指摘する。

ローカルコードパスが依存に独立しているとき巨大マトリクスは要求しない。

### ネイティブ/セキュリティジョブは実リスクに結びついているか — Medium

ファズ/プロパティテスト、依存監査、シークレットスキャンの文書化プランがないネイティブ偏重、FFI、パーサー、認証情報/PII敏感パッケージを指摘する。

すべてのPRにすべての任意安全ジョブは要求しない。リスクとコストのバランスが取れたスケジュール、手動、パスフィルタジョブは許容する。

### 助言チェックは助言であることが明確か — Low

ワークフロー名やREADMEで必須に見える `continue-on-error`、無視された終了コード、非必須チェックを指摘する。

ネイティブ健全性、PII漏洩、永続化整合性、公開API文書の唯一のガードが助言チェックの場合はエスカレートする。

### 開発者は CI をローカルで再現できるか — Low

コアチェックの文書化されたローカル相当がなく、失敗出力が再現しにくいCIを指摘する。

触れたコード向けのパッケージ検証、フォーマット、リント、型チェック、テストの短いローカルコマンド一覧やスクリプトを提案する。推奨ファストパスとフルpre-pushループは [開発環境とセットアップ](/docs/kamae-py/development-setup/) と照合する。
