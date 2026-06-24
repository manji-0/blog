---
title: "Kamae Rust レビュー"
sidebar:
  order: 3
  label: "レビュー"
---

[`guide.md`](/docs/kamae/rust/guide/) のナレッジベースに照らして Rust コードをレビューします。スタイルより、バグ、無効な状態、データ漏洩、テスト不足を優先してください。

## ステップ 0: 適用ルールの読み込み

優先度の高い順に一致するルールファイルを確認します:

1. プロジェクトルートの `.claude/rules/*.md` と `.codex/rules/*.md`
2. リポジトリ同梱の `rules/defaults/*.md`（プラグイン既定）

`applies-to` が `kamae-rs-review` または `*` でないルールはスキップします。`check-toggle` で `enabled: false` のチェックは無効化されます。`convention` ルールはレビュー期待値を変更します。詳細は [`rules.md`](/docs/kamae/rust/rules/) を参照してください。

## レビュー手順

1. [`guide.md`](/docs/kamae/rust/guide/) を読む。
2. `Cargo.toml` と、[`references/crate-guides/`](/docs/kamae/rust/references/crate-guides/) 配下の関連クレートガイドを読む。
3. 利用可能なら、リポジトリルートから `cargo run -p kamae-review-probe -- <変更された Rust パス>` を実行する（アプリケーションクレートでは `--manifest-path path/to/kamae-rs/Cargo.toml`）。出力は所見ではなくレビューの手がかりとして扱う。
4. レビュー対象の Rust ファイルを読む。
5. チェックリストの範囲を選ぶ:
   - フルな敵対的レビュー: 下記のチェックリストをすべて順にたどる。
   - 小さな / 局所的な差分: ルーティングマトリクスに一致するチェックリストファイルのみを読み込み、挙動が変わるときは `tests.md` も含める。
6. 所見を重要度順に先に報告する。`path:line`、リスク、原則参照、根拠、具体的な修正案を含める。

所見の例:

```text
High — src/application/assign_driver.rs:42
Principle: error-handling §Avoid Panics in Domain Code
Evidence: `waiting.unwrap()` after `find_waiting` returns `Option`; a missing row panics in production.
Fix: use `.ok_or(AssignDriverError::RequestNotFound { request_id })?` instead.
```

## ドキュメントマップ

チェックリスト項目番号（`N.M`）は下記のチェックリスト順序と一致します。各チェックリストは [`references/`](/docs/kamae/rust/references/) 配下のトピックガイドへリンクします。

| # | チェックリスト | トピックガイド |
| --- | --- | --- |
| 1 | `domain-modeling.md` | `domain-modeling.md` |
| 2 | `state-transitions.md` | `state-transitions.md` |
| 3 | `error-handling.md` | `error-handling.md` |
| 4 | `boundary.md` | `boundary-defense.md` |
| 5 | `pii-protection.md` | `pii-protection.md` |
| 6 | `logging-metrics.md` | `logging-metrics.md` |
| 7 | `unsafe-boundaries.md` | `unsafe-boundaries.md` |
| 8 | `fmt-lint.md` | `fmt-lint.md` |
| 9 | `rustdoc.md` | `rustdoc.md` |
| 10 | `ci-setup.md` | `ci-setup.md` |
| 11 | `dev-environment.md` | `dev-environment.md` |
| 12 | `persistence-events.md` | `persistence-events.md` |
| 13 | `stream-continuous-queries.md` | `stream-continuous-queries.md` |
| 14 | `domain-macros.md` | `domain-macros.md` |
| 15 | `service-boundaries.md` | `service-boundaries.md` |
| 16 | `property-based-tests.md` | `property-based-tests.md` |
| 17 | `application-wiring.md` | `application-wiring.md` |
| 18 | `aggregate-transactions.md` | `aggregate-transactions.md` |
| 19 | `tests.md` | `test-data.md`、`property-based-tests.md` |

## レビュープローブ

