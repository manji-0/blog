---
title: "はじめに"
description: "サーバーサイドRustの堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

Kamae Rustは、サーバーサイドのドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。[kamae-ts](https://github.com/iwasa-kosui/kamae-ts) のRust向け兄弟で、同じ思想を列挙型・newtype・`TryFrom`・`Result` など、Rustのイディオムに落とし込みます。

守りたいのは、文字列のまま混ざるドメイン概念、`status` とOptionalで表せてしまう無効状態、想定内失敗での `unwrap` / `panic!`、API JSONやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化、といったあたりです。全部を通読する必要はなく、いま触っているトピックだけ開けば足ります。各ページ末尾の **レビュー観点** は、そのトピックのレビュー用チェックです。

ここで示すのは強い既定であり、絶対的な規則ではありません。既存の慣習と衝突する場合は慣習を優先し、ドメインの安全性に影響する逸脱だけを短く記録してください。

## どこから読むか

| 目的 | 読む順 |
| --- | --- |
| 新規ドメインを型で起こす | [ドメインモデリング](/projects/kamae-rs/domain-modeling/) → [状態遷移](/projects/kamae-rs/state-transitions/) → [境界防御](/projects/kamae-rs/boundary-defense/) → [エラーハンドリング](/projects/kamae-rs/error-handling/) |
| 端から端まで追う | [タクシー配車の例](/projects/kamae-rs/examples/taxi-request/)（ドメインまで） |
| 保存とイベントを揃える | [集約とトランザクション境界](/projects/kamae-rs/aggregate-transactions/) → [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) |
| 既存コードへ入れる | [段階的導入](/projects/kamae-rs/adoption/) |
| 仕上げのゲート | [品質ゲート](/projects/kamae-rs/quality-gates/) |

それ以外はサイドバーから必要なトピックだけ開いてください。

## よく参照する節

| トピック | 正規リファレンス |
| --- | --- |
| 薄いユースケース | [アプリケーション配線](/projects/kamae-rs/application-wiring/#依存を持つ-struct-としてユースケースをモデル化する) |
| 楽観的並行性 | [集約とトランザクション境界](/projects/kamae-rs/aggregate-transactions/) |
| リポジトリとイベント | [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) |
| E2E（ドメイン） | [タクシー配車の例](/projects/kamae-rs/examples/taxi-request/) |
| 品質ゲートコマンド | [品質ゲート](/projects/kamae-rs/quality-gates/) |

## 依存クレートを調べる

`Cargo.toml` に応じて、必要なときだけ [クレートガイド](/projects/kamae-rs/crate-guides/) を参照してください。エラー処理は `thiserror` / `anyhow`、シリアライズは `serde`、検証やnewtypeは `validator` / `garde` / `nutype` が中心です。シークレットは `secrecy`、観測は `tracing` / `metrics`、テストは `proptest` のガイドがあります。
