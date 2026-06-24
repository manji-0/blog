---
title: "kamae-py"
sidebar:
  order: 0
  label: "概要"
---

> ソース: [https://github.com/manji-0/kamae-py](https://github.com/manji-0/kamae-py)

Kamae Python は、uv・Pydantic v2 の判別共用体・凍結状態モデル・純粋な遷移関数・境界バリデーション・明示的なドメインエラーを用いた、堅牢なサーバーサイド Python 3.12+ ドメインモデリングのためのガイドです。

このリポジトリに含まれるスキル:

- `kamae-py` — Python バックエンドのドメインモデル、ユースケース、状態遷移、境界パースの生成ガイダンス
- `kamae-py-review` — Python ドメイン差分向けの批判的レビューチェックリスト（変更パス向けの任意 `review_probe.py` ルーター付き）

## インストール

お好みのスキルインストーラーでこのリポジトリからスキルをインストールするか、`skills/kamae-py` を Codex のスキルディレクトリにコピーしてください。

Claude Code の場合は、このリポジトリをマーケットプレイスに追加してプラグインをインストールします:

```bash
/plugin marketplace add manji-0/kamae-py
/plugin install kamae-py@kamae-py
```

## パッケージング

パッケージには Claude、Codex、Agents Marketplace のマニフェストが含まれます:

- `.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` — Claude プラグインパッケージ
- `.codex-plugin/plugin.json` と `.agents/plugins/marketplace.json` — Codex プラグインと Agents Marketplace 掲載
- `.codex-plugin/marketplace.json` — Codex マーケットプレイス向けスキル一覧

ルールベースのカスタマイズは [`rules/README.md`](/docs/kamae/python/rules/) を参照してください。プロジェクトの `.claude/rules/` や `.codex/rules/`、またはユーザーレベルのルールディレクトリからプラグインのデフォルトを上書きできます。

## 開発

このリポジトリは uv と Python 3.12+（現在は `.python-version` で固定）を前提とします。

```bash
uv python install
uv sync
uv run python skills/kamae-py/references/taxi-request.py
```

CI では同じ uv ベースのチェックを実行します:

```bash
uv run python scripts/validate_package.py
uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
uv run ruff format --check .
uv run ruff check .
uv run mypy .
uv run pytest
```

インストール可能なテンプレートは `skills/kamae-py/assets/templates/` にあります。`gh skill` や `npx skills` 経由でスキルをインストールする場合はそちらのコピーを使ってください。リポジトリルートの `pyproject.toml`、`.github/workflows/ci.yml`、`scripts/` などはスキルと一緒に必ずしもインストールされません。

スキルには `skills/kamae-py/scripts/apply_templates.py`（既存ファイルをデフォルトで上書きせずテンプレートをコピー）と `skills/kamae-py/scripts/check_kamae_policy.py`（対象プロジェクトが Kamae Python の方針に沿っているかの簡易チェック）も含まれます。

## 原則

- 各ドメイン状態を個別の凍結 Pydantic v2 モデルとしてモデル化する
- `Annotated[..., Field(discriminator="kind")]` で状態を組み合わせる
- API・DB・ファイル・キュー・SDK の境界で `TypeAdapter` により外部データをパースする
- 有効な状態遷移を純粋関数として表現する
- 想定されるビジネス失敗は明示的かつユースケース固有にする
- ログ・メトリクス・エラー・イベントを含め、PII とシークレットはデフォルトでマスクする
- 状態変更とドメインイベントをアトミックに永続化し、冪等なリトライ経路を用意する
- コンストラクタ・遷移・境界パース・マスク・永続化のエッジをテストで検証する
- 触れたドメインコードについて、uv 経由の Ruff、mypy（Pydantic v2 プラグイン）、pytest のゲートをクリーンに保つ

ディスパッチガイドは [ガイド](/docs/kamae/python/guide/)、詳細リファレンスは `skills/kamae-py/references/` を参照してください。

## カスタマイズ

ルールは `.claude/rules/`、`.codex/rules/`、ユーザーレベルのルールディレクトリ、またはこのリポジトリの `rules/defaults/` に置きます。詳細は [`rules/README.md`](/docs/kamae/python/rules/)。

## リポジトリ構成

```text
skills/kamae-py/          実装ガイダンス
skills/kamae-py-review/   レビュー手順とチェックリスト
rules/                    プロジェクト/ユーザー上書き形式
```
