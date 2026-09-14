---
title: "移植（port）"
description: "kamae ドメインモデルを別言語へ移植する手順と型対応"
sidebar:
  order: 10
---

## 範囲

**kamae-model-port**が扱う、同じドメインを別言語へ写す手順と型対応です。wire連携は[連携（bridge）](/projects/kamae-model-translator/bridge/)、スキル導入は[使い方](/projects/kamae-model-translator/usage/)を参照してください。詳細リファレンスの正はGitHub上のupstreamです。

## 移植の進め方

[migration-workflow.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/migration-workflow.md)の順序は後段が前段に依存するので飛ばしません。

1. 状態型
2. ID・値オブジェクト
3. 遷移
4. エラー
5. 境界・DTO
6. PII
7. 永続化・イベント
8. 配線
9. テスト

各段に検証条件と落とし穴があります。portを始める前に、ソースとターゲットのkamaeスキルを読んでください。

## 型対応

よく見る対応は[type-mapping.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/type-mapping.md)にまとまっています。判別union、branded ID、`Result`/`Either`、遷移成果型などです。言語内の慣用表記とwire上の表記は別物として扱います。

関連リファレンス：

- [state-transition-mapping.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/state-transition-mapping.md)
- [error-handling-mapping.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/error-handling-mapping.md)
- [id-and-branded-types.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/id-and-branded-types.md)
- [pii-and-sensitive.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/pii-and-sensitive.md)
- [boundary-and-dto.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/boundary-and-dto.md)
- [persistence-event-mapping.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/references/persistence-event-mapping.md)

## タクシー例

端から端の写像例はGitHub上のwalkthroughです。ブログにはコードを複製しません。

- [taxi-request-ts-to-rs.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/examples/taxi-request-ts-to-rs.md)
- [taxi-request-py-to-scala.md](https://github.com/manji-0/kamae-model-translator/blob/main/skills/kamae-model-port/examples/taxi-request-py-to-scala.md)

## レビュー観点

- 状態variantに余計なoptionalが残っていないか
- ID型の取り違えがないか
- 遷移に副作用が混ざっていないか
- 境界でのDTO bypassがないか
- PIIがログ経路に漏れていないか
- 移植順序の飛ばしがないか

## 次に読む

サービス間連携は[連携（bridge）](/projects/kamae-model-translator/bridge/)。各言語の実装規約は[kamae-rs](/projects/kamae-rs/)、[kamae-scala](/projects/kamae-scala/)、[kamae-py](/projects/kamae-py/)です。
