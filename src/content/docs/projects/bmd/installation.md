---
title: "インストール"
description: "bmd のインストール方法"
sidebar:
  order: 1
---

bmdはRust製のTUIです。crates.ioからのインストール、またはソースビルドが使えます。

## crates.io（推奨）

```bash
cargo install bmd
bmd --help
```

Rust 1.92以上が必要です（パッケージの `rust-version` に準拠）。

## ソースから（devbox推奨）

```bash
git clone https://github.com/manji-0/bmd.git
cd bmd
devbox run setup
devbox run build-release
./target/release/bmd sample.md
```

[devbox](https://www.jetify.com/devbox)はRustツールチェーン、clang、sccache、prekを揃えます。詳細は [開発環境](/projects/bmd/development/)。

## ターミナル要件

- Webリンク： macOSは `open`、Linuxは `xdg-open`
- インラインMermaid / 画像： Kitty、Ghostty、iTerm2、WezTermなどグラフィックスプロトコル対応端末が望ましい

## 次のステップ

- [クイックスタート](/projects/bmd/quickstart/)
- [キーバインド](/projects/bmd/keybindings/)
