---
title: "Kamae Rust"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

Kamae Rust は、サーバーサイドのドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。[kamae-ts](https://github.com/iwasa-kosui/kamae-ts) の Rust 向け兄弟プロジェクトで、同じ思想を Rust のイディオムに落とし込んでいます。

すべてのリファレンスを通読する必要はありません。今のタスクに関係するトピックだけを開いてください。各リファレンス末尾の **レビュー観点** に、そのトピックのコードレビューで確認すべき項目があります。

## 何を目指すか

Kamae が守りたいのは、次のような失敗です。

- 文字列や数値のまま混在するドメイン概念
- `status` フィールドとオプショナル列で表せてしまう無効な状態
- `unwrap` や `panic!` に頼る想定内の失敗処理
- API JSON や DB 行をそのままドメイン型として使う境界の曖昧さ
- ログ・メトリクス・エラーへの PII 漏洩
- 状態変更とドメインイベントの非アトミックな永続化

Rust では、列挙型・newtype・プライベートフィールド・`TryFrom` といった型機能で、実用的な範囲でこれらをコンパイル時または構築時に弾きます。

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

これらは強い既定であり、絶対ではありません。既存のプロジェクト慣習と矛盾する場合は慣習に従い、ドメイン安全性に影響する逸脱は短い説明を残してください。

## 状況別の読み方

### 新規ドメインを設計するとき

1. [ドメインモデリング](/docs/kamae/rust/references/domain-modeling/)
2. [状態遷移](/docs/kamae/rust/references/state-transitions/)
3. [境界防御](/docs/kamae/rust/references/boundary-defense/) と [エラーハンドリング](/docs/kamae/rust/references/error-handling/)
4. [集約とトランザクション](/docs/kamae/rust/references/aggregate-transactions/) と [永続化とイベント](/docs/kamae/rust/references/persistence-events/)
5. [タクシー配車例](/docs/kamae/rust/examples/taxi-request/)
6. 仕上げ前に [品質ゲート](/docs/kamae/rust/references/quality-gates/)

### 既存コードベースへ段階的に導入するとき

1. [段階的導入](/docs/kamae/rust/references/adoption/)
2. [境界防御](/docs/kamae/rust/references/boundary-defense/)
3. 移行したワークフローごとに、上記「新規ドメイン」のパスを続ける

### オブザーバビリティと PII だけ見るとき

1. [PII 保護](/docs/kamae/rust/references/pii-protection/)
2. [ログとメトリクス](/docs/kamae/rust/references/logging-metrics/)

### インフラ・開発環境の整備

| 関心 | リファレンス |
| --- | --- |
| ユースケース配線、DI | [アプリケーション配線](/docs/kamae/rust/references/application-wiring/) |
| サービス間契約、gRPC | [サービス境界](/docs/kamae/rust/references/service-boundaries/) |
| ストリーム、継続クエリ | [ストリームと継続クエリ](/docs/kamae/rust/references/stream-continuous-queries/) |
| マクロ、derive | [ドメインマクロ](/docs/kamae/rust/references/domain-macros/) |
| `unsafe`、FFI | [unsafe 境界](/docs/kamae/rust/references/unsafe-boundaries/) |
| テスト、フィクスチャ | [テストデータ](/docs/kamae/rust/references/test-data/) |
| プロパティベーステスト | [プロパティベーステスト](/docs/kamae/rust/references/property-based-tests/) |
| フォーマット、lint | [フォーマットと lint](/docs/kamae/rust/references/fmt-lint/) |
| rustdoc | [rustdoc 契約](/docs/kamae/rust/references/rustdoc/) |
| ローカル開発 | [開発環境](/docs/kamae/rust/references/dev-environment/) |
| CI | [CI 設定](/docs/kamae/rust/references/ci-setup/) |

## 依存クレート

プロジェクトの `Cargo.toml` に応じて、必要なときだけ [クレートガイド](/docs/kamae/rust/references/crate-guides/thiserror/) を参照してください。

| 用途 | ガイド付きクレート | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エラー | `thiserror`、`anyhow`、`eyre` | `snafu` |
| シリアライズ | `serde` | `serde_json`、`toml`、`config` |
| 検証 / newtype | `validator`、`garde`、`nutype` | `derive_more` |
| PII / シークレット | `secrecy` | `zeroize` |
| ログ / トレース | `tracing`、`log`、`metrics` | `opentelemetry`、`prometheus` |
| テスト | `proptest` | `quickcheck`、`trybuild` |

## リファレンス一覧

- [アプリケーション配線](/docs/kamae/rust/references/application-wiring/)
- [集約とトランザクション](/docs/kamae/rust/references/aggregate-transactions/)
- [段階的導入](/docs/kamae/rust/references/adoption/)
- [ドメインモデリング](/docs/kamae/rust/references/domain-modeling/)
- [状態遷移](/docs/kamae/rust/references/state-transitions/)
- [エラーハンドリング](/docs/kamae/rust/references/error-handling/)
- [境界防御](/docs/kamae/rust/references/boundary-defense/)
- [PII 保護](/docs/kamae/rust/references/pii-protection/)
- [ログとメトリクス](/docs/kamae/rust/references/logging-metrics/)
- [unsafe 境界](/docs/kamae/rust/references/unsafe-boundaries/)
- [フォーマットと lint](/docs/kamae/rust/references/fmt-lint/)
- [品質ゲート](/docs/kamae/rust/references/quality-gates/)
- [rustdoc 契約](/docs/kamae/rust/references/rustdoc/)
- [CI 設定](/docs/kamae/rust/references/ci-setup/)
- [ローカル検証設定](/docs/kamae/rust/references/local-validation/)
- [開発環境](/docs/kamae/rust/references/dev-environment/)
- [永続化とイベント](/docs/kamae/rust/references/persistence-events/)
- [ストリームと継続クエリ](/docs/kamae/rust/references/stream-continuous-queries/)
- [ドメインマクロ](/docs/kamae/rust/references/domain-macros/)
- [サービス境界](/docs/kamae/rust/references/service-boundaries/)
- [テストデータ](/docs/kamae/rust/references/test-data/)
- [プロパティベーステスト](/docs/kamae/rust/references/property-based-tests/)

## 実践例

[タクシー配車例](/docs/kamae/rust/examples/taxi-request/) で、状態遷移とドメインイベントの流れを一通り追えます。
