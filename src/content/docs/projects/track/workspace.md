---
title: "ワークスペース"
description: "track が所有する git / jj ワークスペース（v0.9.0）"
sidebar:
  order: 4
  label: "ワークスペース"
---

このページは、trackが所有するコーディング用ワークスペースの契約です。手で `git worktree`、`jj workspace add`、`jj-task` を叩きません。人手の一周は [クイックスタート](/projects/track/quickstart/) へ。エージェントが読むJSONとスキルは [エージェント](/projects/track/agents/) へ。実装の細部はupstreamの [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) です。

## 何を / どこで / どう

| 層 | 担当 |
| --- | --- |
| **何をやるか** | track（タスク、TODO、スクラップ、チケット、JSONのworkflowとhint） |
| **どこで書くか** | track（`.worktrees/<slug>/`、ブランチ／bookmark `track/<slug>`） |
| **どうコミットするか** | そのワークスペース内の git または jj |

1つのtrackタスクに対してワークスペースは1つです。調べものや計画だけなら `track todo add "…" --no-workspace` にしてワークスペースを要求しません。コードを書く作業は、例外なく `.worktrees/<slug>/` の中です。メインのチェックアウト（リポジトリルート）では機能実装しません。

```bash
track config set vcs-mode git          # 新規DBの既定
track config set vcs-mode jj           # colocated jj
track config set aggressive-mode on    # 空のマーカーrevision + git notes
```

既存データベースで、すでにタスクがあり `vcs-mode` を一度も書いていないものは **jj** のままです。新規DBは **git** です。別バックエンドのワークスペースが残った状態で `vcs-mode` を切り替えるとエラーになります。

## slugとPR head

ディレクトリ名と `track/<slug>` の種になる `git.slug` / `jj.slug` は、次の順で決まります。エイリアスがあればそれを使い、なければチケットIDを小文字化した文字列（`PROJ-123` なら `proj-123`）、それも無ければ `task-{id}` です。

```bash
track alias set fix-rate-limit-42
```

同じ値は `track status --json` の `hint.next_command` や `workspace_path` に載ります。読み方は [エージェント](/projects/track/agents/) です。

## 人間の流れ

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

`track archive` はワークスペースディレクトリを削除します。`--force` はdirtyチェックを飛ばすだけで、ファイルは残しません。確認プロンプトはTTY以外では失敗します。エージェント向けの待ち方は [エージェント](/projects/track/agents/) へ。

## git と jj

### git（`vcs-mode=git`）

`<repo>/.worktrees/<slug>/` に `git worktree add` します。ベースブランチのfetchはベストエフォートです。`.worktrees/` はコミットされた `.gitignore` ではなく `.git/info/exclude` で無視します。利用者が `git worktree` を手で叩く必要はありません。

### jj（`vcs-mode=jj`）

パスがgit-onlyなら `jj git init --colocate` したうえで `jj workspace add` します。Gitのcolocateは有効のままなので、`gh` とgit remoteは使えます。trackは `~/.config/jj/task-workspaces.json` を読みません。利用者が `jj workspace add` を手で叩く必要はありません。

## aggressive mode

onにすると、各 `(task, repo)` に空のマーカーrevisionが1つ付き、共有スクラップは `refs/notes/track` に載ります。`track scrap add` は既定でローカル、`--share` / `track scrap share` でnotes対象になります。公開は `track notes push`、復元は `track import` です。着想は [jjtask](https://github.com/Coobaha/jjtask) で、実装はtrackの中に閉じます。

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

## 次に読む

エージェントの読み方は [エージェント](/projects/track/agents/) です。実装の細部は [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) へ。
