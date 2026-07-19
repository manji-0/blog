---
title: "JJ連携"
description: "track と agent-skill-jj / jj-task の二層スタック"
sidebar:
  order: 4
---

trackと[agent-skill-jj](https://github.com/manji-0/agent-skill-jj)は、エージェント向けに役割を分けた **二層スタック** です。

| レイヤ | ツール | 責務 |
|---|---|---|
| **Task** | `track` + track skills | 何をやるか — タスク、TODO、スクラップ、チケット、JSON workflow |
| **JJ / PR** | `$jj` + `jj-task` | どうコミットするか — ワークスペース、squash、二段階PR、prek、push |

## インストール

```bash
npx skills add manji-0/track \
  -s track -s track-task-setup -s track-task-execute -s track-advanced -g -y

npx skills add manji-0/agent-skill-jj -s jj -g -y

ln -s "$(pwd)/../agent-skill-jj/skills/jj/scripts/jj-task.sh" ~/.local/bin/jj-task
```

パスは環境に合わせて調整してください。

## エージェントループ（要約）

```text
track status --json     →  workflow.phase + jj.slug + next_action
        ↓
jj-task start <slug>    →  .worktrees/<slug>/
        ↓
cd "$(jj-task path <slug>)"  →  メインではなくタスクWSで実装
        ↓
$jj skill               →  prek、jj squash/commit、PR、push
        ↓
track scrap add / track todo done
        ↓
完了後: $jj + jj-task done + track archive
```

## 責務の境界

**trackが持つもの**

- タスク / TODOライフサイクル
- スクラップ、リンク、チケット、エイリアス
- `track status --json` / `GET /api/status`（workflow、jj、todos_agent、guardrails）
- Web UI
- `track archive`

**`$jj` / jj-taskが持つもの**

- メインワークスペースは同期専用（機能編集はしない）
- タスクワークスペース `.worktrees/<slug>/`
- コミット規約、prek、draft / in-reviewのPRフェーズ、push

## jj.slugの導出

1. `track alias` があればそれ
2. なければ `ticket_id`（例： `PROJ-123` → `proj-123`）
3. なければ `task-{id}`

チケットIDがslugに向かないときはエイリアスを設定します。

```bash
track alias set fix-oauth-refresh
```

詳細はupstreamの [docs/JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) を参照。

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [CLIリファレンス](/projects/track/cli-reference/)
