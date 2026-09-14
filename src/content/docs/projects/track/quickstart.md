---
title: "クイックスタート"
description: "track を最短で動かす手順"
sidebar:
  order: 2
---

このページは、タスク管理からコーディング用ワークスペースまで、track単体で一通り触る手順です。git / jjの切り替えやaggressive modeは [VCS連携](/projects/track/jj-integration/) を読んでください。

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

slugはエイリアス、なければチケットID（`AUTH-456` → `auth-456`）、それも無ければ `task-{id}` です。GitHubのPR headは `track/<slug>` です。

## メモと完了

```bash
track scrap add "Using bcrypt for password hashing"
track todo done 1
track status --json
```

`track todo done` はtrack DB上の完了です。mutatingコマンドは `--json` を付けると同じスナップショットが返ります。実装とcommitは、メインのチェックアウトではなくワークスペースの中で行ってください。

## Todayタスク

```bash
track switch today
```

前日に残ったTODOを引き継ぐ日次用のタスクです。カレンダーを出すなら `track config set-calendar <calendar-id>` を先に。

## Web UI

```bash
track webui --open
```

ブラウザからタスクやTODO、スクラップを触りたいとき用です。細かい機能は [Web UI](/projects/track/webui/) へ。

## 仕上げ

実装が終わったら `track/<slug>` をpushしてPRを出します。マージ後は `track archive` です。確認プロンプトはTTY以外では失敗するので、エージェントは待たずにhintへ従ってください。`todo delete` だけは常に `--force` が要ります。

コマンド一覧は [CLI リファレンス](/projects/track/cli-reference/) です。
