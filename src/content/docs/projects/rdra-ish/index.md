---
title: "はじめに"
description: "要件モデルをコードで書きレビューする rdra-ish DSL の概要（v0.2.0）"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl) · 対象バージョン: **v0.2.0**

**rdra-ish** は、要件モデルを `.rdra` というDSLで記述し、型チェック・図表生成・状態導出・形式検証までを一貫して行うCLIとコンパイラ群です。Wordやスプレッドシートに散在しがちな「誰が・何を・どのデータに触るか」を、関係（predicate）で結んだグラフとしてコード化し、レビュー可能にします。

## RDRA の考え方

**RDRA**（Relationship-Driven Requirements Analysis）は、システムを型付き要素のグラフとして扱う要件モデリング手法です。アクター、ビジネス領域、BUC、ユースケース、画面、エンティティなどを宣言し、`performs`、`contains`、`creates` といった **関係述語** で明示的に結びます。

## RDRA-ISH とは

rdra-ishが実装するのは **RDRA-ISH**（RDRA-inspired Implementation and System Heuristics）です。RDRAのrelationship-firstな書き方を踏襲しますが、**厳密な RDRA の写しではありません**。システム境界、API境界、アクセス制約、エンティティライフサイクルなど、実装寄りのレビューに必要な語彙を追加しています。

同じモデルから `check`、各種diagram、CSV、`states`、`export`、さらにv0.2.0では `export --kind tla` / `verify --backend tlc` によるTLA+/TLC形式検証まで回せることが目的です。

## v0.2.0 の主な変化

| 領域 | 内容 |
| --- | --- |
| **形式検証** | `export --kind tla` と `verify --backend tlc`（`.tla` + `.cfg`） |
| **DSL 表面** | 比較式の条件、`transitions(Entity.col, Event, from -> to)`、マルチエンティティ `forbidden` / `invariant`、`when(...).none/has` |
| **堅牢性** | 生成系サブコマンドの fail-closed、読みやすいパースエラー |

破壊的変更の詳細はupstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/main/CHANGELOG.md) を参照。

## ドキュメントの読み方

### 初めて使う

1. [インストール](/projects/rdra-ish/installation/)
2. [クイックスタート](/projects/rdra-ish/quickstart/)
3. [段階的モデリング](/projects/rdra-ish/incremental-modeling/) — Stage 0–6の進め方

### モデルを書く・レビューする

| 関心 | ページ |
| --- | --- |
| DSL の構文 | [言語リファレンス](/projects/rdra-ish/language-reference/) |
| 図表・CSV・export | [図表とエクスポート](/projects/rdra-ish/diagram-and-export/) |
| TLA+/TLC | [形式検証](/projects/rdra-ish/formal-verification/) |
| CLI 全般 | [CLI リファレンス](/projects/rdra-ish/cli-reference/) |
| エディタ | [VS Code / LSP](/projects/rdra-ish/vscode-lsp/) |

### 開発・拡張

- [開発環境](/projects/rdra-ish/development/)

## BUC・ビジネスフロー・ユースケース

RDRA-ishでは3つを **異なるレビュー単位** として読み分けます。

| 概念 | 役割 |
|---|---|
| **BUC** | ビジネス価値のスライスとレビュー容器 |
| **ビジネスフロー** | BUC を UC とイベントで具体化した流れ |
| **ユースケース（UC）** | 効果を持つ相互作用の境界 |

実務的な読み方： **BUC** でレビュー単位を決め、**ビジネスフロー** で時間順の展開を捉え、**UC** で1操作とそのデータ・画面・API効果を命名する。

## 他プロジェクトとの関係

| レイヤ | 役割 |
| --- | --- |
| **[rdra-ish](/projects/rdra-ish/)** | 要件モデル（上流） |
| **[dagayn](/projects/dagayn/)** | 設計書・コードの構造グラフ（横断トレース） |
| **kamae 等** | 実装のドメイン設計 |

## 使うべき場面 / 使わない場面

**向いているケース**

- BUC単位で要件と設計の整合をレビューしたい
- CRUDマトリクス、シーケンス、状態到達性を **モデルから自動生成** したい
- ライフサイクル制約を `states` で素早く、必要ならTLCで形式検証したい
- API契約やDBスキーマのたたき台をモデルと同期させたい
- エージェントやCIと組み合わせ、モデルをコードとして差分管理したい

**向いていないケース**

- 完全に自由形式の議事録・ユーザーストーリーだけで足りる初期探索
- RDRA原典の用語・手順をそのまま再現したい
- 実行可能なアプリケーションコードや本番DBマイグレーションの代替

## サンプル

リポジトリ内の `samples/` を参照。

| サンプル | 内容 |
| --- | --- |
| `incremental-order` | Stage 0–6 の段階的増築例（学習の入口） |
| `ec-site` | コンパクトなend-to-end |
| `clinic-ops` | API・イベント・アクセス制約を含む大規模例 |
| `personal-info` | 個人情報管理 |
| `formal-verification/` | TLA+/TLC 向けサンプル（[形式検証](/projects/rdra-ish/formal-verification/)） |

rdra-ishは「正しいモデル」を自動判定する魔法ではなく、**関係を明示したモデルをレビューしやすくする** ための道具です。 [クイックスタート](/projects/rdra-ish/quickstart/) から試してください。
