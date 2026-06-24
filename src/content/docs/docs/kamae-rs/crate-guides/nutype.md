---
title: "nutype（検証 newtype）"
sidebar:
  order: 10
---

> **いつ読むか:** 検証付き newtype のボイラープレートを `nutype` で削減するとき。
> **関連:** [`../domain-modeling.md`](/docs/kamae-rs/domain-modeling/)、[`validator.md`](/docs/kamae-rs/crate-guides/validator/)。

詳細パターンは [`../domain-modeling.md`](/docs/kamae-rs/domain-modeling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

プロジェクトがすでに `nutype` を使う場合、または多数の検証付き newtype でボイラープレートが繰り返される場合に newtype 向けに使う。

フィールドは private と生成コンストラクタを優先する。型名は意味論的に保つ（`EmailAddress`、`OrderId`、`MoneyAmount`）。意味をぼかす汎用 wrapper は避ける。
