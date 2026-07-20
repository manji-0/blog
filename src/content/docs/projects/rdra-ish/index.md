---
title: "はじめに"
description: "要件モデルをコードで書きレビューする rdra-ish DSL の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl) · 対象バージョン: **v0.2.0**

**rdra-ish** は、要件モデルを `.rdra` で書いて、型チェック・図表・状態導出・形式検証まで同じモデルから回すCLIとコンパイラ群です。Wordや表に散らばりがちな「誰が・何を・どのデータに触るか」を、関係（predicate）で結んだグラフとしてコードに残し、レビューしやすくします。

ベースにあるのは **RDRA**（Relationship-Driven Requirements Analysis）です。アクターやBUC、ユースケース、画面、エンティティなどを宣言し、`performs` や `contains`、`creates` といった関係で明示的につなぐ、という書き方です。rdra-ishが実装しているのはその **RDRA-ISH** 寄りの読みで、原典の写しではなく、システム境界やAPI、アクセス制約、エンティティのライフサイクルなど、実装レビューに効く語彙を足しています。

同じソースから `check`、diagram、CSV、`states`、各種 `export` が出せます。ライフサイクルを厳密に見たいときは `export --kind tla` と `verify --backend tlc` でTLA+/TLCにも渡せます（手順は [形式検証](/projects/rdra-ish/formal-verification/)）。破壊的変更の一覧はupstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/main/CHANGELOG.md) です。

## どこから読むか

[インストール](/projects/rdra-ish/installation/) と [クイックスタート](/projects/rdra-ish/quickstart/) でサンプルを一度回すのが早いです。書き方の進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/)。構文は [言語リファレンス](/projects/rdra-ish/language-reference/)、図表とexportは [図表とエクスポート](/projects/rdra-ish/diagram-and-export/)、CLIは [CLI リファレンス](/projects/rdra-ish/cli-reference/)、エディタは [VS Code / LSP](/projects/rdra-ish/vscode-lsp/)、ソース開発は [開発環境](/projects/rdra-ish/development/) へ。

## BUC・フロー・ユースケース

レビュー単位は3つに分けて読むと混乱が減ります。**BUC** はビジネス価値のスライスとレビューの器、**ビジネスフロー** はその時間順の展開、**ユースケース** は効果を持つ相互作用の境界です。実務ではBUCで切り、フローで順番を追い、UCで1操作とそのデータ・画面・API効果に名前を付けます。

## まわりのツールとの関係

上流の要件モデルがrdra-ish、横断トレースが [dagayn](/projects/dagayn/)、実装のドメイン設計がkamae系、という並びで使うことが多いです。同じリポジトリに置いておけば、dagaynが設計書とコードをつなぐ入口になります。

## 向いていること / 向いていないこと

BUC単位で要件と設計のずれを見たいとき、CRUDマトリクスやシーケンス、状態到達性をモデルから出したいときに向いています。ライフサイクルはまず `states`、必要ならTLC、という段階も取れます。APIやDBのたたき台をモデルと揃えて差分管理したい場合、エージェントやCIと組む場合にも使えます。

議事録やユーザーストーリーだけで回る初期探索には向きません。RDRA原典の用語と手順をそのまま再現する道具でも、本番アプリや本番マイグレーションの代替でもありません。「正しいモデルか」を自動判定する魔法ではなく、関係を明示したモデルをレビューしやすくするためのものです。

## サンプル

リポジトリの `samples/` に例があります。学習の入口は `incremental-order`、コンパクトな全体像は `ec-site`、大きめは `clinic-ops`、個人情報は `personal-info`、TLA向けは `formal-verification/`（[形式検証](/projects/rdra-ish/formal-verification/)）です。

まずは [クイックスタート](/projects/rdra-ish/quickstart/) からどうぞ。
