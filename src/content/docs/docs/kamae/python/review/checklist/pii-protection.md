---
title: "PII 保護 チェックリスト"
sidebar:
  order: 5
  label: "PII 保護"
---

リファレンス: [`pii-protection.md`](/docs/kamae/python/references/pii-protection/)。
関連: [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/)。

## 5.1 PII とシークレットはラップまたはマスクされているか — High

メール、電話、住所、氏名、政府 ID、決済データ、健康データ、IP アドレス、精密位置、トークン、パスワードを運ぶ素の `str`、`bytes`、プリミティブフィールドを指摘する。

`pydantic.SecretStr`、プロジェクトローカルのマスクラッパー、明示的なアダプター専用露出を提案する。

すべての PII 値に `SecretStr` は必須ではない。非シークレット識別子は、`repr`、ログ、シリアライズがマスクされるか意図的に露出されるならドメイン型でよい。

## 5.2 repr、str、ログ、エラーで機微データが露出しないか — High

生の機微値を含むデフォルト `repr`、f-string ログ、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、バリデーションエラーにも生 PII やシークレットがないか確認する。

## 5.3 平文露出は狭く名前付きか — Medium

`email` のように生の機微値を返す広いプロパティやゲッターを指摘する。アダプター専用の露出メソッドやラッパーを提案する。

## 5.4 オブザーバビリティはデフォルトでマスクされているか — High

任意のドメインオブジェクトや DTO をマスク方針、許可フィールド、明示的安全表示ラッパーなしで受け取るログ/メトリクスヘルパーを指摘する。

## 5.5 人物に紐づく ID は自動安全とみなさないか — High

[`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) と突き合わせる。不透明な代理キーである根拠なく `user_id`、`passenger_id`、`customer_id`、`patient_id`、`device_id`、パートナー参照をログする箇所を指摘する。

`request_id`、`order_id`、`correlation_id` のような内部集約 ID が明らかな代理キーで安全な整形なら指摘しない。
