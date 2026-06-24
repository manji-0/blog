---
title: "Kamae Rust ガイド"
sidebar:
  order: 1
  label: "ガイド"
---

このガイドは薄いディスパッチャとして使います。現在のタスクに関係するトピックとクレートガイドだけを読んでください。

## ステップ 0: 適用ルールの読み込み

他のステップの前に、優先順位の高い順に一致するルールファイルを確認します:

1. プロジェクトルートの `.claude/rules/*.md` と `.codex/rules/*.md`
2. リポジトリ同梱の `rules/defaults/*.md`（プラグイン既定）

各ルールについて:

- YAML frontmatter を読む。`applies-to` が `kamae-rs` または `*` でないものはスキップする。
- `name` でグループ化する。上位の階層が下位より優先され、同一階層内ではファイル名の辞書順で最後のものが勝つ。
- 残った `library-preference`、`convention`、`override` ルールをタスク全体で適用する。

ルールの書き方とチェック ID の一覧は [`rules.md`](/docs/kamae/rust/rules/) を参照してください。

## ステップ 1: Rust コンテキストの把握

編集対象ファイルに関係する `Cargo.toml` とワークスペースメンバーを読みます。次の依存があればメモします。ガイド付きクレートは必要なときだけガイドを読み込みます。検出のみのクレートはローカル慣習の参考になりますが、ガイドは必須ではありません。

- エラー: `thiserror`、`anyhow`、`eyre`；検出のみ: `snafu`
- 境界 / シリアライズ: `serde`；検出のみ: `serde_json`、`toml`、`config`
- 検証 / newtype: `validator`、`garde`、`nutype`；検出のみ: `derive_more`
- PII / シークレット: `secrecy`；検出のみ: `zeroize`
- ログ / トレース / メトリクス: `tracing`、`log`、`metrics`；監視エクスポート基盤: `opentelemetry`；任意の pull エクスポータ: `prometheus`
- 検出のみの永続化: `sqlx`、`diesel`、`sea-orm`
- 検出のみの async: `tokio`、`async-trait`、`futures`、`tokio-stream`、`async-stream`
- 検出のみの RPC / メッセージング: `tonic`、`prost`、`lapin`、`rdkafka`
- 検出のみの耐障害: `tower`、`governor`
- 検出のみのテスト: `proptest`、`quickcheck`、`proptest-regressions`、`trybuild`

依存が関係する場合は、[`references/crate-guides/`](/docs/kamae/rust/references/crate-guides/) 配下の対応ファイルを読み込みます。クレートガイドはクレート固有の既定のみを扱います。完全なパターンは `references/` 配下の対応トピックガイドを優先してください。一致するクレートガイドがなければ、新しい依存を入れる前に標準ライブラリの Rust イディオムを使います。

## ステップ 2: トピックガイドの読み込み

タスクに必要なトピックファイルだけを読みます。一部のトピックファイルは先頭に `constrained-by` HTML コメントがあり、主要トピックを適用するときは関連ガイドも読み込みます。

- アプリケーション配線: [`references/application-wiring.md`](/docs/kamae/rust/references/application-wiring/)
- 集約とトランザクション: [`references/aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/)
- 段階的導入: [`references/adoption.md`](/docs/kamae/rust/references/adoption/)
- ドメインモデリング: [`references/domain-modeling.md`](/docs/kamae/rust/references/domain-modeling/)
- 状態遷移: [`references/state-transitions.md`](/docs/kamae/rust/references/state-transitions/)
- エラーハンドリング: [`references/error-handling.md`](/docs/kamae/rust/references/error-handling/)
- 境界防御: [`references/boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/)
- PII 保護: [`references/pii-protection.md`](/docs/kamae/rust/references/pii-protection/)
- ログとメトリクス: [`references/logging-metrics.md`](/docs/kamae/rust/references/logging-metrics/)
- unsafe 境界: [`references/unsafe-boundaries.md`](/docs/kamae/rust/references/unsafe-boundaries/)
- フォーマットと lint: [`references/fmt-lint.md`](/docs/kamae/rust/references/fmt-lint/)
- 品質ゲート: [`references/quality-gates.md`](/docs/kamae/rust/references/quality-gates/)
- rustdoc 契約: [`references/rustdoc.md`](/docs/kamae/rust/references/rustdoc/)
- CI 設定: [`references/ci-setup.md`](/docs/kamae/rust/references/ci-setup/)
- ローカル検証設定: [`references/local-validation.md`](/docs/kamae/rust/references/local-validation/)
- 開発環境: [`references/dev-environment.md`](/docs/kamae/rust/references/dev-environment/)
- スキルリポジトリ設定: [`references/development-setup.md`](/docs/kamae/rust/references/development-setup/)
- 永続化とイベント: [`references/persistence-events.md`](/docs/kamae/rust/references/persistence-events/)
- ストリームと継続クエリ: [`references/stream-continuous-queries.md`](/docs/kamae/rust/references/stream-continuous-queries/)
- ドメインマクロ: [`references/domain-macros.md`](/docs/kamae/rust/references/domain-macros/)
- サービス境界: [`references/service-boundaries.md`](/docs/kamae/rust/references/service-boundaries/)
- テストデータ: [`references/test-data.md`](/docs/kamae/rust/references/test-data/)
- プロパティベーステスト: [`references/property-based-tests.md`](/docs/kamae/rust/references/property-based-tests/)

## 基本スタンス

実用的な範囲で、無効な状態と無効な遷移を型システムから排除します:

- 列挙型、構造体、newtype、プライベートフィールド、`TryFrom` / `FromStr` コンストラクタを使う。
- ドメインおよびユースケースコードでは、ドメイン固有のエラー列挙型と `Result<T, E>` を使う。
- ドメインコードでは `panic!`、`unwrap()`、`expect()` を避ける。
- 外部データはまず DTO にパースし、その後 DTO からドメイン型へ変換する。
- プロジェクトに明示的な慣習がない限り、永続化モデル、API DTO、ドメインモデルは分離する。
- デフォルトではドメインロジックから `unsafe` を排除する。FFI、メモリレイアウト、計測済みの低レベル性能が必要なときは、文書化された安全性不変条件を持つ小さな安全 API の背後に隠す。
- 触った Rust コードでは `rustfmt` と `clippy` をクリーンに保つ。lint 抑制は狭い範囲と理由が必要な設計判断として扱う。
- 公開ドメイン API は rustdoc で不変条件、エラー、状態遷移、例、および該当する場合は安全性契約を明記する。
- CI をレビュアが依存するチェックと揃える: フォーマット、lint、テスト、rustdoc、および任意の unsafe / セキュリティプローブ。

これらは強い既定であり、絶対ではありません。既存のプロジェクト慣習と矛盾する場合は慣習に従い、ドメイン安全性に影響する逸脱があるときは簡潔に説明を残してください。

## 例

具体的な状態遷移の例がタスクの理解を助けるときだけ、[`examples/taxi-request.md`](/docs/kamae/rust/examples/taxi-request/) を読んでください。例は意図的に rustdoc を省略しています。本番の公開 API では [`references/rustdoc.md`](/docs/kamae/rust/references/rustdoc/) に従ってください。