任意のプローブ [`kamae-review-probe`](https://github.com/manji-0/kamae-rs/tree/main/crates/review-probe) は `syn` で Rust ファイルをパースし、Kamae チェックリストへよくルーティングされるパターンを収集します: unsafe 境界、lint 抑制、パニック、serde / 行 derive、PII 用語、永続化 / イベントコード、async の運用リスク、rustdoc 契約の欠落。

プローブ出力は検査対象の選定にのみ使います。到達可能な不変条件違反、漏洩、健全性リスク、プロジェクト方針違反をコードで確認するまで、所見として報告しないでください。

## レビュールーティングマトリクス

| 差分のシグナル | 読み込むチェックリスト |
| --- | --- |
| 新規 / 変更されたドメイン型、値オブジェクト、列挙型、コンストラクタ、ミューテータ、金額 / 時間 / 単位フィールド | `domain-modeling.md`、`state-transitions.md`、`tests.md` |
| 状態機械の遷移、ライフサイクル / ステータス変更、楽観的ロック、コマンドハンドラ | `state-transitions.md`、`aggregate-transactions.md`、`persistence-events.md`、`tests.md` |
| `Result`、エラー列挙型、パニック、`unwrap` / `expect`、インフラエラーのマッピング | `error-handling.md`、`tests.md` |
| `async fn` ユースケース、`.await?`、ポート呼び出し、`try_join`、await をまたぐロック使用 | `error-handling.md`、`application-wiring.md`、`tests.md` |
| ユースケース構造体、ハンドラ配線、リポジトリトレイト、アダプタ注入 | `application-wiring.md`、`persistence-events.md`、`tests.md` |
| HTTP / キュー / CLI / 設定 / DB 入力、DTO、serde derive / 既定値、行マッピング | `boundary.md`、`domain-modeling.md`、`tests.md` |
| PII / シークレット / トークン、ログ、トレース、メトリクス、エラー、`Debug` / `Display` | `pii-protection.md`、`logging-metrics.md`、`tests.md` |
| `unsafe`、`unsafe fn`、`unsafe impl`、FFI、生ポインタ、`MaybeUninit`、`transmute`、安全ラッパ | `unsafe-boundaries.md`、`boundary.md`、`tests.md` |
| `rustfmt`、`clippy`、lint 設定、`#[allow]`、警告、CI 品質ゲート | `fmt-lint.md`、近傍の関心チェックリスト、`tests.md` |
| rustdoc、公開 API ドキュメント、`# Errors`、`# Panics`、`# Safety`、doctest、ドキュメント内リンク | `rustdoc.md`、近傍の関心チェックリスト、`tests.md` |
| CI ワークフロー、必須チェック、GitHub Actions、cargo fmt / clippy / test / doc ジョブ、参考チェック | `ci-setup.md`、`fmt-lint.md`、`tests.md` |
| 開発環境、クレート構成、フェイクポート、ローカルテストループ、docker-compose、`.env.example` | `dev-environment.md`、`application-wiring.md`、`tests.md` |
| リポジトリ、トランザクション、DB 制約、アウトボックス / イベント、リトライ / 冪等性 | `persistence-events.md`、`aggregate-transactions.md`、`state-transitions.md`、`tests.md` |
| `Stream`、プロジェクション、アウトボックスポーリング、継続クエリ、イベント購読 | `stream-continuous-queries.md`、`persistence-events.md`、`service-boundaries.md`、`tests.md` |
| proc-macro、derive マクロ、`macro_rules!`、生成 newtype / イベント impl | `domain-macros.md`、`domain-modeling.md`、`boundary.md`、`tests.md` |
| gRPC / Protobuf、tonic / prost、メッセージキュー、サービス間契約 | `service-boundaries.md`、`boundary.md`、`persistence-events.md`、`tests.md` |
| `#[source]`、`#[from]`、エラーチェーンのログ、重複エラーログ | `error-handling.md`、`logging-metrics.md`、`tests.md` |
| `proptest`、`quickcheck`、`proptest!`、カスタム戦略、プロパティ回帰 | `property-based-tests.md`、`tests.md`、近傍のドメインチェックリスト |
| テスト専用ヘルパ、ビルダー、フィクスチャ、コンパイル失敗カバレッジ | `tests.md` |

差分が複数の関心にまたがるときは近傍のチェックリストも使います。汎用アドバイスを繰り返すだけのために無関係なファイルを読み込まないでください。

## チェックリスト順序

- [`checklist/domain-modeling.md`](/docs/kamae/rust/review/checklist/domain-modeling/)
- [`checklist/state-transitions.md`](/docs/kamae/rust/review/checklist/state-transitions/)
- [`checklist/error-handling.md`](/docs/kamae/rust/review/checklist/error-handling/)
- [`checklist/boundary.md`](/docs/kamae/rust/review/checklist/boundary/)
- [`checklist/pii-protection.md`](/docs/kamae/rust/review/checklist/pii-protection/)
- [`checklist/logging-metrics.md`](/docs/kamae/rust/review/checklist/logging-metrics/)
- [`checklist/unsafe-boundaries.md`](/docs/kamae/rust/review/checklist/unsafe-boundaries/)
- [`checklist/fmt-lint.md`](/docs/kamae/rust/review/checklist/fmt-lint/)
- [`checklist/rustdoc.md`](/docs/kamae/rust/review/checklist/rustdoc/)
- [`checklist/ci-setup.md`](/docs/kamae/rust/review/checklist/ci-setup/)
- [`checklist/dev-environment.md`](/docs/kamae/rust/review/checklist/dev-environment/)
- [`checklist/persistence-events.md`](/docs/kamae/rust/review/checklist/persistence-events/)
- [`checklist/stream-continuous-queries.md`](/docs/kamae/rust/review/checklist/stream-continuous-queries/)
- [`checklist/domain-macros.md`](/docs/kamae/rust/review/checklist/domain-macros/)
- [`checklist/service-boundaries.md`](/docs/kamae/rust/review/checklist/service-boundaries/)
- [`checklist/property-based-tests.md`](/docs/kamae/rust/review/checklist/property-based-tests/)
- [`checklist/application-wiring.md`](/docs/kamae/rust/review/checklist/application-wiring/)
- [`checklist/aggregate-transactions.md`](/docs/kamae/rust/review/checklist/aggregate-transactions/)
- [`checklist/tests.md`](/docs/kamae/rust/review/checklist/tests/)

## 重要度クラス

- High: 実行時障害の可能性、許容されうる不可能な状態、未検証の外部データ、または PII 漏洩。
- Medium: 弱いドメイン契約、非網羅的なエラー / 状態処理、永続化の一貫性リスク。
- Low: 保守性、イディオム、または正確性を直ちに損なわないテスト品質の問題。

次の領域に触れる差分はエスカレートしてください: 外部境界、認可 / テナント分離、金額、不可逆なライフサイクル遷移、永続化 / イベントの原子性、シークレット、unsafe の健全性、FFI、誤解を招く公開 API ドキュメント、壊れたドメインコードのマージを許す CI ゲート、正確性リスクを隠す lint 抑制、本番の可観測性。次の場合は格下げしてください: コンパイル時に封じ込められるリスク、テストのみ、起動時のみ、信頼できるアダプタ内部、生成コード、非公開ヘルパのドキュメント、参考 CI、またはフラグ行から見えない近傍の不変条件でブロックされている。現実的な呼び出し元が悪い状態や漏洩に到達できる根拠なしに所見を報告しないでください。

必須の根拠:

- 臭いだけでなく、迂回経路または欠落したガードを示す。
- 破られている不変条件またはドメインルールを名指しする。
- 既存のコンストラクタ、バリデータ、DB 制約、認可チェック、テストがすでにカバーしているか確認する。
- 推測的なスタイル指摘より「問題なし」を優先する。

問題が見つからなければ、明確にそう述べ、残存リスクやテストのギャップに触れてください。
