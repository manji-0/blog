---
title: "nutype"
sidebar:
  order: 10
---

詳細パターンは [`../domain-modeling.md`](/docs/kamae/rust/references/domain-modeling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

プロジェクトがすでに `nutype` を使う場合、または多数の検証付き newtype でボイラープレートが繰り返される場合に newtype 向けに使う。

フィールドは private と生成コンストラクタを優先する。型名は意味論的に保つ（`EmailAddress`、`OrderId`、`MoneyAmount`）。意味をぼかす汎用 wrapper は避ける。
