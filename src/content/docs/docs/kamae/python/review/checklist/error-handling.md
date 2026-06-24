---
title: "エラーハンドリング チェックリスト"
sidebar:
  order: 5
  label: "エラーハンドリング"
---

リファレンス: [`error-handling.md`](/docs/kamae/python/references/error-handling/)。

## 3.1 ビジネス失敗は隠れた例外ではなく明示的か — High

プロジェクトが明示的ドメインエラー列挙や Result 値を使うとき、広い `except Exception`、飲み込まれた失敗、ユースケース API を通るインフラ例外を指摘する。

フレームワーク境界、起動/設定失敗、明確に隔離されたテスト/フィクスチャ例外は指摘しない。

## 3.2 ランタイムのビジネス検証に `assert` を使っていないか — High

本番コードでビジネス前提を守る `assert` を指摘する。明示的エラーまたはバリデータを提案する。

## 3.3 ドメインエラーは具体的でユースケース形状か — Medium

呼び出し元が分岐する必要があるのに、ドメインコンストラクタやユースケースから `Exception`、裸の `ValueError`、`RuntimeError`、不透明な文字列エラーを返す箇所を指摘する。

## 3.4 インフラエラーは意図的に変換されているか — Medium

SQLAlchemy/Django/HTTP クライアント例外、生 DB ドライバーエラー、設定エラーが公開ドメイン/ユースケース API を直接通る箇所を指摘する。

## 3.5 非同期ユースケースは正しくレイヤー分けされているか — Medium

[`error-handling.md`](/docs/kamae/python/references/error-handling/) と突き合わせる。I/O を行う非同期ドメイン遷移、またはマッピングなしで `async def` 境界を通るインフラエラー型を指摘する。

## 3.6 ロックやブロック処理を await 点をまたいで保持していないか — High

ユースケースやアダプターで、プロジェクトが明示的に設計していない限り、mutex、`await` をまたぐ DB 行ロック、ブロック ORM/セッション、その他の排他リソースを指摘する。

[`concurrency.md`](/docs/kamae/python/references/concurrency/) と突き合わせる。

## 3.7 エラーバリアントは呼び出し元にとって意味があるか — Low

呼び出し元が網羅的に分岐する必要があるのに、`other: str` や `invalid_input: str` のような曖昧なバリアントを指摘する。

## 3.8 例外チェーンは `raise ... from` で保持されているか — Medium

[`error-handling.md`](/docs/kamae/python/references/error-handling/) と突き合わせる。内部失敗を f-string で文字列化し、ログ用の例外チェーンを失うユースケースエラーを指摘する。

## 3.9 エラーメッセージに PII やシークレットが含まれないか — High

[`pii-protection.md`](/docs/kamae/python/references/pii-protection/) と突き合わせる。メール、電話、トークン、生 SQL/HTTP 本文を埋め込むエラーテキストを指摘する。
