---
title: "使い方"
description: "rdra-ish のインストールと初回の一周"
sidebar:
  order: 1
  label: "使い方"
---

このページは、バイナリの入れ方からサンプル検証・図生成・最小モデル作成までの手順です。Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) へ。構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。

## インストール

rdra-ishはRust製CLIです。PyPI/uv経由のバイナリ配布が主なインストール方法です（v0.2.0向け）。

```bash
uv tool install rdra-ish
rdra-ish --help
```

インストール後に `export` / `verify` サブコマンドが見えればv0.2.0系です（旧0.1.xには `verify` がありません）。

```bash
rdra-ish check --help
rdra-ish diagram --help
```

`.rdra` ファイルの編集体験にはVS Code拡張と `rdra-ish-lsp` を併用します（[CLI リファレンス](/projects/rdra-ish/cli-reference/)）。

## サンプルの検証

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
rdra-ish check samples/ec-site
```

エラーがなければ `OK: no errors` が表示されます。

## 図の生成

Mermaidは追加依存なしで使えます。

```bash
rdra-ish diagram samples/ec-site --kind rdra --format mermaid --buc BucOrder
rdra-ish diagram samples/clinic-ops --kind sequence --format mermaid --buc BucAppointmentScheduling
```

`diagram --format plantuml` でPNG/SVGを生成する場合、Javaと `plantuml.jar` が必要になります。

## レビュー用CSV

```bash
rdra-ish csv samples/clinic-ops --kind matrix
rdra-ish csv samples/clinic-ops --kind actor-permission-audit
```

## 状態パターン導出

```bash
rdra-ish states samples/clinic-ops --entity Appointment
```

## 形式検証

TLCがPATHにある場合：

```bash
rdra-ish export samples/formal-verification/order.rdra --kind tla -o /tmp/rdra-tla
rdra-ish verify samples/formal-verification/order.rdra --backend tlc -o /tmp/rdra-tla
```

詳細は [形式検証](/projects/rdra-ish/formal-verification/)。CLIを入れても、TLCは別途必要です。

## 最小モデル

新規プロジェクトでは、まず1ファイルで通る最小モデルから始めます。`Customer` と `Commerce` は述語で参照する前に宣言します。

```rdra
module buc.order

actor Customer "Customer"
business Commerce "Commerce"
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
mkdir -p src/buc
# 上記を src/buc/order.rdra に保存してから
rdra-ish check src/
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

ファイルを分けたくなったら、`shared/actors.rdra` や `shared/biz.rdra` に切り出し、`import` でつなぎます（配置の目安は [段階的モデリング](/projects/rdra-ish/incremental-modeling/)）。

## 推奨ループ

1. 1段階だけモデルを足す（[段階的モデリング](/projects/rdra-ish/incremental-modeling/)）
2. `rdra-ish check src/` で型・整合性を確認
3. `--buc` フィルタ付きdiagram / csvでその段階の関心だけレビュー
4. 次の段階へ

`warning` はレビュー信号、`error` はブロッカーとして扱います。

## 次に読む

Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) です。要求からルールまでの実践例は [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) へ。
