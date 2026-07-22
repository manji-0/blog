---
title: "はじめに"
description: "サーバーサイドPythonの堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-py](https://github.com/manji-0/kamae-py)

Kamae Pythonは、サーバーサイドPython 3.12以降向けの設計スタンスとガイド集です。依存管理には **uv**、ドメインモデルには **Pydantic v2** の判別共用体と凍結モデル、状態変更には **純粋関数**を使う構成を基本とします。

防ぎたいのは、`status: str` とOptionalだらけで表せる無効状態、`typing.cast` や未検証dictの穴、想定内ビジネス失敗の例外依存、ORMエンティティとドメインの混同、観測経路へのPII、状態とイベントの非アトミックな保存です。全部を通読する必要はなく、いまのトピックだけ開けば足ります。各ページ末尾の **レビュー観点** はレビュー用の確認項目です。

既定のツールチェーンはPython 3.12/3.13、uv、Pydantic v2（ジェネリックを使うなら2.11以降を推奨）、Ruff、mypy（`plugins = ["pydantic.mypy"]`）です。既存リポジトリでは、まずそのリポジトリの慣習を確認してください。

## どこから読むか

新規ドメインなら [ドメインモデリング](/projects/kamae-py/domain-modeling/) → [状態遷移](/projects/kamae-py/state-transitions/) → [境界防御](/projects/kamae-py/boundary-defense/)・[エラーハンドリング](/projects/kamae-py/error-handling/) → [集約](/projects/kamae-py/aggregates/)・[永続化、集約、イベント](/projects/kamae-py/persistence-events/) が素直です。端から端までは [タクシー配車の例](/projects/kamae-py/examples/taxi-request/) で追えます。仕上げ前に [品質ゲート](/projects/kamae-py/quality-gates/) を見てください。

既存コードへの導入は [移行戦略](/projects/kamae-py/migration-strategy/) から。ORMを使うなら途中で [ORM アダプター](/projects/kamae-py/orm-adapters/) も挟みます。PIIと観測だけなら [PII と観測経路の保護](/projects/kamae-py/pii-protection/)、[ログ可能な識別子](/projects/kamae-py/loggable-identifiers/)、[ロギングとメトリクス](/projects/kamae-py/logging-metrics/)、アサーションの置き方は [テストデータ](/projects/kamae-py/test-data/) です。

配線は [アプリケーション配線](/projects/kamae-py/application-wiring/)、サービス間は [サービス境界](/projects/kamae-py/service-boundaries/)、ストリームは [ストリームと継続クエリ](/projects/kamae-py/stream-continuous-queries/) です。GILやasyncioは [並行性と非同期](/projects/kamae-py/concurrency/)、リトライ等は [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/)、ネイティブ境界は [unsafe 境界](/projects/kamae-py/unsafe-boundaries/) へ。公開APIのdocstringは [公開 API のドキュメント](/projects/kamae-py/api-contracts/)、ホットパス全体は [Python のパフォーマンス](/projects/kamae-py/python-performance/)、バリデーションコストは [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) です。ローカルとCIは [開発環境とセットアップ](/projects/kamae-py/development-setup/)、[ローカル検証セットアップ](/projects/kamae-py/local-validation/)、[CI セットアップ](/projects/kamae-py/ci-setup/) を見てください。依存に応じて [ライブラリガイド](/projects/kamae-py/library-guides/) もあります。

## 正規の例と参照先

同じスニペットを複数ページに増やさず、正規リファレンスへリンクしてください。

| トピック | 正規リファレンス |
| --- | --- |
| 薄いユースケース | [状態遷移](/projects/kamae-py/state-transitions/#ユースケースは薄く保つ) |
| 永続化エラー | [エラーハンドリング](/projects/kamae-py/error-handling/#推奨パターン-早期リターン) |
| リポジトリポート | [永続化](/projects/kamae-py/persistence-events/#リポジトリプロトコルは小さく保つ) / [ドメインモデリング](/projects/kamae-py/domain-modeling/#プロトコルでリポジトリポートを定義する) |
| E2E | [タクシー配車の例](/projects/kamae-py/examples/taxi-request/) |
| mypy | [ドメインモデリング](/projects/kamae-py/domain-modeling/#pydantic-プラグイン付きで-mypy-を設定する) |
| 品質ゲートコマンド | [品質ゲート](/projects/kamae-py/quality-gates/#ベースラインコマンド) |
