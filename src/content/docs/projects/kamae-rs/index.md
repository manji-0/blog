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

新規ドメインなら [ドメインモデリング](/projects/kamae-rs/domain-modeling/) → [状態遷移](/projects/kamae-rs/state-transitions/) → [境界防御](/projects/kamae-rs/boundary-defense/) と [エラーハンドリング](/projects/kamae-rs/error-handling/) → [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) の順が素直です。一通りの流れは [タクシー配車の例](/projects/kamae-rs/examples/taxi-request/) で追えます。仕上げ前に [品質ゲート](/projects/kamae-rs/quality-gates/) を見てください。

既存コードへ段階的に入れるなら [段階的導入](/projects/kamae-rs/adoption/) から入り、触った境界を先に締めてから上のパスへ合流します。PIIと観測だけなら [PII 保護](/projects/kamae-rs/pii-protection/) と [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) で足ります。

配線やDIは [アプリケーション配線](/projects/kamae-rs/application-wiring/)、集約のトランザクション境界は [集約とトランザクション境界](/projects/kamae-rs/aggregate-transactions/) です。サービス間契約は [サービス境界](/projects/kamae-rs/service-boundaries/)、ストリームは [ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/)、マクロは [ドメインマクロ](/projects/kamae-rs/domain-macros/)、`unsafe` は [unsafe 境界](/projects/kamae-rs/unsafe-boundaries/) へ。テストまわりは [テストデータ](/projects/kamae-rs/test-data/)、[プロパティベーステスト](/projects/kamae-rs/property-based-tests/)、アサーション強度は [ミューテーションテスト](/projects/kamae-rs/mutation-testing/) です。公開APIのrustdocは [公開 API のドキュメント](/projects/kamae-rs/rustdoc/)、フォーマットは [フォーマットと lint](/projects/kamae-rs/fmt-lint/) へ。ローカルとCIは [開発環境](/projects/kamae-rs/dev-environment/)、[ローカル検証セットアップ](/projects/kamae-rs/local-validation/)、[CI セットアップ](/projects/kamae-rs/ci-setup/) です。スキル本体の開発は [スキルリポジトリの開発](/projects/kamae-rs/development-setup/) へ。

## 依存クレートを調べる

`Cargo.toml` に応じて、必要なときだけ [クレートガイド](/projects/kamae-rs/crate-guides/) を参照してください。エラー処理は `thiserror` / `anyhow`、シリアライズは `serde`、検証やnewtypeは `validator` / `garde` / `nutype` が中心です。シークレットは `secrecy`、観測は `tracing` / `metrics`、テストは `proptest` のガイドがあります。
