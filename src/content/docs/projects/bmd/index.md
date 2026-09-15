---
title: "はじめに"
description: "ターミナルでMarkdownを読むTUIビューア bmd の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [bmd](https://github.com/manji-0/bmd) · 対象バージョン: **v0.5.0** · ライセンス: Apache-2.0

**bmd** は、ターミナルのままMarkdownを読むためのTUIです。ブラウザも外部のJSランタイムも要りません。

## 目的

READMEや設計メモをエディタと別ウィンドウに出さず、ターミナル内で読めるようにします。

## 背景

開発中のドキュメントはエディタ横にブラウザを置く運用が多いですが、SSH先やタイル型端末ではウィンドウ分割が煩雑になります。Mermaid図の確認だけのためにHTMLを生成する手間も避けたい場面があります。

## 関連文書

| 種別 | リンク |
| --- | --- |
| upstream | [PLAN.md](https://github.com/manji-0/bmd/blob/main/PLAN.md)（設計メモ、日本語） |
| upstream | `docs/func-check/`（機能確認用Markdown） |

## 目標

vim風の操作で長文を `j`/`k` と検索で辿れるようにします。[merman](https://crates.io/crates/merman) によるネイティブMermaid描画で、ブラウザなしに図を確認できるようにします。KittyやiTerm2等のグラフィックス端末では図や画像をインライン表示し、未対応端末ではUnicodeハーフブロックにフォールバックします。

## 対象外

WYSIWYGのMarkdown編集、タスクリストのファイル書き戻し、Webアプリのレンダリング代替には向きません。グラフィックス非対応端末でも読めますが、図の見た目は落ちます。

## シナリオ

1. 開発者がSSH先のリポジトリで `bmd docs/design.md` を起動する。
2. `t` で見出しアウトラインを開き、該当セクションへジャンプする。
3. 文中のMermaidブロックで `o` を押し、mermanがKittyプロトコルで図をインライン表示する。
4. 相対リンク `./api.md` を `Enter` で開き、ファイルスタックで戻る。
5. `/` で用語を検索し、該当箇所へ移動する。

## 構成

```diagram-design bmd-render
```

見出し、テーブル、コードハイライト（syntect）、タスクリスト（セッション内トグルのみ）、文書内検索、リンク（Web / アンカー / 相対 `.md` / プレビュー）を備えます。v0.5.0から見出しアウトライン（`t`）、スクロールマーク（`ma` / `'a`）、yank（選択・リンク・見出しslug・コードブロック）もあります。

## 制約

編集やチェックボックスの永続化は行いません。WebリンクはmacOSで `open`、Linuxで `xdg-open` に依存します。アンカーと文書ナビのスタックは各最大64層です。

## インタフェース

| 面 | 入口 |
| --- | --- |
| CLI | `bmd README.md`、`bmd < file.md`、パイプ |
| キー操作 | Normal / Search / Preview モード（[キーバインド](/projects/bmd/keybindings/)） |
| 設定 | `~/.config/bmd/config.toml`（[設定](/projects/bmd/configuration/)） |

## 依存

| 依存 | 役割 |
| --- | --- |
| ratatui / crossterm | TUI描画・入力 |
| pulldown-cmark | Markdownパース |
| syntect | コードハイライト |
| merman | Mermaidラスター描画 |
| ratatui-image / image | 画像プレビュー |

Rust 1.92以上が必要です（パッケージの `rust-version` に準拠）。

## 検討して捨てた案

**ブラウザプレビュー必須**：オフラインとSSH先での即読を優先し、TUI内完結にしました。

**Mermaidを外部CLI（mmdc等）に委譲**：Node依存と起動コストを避け、mermanによるネイティブ描画にしました。

**編集モード**：スコープを読む体験に絞り、ファイル書き戻しは載せませんでした。

## 次に読む

インストールと起動は [使い方](/projects/bmd/usage/) です。Mermaid描画の詳細は [レンダリング](/projects/bmd/rendering/) へ。
