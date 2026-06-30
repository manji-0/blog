---
title: "段階的モデリング"
description: "rdra-ish の Stage 0–6 モデリングフロー"
sidebar:
  order: 3
---

rdra-ishは一度に全部書くことを求めません。**小さな段階**で精緻化し、各段階のあと `check` やdiagramでレビューします。

## 原則

- 早期段階はビジネス言語（価値ストリーム、アクター、ユーザー可視の仕事）に近い
- 後半段階でデータ、UI/API境界、アクセス、永続化構造、ライフサイクル、ルールを追加
- **warning** はレビュー信号（探索中は意図的に残してよい）
- **error** はモデル信頼性を損なうためブロッカー
- `--buc` フィルタで1スライスだけ検証できる

## Stage 一覧

| Stage | 関心 | 主な追加内容 |
|---|---|---|
| **0** | スコープ | `business`、候補 `buc` |
| **1** | BUC 骨格 | `actor`、`usecase`、`performs`、`contains` |
| **2** | データ接点 | 粗い `entity`、CRUD 述語 |
| **3** | 相互作用境界 | `screen`、`api`、`displays`、`invokes`、権限・媒体制約 |
| **4** | エンティティ構造 | カラム詳細、`relate`、カーディナリティ |
| **5** | ライフサイクル | `state`、`event`、`transitions`、`raises`、`sets` |
| **6** | ルール | `forbidden`、`exclusive`、`invariant`、`required` |

各段階のあと実行する検証例：

```bash
rdra-ish check src/
rdra-ish lint src/
rdra-ish diagram src/ --kind rdra --format mermaid --buc <BucId>
```

Stage 3以降は `--kind sequence` や `--kind event-flow` も有効。

## ディレクトリ配置

```text
src/
  shared/
    actors.rdra      # module shared.actors
    biz.rdra         # module shared.biz
    entities.rdra    # module shared.entities
  buc/
    buc_<name>.rdra  # module buc.<name>
```

### 配置ルール

| 要素 | 置き場所 |
|---|---|
| `actor`, `extsystem` | `shared/actors.rdra` |
| `business`, 安定した `requirement` / NFR | `shared/biz.rdra` 等 |
| 再利用 `entity`, 共有 lifecycle | `shared/entities.rdra` |
| `buc`, `usecase`, BUCローカル `api` / `screen` | `buc/buc_<name>.rdra` |
| BUC固有の述語（CRUD, `invokes`, `raises` 等） | そのBUCファイル（sharedに置かない） |
| クロスBUC `event`, 制約述語 | エンティティ近くの shared |

成長したら `shared/entities/order.rdra`、`shared/lifecycle/`、`shared/rules.rdra` へ分割する。

## BUC・フロー・UC の読み分け

1. **BUC** —「今どの価値スライスをレビューするか」を決める
2. **ビジネスフロー** — `flow` / `step` / `precedes` で時間順・分岐
3. **UC** —「注文する」のような **一つの操作**。混ざったら分割

BUCは画面名やテーブル名ではなく **ビジネス価値** から名付ける。

## 段階別の検証観点

| Stage | 確認すること |
|---|---|
| 0–1 | アクターとUCがBUCに束ねられているか |
| 2 | UCごとにCRUDが説明可能か（`csv --kind matrix`） |
| 3 | 画面/API/権限のギャップ（`csv --kind actor-permission-audit`） |
| 4 | ER整合、外部キー、所有関係 |
| 5 | 到達不能状態、未消費イベント（`states`, `diagram --kind event-flow`） |
| 6 | `forbidden` / `invariant` 違反（`states --format json`） |

## サンプル

`samples/incremental-order/` にStage 0から6まで段階的に増やした成果物がある。diffしながら各段階の追加量を確認できる。

## 関連ページ

- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [図表とエクスポート](/projects/rdra-ish/diagram-and-export/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
