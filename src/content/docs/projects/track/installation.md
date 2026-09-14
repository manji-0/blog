---
title: "インストール"
description: "track のインストール方法"
sidebar:
  order: 1
---

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

ここまでで [クイックスタート](/projects/track/quickstart/) のタスク・TODO・スクラップは使えます。リポジトリを登録すると、同じ流れでコーディング用ワークスペースも作れます。

## エージェント向けスキル

エージェントにtrackのphaseを読ませるなら、スキルを入れてください。入口は `track status --json` の `hint` / `workflow.next_action` です。`jj-task` は使いません。

```bash
npx skills add manji-0/track \
  -s track -s track-task-setup -s track-task-execute -s track-advanced \
  -g -a cursor -a claude-code -a codex -y
```

| Skill | いつ使うか |
| --- | --- |
| `track` | ルーター。`workflow.phase` を見て振り分ける |
| `track-task-setup` | タスク・repo・TODOの用意（`setup`） |
| `track-task-execute` | ワークスペース内の実装ループ |
| `track-advanced` | archive、マルチリポジトリ、hotfix |

## VCSモード

新規のデータベースでは `vcs-mode` の既定は **git** です。colocated jjでワークスペースを切るなら：

```bash
track config set vcs-mode jj
track config show
```

すでにタスクがある既存DBで `vcs-mode` を一度も書いていない場合は **jj** のままです。詳細は [VCS連携](/projects/track/jj-integration/) へ。

## シェル補完

bash / zsh / fish / PowerShell向けに出せます。zshなら例えばこうです。

```bash
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を足してから exec zsh
```

ほかのシェルやトラブルシュートはupstreamの [completions/README.md](https://github.com/manji-0/track/blob/main/completions/README.md) を見てください。コマンドを探すなら [CLI リファレンス](/projects/track/cli-reference/) へ。
