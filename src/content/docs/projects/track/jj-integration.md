---
title: "VCS連携"
description: "track が所有する git / jj ワークスペース（v0.9.0）"
sidebar:
  order: 4
  label: "VCS連携"
---

trackはコーディング用ワークスペースを自分で作ります。エージェントと人間はいずれも `git worktree`、`jj workspace add`、`jj-task` を手で叩きません。実装の細部はupstreamの [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) を見てください。

## どう分かれているか

| 層 | 担当 |
| --- | --- |
| **何をやるか** | track（タスク、TODO、スクラップ、チケット、JSONのworkflowとhint） |
| **どこで書くか** | track（`.worktrees/<slug>/`、ブランチ／bookmark `track/<slug>`） |
| **どうコミットするか** | そのワークスペース内の git または jj |

```bash
track config set vcs-mode git          # 新規DBの既定
track config set vcs-mode jj           # colocated jj
track config set aggressive-mode on    # 空のマーカーrevision + git notes
```

既存データベースで、すでにタスクがあり `vcs-mode` を一度も書いていないものは **jj** のままです。新規DBは **git** です。別バックエンドのワークスペースが残った状態で `vcs-mode` を切り替えるとエラーになります。

1つのtrackタスクに対してワークスペースは1つです。調べものや計画だけなら `track todo add "…" --no-workspace` にしてワークスペースを要求しません。コードを書く作業は、例外なく `.worktrees/<slug>/` の中です。メインのチェックアウト（リポジトリルート）では機能実装しません。

## slugの決まり方

ディレクトリ名と `track/<slug>` の種になる `git.slug` / `jj.slug` は、次の順で決まります。エイリアスがあればそれを使い、なければチケットIDを小文字化した文字列（`PROJ-123` なら `proj-123`）、それも無ければ `task-{id}` です。

```bash
track alias set fix-rate-limit-42
```

`track status --json` を見れば、同じ値が `hint.next_command` や `workspace_path` に載っています。

## いち通りの流れ

```bash
track new "Fix rate limit edge cases" \
  --ticket PROJ-123 \
  --ticket-url https://github.com/acme/example/issues/123

track repo add .
track todo add "Reproduce and add failing test"
track todo add "Implement validation"
track todo add "Check existing rate-limit docs" --no-workspace
```

`track repo add` か `track sync` がワークスペースを作ります。stderrの `next:` に従って移動します。

```bash
cd "/path/to/example-service/.worktrees/proj-123"
# 実装と commit / push はこのディレクトリの外に出ない
```

Gitモードならブランチ `track/proj-123`、jjモードならbookmark `track/proj-123` がGitHubのPR headです。

```bash
# git
git push -u origin track/proj-123
gh pr create --base main

# jj（colocated）
jj git push --named track/proj-123
gh pr create --base main
```

実装の合間にtrackへメモを残すのは、どのディレクトリからでも大丈夫です。アクティブタスクに載ります。

```bash
track scrap add "Chose sliding window over fixed window for burst traffic"
track todo done 1 --json
```

`track todo done` はtrack DB上の完了です。aggressive modeがonなら、未公開のWIPをTODO 1件あたり1コミットに畳み、共有スクラップはそのSHAのgit notesになります。公開済みSHAの書き換えはしません。続きは新しいTODOです。

PRがマージされたら閉じます。

```bash
track archive
```

`track archive` はワークスペースディレクトリを削除します。`--force` はdirtyチェックを飛ばすだけで、ファイルは残しません。確認プロンプトはTTY以外では失敗するので、エージェントは待たないでください。

## git と jj

### git（`vcs-mode=git`）

`<repo>/.worktrees/<slug>/` に `git worktree add` します。ベースブランチのfetchはベストエフォートです。`.worktrees/` はコミットされた `.gitignore` ではなく `.git/info/exclude` で無視します。

### jj（`vcs-mode=jj`）

パスがgit-onlyなら `jj git init --colocate` したうえで `jj workspace add` します。Gitのcolocateは有効のままなので、`gh` とgit remoteは使えます。trackは `~/.config/jj/task-workspaces.json` を読みません。

### aggressive mode

onにすると、各 `(task, repo)` に空のマーカーrevisionが1つ付き、共有スクラップは `refs/notes/track` に載ります。`track scrap add` は既定でローカル、`--share` / `track scrap share` でnotes対象になります。公開は `track notes push`、復元は `track import` です。着想は [jjtask](https://github.com/Coobaha/jjtask) で、実装はtrackの中に閉じます。

## エージェントが読むJSON

```bash
track status --json
```

だいたいこんな形です（gitモードの例）。

```json
{
  "vcs_mode": "git",
  "aggressive": false,
  "workflow": {
    "phase": "sync_required",
    "next_action": {
      "command": "track sync",
      "reason": "Create git worktree at .worktrees/proj-123 on branch/bookmark track/proj-123"
    }
  },
  "hint": {
    "next_command": "track sync",
    "post_state": "workspace missing at /repo/.worktrees/proj-123 — run track sync"
  },
  "git": {
    "slug": "proj-123",
    "branch": "track/proj-123",
    "workspace_path": "/repo/.worktrees/proj-123",
    "sync_command": "track sync"
  },
  "guardrails": {
    "must_use_jj_skill": false,
    "reopen_forbidden": true
  }
}
```

jjモードでは `git` キーを省略し、`jj` キーを返します。`start_command` は `track sync`、`path_command` は `cd "<path>"` です。`must_use_jj_skill` は常に `false` です。

| Phase | Track側の次の手 |
| --- | --- |
| `setup` | `track repo add`、`track todo add` |
| `sync_required` | `track sync`（ワークスペース作成） |
| `execute` | ワークスペースへ `cd`、`track scrap add`、`track todo done` |
| `task_complete` | `track/<slug>` をpushしてPRをマージし、`track archive` |

## jj-task からの移行

v0.8以前は、ワークスペース作成を `jj-task start` に任せる二層構成でした。v0.9ではtrackが所有します。

| 旧（jj-task） | いま |
| --- | --- |
| `jj-task start <slug>` | `track sync` / `track repo add` |
| `jj-task path <slug>` | `hint.next_command` / `cd "<workspace_path>"` |
| `~/.config/jj/task-workspaces.json` | Track DB + ファイルシステム |
| TODOごとのworktree | タスクあたりワークスペース1つ |

`track todo add --worktree` は削除済みです。古いDB行が残っているときだけ：

```bash
track migrate legacy-worktrees --dry-run
track migrate legacy-worktrees
track sync
```

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [CLI リファレンス](/projects/track/cli-reference/)
- [Web UI](/projects/track/webui/)
- [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md)
