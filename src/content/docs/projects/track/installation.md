---
title: "インストール"
description: "track のインストール方法"
sidebar:
  order: 1
---

trackはRust製CLIです。現状の主な入手方法はソースからのビルドです。

## ソースからビルド

```bash
git clone https://github.com/manji-0/track.git
cd track
cargo build --release
cargo install --path .
```

バイナリ名は `track`（Cargoパッケージ名は `task-track`）。

## 確認

```bash
track --help
track list
```

## JJ連携（任意・推奨）

タスクワークスペースを使う場合は [agent-skill-jj](https://github.com/manji-0/agent-skill-jj) と `jj-task` を入れます。手順は [JJ連携](/projects/track/jj-integration/) を参照。

## シェル補完

bash / zsh / fish / PowerShell向けの補完を生成できます。

```bash
# zsh（動的・推奨）
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を追加し、exec zsh
```

詳細はupstreamの `completions/README.md` を参照。

## 次のステップ

- [クイックスタート](/projects/track/quickstart/)
- [CLIリファレンス](/projects/track/cli-reference/)
