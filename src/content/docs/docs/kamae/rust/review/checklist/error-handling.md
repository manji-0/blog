---
title: "エラーハンドリング チェックリスト"
sidebar:
  order: 5
  label: "エラーハンドリング"
---

参照: [`error-handling.md`](/docs/kamae/rust/references/error-handling/)

## 3.1 ドメインとユースケースコードでパニックは避けているか — High

テスト、フィクスチャ、起動コード、真に到達不能な分岐以外での `panic!`、`todo!`、`unimplemented!`、`unwrap()`、`expect()` をフラグする。

起動 / 設定のフェイルファストパニック、テスト / フィクスチャのパニック、マイグレーションアサーション、同一式で既に証明された不変条件を守る `expect` メッセージにはフラグを立てない。

## 3.2 ドメインエラーは具体的な列挙型か — Medium

ドメインコンストラクタやユースケースから `anyhow::Result`、`eyre::Result`、`Box<dyn Error>`、`String`、不透明な catch-all エラーを返す箇所をフラグする。

## 3.3 インフラエラーは意図的に変換されているか — Medium

`sqlx::Error`、`diesel::result::Error`、HTTP クライアントエラー、設定エラーを公開ドメイン / ユースケース API へそのまま漏らす箇所をフラグする。

## 3.4 async ユースケースは正しく層分けされているか — Medium

[`error-handling.md`](/docs/kamae/rust/references/error-handling/) も照合する。I/O を行う async ドメイン遷移、`Result<impl Future<...>, E>` 型 API、マッピングなしに `async fn` 境界を通過するインフラエラー型をフラグする。

## 3.5 ロックは await 点をまたいで保持されていないか — High

プロジェクトが明示的に設計していない限り、ユースケースやアダプタで mutex ガード、DB 行ロック、その他の排他リソースを `.await` をまたいで保持する箇所をフラグする。

## 3.6 エラーバリアントは呼び出し元にとって意味があるか — Low

呼び出し元が網羅的に分岐する必要があるのに `Other(String)` や `InvalidInput(String)` のような曖昧なバリアントをフラグする。

## 3.7 エラーは `#[source]` / `#[from]` でチェーンされているか — Medium

[`error-handling.md`](/docs/kamae/rust/references/error-handling/) も照合する。内部失敗を `format!` で文字列化し、`thiserror` のソースチェーンを失うユースケースエラーをフラグする。

## 3.8 エラーメッセージは PII とシークレットを避けているか — High

[`pii-protection.md`](/docs/kamae/rust/references/pii-protection/) も照合する。メール、電話、トークン、生の SQL / HTTP ボディを埋め込むエラーの `Display` テキストをフラグする。
