---
title: "使い方"
description: "track のインストールと初回の一周"
sidebar:
  order: 1
  label: "使い方"
---

このページは、バイナリの入れ方からタスク作成・ワークスペース入室・PRまでの手順です。slugや `vcs-mode` の契約は [ワークスペース](/projects/track/workspace/) へ。JSONとスキルは [エージェント](/projects/track/agents/) へ。

## インストール

trackはRust製CLIです。Cargo上のパッケージ名は `task-track`、動くバイナリの名前は `track` です。

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

## タスクの作成

```bash
track new "Implement User Authentication" \
  --ticket AUTH-456 \
  --ticket-url https://jira.example.com/browse/AUTH-456
```

作った瞬間、そのタスクがアクティブになります。TODOやスクラップは、切り替えるまでここに付きます。

## リポジトリとTODO

```bash
track repo add .
track todo add "Design database schema"
track todo add "Compare auth providers" --no-workspace
```

`track repo add`（または後からの `track sync`）が `.worktrees/<slug>/` を作ります。調べものだけでワークスペースが要らない項目は `--no-workspace` を付けます。

コマンドの末尾（stderrの `next:`、JSONなら `hint.next_command`）が次に入るディレクトリを示します。

```bash
cd "/path/to/repo/.worktrees/auth-456"
```

slugの決まり方は [ワークスペース](/projects/track/workspace/) です。GitHubのPR headは `track/<slug>` です。

## メモと完了

```bash
track scrap add "Using bcrypt for password hashing"
track todo done 1
track status --json
```

`track todo done` はtrack DB上の完了です。mutatingコマンドは `--json` を付けると同じスナップショットが返ります。実装とcommitはワークスペースの中で行ってください。

## PRと片付け

実装が終わったら `track/<slug>` をpushしてPRを出します。マージ後は `track archive` です。確認プロンプトの扱いは [エージェント](/projects/track/agents/) へ。

```bash
# git
git push -u origin track/auth-456
gh pr create --base main

# jj（colocated）
jj git push --named track/auth-456
gh pr create --base main
```

## シェル補完

bash / zsh / fish / PowerShell向けに出せます。zshなら例えばこうです。

```bash
mkdir -p ~/.zsh/completions
track completion zsh --dynamic > ~/.zsh/completions/_track
# ~/.zshrc に fpath=(~/.zsh/completions $fpath) を足してから exec zsh
```

ほかのシェルやトラブルシュートはupstreamの [completions/README.md](https://github.com/manji-0/track/blob/main/completions/README.md) を見てください。

## 日次運用

`track switch today` でTodayタスクに切り替えます。前日に終わらなかったTODOを持ち越せます。ブラウザから触るなら [Web UI](/projects/track/webui/) へ。

## 次に読む

契約を読むなら [ワークスペース](/projects/track/workspace/) です。コマンド表は [CLI リファレンス](/projects/track/cli-reference/) へ。
