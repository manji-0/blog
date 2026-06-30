---
title: "クイックスタート"
description: "rdra-ish を最短で動かす手順"
sidebar:
  order: 2
---

## 1. インストール

```bash
uv tool install rdra-ish
```

[インストール](/projects/rdra-ish/installation/) の詳細を参照。

## 2. サンプルを検証

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
rdra-ish check samples/ec-site
```

エラーがなければ `OK: no errors` が表示される。

## 3. 図を生成

Mermaidは追加依存なしで使える。

```bash
rdra-ish diagram samples/ec-site --kind rdra --format mermaid --buc BucOrder
rdra-ish diagram samples/clinic-ops --kind sequence --format mermaid --buc BucAppointmentScheduling
```

## 4. レビュー用CSV

```bash
rdra-ish csv samples/clinic-ops --kind matrix
rdra-ish csv samples/clinic-ops --kind actor-permission-audit
```

## 5. 状態パターン導出

```bash
rdra-ish states samples/clinic-ops --entity Appointment
```

## 最小モデルの例

新規プロジェクトでは次の配置から始める。

```text
src/
  shared/
    actors.rdra
    biz.rdra
    entities.rdra
  buc/
    buc_order.rdra
```

```rdra
module buc.order

import shared.actors
import shared.biz

buc BucOrder "Process Order"
usecase PlaceOrder "Place Order"

entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid) @default(pending)
}

performs(Customer, BucOrder)
belongs(BucOrder, Commerce)
contains(BucOrder, PlaceOrder)
creates(PlaceOrder, Order)
```

```bash
rdra-ish check src/
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) を参照。

## 推奨ループ

1. 1段階だけモデルを足す（[段階的モデリング](/projects/rdra-ish/incremental-modeling/)）
2. `rdra-ish check src/` で型・整合性を確認
3. `--buc` フィルタ付きdiagram / csvでその段階の関心だけレビュー
4. 次の段階へ

warningはレビュー信号、errorはブロッカーとして扱う。

## 次のステップ

| やりたいこと | ページ |
| --- | --- |
| Stage 0–6 の進め方 | [段階的モデリング](/projects/rdra-ish/incremental-modeling/) |
| 全サブコマンド | [CLI リファレンス](/projects/rdra-ish/cli-reference/) |
| エディタ連携 | [VS Code / LSP](/projects/rdra-ish/vscode-lsp/) |
