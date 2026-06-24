---
title: "はじめに"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

Kamae Rust は、サーバーサイドのドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集である。[kamae-ts](https://github.com/iwasa-kosui/kamae-ts) の Rust 向け兄弟プロジェクトで、同じ思想を Rust のイディオムに落とし込んでいる。

すべてのリファレンスを通読する必要はない。今のタスクに関係するトピックだけを開けばよい。各リファレンス末尾の **レビュー観点** に、そのトピックのコードレビューで確認すべき項目がある。

## 何を目指すか

Kamae が守りたいのは、次のような失敗である。

- 文字列や数値のまま混在するドメイン概念
- `status` フィールドとオプショナル列で表せてしまう無効な状態
- `unwrap` や `panic!` に頼る想定内の失敗処理
- API JSON や DB 行をそのままドメイン型として使う境界の曖昧さ
- ログ・メトリクス・エラーへの PII 漏洩
- 状態変更とドメインイベントの非アトミックな永続化

Rust では、列挙型・newtype・プライベートフィールド・`TryFrom` といった型機能で、実用的な範囲でこれらをコンパイル時または構築時に弾く。

## コア原則

- **意味を型で表す** — 列挙型、構造体、newtype、検証付きコンストラクタでドメイン概念をモデル化する。
- **無効な遷移を型で封じる** — ソース状態ごとに遷移メソッドや型を分け、網羅的な `match` で分岐を閉じる。
- **`Result` で失敗を明示する** — ドメイン固有のエラー列挙型とともに `Result<T, E>` を使い、ドメインコードでは `panic!`・`unwrap()`・`expect()` を避ける。
- **境界で一度パースする** — 外部データは DTO / 行 / 設定構造体に入れてから `TryFrom` でドメイン型へ変換する。
- **ユースケースは小さく配線する** — ポート（トレイト）経由で依存を受け取り、アダプタはコンポジションルートで注入する。
- **集約の変更はトランザクション内に** — 実用的な範囲で、ユースケースごとに集約の変更を 1 つのトランザクション境界に収める。
- **PII とシークレットは内側に** — マスキング用ラッパーの内側に置き、観測経路ではデフォルトでマスクする。
- **`unsafe` は境界に閉じる** — ドメインロジックからは排除し、必要なら文書化された安全性不変条件を持つ小さな安全 API の背後に隠す。
- **品質ゲートを揃える** — `rustfmt`・`clippy`・テスト・rustdoc をクリーンに保ち、CI をレビュー前提と一致させる。

これらは強い既定であり、絶対ではない。既存のプロジェクト慣習と矛盾する場合は慣習に従い、ドメイン安全性に影響する逸脱は短い説明を残す。

## 状況別の読み方

### 新規ドメインを設計するとき

1. [ドメインモデリング](/docs/kamae-rs/domain-modeling/)
2. [状態遷移](/docs/kamae-rs/state-transitions/)
3. [境界防御](/docs/kamae-rs/boundary-defense/) と [エラーハンドリング](/docs/kamae-rs/error-handling/)
4. [永続化、集約、イベント](/docs/kamae-rs/persistence-events/)
5. [タクシー配車の例](/docs/kamae-rs/examples/taxi-request/)
6. 仕上げ前に [品質ゲート](/docs/kamae-rs/quality-gates/)

### 既存コードベースへ段階的に導入するとき

1. [段階的導入](/docs/kamae-rs/adoption/)
2. [境界防御](/docs/kamae-rs/boundary-defense/)
3. 移行したワークフローごとに、上記「新規ドメイン」のパスを続ける

### オブザーバビリティと PII だけ見るとき

1. [PII 保護](/docs/kamae-rs/pii-protection/)
2. [ロギングとメトリクス](/docs/kamae-rs/logging-metrics/)

### インフラ・開発環境の整備

| 関心 | リファレンス |
| --- | --- |
| ユースケース配線、DI | [アプリケーション配線](/docs/kamae-rs/application-wiring/) |
| サービス間契約、gRPC | [サービス境界](/docs/kamae-rs/service-boundaries/) |
| ストリーム、継続クエリ | [ストリームと継続クエリ](/docs/kamae-rs/stream-continuous-queries/) |
| マクロ、derive | [ドメインマクロ](/docs/kamae-rs/domain-macros/) |
| `unsafe`、FFI | [unsafe 境界](/docs/kamae-rs/unsafe-boundaries/) |
| テスト、フィクスチャ | [テストデータ](/docs/kamae-rs/test-data/) |
| プロパティベーステスト | [プロパティベーステスト](/docs/kamae-rs/property-based-tests/) |
| フォーマット、lint、品質ゲート | [品質ゲート](/docs/kamae-rs/quality-gates/) |
| 公開 API の rustdoc | [公開 API のドキュメント](/docs/kamae-rs/rustdoc/) |
| ローカル開発・ブートストラップ | [開発環境](/docs/kamae-rs/dev-environment/) |
| スキルリポジトリの開発 | [スキルリポジトリの開発](/docs/kamae-rs/development-setup/) |
| CI | [CI セットアップ](/docs/kamae-rs/ci-setup/) |

## 依存クレート

プロジェクトの `Cargo.toml` に応じて、必要なときだけ [クレートガイド](/docs/kamae-rs/crate-guides/) を参照する。

| 用途 | ガイド付きクレート | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エラー | `thiserror`、`anyhow`、`eyre` | `snafu` |
| シリアライズ | `serde` | `serde_json`、`toml`、`config` |
| 検証 / newtype | `validator`、`garde`、`nutype` | `derive_more` |
| PII / シークレット | `secrecy` | `zeroize` |
| ログ / トレース | `tracing`、`log`、`metrics` | `opentelemetry`、`prometheus` |
| テスト | `proptest` | `quickcheck`、`trybuild` |

## リファレンス一覧

- [アプリケーション配線](/docs/kamae-rs/application-wiring/)
- [段階的導入](/docs/kamae-rs/adoption/)
- [ドメインモデリング](/docs/kamae-rs/domain-modeling/)
- [状態遷移](/docs/kamae-rs/state-transitions/)
- [エラーハンドリング](/docs/kamae-rs/error-handling/)
- [境界防御](/docs/kamae-rs/boundary-defense/)
- [PII 保護](/docs/kamae-rs/pii-protection/)
- [ロギングとメトリクス](/docs/kamae-rs/logging-metrics/)
- [unsafe 境界](/docs/kamae-rs/unsafe-boundaries/)
- [品質ゲート](/docs/kamae-rs/quality-gates/)
- [公開 API のドキュメント](/docs/kamae-rs/rustdoc/)
- [CI セットアップ](/docs/kamae-rs/ci-setup/)
- [開発環境](/docs/kamae-rs/dev-environment/)
- [スキルリポジトリの開発](/docs/kamae-rs/development-setup/)
- [永続化、集約、イベント](/docs/kamae-rs/persistence-events/)
- [ストリームと継続クエリ](/docs/kamae-rs/stream-continuous-queries/)
- [ドメインマクロ](/docs/kamae-rs/domain-macros/)
- [サービス境界](/docs/kamae-rs/service-boundaries/)
- [テストデータ](/docs/kamae-rs/test-data/)
- [プロパティベーステスト](/docs/kamae-rs/property-based-tests/)

## 実践例

[タクシー配車の例](/docs/kamae-rs/examples/taxi-request/) で、状態遷移とドメインイベントの流れを一通り追える。
