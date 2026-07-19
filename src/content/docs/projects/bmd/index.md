---
title: "はじめに"
description: "ターミナルでMarkdownを読むTUIビューア bmd の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [bmd](https://github.com/manji-0/bmd) · 対象バージョン: **v0.4.1**

**bmd** は、ターミナル向けのMarkdownビューアです。vim風キーバインド、リッチなマークアップ描画、ネイティブMermaid図、文書内検索、対話的なタスクリストを1つのTUIにまとめています。ブラウザや外部JSランタイムを必要としません。

## 何をするか

- **Markdown描画** — 見出し、段落、コード（syntectハイライト）、引用、リスト、テーブル、水平線
- **タスクリスト** — `- [ ]` / `- [x]` をチェックボックス表示。クリックまたは `x` でトグル（セッションのみ、ファイルへは書かない）
- **vim風ナビ** — `j`/`k`、半ページ、`g`/`G`、見出しジャンプ
- **検索** — `/` 前方、`?` 後方。ヒットはハイライト、`n`/`N`で移動
- **リンク** — WebはOSのブラウザ、`#anchor`は文書内ジャンプ、相対`.md`は同ビューで開く。画像・Mermaidはフローティングプレビュー
- **Mermaid / 画像** — [merman](https://crates.io/crates/merman)でラスタ化し、Kitty / iTerm2 / Sixel等のグラフィックスプロトコルでインライン表示（未対応時はUnicodeハーフブロック）

## ドキュメントの読み方

1. [インストール](/projects/bmd/installation/)
2. [クイックスタート](/projects/bmd/quickstart/)
3. [キーバインド](/projects/bmd/keybindings/)
4. [設定](/projects/bmd/configuration/) — テーマとkeymap
5. [開発環境](/projects/bmd/development/)

## 使うべき場面 / 使わない場面

**向いているケース**

- READMEや設計メモをターミナルのまま読みたい
- Mermaidをブラウザなしで確認したい
- vim操作感で長い文書をスクロール・検索したい

**向いていないケース**

- MarkdownのWYSIWYG編集（ビューアでありエディタではない）
- タスクリストの永続化（トグルはセッション限定）
- グラフィックス非対応ターミナルでの高品質な図表示（フォールバックはある）

## 他プロジェクトとの関係

| プロジェクト | 関係 |
| --- | --- |
| **[merman](https://crates.io/crates/merman)** | MermaidのRustネイティブ描画 |
| **[kamae-rs](/projects/kamae-rs/)**（設計思想） | 型安全なドメインモデルと状態遷移 |

ライセンスはApache-2.0。
