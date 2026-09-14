---
title: "エージェント"
description: "track のスキル、JSON、エージェント向けガードレール"
sidebar:
  order: 5
  label: "エージェント"
---

このページは、コーディングエージェントがtrackを読むときの契約です。MCPではありません。入口はスキルと `track llm-help` と `--json` です。ワークスペースの所有モデルは [ワークスペース](/projects/track/workspace/) へ。人手の一周は [クイックスタート](/projects/track/quickstart/) へ。

## スキルを入れる

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

`jj-task` は使いません。`track status --json` の `hint` と `workflow.next_action` に従ってください。

## phaseと次のコマンド

| Phase | Track側の次の手 |
| --- | --- |
| `setup` | `track repo add`、`track todo add` |
| `sync_required` | `track sync`（ワークスペース作成） |
| `execute` | ワークスペースへ `cd`、`track scrap add`、`track todo done` |
| `task_complete` | `track/<slug>` をpushしてPRをマージし、`track archive` |

人間向け出力の末尾には `hint:` / `next:` が付きます。mutatingコマンドに `--json` を付けると、`track status --json` と同じスナップショットに `mutation` が足されます。消すときは `TRACK_HINTS=0` です。

## JSONの読み方

```bash
track status --json
```

gitモードならだいたい次の形です。見るのは `hint.next_command` とワークスペースのパスです。

```json
{
  "vcs_mode": "git",
  "workflow": {
    "phase": "execute",
    "next_action": {
      "command": "cd \"/repo/.worktrees/proj-123\""
    }
  },
  "hint": {
    "next_command": "cd \"/repo/.worktrees/proj-123\""
  },
  "git": {
    "slug": "proj-123",
    "workspace_path": "/repo/.worktrees/proj-123"
  }
}
```

jjモードでは `git` キーを省略し、`jj` キーを返します。`start_command` は `track sync`、`path_command` は `cd "<path>"` です。`must_use_jj_skill` は常に `false` です。フルスキーマはupstreamの [LLM_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/LLM_INTEGRATION.md) へ。

Web UI起動中は `GET /api/status` でも同じ状態が取れます。フィールドの意味はこのページと同じです。

## ガードレール

- 確認プロンプトはTTY以外では失敗します。待たずに `hint` へ従ってください。
- `track todo delete N` は常に `--force` が要ります。
- `track archive --force` は、利用者がdirtyチェックのスキップを明示したときだけです。ディレクトリは消えます。
- 完了したTODOの再オープンはできません。続きは新しいTODOです。
- aggressive modeでは、公開済みSHAを書き換えません。

## 次に読む

ワークスペースの契約は [ワークスペース](/projects/track/workspace/) です。エージェント連携の細部は [LLM_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/LLM_INTEGRATION.md) へ。
