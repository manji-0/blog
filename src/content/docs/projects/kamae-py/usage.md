---
title: "使い方"
description: "kamae-py の導入とガイドの読み方"
sidebar:
  order: 1
  label: "使い方"
---

Kamae Pythonガイドの採用手順と、uv・pyrefly・スキル導入までを扱います。各トピックの詳細は実装ページと[品質ゲート](/projects/kamae-py/quality-gates/)へ。百科事典的なAPI一覧は目的にしていません。

## ガイドの読み方

| いまやること | 読む順 |
| --- | --- |
| 新規ドメイン | [ドメインモデリング](/projects/kamae-py/domain-modeling/) → [状態遷移](/projects/kamae-py/state-transitions/) → [境界防御](/projects/kamae-py/boundary-defense/) |
| 既存コードへ入れる | [ドメインモデリング](/projects/kamae-py/domain-modeling/#段階的な移行) のフェーズ表から触ったワークフローだけ |
| 仕上げ | [品質ゲート](/projects/kamae-py/quality-gates/) |
| ライブラリの置き場 | [ライブラリガイド](/projects/kamae-py/library-guides/) |

強い既定です。リポジトリの慣習と衝突する場合は慣習を優先し、ドメイン安全性に効く逸脱だけ短く記録してください。

## スキルのインストール

実装時は`kamae-py`、差分レビュー時は`kamae-py-review`です。

```bash
npx skills add manji-0/kamae-py -s kamae-py -s kamae-py-review -g -y
```

チームの命名やライブラリ好みは`.claude/rules/` / `.codex/rules/`で上書きできます。スキルは`references/`配下のMarkdownをディスパッチしますが、ブログ側の正規ページは`/projects/kamae-py/`です。

## アプリリポジトリのブートストラップ

`npx skills`で入れただけでは`pyproject.toml`や`.github/workflows/`は付きません。[テンプレート](https://github.com/manji-0/kamae-py/tree/main/skills/kamae-py/assets/templates/)をコピーまたはマージします。

```bash
python path/to/kamae-py/skills/kamae-py/scripts/apply_templates.py --target . --ci backend --dry-run
python path/to/kamae-py/skills/kamae-py/scripts/apply_templates.py --target . --ci backend
```

`--force`なしでは既存ファイルを上書きしません。スキル/プラグインリポジトリ向けは`--ci skill-package`です。

## uvとPython

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # or brew install uv
cd your-project
uv python pin 3.13
uv sync
uv lock
```

新規パッケージでは`uv init --package`から始め、`uv add "pydantic>=2,<3"`を追加します。スキルやドキュメントだけのリポジトリでは`[tool.uv]`に`package = false`を設定します。

## pyrefly

型チェック既定は**pyrefly**です。Pydantic v2サポートは組み込みで、`extra="forbid"`・`frozen=True`・`strict=True`をモデルから直接読みます。

```toml
[dependency-groups]
dev = [
    "pyrefly>=1.1.1",
]

[tool.pyrefly]
project-includes = ["src", "tests"]
python-version = "3.12.0"
```

既存mypy設定からは`pyrefly init`で移せます。`[tool.pyrefly].project-includes`はアプリでは通常`src`と`tests`、スキルリポジトリでは`scripts`も含めます。

## 初回検証

```bash
uv run ruff format --check .
uv run ruff check .
uv run pyrefly check .
uv run pytest
python path/to/kamae-py/skills/kamae-py/scripts/check_kamae_policy.py --target . --include-tests
```

統合テストにPostgresが要る場合はローカルサービスかDockerを任意で使い、ドメイン単体テストはコンテナなしで`uv run pytest`できるように保ちます。日常のコマンド一覧は[品質ゲート](/projects/kamae-py/quality-gates/)です。

## kamae-pyリポジトリで開発する場合

```bash
git clone https://github.com/manji-0/kamae-py.git
cd kamae-py
uv python install
uv sync
uv run pytest
uv run python scripts/validate_package.py
uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
```

依存を変えたら`uv lock`を更新し、CIは`uv sync --locked`を前提にします。

## 次に読む

| 目的 | ページ |
| --- | --- |
| 設計の全体像 | [はじめに](/projects/kamae-py/) |
| ドメインの型 | [ドメインモデリング](/projects/kamae-py/domain-modeling/) |
| コミット前のチェック | [品質ゲート](/projects/kamae-py/quality-gates/) |
