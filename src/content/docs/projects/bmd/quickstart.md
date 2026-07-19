---
title: "クイックスタート"
description: "bmd を最短で動かす手順"
sidebar:
  order: 2
---

## ファイルを開く

```bash
bmd README.md
```

## stdin / パイプ

```bash
bmd < some-file.md
some-generator | bmd
bmd -   # stdinを明示
```

ファイルパスで開いた場合、保存すると自動リロードし、スクロール位置をなるべく保持します。

## チェックリスト表示

```bash
BMD_CHECKLIST_STYLE=unicode bmd notes.md
BMD_CHECKLIST_STYLE=emoji bmd notes.md
```

未設定時は端末種別に応じて自動選択します（詳細は [設定](/projects/bmd/configuration/)）。

## 最初の操作

| キー | 動作 |
|---|---|
| `j` / `k` | 下 / 上へスクロール |
| `/` | 前方検索 |
| `Tab` / `n` | 次の可視リンク（または検索ヒット） |
| `o` / `Enter` | リンクを開く / プレビュー |
| `h` | ヘルプオーバーレイ |
| `q` | 終了 |

キー一覧は [キーバインド](/projects/bmd/keybindings/)。

## サンプル

リポジトリの `sample.md` / `sample-gfm.md` / `sample.adoc` / `sample.rst` で描画を試せます（主な対象はMarkdown）。

## 次のステップ

| やりたいこと | ページ |
| --- | --- |
| 全キー | [キーバインド](/projects/bmd/keybindings/) |
| テーマ / keymap | [設定](/projects/bmd/configuration/) |
| ビルド・アーキテクチャ | [開発環境](/projects/bmd/development/) |
