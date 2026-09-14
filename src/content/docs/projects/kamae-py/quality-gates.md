---
title: "品質ゲート"
sidebar:
  order: 10
---

触ったパッケージでフォーマット・リント・型チェック・焦点を絞ったテストをローカルとCIで同じコマンドに揃える方法を扱います。初回セットアップは[使い方](/projects/kamae-py/usage/)、ポリシー詳細はリポジトリの`check_kamae_policy.py`を参照してください。

## ベースラインコマンド

```bash
uv run ruff format .
uv run ruff check .
uv run pyrefly check .
uv run pytest
```

狭い変更では触れたファイルと関連stateをカバーする最小コマンドを実行し、制限を述べます。リポジトリに既存の`make check`や`task check`があればそれを正とします。

## スキルパッケージとポリシー

スキル/プラグインリポジトリではさらに次を実行します。

```bash
uv run python scripts/validate_package.py
uv run python skills/kamae-py/scripts/check_kamae_policy.py --include-tests --strict
```

CIでは`ruff format --check`を使い、失敗時はローカルで`uv run ruff format .`を適用します。[テンプレート](https://github.com/manji-0/kamae-py/tree/main/skills/kamae-py/assets/templates/)の`ci.yml`をマージしてGitHub Actionsへ載せます。

## Ruffで見るシグナル

- 広い`except Exception`、飲み込まれた例外、無視されたawaitable
- `print`、Pydanticモデルの生ログ、機密値の文字列フォーマット
- ビジネス検証への`assert`、可変デフォルト、遷移内の暗黙的時刻/乱数
- 境界付近の未検証`Any`、広い`dict`、`type: ignore`、`cast`
- 浮動小数点の金額、単位のない量

## 型チェック（pyrefly）

Pydantic v2プロジェクトではpyreflyを優先します。frozenモデル変更、誤った`model_construct`、余分なコンストラクタキーワードを検出します。抑制は狭く保ち、実行時検証かアダプター契約が不変条件を保つ理由を説明します。

## テスト

ドメインコンストラクタ、遷移、DTO変換、PIIマスキング、リポジトリTX、アウトボックス、リトライ/冪等経路に焦点を絞ります。値は公開コンストラクタとアダプタ経由で組み立て、HTTPやライブDBにユースケーステストを依存させません。Hypothesisは1プロパティ1不変条件で使い、generatorを本番パッケージへ置きません。

## パフォーマンス

プロファイルしてから最適化します。純粋遷移はI/O・パース・隠れスキャンなしのO(fields)を保ち、ホットパス最適化は境界・リポジトリ・バッチジョブへ寄せます。検証コストが支配的なら`validate_json`の利用やDTOの`strict`設計を見直します。event loopを止めるCPU作業はコンポジションルートでオフロードします。

## 観測とAPI契約

テレメトリ既定はOpenTelemetryです。ログは構造化フィールドで相関IDを載せ、メトリクスラベルにリクエストごとIDを載せません。公開APIのエラー形状とステータスコードは操作別に安定させ、生の`ValidationError` dictをクライアントへ返しません。詳細は[境界防御](/projects/kamae-py/boundary-defense/#piiと観測経路)です。

## pre-commitとCIエントリポイント

```yaml
# .pre-commit-config.yaml（抜粋）
repos:
  - repo: local
    hooks:
      - id: ruff-format
        entry: uv run ruff format
        language: system
        types: [python]
      - id: pyrefly
        entry: uv run pyrefly check
        language: system
        types: [python]
        pass_filenames: false
```

```makefile
.PHONY: check
check:
	uv run ruff format .
	uv run ruff check .
	uv run pyrefly check .
	uv run pytest
```

フックは高速に保ち、フル`pytest`はCIで毎コミット必須にしません。

## 次に読む

| 目的 | ページ |
| --- | --- |
| uv・pyrefly導入 | [使い方](/projects/kamae-py/usage/) |
| 境界とPII | [境界防御](/projects/kamae-py/boundary-defense/) |
| 設計の全体像 | [はじめに](/projects/kamae-py/) |
