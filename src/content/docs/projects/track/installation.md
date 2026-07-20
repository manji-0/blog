---
title: "インストール"
description: "track のインストール方法"
sidebar:
  order: 1
---

trackはRust製のCLIで、いまのところソースからビルドして入れるのが主な入手経路です。

```bash
git clone https://github.com/manji-0/track.git
cd track
cargo build --release
cargo install --path .
```

動くバイナリの名前は `track` です。Cargo上のパッケージ名だけ `task-track` になっています。

```bash
track --help
track list
```

タスクワークスペースまで使うなら、[agent-skill-jj](https://github.com/manji-0/agent-skill-jj) と `jj-task` も入れます。手順は [JJ連携](/projects/track/jj-integration/) にあります。

シェル補完はbash / zsh / fish / PowerShell向けに出せます。zshなら例えばこうです。

```bash
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を足してから exec zsh
```

ほかのシェルやトラブルシュートはupstreamの `completions/README.md` を見てください。動かし始めたら [クイックスタート](/projects/track/quickstart/)、コマンドを探すなら [CLIリファレンス](/projects/track/cli-reference/) へ。
