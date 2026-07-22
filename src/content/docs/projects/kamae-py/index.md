---
title: "はじめに"
description: "サーバーサイドPythonの堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-py](https://github.com/manji-0/kamae-py)

Kamae Pythonは、サーバーサイドPython 3.12以降向けの設計スタンスとガイド集です。依存管理には **uv**、ドメインモデルには **Pydantic v2** の判別共用体と凍結モデル、状態変更には **純粋関数**を使う構成を基本とします。

防ぎたいのは、`status: str` とOptionalだらけで表せる無効状態、`typing.cast` や未検証dictの穴、想定内ビジネス失敗の例外依存、ORMエンティティとドメインの混同、観測経路へのPII、状態とイベントの非アトミックな保存です。全部を通読する必要はありません。いまのトピックだけ開けば十分です。各ページ末尾の **レビュー観点** はレビュー用の確認項目です。

既定のツールチェーンはPython 3.12/3.13、uv、Pydantic v2（ジェネリックを使うなら2.11以降を推奨）、Ruff、mypy（`plugins = ["pydantic.mypy"]`）です。既存リポジトリでは、まずそのリポジトリの慣習を確認してください。

## どこから読むか

| 目的 | 読む順 |
| --- | --- |
| 新規ドメインを型で起こす | [ドメインモデリング](/projects/kamae-py/domain-modeling/) → [状態遷移](/projects/kamae-py/state-transitions/) → [境界防御](/projects/kamae-py/boundary-defense/) → [エラーハンドリング](/projects/kamae-py/error-handling/) |
| 保存とイベントを揃える | [集約とトランザクション境界](/projects/kamae-py/aggregates/) → [永続化、集約、イベント](/projects/kamae-py/persistence-events/) |
| 端から端まで追う | [タクシー配車の例](/projects/kamae-py/examples/taxi-request/)（ドメインまで） |
| 既存コードへ入れる | [移行戦略](/projects/kamae-py/migration-strategy/)（ORMなら [ORM アダプター](/projects/kamae-py/orm-adapters/)） |
| 仕上げのゲート | [品質ゲート](/projects/kamae-py/quality-gates/) |

それ以外はサイドバーから必要なトピックだけ開いてください。よく参照する節は下表へ。

## よく参照する節

| トピック | 正規リファレンス |
| --- | --- |
| 薄いユースケース | [状態遷移](/projects/kamae-py/state-transitions/#ユースケースは薄く保つ) |
| 永続化エラー | [エラーハンドリング](/projects/kamae-py/error-handling/#推奨パターン-早期リターン) |
| リポジトリポート | [永続化](/projects/kamae-py/persistence-events/#リポジトリプロトコルは小さく保つ) / [ドメインモデリング](/projects/kamae-py/domain-modeling/#プロトコルでリポジトリポートを定義する) |
| E2E（ドメイン） | [タクシー配車の例](/projects/kamae-py/examples/taxi-request/) |
| mypy | [ドメインモデリング](/projects/kamae-py/domain-modeling/#pydantic-プラグイン付きで-mypy-を設定する) |
| 品質ゲートコマンド | [品質ゲート](/projects/kamae-py/quality-gates/#ベースラインコマンド) |
