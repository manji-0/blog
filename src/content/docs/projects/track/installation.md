---
title: "インストール"
description: "track のインストール方法"
sidebar:
  order: 1
---

このページはバイナリの入れ方です。スキルとJSONは [エージェント](/projects/track/agents/) へ。git / jjの既定は [ワークスペース](/projects/track/workspace/) へ。

trackはRust製のCLIです。Cargo上のパッケージ名は `task-track`、動くバイナリの名前は `track` です。

## crates.io（推奨）

```bash
cargo install task-track
track --help
track list
```

ソースから入れる場合：

```bash
git clone https://github.com/manji-0/track.git
cd track
cargo install --path .
```

ここまでで [クイックスタート](/projects/track/quickstart/) に進めます。エージェントにphaseを読ませるなら、[エージェント](/projects/track/agents/) のスキル導入を見てください。

## シェル補完

bash / zsh / fish / PowerShell向けに出せます。zshなら例えばこうです。

```bash
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を足してから exec zsh
```

ほかのシェルやトラブルシュートはupstreamの [completions/README.md](https://github.com/manji-0/track/blob/main/completions/README.md) を見てください。

## 次に読む

手を動かすなら [クイックスタート](/projects/track/quickstart/) です。コマンド表は [CLI リファレンス](/projects/track/cli-reference/) へ。
