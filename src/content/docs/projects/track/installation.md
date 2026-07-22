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

ここまでで [クイックスタート](/projects/track/quickstart/) の前半（タスク・TODO・スクラップ）は使えます。

### タスクワークスペースまで使うなら

jj連携が必要です。[agent-skill-jj](https://github.com/manji-0/agent-skill-jj) と `jj-task` を入れたうえで、手順は [JJ連携](/projects/track/jj-integration/) を見てください。`jj-task` 未導入のままクイックスタート後半に進むと失敗します。

シェル補完はbash / zsh / fish / PowerShell向けに出せます。zshなら例えばこうです。

```bash
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を足してから exec zsh
```

ほかのシェルやトラブルシュートはupstreamの [completions/README.md](https://github.com/manji-0/track/blob/main/completions/README.md) を見てください。コマンドを探すなら [CLI リファレンス](/projects/track/cli-reference/) へ。
