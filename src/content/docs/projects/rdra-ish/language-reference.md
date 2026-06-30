---
title: "言語リファレンス"
description: "rdra-ish DSL（.rdra）の構文概要"
sidebar:
  order: 6
---

`.rdra` ファイルは `module` 宣言、`import`、**インスタンス宣言**、**述語呼び出し**、**エンティティ本体** で構成される。完全な仕様は [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl/blob/main/docs/language-reference.md) のupstreamドキュメントも参照。

## ファイル構造

```rdra
module buc.order

import shared.actors
import shared.biz

// インスタンス宣言
actor Customer "Customer"
buc BucOrder "Process Order"
usecase PlaceOrder "Place Order"

// エンティティ
entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid) @default(pending)
}

// 述語（関係）
performs(Customer, BucOrder)
belongs(BucOrder, Commerce)
contains(BucOrder, PlaceOrder)
creates(PlaceOrder, Order)
```

- **module / import**: ファイルパスと対応（`module buc.order` ↔ `buc/order.rdra` 等）
- コメント： `//` 行コメント、`/* */` ブロックコメント（`#` は非対応）

## インスタンス宣言

```
<kind> <Id> "Label"
<kind> <Id> "Label" description "Longer text"
```

### 主要な kind

| kind | 説明 |
|---|---|
| `actor` | 人間アクター |
| `extsystem` | 外部システム |
| `system` | 内部システム境界 |
| `business` | ビジネス領域 |
| `buc` | ビジネスユースケース（価値スライス） |
| `usecase` | ユースケース |
| `screen` | 画面 |
| `api` | API 境界 |
| `entity` | 永続化エンティティ |
| `concept` / `domain_object` | 概念モデル（DB前） |
| `requirement` / `nfr` / `constraint` | 要件・非機能 |
| `adr` | アーキテクチャ決定記録 |
| `event` / `state` | ライフサイクル |
| `permission` / `medium` / `location` / `timing` | 制約語彙 |

## エンティティ本体

```rdra
entity Order "Order" {
  id: Int @pk
  customer_id: Int @fk(Customer)
  status: Enum(pending, paid, shipped) @default(pending)
  total: Decimal
}
```

アノテーション例： `@pk`, `@fk`, `@unique`, `@default`, `@index`

## 関係述語（predicate）

述語は `(Subject, Object)` またはチェーン形式で関係を記述する。

### スコープ・所有

| 述語 | 意味 |
|---|---|
| `performs(Actor, Buc\|Usecase)` | アクターが実行 |
| `belongs(Buc, Business)` | BUCが事業領域に属する |
| `contains(Buc, Usecase)` | BUCがUCを包含 |
| `decides(Adr, Element)` | ADRが要素に影響 |

### データ操作（CRUD）

| 述語 | 意味 |
|---|---|
| `creates(Usecase, Entity)` | 作成 |
| `reads(Usecase, Entity)` | 参照 |
| `updates(Usecase, Entity)` | 更新 |
| `deletes(Usecase, Entity)` | 削除 |
| `relate(Entity, Entity, cardinality)` | エンティティ間関連 |

### 相互作用

| 述語 | 意味 |
|---|---|
| `displays(Usecase, Screen)` | 画面表示 |
| `invokes(Usecase, Api)` | API呼び出し |
| `requires_permission(Usecase\|Api, Permission)` | 必要権限 |
| `requires_medium(Screen, Medium)` | 媒体制約 |

### ライフサイクル

| 述語 | 意味 |
|---|---|
| `raises(Usecase, Event)` | イベント発行 |
| `sets(Event\|Usecase, Entity, State)` | 状態設定 |
| `transitions(State, Event, State)` | 遷移定義 |
| `outbox(Event)` | 意図的な外部公開（未消費 warning 抑制） |

### ルール

| 述語 | 意味 |
|---|---|
| `forbidden(Entity, State)` | 到達禁止状態 |
| `invariant(Entity, expr)` | 不変条件 |
| `required(Entity, field, condition)` | 必須条件 |
| `exclusive(Entity, states...)` | 排他状態 |

## ビジネスフロー

```rdra
flow OrderFlow "Order Flow"
step S1 "Validate cart"
step S2 "Place order"

precedes(S1, S2)
contains(BucOrder, OrderFlow)
```

## 配置ルール（要約）

- BUC固有述語を `shared/` に置かない
- 安定語彙（actor, business, 共有entity）は `shared/`
- 1 BUC = 原則1ファイル（`buc/buc_<name>.rdra`）

詳細は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) を参照。

## 検証

```bash
rdra-ish check src/
rdra-ish fmt src/ --check
```

## 関連ページ

- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [図表とエクスポート](/projects/rdra-ish/diagram-and-export/)
