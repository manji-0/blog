---
title: "Kamae Python"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-py](https://github.com/manji-0/kamae-py)

Kamae Python は、**uv** で依存を管理し、**Pydantic v2** の判別共用体と凍結状態モデルでドメインを表現し、状態変更を**純粋関数**で記述する、サーバーサイド Python 3.12+ 向けの設計スタンスとガイド集です。

すべてのリファレンスを通読する必要はありません。今のタスクに関係するトピックだけを開いてください。各リファレンス末尾の **レビュー観点** に、そのトピックのコードレビューで確認すべき項目があります。

## 何を目指すか

Kamae が守りたいのは、次のような失敗です。

- `status: str` と大量のオプショナルフィールドで表せてしまう無効な状態
- `typing.cast` や未検証の dict アクセスによる境界の穴
- 例外に頼る想定内のビジネス失敗
- ORM エンティティとドメインモデルの混同
- ログ・メトリクス・エラーへの PII 漏洩
- 状態変更とドメインイベントの非アトミックな永続化

Python では、凍結 Pydantic モデル・`kind` 判別子・`TypeAdapter`・純粋な遷移関数で、実用的な範囲でこれらをランタイム検証と型チェックの両方で抑えます。

## コア原則

- **状態はバリアントで分ける** — 各ビジネス状態を個別の凍結 Pydantic v2 モデルとし、`Annotated[..., Field(discriminator="kind")]` で共用体にする。
- **遷移は純粋関数** — 入力型が許可するソース状態、戻り値型がターゲット状態になる関数として表現する。時刻・ID・乱数は引数で注入する。
- **境界で一度パースする** — API・DB・ファイル・キュー・SDK のデータは `TypeAdapter` で受け、検証済みモデルからドメインへ変換する。
- **失敗は明示的に** — 想定されるドメイン失敗はユースケース固有の型で表し、例外はフレームワーク境界と想定外のインフラ失敗に留める。
- **PII はデフォルトでマスク** — ログ・トレース・エラー・メトリクス・イベントに載せる ID は許可リストで管理する。
- **永続化はアトミックに** — 状態変更とドメインイベントを同じトランザクションで保存し、冪等なリトライ経路を用意する。
- **品質ゲートを揃える** — 触ったコードでは `uv run ruff format`、`uv run ruff check`、`uv run mypy`、焦点を絞った `uv run pytest` をクリーンに保つ。

## 前提となるツールチェーン

新規プロジェクトの既定は次のとおりです。既存コードベースでは、まずリポジトリの慣習を確認してください。

- Python 3.12.x または 3.13.x（`requires-python = ">=3.12,<3.14"`）
- 依存管理は **uv**（`pip` / Poetry / Pipenv は導入しない）
- バリデーションは **Pydantic v2**（ジェネリックモデルを使う場合は 2.11+ を推奨）
- 静的解析は **Ruff** と **mypy**（`plugins = ["pydantic.mypy"]`）

## 状況別の読み方

### 新規ドメインを設計するとき

1. [ドメインモデリング](/docs/kamae/python/references/domain-modeling/)
2. [状態遷移](/docs/kamae/python/references/state-transitions/)
3. [境界防御](/docs/kamae/python/references/boundary-defense/) と [エラーハンドリング](/docs/kamae/python/references/error-handling/)
4. [集約](/docs/kamae/python/references/aggregates/) と [永続化とイベント](/docs/kamae/python/references/persistence-events/)
5. [タクシー配車例](/docs/kamae/python/examples/taxi-request/)
6. 仕上げ前に [品質ゲート](/docs/kamae/python/references/quality-gates/)

### 既存コードベースへ段階的に導入するとき

1. [移行戦略](/docs/kamae/python/references/migration-strategy/)
2. [境界防御](/docs/kamae/python/references/boundary-defense/)
3. 永続化に ORM を使う場合は [ORM アダプタ](/docs/kamae/python/references/orm-adapters/)
4. 移行したワークフローごとに、上記「新規ドメイン」のパスを続ける

### オブザーバビリティと PII だけ見るとき

1. [PII 保護](/docs/kamae/python/references/pii-protection/)
2. [ログ可能な識別子](/docs/kamae/python/references/loggable-identifiers/)
3. [ログとメトリクス](/docs/kamae/python/references/logging-metrics/)
4. テストのアサーションは [テストデータ](/docs/kamae/python/references/test-data/)

### インフラ・開発環境の整備

| 関心 | リファレンス |
| --- | --- |
| ユースケース配線、DI | [アプリケーション配線](/docs/kamae/python/references/application-wiring/) |
| CPU バウンド、GIL、asyncio | [並行性](/docs/kamae/python/references/concurrency/) |
| リトライ、サーキットブレーカー | [インフラの耐障害性](/docs/kamae/python/references/infrastructure-resilience/) |
| ネイティブ、`ctypes`、`model_construct` | [unsafe 境界](/docs/kamae/python/references/unsafe-boundaries/) |
| 公開 API の docstring | [API 契約](/docs/kamae/python/references/api-contracts/) |
| バリデーションコスト | [Pydantic パフォーマンス](/docs/kamae/python/references/pydantic-performance/) |
| ローカル開発 | [開発環境のセットアップ](/docs/kamae/python/references/development-setup/) |
| プロジェクトのブートストラップ | [ローカル検証のセットアップ](/docs/kamae/python/references/local-validation/) |
| CI | [CI セットアップ](/docs/kamae/python/references/ci-setup/) |

## 正規の例

新しいリファレンスに全文スニペットをコピーせず、次の定義へリンクしてください。

| トピック | 正規リファレンス |
| --- | --- |
| ハッピーパスのユースケース | [状態遷移 — ユースケースを薄く保つ](/docs/kamae/python/references/state-transitions/#keep-use-cases-thin) |
| 永続化エラーのマッピング | [エラーハンドリング — early return](/docs/kamae/python/references/error-handling/#preferred-pattern-early-return) |
| リポジトリポート（本番） | [永続化とイベント — 小さなプロトコル](/docs/kamae/python/references/persistence-events/#keep-repository-protocols-small) |
| リポジトリポート（入門） | [ドメインモデリング — Protocol](/docs/kamae/python/references/domain-modeling/#define-repository-ports-with-protocols) |
| エンドツーエンドコード | [タクシー配車例](/docs/kamae/python/examples/taxi-request/) |
| Mypy / Pydantic プラグイン設定 | [ドメインモデリング — mypy 設定](/docs/kamae/python/references/domain-modeling/#configure-mypy-with-the-pydantic-plugin) |
| 品質ゲートのコマンド | [品質ゲート — 基本コマンド](/docs/kamae/python/references/quality-gates/#baseline-commands) |

## リファレンス一覧

- [アプリケーション配線](/docs/kamae/python/references/application-wiring/)
- [集約](/docs/kamae/python/references/aggregates/)
- [API 契約](/docs/kamae/python/references/api-contracts/)
- [境界防御](/docs/kamae/python/references/boundary-defense/)
- [CI セットアップ](/docs/kamae/python/references/ci-setup/)
- [並行性](/docs/kamae/python/references/concurrency/)
- [開発環境のセットアップ](/docs/kamae/python/references/development-setup/)
- [ドメインモデリング](/docs/kamae/python/references/domain-modeling/)
- [エラーハンドリング](/docs/kamae/python/references/error-handling/)
- [インフラの耐障害性](/docs/kamae/python/references/infrastructure-resilience/)
- [ローカル検証のセットアップ](/docs/kamae/python/references/local-validation/)
- [ログ可能な識別子](/docs/kamae/python/references/loggable-identifiers/)
- [ログとメトリクス](/docs/kamae/python/references/logging-metrics/)
- [移行戦略](/docs/kamae/python/references/migration-strategy/)
- [ORM アダプタ](/docs/kamae/python/references/orm-adapters/)
- [永続化とイベント](/docs/kamae/python/references/persistence-events/)
- [PII 保護](/docs/kamae/python/references/pii-protection/)
- [Pydantic パフォーマンス](/docs/kamae/python/references/pydantic-performance/)
- [品質ゲート](/docs/kamae/python/references/quality-gates/)
- [状態遘移](/docs/kamae/python/references/state-transitions/)
- [テストデータ](/docs/kamae/python/references/test-data/)
- [unsafe 境界](/docs/kamae/python/references/unsafe-boundaries/)

## 実践例

[タクシー配車例](/docs/kamae/python/examples/taxi-request/) で、Pydantic v2 判別共用体、凍結状態モデル、純粋遷移、ドメインイベント、境界パースを一通り追えます。
