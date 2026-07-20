---
title: "はじめに"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

Kamae Rustは、サーバーサイドのドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。[kamae-ts](https://github.com/iwasa-kosui/kamae-ts) のRust向け兄弟で、同じ思想を列挙型・newtype・`TryFrom`・`Result` といったRustのイディオムに落としています。

守りたいのは、文字列のまま混ざるドメイン概念、`status` とOptionalで表せてしまう無効状態、想定内失敗での `unwrap` / `panic!`、API JSONやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化、といったあたりです。全部を通読する必要はなく、いま触っているトピックだけ開けば足ります。各ページ末尾の **レビュー観点** は、そのトピックのレビュー用チェックです。

強い既定であって絶対ではありません。既存の慣習とぶつかったら慣習を優先し、ドメイン安全性に効く逸脱だけ短く残してください。

## どこから読むか

新規ドメインなら [ドメインモデリング](/projects/kamae-rs/domain-modeling/) → [状態遷移](/projects/kamae-rs/state-transitions/) → [境界防御](/projects/kamae-rs/boundary-defense/) と [エラーハンドリング](/projects/kamae-rs/error-handling/) → [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) の順が素直です。一通りの流れは [タクシー配車の例](/projects/kamae-rs/examples/taxi-request/) で追えます。仕上げ前に [品質ゲート](/projects/kamae-rs/quality-gates/) を見てください。

既存コードへ段階的に入れるなら [段階的導入](/projects/kamae-rs/adoption/) から入り、触った境界を先に締めてから上のパスへ合流します。PIIと観測だけなら [PII 保護](/projects/kamae-rs/pii-protection/) と [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) で足ります。

配線やDIは [アプリケーション配線](/projects/kamae-rs/application-wiring/)、サービス間契約は [サービス境界](/projects/kamae-rs/service-boundaries/)、ストリームは [ストリームと継続クエリ](/projects/kamae-rs/stream-continuous-queries/)、マクロは [ドメインマクロ](/projects/kamae-rs/domain-macros/)、`unsafe` は [unsafe 境界](/projects/kamae-rs/unsafe-boundaries/) です。テストまわりは [テストデータ](/projects/kamae-rs/test-data/) と [プロパティベーステスト](/projects/kamae-rs/property-based-tests/)、公開APIのrustdocは [公開 API のドキュメント](/projects/kamae-rs/rustdoc/)、ローカルとCIは [開発環境](/projects/kamae-rs/dev-environment/) と [CI セットアップ](/projects/kamae-rs/ci-setup/) へ。スキル本体の開発は [スキルリポジトリの開発](/projects/kamae-rs/development-setup/) です。

## 依存クレート

`Cargo.toml` に応じて、必要なときだけ [クレートガイド](/projects/kamae-rs/crate-guides/) を見てください。エラーは `thiserror` / `anyhow`、シリアライズは `serde`、検証やnewtypeは `validator` / `garde` / `nutype`、シークレットは `secrecy`、観測は `tracing` / `metrics`、テストは `proptest` あたりがガイド付きです。
