---
title: "rdra-ish とは"
description: "要件モデルをコードで書きレビューする rdra-ish DSL の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl)

**rdra-ish** は、要件モデルを `.rdra` というDSLで記述し、型チェック・図表生成・状態導出までを一貫して行うCLIとコンパイラ群です。Wordやスプレッドシートに散在しがちな「誰が・何を・どのデータに触るか」を、関係（predicate）で結んだグラフとしてコード化し、レビュー可能にします。

## RDRA の考え方

**RDRA**（Relationship-Driven Requirements Analysis）は、システムを型付き要素のグラフとして扱う要件モデリング手法です。アクター、ビジネス領域、BUC、ユースケース、画面、エンティティなどを宣言し、`performs`、`contains`、`creates` といった **関係述語** で明示的に結びます。左側のレイヤ（ビジネス意図）が右側のレイヤ（設計）の根拠になる、という **relationship-first** の発想が中核です。

## RDRA-ISH とは何か

rdra-ishが実装するのは **RDRA-ISH**（RDRA-inspired Implementation and System Heuristics）です。RDRAのrelationship-firstな書き方を踏襲しますが、**厳密な RDRA の写しではありません**。システム境界、API境界、アクセス制約、エンティティライフサイクルなど、実装寄りのレビューに必要な語彙を追加しています。

同じモデルから `check`、各種diagram、CSV、`states`、`export` を生成できることが目的です。元のRDRA手法の用語定義そのものを再現するツールではなく、**要件議論から設計レビューまで続くモデル**を支える実装です。

## BUC・ビジネスフロー・ユースケース（RDRA-ish 解釈）

RDRA-ishでは3つを **異なるレビュー単位** として読み分けます。

| 概念 | RDRA-ish での役割 |
|---|---|
| **BUC** | ビジネス価値のスライスとレビュー容器。`belongs` で事業領域に属し、`contains` で UC を束ねる |
| **ビジネスフロー** | BUC を UC とイベントで具体化した流れ。`flow` / `step` と `precedes` 等で順序・分岐を表現 |
| **ユースケース（UC）** | 効果を持つ相互作用の境界。画面・API・CRUD・イベント・権限をここに接続する |

実務的な読み方は次のとおりです。

1. **BUC** で「今どの価値スライスをレビューするか」を決める
2. **ビジネスフロー** でそのBUCが時間順にどう展開されるかを捉える
3. **UC** でアクターが理解できる1つの操作と、そのデータ・画面・API効果を命名する

BUCは画面名やテーブル名ではなく **ビジネス価値** から名付けます。UCは「注文する」「決済を確定する」のように **一つの操作** に留め、複数アクターや無関係な画面/APIが混ざるなら分割を検討します。

## `.rdra` DSL の基本

`.rdra` ファイルは `module` 宣言、`import`、**インスタンス宣言**、**述語呼び出し**、**エンティティ本体** で構成されます。

- **module / import**: ファイルパスと対応するモジュール名（例： `module buc.order`、`import shared.actors`）
- **インスタンス**: `actor Customer "Customer"` のように種別・ID・表示ラベルを宣言
- **述語**: `performs(Customer, BucOrder)` のように関係を記述
- **entity**: カラム定義と `@pk` 等のアノテーションを持つデータ構造

典型的な配置は `shared/`（共通語彙）と `buc/`（BUCローカルなフロー）です。

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

述語はBUC固有のものをsharedに置かない、という配置ルールがレビューしやすさの鍵です。

## 段階的モデリング（Stage 0–6）

rdra-ishは一度に全部書くことを求めません。**小さな段階**で精緻化し、各段階のあと `check` やdiagramでレビューします。

| Stage | 関心 | 主な追加内容 |
|---|---|---|
| **0** | スコープ | `business`、候補 `buc` |
| **1** | BUC 骨格 | `actor`、`usecase`、`performs`、`contains` |
| **2** | データ接点 | 粗い `entity`、CRUD 述語 |
| **3** | 相互作用境界 | `screen`、`api`、`displays`、`invokes`、権限・媒体制約 |
| **4** | エンティティ構造 | カラム詳細、`relate`、カーディナリティ |
| **5** | ライフサイクル | `state`、`event`、`transitions`、`raises`、`sets` |
| **6** | ルール | `forbidden`、`exclusive`、`invariant`、`required`、クロスエンティティ制約 |

