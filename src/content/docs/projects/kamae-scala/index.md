---
title: "はじめに"
description: "サーバーサイドScala 3の堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-scala](https://github.com/manji-0/kamae-scala)

_Kamae（構え）— 備えの姿勢。_

Kamae Scalaは、サーバーサイドのScala 3ドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。[kamae-rs](https://github.com/manji-0/kamae-rs) や [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) と同じ思想を、opaque types・sealed traits・`Either`・エフェクト型など、Scala 3のイディオムに落とし込みます。

守りたいのは、文字列のまま混ざるドメイン概念、`status` とOptionalで表せてしまう無効状態、想定内失敗での `throw` / `.get`、APIやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化です。全部を通読する必要はなく、いまのトピックだけ開けば十分です。各ページ末尾の **レビュー観点** はレビュー用の確認項目です。

既定はScala 3.3以降、sbt 1.10以降、Java 17以降です。フォーマットにはscalafmt、lintにはscalafix（採用している場合）を使います。既存リポジトリではまず慣習を確認してください。ここで示すのは強い既定であり、絶対的な規則ではありません。慣習と衝突する場合は慣習を優先し、ドメインの安全性に影響する逸脱だけを短く記録します。

## どこから読むか

| 目的 | 読む順 |
| --- | --- |
| 新規ドメインを型で起こす | [ドメインモデリング](/projects/kamae-scala/domain-modeling/) → [状態遷移](/projects/kamae-scala/state-transitions/) → [境界防御](/projects/kamae-scala/boundary-defense/) → [エラーハンドリング](/projects/kamae-scala/error-handling/) |
| 端から端まで追う | [タクシー配車の例](/projects/kamae-scala/examples/taxi-request/)（ドメインまで） |
| 保存とイベントを揃える | [集約とトランザクション境界](/projects/kamae-scala/aggregate-transactions/) → [永続化、集約、イベント](/projects/kamae-scala/persistence-events/) |
| エフェクトを選ぶ | 先に [エフェクトシステム](/projects/kamae-scala/effect-systems/)（本文例はCats。ZIOは同ページ） |
| 既存コードへ入れる | [段階的導入](/projects/kamae-scala/adoption/)（ORMなら [ORM アダプター](/projects/kamae-scala/orm-adapters/)） |
| 仕上げのゲート | [品質ゲート](/projects/kamae-scala/quality-gates/) |

それ以外はサイドバーから必要なトピックだけ開いてください。

## よく参照する節

| トピック | 正規リファレンス |
| --- | --- |
| 薄いユースケース | [状態遷移](/projects/kamae-scala/state-transitions/#ユースケースを薄く保つ) |
| 永続化エラー | [エラーハンドリング](/projects/kamae-scala/error-handling/#推奨パターン-either-による早期リターン) |
| リポジトリ | [永続化](/projects/kamae-scala/persistence-events/#責務でリポジトリを分離する) |
| E2E | [タクシー配車の例](/projects/kamae-scala/examples/taxi-request/) |
| 品質ゲートコマンド | [品質ゲート](/projects/kamae-scala/quality-gates/#ベースラインコマンド) |
