---
title: "ドメインマクロ チェックリスト"
sidebar:
  order: 5
  label: "ドメインマクロ"
---

参照: [`domain-macros.md`](/docs/kamae/rust/references/domain-macros/)

## 14.1 マクロはドメイン不変条件を隠していないか — High

public フィールド、`Default`、黙示的な強制、手書きドメインルールと異なる検証を追加する proc-macro や derive をフラグする。

## 14.2 生成された Debug / Display はログに安全か — High

[`logging-metrics.md`](/docs/kamae/rust/review/checklist/logging-metrics/) も照合する。PII やシークレットを露出しうる ID、イベント、ペイロードへの生成 `Debug` / `Display` をフラグする。

## 14.3 マクロは繰り返しで正当化されているか — Low

1〜2 型のために `nutype`、`TryFrom`、明示 impl の方がレビューで明確なのに、新しい内部 proc-macro クレートを導入する箇所をフラグする。

## 14.4 イベントマクロはバージョンメタデータを保持しているか — Medium

デプロイをまたいで永続化、キューイング、消費されるドメインイベントに、安定した `name` / `version`（または同等）がない場合はフラグする。

## 14.5 マクロ生成ドメイン型では Deserialize / FromRow derive を避けているか — Medium

[`boundary.md`](/docs/kamae/rust/review/checklist/boundary/) も照合する。プロジェクトが明示的なリーフ検証慣習を文書化していない限り、不変条件を持つドメイン型へのマクロ生成 serde や ORM derive をフラグする。
