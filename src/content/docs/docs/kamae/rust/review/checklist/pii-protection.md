---
title: "PII 保護 チェックリスト"
sidebar:
  order: 5
  label: "PII 保護"
---

参照: [`pii-protection.md`](/docs/kamae/rust/references/pii-protection/)

## 5.1 PII とシークレットはラップされているか — High

メール、電話、住所、氏名、政府 ID、決済データ、健康データ、IP アドレス、精密位置、トークン、パスワードを運ぶ素の `String`、`Vec<u8>`、プリミティブフィールドをフラグする。

`secrecy::SecretString`、`SecretBox<T>`、またはプロジェクトローカルのマスキングラッパを提案する。

すべての PII 値に `SecretString` を必須としない。表示名、メール、粗い IP など非シークレット識別子は、`Debug`、ログ、シリアライズがマスキングされるか意図的に公開されるならドメイン newtype でよい。

## 5.2 Debug やログで機密データが露出しないか — High

生の機密値を含む `#[derive(Debug)]`、`tracing` フィールド、整形エラー、ログをフラグする。

メトリクス、スパン属性、監査イベント、パニックメッセージ、検証エラーにも生の PII やシークレットがないか確認する。

## 5.3 平文露出は狭く名前付きか — Medium

機密値向けの `email(&self) -> &str` のような広いゲッターをフラグする。アダプタ専用の露出メソッドやラッパを提案する。

## 5.4 可観測性はデフォルトでマスキングされているか — High

マスキング方針、許可リストフィールド、明示的な安全表示ラッパなしに、任意のドメインオブジェクトや DTO を受け取るログ / メトリクスヘルパをフラグする。

## 5.5 人物に紐づく ID は条件付きで、自動的に安全とはみなさない — High

[`logging-metrics.md`](/docs/kamae/rust/references/logging-metrics/) の「ログに載せる ID」の節も照合する。不透明なサロゲートである根拠なしに `user_id`、`passenger_id`、`customer_id`、`patient_id`、`device_id`、パートナー参照をログする箇所をフラグする。

`request_id`、`order_id`、`correlation_id` のような内部集約 ID で、明らかにサロゲートキーかつ安全な整形である場合はフラグを立てない。
