---
title: "はじめに"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-scala](https://github.com/manji-0/kamae-scala)

_Kamae（構え）— 備えの姿勢。_

Kamae Scalaは、サーバーサイドのScala 3ドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。[kamae-rs](https://github.com/manji-0/kamae-rs) や [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) と同じ思想を、opaque types・sealed traits・`Either`・エフェクト型といったScala 3のイディオムに落としています。

守りたいのは、文字列のまま混ざるドメイン概念、`status` とOptionalで表せてしまう無効状態、想定内失敗での `throw` / `.get`、APIやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化です。全部を通読する必要はなく、いまのトピックだけ開けば足ります。各ページ末尾の **レビュー観点** はレビュー用の確認項目です。

既定はScala 3.3+、sbt 1.10+、Java 17以上、フォーマットはscalafmt、lintはscalafix（採用している場合）です。既存リポジトリではまずそこの慣習を確認してください。強い既定であって絶対ではないので、慣習とぶつかったら慣習を優先し、ドメイン安全性に効く逸脱だけ短く残します。

## どこから読むか

新規ドメインなら [ドメインモデリング](/projects/kamae-scala/domain-modeling/) → [状態遷移](/projects/kamae-scala/state-transitions/) → [境界防御](/projects/kamae-scala/boundary-defense/) と [エラーハンドリング](/projects/kamae-scala/error-handling/) → [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) が素直です。一通りは [タクシー配車の例](/projects/kamae-scala/examples/taxi-request/) で追えます。仕上げ前に [品質ゲート](/projects/kamae-scala/quality-gates/) を見てください。

既存コードへの導入は [段階的導入](/projects/kamae-scala/adoption/) から。ORMを使うなら [ORM アダプター](/projects/kamae-scala/orm-adapters/) も挟みます。PIIと観測だけなら [PII 保護](/projects/kamae-scala/pii-protection/) と [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/)、アサーションは [テストデータ](/projects/kamae-scala/test-data/) です。

配線は [アプリケーション配線](/projects/kamae-scala/application-wiring/)、Cats Effect / ZIOは [エフェクトシステム](/projects/kamae-scala/effect-systems/)、サービス間は [サービス境界](/projects/kamae-scala/service-boundaries/)、ストリームは [ストリームと継続クエリ](/projects/kamae-scala/stream-continuous-queries/)、マクロは [ドメインマクロ](/projects/kamae-scala/domain-macros/)、JNIは [JNI / ネイティブ境界](/projects/kamae-scala/jni-native-boundaries/) へ。テストは [テストデータ](/projects/kamae-scala/test-data/) と [プロパティベーステスト](/projects/kamae-scala/property-based-tests/)、Scaladocは [公開 API のドキュメント](/projects/kamae-scala/scaladoc/)、ローカルとCIは [開発環境](/projects/kamae-scala/dev-environment/) と [CI セットアップ](/projects/kamae-scala/ci-setup/) です。スキル本体の開発は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) へ。

## 依存ライブラリ

`build.sbt` に応じて、必要なときだけ [ライブラリガイド](/projects/kamae-scala/library-guides/) を見てください。エフェクトは `cats` / `zio`、JSONは `circe`、検証は `refined`、永続化は `doobie`、ストリームは `fs2`、設定は `pureconfig`、テストは `scalacheck` あたりがガイド付きです。

## 正規の例（重複を避ける）

| トピック | 正規リファレンス |
| --- | --- |
| 薄いユースケース | [状態遷移](/projects/kamae-scala/state-transitions/#ユースケースを薄く保つ) |
| 永続化エラー | [エラーハンドリング](/projects/kamae-scala/error-handling/#推奨パターン-either-による早期リターン) |
| リポジトリ | [永続化](/projects/kamae-scala/persistence-events/#責務でリポジトリを分離する) |
| E2E | [タクシー配車の例](/projects/kamae-scala/examples/taxi-request/) |
| 品質ゲートコマンド | [品質ゲート](/projects/kamae-scala/quality-gates/#ベースラインコマンド) |
