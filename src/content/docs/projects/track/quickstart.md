---
title: "クイックスタート"
description: "track を最短で動かす手順"
sidebar:
  order: 2
---

このページは、タスク管理からワークスペースへ入るまでの手順です。slugや `vcs-mode`、aggressive modeは [ワークスペース](/projects/track/workspace/) へ。JSONとスキルは [エージェント](/projects/track/agents/) へ。

## タスクを作る

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

`track repo add`（または後からの `track sync`）が `.worktrees/<slug>/` を作ります。調べものだけでワークスペースが要らない項目は、`--no-workspace` を付けておきます。

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

`track todo done` はtrack DB上の完了です。mutatingコマンドは `--json` を付けると同じスナップショットが返ります。実装とcommitは、メインのチェックアウトではなくワークスペースの中で行ってください。

## 仕上げ

実装が終わったら `track/<slug>` をpushしてPRを出します。マージ後は `track archive` です。確認プロンプトの扱いは [エージェント](/projects/track/agents/) へ。

## ほかの入口

日次のTodayタスクは `track switch today` です。ブラウザから触るなら [Web UI](/projects/track/webui/) へ。

## 次に読む

契約を読むなら [ワークスペース](/projects/track/workspace/) です。コマンド表は [CLI リファレンス](/projects/track/cli-reference/) へ。
