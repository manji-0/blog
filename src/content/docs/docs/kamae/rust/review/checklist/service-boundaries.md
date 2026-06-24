---
title: "サービス境界 チェックリスト"
sidebar:
  order: 5
  label: "サービス境界"
---

参照: [`service-boundaries.md`](/docs/kamae/rust/references/service-boundaries/)

## 15.1 ワイヤメッセージは DTO → ドメインで変換されているか — High

`TryFrom` 検証なしに protobuf、JSON、キューペイロードをドメインロジックへ直接渡すハンドラをフラグする。

## 15.2 生成クライアント型はドメインクレートに漏れていないか — Medium

アダプタ境界でマッピングするのではなく、ドメインやユースケースモジュールが `tonic` / `prost` 生成型を import している場合はフラグする。

## 15.3 protobuf / JSON スキーマ進化は明示的か — High

破壊的なフィールド改名 / 削除、`schema_version` の欠落、未知のイベント型やバージョンでパニックするコンシューマをフラグする。

## 15.4 キューハンドラは冪等か — High

[`persistence-events.md`](/docs/kamae/rust/review/checklist/persistence-events/) も照合する。冪等キーや重複排除ストレージなしに副作用を適用するコンシューマをフラグする。

## 15.5 リトライ、ブレーカ、レート制限はアダプタにあるか — Medium

ドメイン遷移やユースケースのビジネスルール内のリトライループ、サーキットブレーカ状態、レート制限をフラグする。

## 15.6 相関コンテキストは外向き呼び出しで伝播されているか — Low

入口リクエストが既に `correlation_id` やトレースコンテキストを運んでいるのに、サービス間呼び出しや公開メッセージからそれらを欠落させる場合はフラグする。
