---
title: "連携（bridge）"
description: "wire 規約と DTO 境界による言語間サービス連携"
sidebar:
  order: 10
---

## 範囲

**kamae-model-bridge**が扱う、通信表現（wire）経由での異言語サービス連携です。同じドメインの言語移植は[移植（port）](/projects/kamae-model-translator/port/)、スキル導入は[使い方](/projects/kamae-model-translator/usage/)を参照してください。詳細リファレンスの正はGitHub上のupstreamです。

## wireの既定

共有するcanonicalはだいたい次のとおりです。

- フィールドは`snake_case`
- 判別子`kind`もsnake_caseリテラル
- 時刻はISO 8601 UTC
- UUIDは小文字ハイフン
- 金額は整数セント＋通貨コード

TS / ScalaはcodecでcamelCaseと往復し、Python / Rustはwireと素直に揃いやすいです。規約の全文は[wire-format-conventions.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/wire-format-conventions.md)です。

## DTO境界

ドメイン型をwireに直接載せません。

- 送信： domain → outbound DTO → serialize
- 受信： deserialize → inbound DTO → domain

パターン集は[dto-boundary-patterns.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/dto-boundary-patterns.md)です。

## 関連リファレンス

- [discriminant-interop.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/discriminant-interop.md)
- [serialization-compatibility.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/serialization-compatibility.md)
- [schema-evolution.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/schema-evolution.md)
- [protobuf-mapping.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/protobuf-mapping.md)

## 契約テスト

両言語が同じwire例を共有し、round-tripと破壊的変更を検知します。手順は[contract-testing.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/contract-testing.md)です。

## 連携例

- [json-interop-ts-py.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/examples/json-interop-ts-py.md)
- [grpc-interop-rs-scala.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/examples/grpc-interop-rs-scala.md)

## レビュー観点

- wire規約と実装のcodecが一致しているか
- ドメイン型がシリアライズ境界に漏れていないか
- 契約テストが両言語で同じfixtureを参照しているか
- スキーマ変更が後方互換か（[schema-evolution.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-bridge/references/schema-evolution.md)）

## 次に読む

言語移植は[移植（port）](/projects/kamae-model-translator/port/)。各言語の境界防御は[kamae-rs 境界防御](/projects/kamae-rs/boundary-defense/)、[kamae-scala 境界防御](/projects/kamae-scala/boundary-defense/)です。
