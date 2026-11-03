---
title: "使い方"
description: "rdra-ish のインストールと初回の一周"
sidebar:
  order: 1
  label: "使い方"
---

このページは、バイナリの入れ方からサンプル検証・図生成・最小モデル作成までの手順です。Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) へ。構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。

## インストール

rdra-ishはRust製CLIです。PyPI/uv経由のバイナリ配布が主なインストール方法です（v1.0.0向け）。GitHub Releaseにもプラットフォーム別のアーカイブがあります。

```bash
uv tool install rdra-ish
rdra-ish --help
```

`--version` フラグはありません。`rdra-ish --help` に `next` サブコマンドが見えればv0.4.0以降です（v0.2.0には `next` がありません）。

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

エラーがなければ `OK: no errors within 1 instance per entity, Int 0..5` のように、検査した範囲付きで表示されます。

## 図の生成

Mermaidは追加依存なしで使えます。

```bash
rdra-ish diagram samples/ec-site --kind rdra --format mermaid --buc BucOrder
rdra-ish diagram samples/clinic-ops --kind sequence --format mermaid --usecase BookAppointment
```

`--kind sequence` は1つのUCを描くので、`--buc` ではなく `--usecase` を渡します。出力はMermaidテキストだけです。PlantUML出力はv0.3.0で削除されました。画像が要るときはMermaid CLI（`mmdc`）などで描画します。

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
4. `rdra-ish next src/` で各BUCのStageと、次の段階で足すものを確認
5. 次の段階へ

`warning` はレビュー信号、`error` はブロッカーとして扱います。

## v0.2.0のモデルを移行する

v1.0.0は最初の安定版です。以降はセマンティックバージョニングに従い、読み込めるモデルは次のメジャーリリースまで読み込めます。一方、v0.2.0からv1.0.0までの間に構文が変わりました。v0.2.0で書いたモデルの多くは、そのままでは読み込めません。古い形は、書き換え後の行を示すエラーで止まります。upstreamのスクリプトを順に実行して書き換えます。

```bash
python3 scripts/migrate-phase3.py src/      # v0.3.0: timing → timer、UCが駆動する transitions
python3 scripts/migrate-syntax-v2.py src/   # v0.4.0: transitions(UC, Entity.col, ...) など
python3 scripts/migrate-syntax-v3.py src/   # v1.0.0: sets(UC, Entity.col == v) など
```

スクリプトが扱わない箇所は、エラーメッセージに従って手で直します。たとえば `state` 宣言と `location` の削除、`belongs(...)` の `.where(...)` の削除、タイマーをどのUCにつなぐかです。変更の一覧はupstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/v1.0.0/CHANGELOG.md) にあります。

## 次に読む

Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) です。要求からルールまでの実践例は [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) へ。
