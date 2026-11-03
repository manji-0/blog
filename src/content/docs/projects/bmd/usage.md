---
title: "使い方"
description: "bmd のインストールから基本操作まで"
sidebar:
  order: 1
---

このページは、bmdのインストールと最短の起動手順を扱います。キー一覧は [キーバインド](/projects/bmd/keybindings/) へ。テーマやkeymapは [設定](/projects/bmd/configuration/) へ。

## インストール

bmdはRust製のTUIです。crates.ioからのインストール、またはソースビルドが使えます。

### crates.io（推奨）

```bash
cargo install bmd
bmd README.md
```

Rust 1.98以上が必要です（パッケージの `rust-version` に準拠）。

### ソースから

```bash
git clone https://github.com/manji-0/bmd.git
cd bmd
devbox run setup
devbox run build-release
./target/release/bmd sample.md
```

[devbox](https://www.jetify.com/devbox)はRustツールチェーン、clang、sccache、prekを揃えます。ソース開発の詳細は [レンダリング](/projects/bmd/rendering/) を参照してください。

## ターミナル要件

- Webリンク： macOSは `open`、Linuxは `xdg-open`
- インラインMermaid / 画像： Kitty、Ghostty、iTerm2、WezTermなどグラフィックスプロトコル対応端末が望ましい

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

ファイルパスで開いた場合、保存すると自動リロードし、スクロール位置をなるべく保持します。引数に渡せる入力は1つだけです。

## GitHub上のファイル

GitHubのblob URLを渡すと、そのファイルを取得して表示します。認証は `gh auth token`、次に `GITHUB_TOKEN` の順に使います。

```bash
bmd https://github.com/manji-0/bmd/blob/main/README.md
```

プルリクエストのURLは `--pr-listing` を付けたときだけ受け付けます。変更された文書ファイルの一覧を表示します。フラグなしでPRのURLを渡すとエラーになります。

```bash
bmd --pr-listing https://github.com/OWNER/REPO/pull/123
```

## チェックリスト表示

```bash
BMD_CHECKLIST_STYLE=unicode bmd notes.md
BMD_CHECKLIST_STYLE=emoji bmd notes.md
BMD_CHECKLIST_STYLE=ascii bmd notes.md
```

環境変数は `config.toml` の `[view] checklist` より優先します。どちらも無いときは端末種別に応じて自動選択します。詳細は [設定](/projects/bmd/configuration/) を参照してください。

## 最初の操作

| キー | 動作 |
|---|---|
| `j` / `k` | 下 / 上へスクロール |
| `t` | 見出しアウトラインをピン留め |
| `/` | 前方検索 |
| `y` | 選択をコピー（続けて `l` / `h` / `c`） |
| `Tab` / `n` | 文書内の次のリンク（または検索ヒット） |
| `o` / `Enter` | リンクを開く / プレビュー |
| `h` | ヘルプオーバーレイ |
| `q` | 終了 |

## 次に読む

キー操作の全一覧は [キーバインド](/projects/bmd/keybindings/) です。Mermaid描画は [レンダリング](/projects/bmd/rendering/) へ。