`check` の **error** はモデル信頼性を損なうためブロッカー、**warning** はレビュー信号として扱います。探索中は意図的に未完成のまま `--buc` フィルタでスライスレビューするのが定石です。

## CLI

`uv tool install rdra-ish` でインストールします。主要サブコマンドは次のとおりです。

| コマンド | 用途 |
|---|---|
| **`check`** | パース・型チェック・モデル整合性検証。エラー時は非ゼロ終了 |
| **`diagram`** | RDRA レイヤ図、ER、シーケンス、状態遷移、イベントフロー等（Mermaid / PlantUML） |
| **`csv`** | CRUD マトリクス、API 一覧、画面制約、権限監査などレビュー用表 |
| **`states`** | BUC 横断で到達可能なエンティティ状態パターンを導出 |
| **`export`** | OpenAPI、AsyncAPI、DBML、JSON Schema 等の機械可読な成果物 |
| **`list` / `lint` / `fmt`** | 要素一覧、カバレッジ監査、フォーマット |

## アーキテクチャ（crates）

Rustのcrate分割は責務が明確です。

```text
crates/
  rdra-ish-syntax/   # 字句解析・構文解析・AST
  rdra-ish-core/     # 意味モデル、型チェック、状態導出
  rdra-ish-emit/     # PlantUML / Mermaid / CSV / export 生成
  rdra-ish-render/   # plantuml.jar ラッパ
  rdra-ish-cli/      # rdra-ish コマンド
  rdra-ish-lsp/      # Language Server
```

`syntax` → `core` → `emit` の一方向依存により、CLIとLSPが同じ意味論を共有します。

## VS Code / LSP

リポジトリの `editors/vscode` にVS Code拡張があります。`rdra-ish-lsp` バイナリ（PATHまたは `rdra-ish.languageServerPath`）と連携し、診断、補完、定義/参照、リネーム、ホバー、シンボル、セマンティックハイライト、インレイヒント、フォーマット（保存時）などを提供します。`.rdra` を通常のコードと同様に編集しながらモデルを保つ前提のUXです。

## クイックスタート

```sh
uv tool install rdra-ish
rdra-ish check samples/ec-site
rdra-ish diagram samples/ec-site --kind rdra --format mermaid --buc BucOrder
```

`samples/ec-site` はコンパクトなend-to-end例、`samples/clinic-ops` はAPI・イベント・アクセス制約を含む大きめの例です。`samples/incremental-order` ではStage 0から6まで段階的に増やした成果物も参照できます。

## 使うべき場面 / 使わない場面

**向いているケース**

- BUC単位で要件と設計の整合をレビューしたい
- CRUDマトリクス、シーケンス、状態到達性を **モデルから自動生成** したい
- API契約やDBスキーマのたたき台をモデルと同期させたい
- エージェントやCIと組み合わせ、モデルをコードとして差分管理したい

**向いていないケース**

- 完全に自由形式の議事録・ユーザーストーリーだけで足りる初期探索
- RDRA原典の用語・手順をそのまま再現したい（rdra-ishはinspiredでありequivalentではない）
- 実行可能なアプリケーションコードや本番DBマイグレーションの代替（exportはレビュー起点の成果物）

## レビュー観点

モデルを書いた（または更新した）あと、次の観点で `check` と生成物を確認すると効果的です。

- **構造整合性**: 未解決参照、型エラー、重複定義がないか（`check`）
- **カバレッジ**: UCとentityのCRUDが説明可能か（`csv --kind matrix`）
- **境界設計**: UCが直接CRUDすべきかAPI境界が必要か、トランザクション警告は妥当か（`diagram --kind sequence`）
- **アクセス**: `requires_permission` に対応するactor割当、画面経由の媒体制約（`csv --kind actor-permission-audit`）
- **ライフサイクル**: 到達不能状態、作成経路の欠落、イベントの未消費（`states`、`diagram --kind event-flow`）
- **ルール**: `forbidden` / `invariant` 違反が意図通りか（`states --format json`）
- **トレーサビリティ**: requirement / ADR / NFRがBUC・UCに接続されているか（`list`、`lint`）

rdra-ishは「正しいモデル」を自動判定する魔法ではなく、**関係を明示したモデルをレビューしやすくする** ための道具です。段階を1つ進めるたびに `check` とdiagramで閉じ、次の問いだけをモデルに足していく運用が最も効きます。
