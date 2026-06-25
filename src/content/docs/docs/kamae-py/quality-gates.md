---
title: "品質ゲート"
sidebar:
  order: 10
---

ドメイン方針は「レビューで気づく」だけでは再現性がない。触ったパッケージではフォーマット・リント・型チェック・焦点を絞ったテストをローカルと CI の両方で同じコマンドに揃える。ここが正規のコマンド一覧である。

初回セットアップは [開発環境とセットアップ](/docs/kamae-py/development-setup/)、GitHub Actions への反映は [CI セットアップ](/docs/kamae-py/ci-setup/) を参照する。

## ベースラインコマンド

uv でプロジェクトツールを実行する。リポジトリに既存コマンドがあればそれを優先する。なければ触れた Python コード向けに次のデフォルトを使う。

```bash
uv run ruff format .
uv run ruff check .
uv run mypy .
uv run pytest
```

狭い変更では、触れたファイルと状態をカバーする最小コマンドを実行し、制限を述べる。

初回ローカルセットアップは [開発環境とセットアップ](/docs/kamae-py/development-setup/) を読み、[`../assets/templates/`](https://github.com/manji-0/kamae-py/blob/main/skills/kamae-py/assets/templates/) からテンプレートをコピーまたはマージする。インストール済みスキルにはスキルディレクトリ下のファイルが含まれるが、このリポジトリルートの `pyproject.toml`、`uv.lock`、`.github/`、`scripts/` は確実にはインストールされない。

## スキルパッケージとポリシーチェック

スキル/プラグインリポジトリではさらに実行する:

```bash
uv run python scripts/validate_package.py
uv run python path/to/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
```

**kamae-py** リポジトリ自体では `skills/kamae-py/scripts/check_kamae_policy.py` を使う。CI では `ruff format --check` を使う。チェック失敗時はローカルで `ruff format .` で適用する。ワークフロー配線は [CI セットアップ](/docs/kamae-py/ci-setup/)、このリポジトリの開発ワークフローは [開発環境とセットアップ](/docs/kamae-py/development-setup/) を参照。

## ドメイン安全性に重要な Ruff シグナル

フォーマットは差分をレビューしやすくし、ドメイン、境界、PII、ネイティブ、永続化の変更を検査しやすくする。

無効状態や運用失敗を隠しうるパターンに特に注意する:

- 広い `except Exception`、飲み込まれた例外、無視された awaitable。
- `print`、Pydantic モデルの生ログ、機密値の文字列フォーマット。
- 実行時ビジネス検証に使われる `assert`。
- 可変デフォルト、グローバル可変状態、遷移内の暗黙的時刻/乱数。
- ドメイン境界付近の未検証 `Any`、広い `dict`、`type: ignore`、`cast`。
- 浮動小数点の金額、損失のあるキャスト、単位のない量。

すべてのリントをグローバルに有効化する必要はない。変更したコードやローカル設定に現れた警告は、レビュー時の判断材料として扱う。

## 型チェック

プロジェクトに設定があれば mypy または pyright を実行する。Pydantic v2 プロジェクトでは `plugins = ["pydantic.mypy"]` と strict プラグインフラグ（`init_forbid_extra`、`init_typed`、`warn_required_dynamic_aliases`）付き mypy を優先する。完全な `[tool.mypy]` と `[tool.pydantic-mypy]` 例: [ドメインモデリング](/docs/kamae-py/domain-modeling/#configure-mypy-with-the-pydantic-plugin)。

プラグインは素の mypy が見逃しうる Pydantic 固有リスクを検出する: 型なしモデルフィールド、frozen モデル変更、誤った `model_construct`、無効フィールドデフォルト、余分なコンストラクタキーワード、必須動的エイリアス。

判別共用体、リポジトリプロトコル、結果値、境界 DTO、Pydantic モデル構築周りの型チェックを弱めない。

抑制が必要なら狭く保ち、実行時検証またはアダプター契約が依然として不変条件を保つ理由を説明する。

## テスト

ドメインコンストラクタ、遷移、DTO 変換、PII マスキング、ネイティブラッパー、リポジトリトランザクション、アウトボックス振る舞い、リトライ/冪等性経路向けに焦点を絞った pytest を実行する。

生成、ベンダー、外部維持コードはフルリントバーから免除できるが、その周りの安全ラッパーは依然として境界検証、PII、ネイティブ境界ガイダンスに従う。

## pre-commit 統合

コミット前に同じチェックをローカルで実行する。[pre-commit](https://pre-commit.com/) 設定フラグメント例:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ruff-format
        name: ruff format
        entry: uv run ruff format
        language: system
        types: [python]
      - id: ruff-check
        name: ruff check
        entry: uv run ruff check --fix
        language: system
        types: [python]
      - id: mypy
        name: mypy
        entry: uv run mypy
        language: system
        types: [python]
        pass_filenames: false
      - id: kamae-policy
        name: kamae policy
        entry: uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
        language: system
        pass_filenames: false
```

インストールと実行:

```bash
uv add --dev pre-commit
uv run pre-commit install
uv run pre-commit run --all-files
```

フックは高速に保つ。スイートが小さい場合を除き、すべてのコミットでフル `pytest` は CI で実行し、必ずしも毎コミットではない。高コストフックのスコープには `files:` パターンを使う。

## Makefile と Taskfile パターン

ローカルと CI が同じエントリポイントを共有するよう `uv run` コマンドを集約する。

**Makefile:**

```makefile
.PHONY: format lint typecheck test check

format:
	uv run ruff format .

lint:
	uv run ruff check .

typecheck:
	uv run mypy .

test:
	uv run pytest

check: format lint typecheck test
```

**Taskfile.yml**（[Task](https://taskfile.dev/)）:

```yaml
version: "3"

tasks:
  default:
    deps: [format, lint, typecheck, test]

  format:
    cmds: [uv run ruff format .]

  lint:
    cmds: [uv run ruff check .]

  typecheck:
    cmds: [uv run mypy .]

  test:
    cmds: [uv run pytest]

  check:
    deps: [format, lint, typecheck, test]
```

CI ワークフローを `make check` または `task check` に向け、ローカルとパイプラインのドリフトを 1 か所で可視にする。GitHub Actions 配線は [CI セットアップ](/docs/kamae-py/ci-setup/) を読む。

## レビュー観点

### 抑制されたチェックがドメイン安全性リスクを隠していないか — High

広い例外、未検証 `Any`、無視された awaitable、ビジネスチェックの `assert`、損失のあるキャスト、浮動小数金額/数量比較、PII ログ、境界デシリアライズに関する抑制や無視警告を指摘する。

無効状態の許容、データ損失、PII 漏洩、健全性問題、見逃された永続化失敗を招きうる抑制はエスカレートする。

### 抑制は狭く正当化されているか — Medium

ドメイン、境界、PII、ネイティブ、永続化、エラーハンドリング周りの広い `# type: ignore`、ファイルレベル `noqa`、モジュールレベル抑制、説明のない `# noqa: ...` を指摘する。

文書化され隔離された生成、ベンダー、互換コードは格下げする。

### 触れたコードのリントと型チェックはクリーンか — Medium

リポジトリが触れたパッケージで通常実行するのに、新しい Ruff 警告、mypy/pyright エラー、スキップされた品質ゲートを指摘する。

リポジトリが使っていない新しいグローバル厳格方針は要求しない。既存のローカルコマンドを走らせ、触れたコードの警告を直すことを推奨する。

### フォーマット/リント/型ゲートは CI またはパッケージ検証に表れているか — Low

Python ドメイン変更があるのにフォーマット、リント、型チェック、テストの実行方法が文書化されていないパッケージを指摘する。`uv run ruff format --check`、`uv run ruff check`、`uv run mypy`、焦点を絞った `uv run pytest` を提案する。

ドキュメントのみの小変更を Python CI 欠如でブロックしない。

### 触れた Python コードはフォーマットされているか — Low

生成またはベンダーコードでない限り、`uv run ruff format --check` に失敗する触れた Python ファイルを指摘する。

フォーマット指摘は Low のまま。リスクのあるドメイン、ネイティブ、PII、永続化、境界変更を隠す悪いフォーマットの場合を除く。

