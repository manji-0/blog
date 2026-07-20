---
title: "はじめに"
description: "ターミナルでMarkdownを読むTUIビューア bmd の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [bmd](https://github.com/manji-0/bmd) · 対象バージョン: **v0.4.1**

**bmd** は、ターミナルのままMarkdownを読むためのTUIです。ブラウザも外部のJSランタイムも要りません。差が出やすいのは、vim風の操作感と、[merman](https://crates.io/crates/merman)によるネイティブなMermaid描画です。KittyやiTerm2、WezTermなどグラフィックス対応端末では図や画像をインラインに出し、未対応ならUnicodeハーフブロックに落ちます。

見出しからテーブル、コードハイライト、タスクリスト（セッション内のトグルのみ）、文書内検索、リンクまわり（Web / アンカー / 相対 `.md` / プレビュー）まで、読むのに必要な一式は入っています。編集やチェックボックスのファイル書き戻しはしません。

## どこから読むか

[インストール](/projects/bmd/installation/) のあと [クイックスタート](/projects/bmd/quickstart/) で一度開けば十分です。キーは [キーバインド](/projects/bmd/keybindings/)、テーマやkeymapは [設定](/projects/bmd/configuration/)、ソースを触る人は [開発環境](/projects/bmd/development/) へ。

## 向いていること / 向いていないこと

READMEや設計メモをエディタと別ウィンドウに出さず読みたいとき、Mermaidをブラウザなしで確認したいときに向いています。長い文書を `j`/`k` と検索で辿る使い方も想定しています。

WYSIWYGのMarkdown編集や、タスクリストの永続化が欲しい用途には向きません。グラフィックス非対応の端末でも読めますが、図の見た目は落ちます。

設計の型の置き方は [kamae-rs](/projects/kamae-rs/) 寄りのままです。ライセンスはApache-2.0です。
