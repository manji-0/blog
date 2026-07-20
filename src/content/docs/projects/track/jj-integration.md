---
title: "JJ連携"
description: "track と jj-task / $jj による開発ワークフロー（現行仕様）"
sidebar:
  order: 4
---

trackと[agent-skill-jj](https://github.com/manji-0/agent-skill-jj)を一緒に使うときの、いまの開発の進め方です。手作業とエージェント経由で、辿る骨格は共通です。実装の細部はupstreamの [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) とagent-skill-jj側のドキュメントを見てください。

## どう分かれているか

ざっくり言うと、trackは「何をやるか」、`$jj` と `jj-task` は「どうコミットしてPRするか」を持ちます。

track側ではタスクやTODO、スクラップ、チケット、そして `track status --json` が中心です。jj側ではワークスペースの作成、履歴の整形、prek、push、GitHubのPR操作が中心になります。

作業ディレクトリも役割が分かれています。リポジトリのルート（メインワークスペース）では `jj git fetch` と `jj-task` の管理だけをして、機能の実装は置きません。実装は `<repo>/.worktrees/<slug>/` のタスクワークスペースで進めます。どのタスクがどのディレクトリに対応するかは、だいたい `~/.config/jj/task-workspaces.json`（環境変数 `JJ_TASK_MAP` で差し替え可）に書いてあります。phaseやPRのURLもここに残ります。

対応関係は単純です。trackの1タスクに対してタスクワークスペースが1つ、bookmarkもだいたいslugと同名で1つ、PRも既定では1本です。TODOはtrack上のチェックリストで、調べものや計画だけなら `track todo add "…" --no-workspace` にしてワークスペースを要求しません。コードを書く作業は、例外なくタスクワークスペースの中でやります。

Gitに慣れている人向けの読み替えだけ書いておくと、branchにあたるのがbookmark、worktreeにあたるのがworkspace、機能ブランチで触っていた作業コピーがタスクワークスペース内の `@` です。

## セットアップ

jjが使えるリポジトリであること（多くの場合は `jj git init --colocate`）、trackが入っていること（[インストール](/projects/track/installation/)）、エージェント経由ならスキルと `jj-task` があること、が前提です。

```bash
npx skills add manji-0/track \
  -s track -s track-task-setup -s track-task-execute -s track-advanced -g -y

npx skills add manji-0/agent-skill-jj -s jj -g -y

ln -s /path/to/agent-skill-jj/skills/jj/scripts/jj-task.sh ~/.local/bin/jj-task
```

symlinkのパスは自分のclone位置に合わせてください。

リポジトリごと、メインで一度だけ登録します。

```bash
cd /path/to/example-service
jj-task repo init
```

何も指定しなければ `tasks_root` は `<main>/.worktrees`、trunkは `main@origin` です。

## slugの決まり方

ワークスペース名やbookmarkの種になる `jj.slug` は、アクティブなtrackタスクから次の順で決まります。エイリアスがあればそれを使い、なければチケットIDを小文字化した文字列（`PROJ-123` なら `proj-123`）、それも無ければ `task-{id}` です。

```bash
track alias set fix-rate-limit-42
```

`track status --json` を見れば、同じ値が `jj.slug` や `start_command` / `path_command` に載っています。

## いち通りの流れ

機能を1本仕上げるときのおおまかな順番です。

まずタスクとTODOを用意します。

```bash
track new "Fix rate limit edge cases" \
  --ticket PROJ-123 \
  --ticket-url https://github.com/acme/example/issues/123

track repo add .
track todo add "Reproduce and add failing test"
track todo add "Implement validation"
track todo add "Check existing rate-limit docs" --no-workspace
```

次にメインでワークスペースを起こして移動します。

```bash
jj git fetch
jj-task start fix-rate-limit-42
cd "$(jj-task path fix-rate-limit-42)"
```

`jj-task start` は、なければ `.worktrees/<slug>/` を作り、マップに `phase: draft` で登録し、bookmark名をslugに揃えます（既にあるなら再利用、`--bookmark` で名前だけ変えられます）。ここから先の編集とcommit、pushは、このディレクトリの外に出ない方が安全です。

Draftのうちに実装し、履歴もここで整えます。

```bash
jj new main@origin

# 実装…
jj commit -m 'feat(api): add rate limit validation'
jj commit -m 'test(api): cover limit edge cases'

jj bookmark create fix-rate-limit-42 -r @-
jj bookmark track fix-rate-limit-42
jj git push --bookmark fix-rate-limit-42

gh pr create --draft --base main
jj-task set fix-rate-limit-42 --pr 'https://github.com/acme/example/pull/N'
```

PRがDraftで、まだレビューを頼んでいないあいだは履歴をかなり自由にいじって構いません。`jj squash` や `jj split -i`、`jj rebase -b fix-rate-limit-42 -d main@origin` のあとbookmarkを動かしてpushする、という流れです。force pushもこの段階なら想定内です。

リポジトリに `.pre-commit-config.yaml` か `prek.toml` があるなら、`jj commit` の直前に **`prek`** を走らせてください。コマンド名は `pre-commit` ではありません。メッセージはConventional Commits（typeと、必要ならscope、あとはWhat。本文にWhy）に寄せます。プロセスだけの件名は避けた方がいいです。細かい規則はagent-skill-jjの `conventional-commits` にあります。

自分でも見てCIも通ったら、レビュー可能な状態へ進めます。

```bash
jj bookmark move fix-rate-limit-42 --to @-
jj git push --bookmark fix-rate-limit-42
gh pr ready
jj-task set fix-rate-limit-42 --phase in_review
```

レビューが始まったあとはルールが変わります。指摘対応は先端に積み上げるだけにして、すでに見られたコミットへsquashで戻したり、force pushで積み直したりはしません。

```bash
jj new fix-rate-limit-42
# フィードバック反映…
prek run … -a
jj commit -m 'fix(api): validate token expiry edge case'
jj bookmark move fix-rate-limit-42 --to @-
jj git push
```

GitHubではコミットハッシュか、`jj log` のchange IDを添えて返信し、再レビューを頼みます。レビュー中にmainが進んだときは、チームがGitHubの「Update branch」を使うならそちらを優先するのが無難です。

実装の合間にtrackへメモを残すのは、どのディレクトリからでも大丈夫です。アクティブタスクに載ります。

```bash
track scrap add "Chose sliding window over fixed window for burst traffic"
track todo done 1
track status --json
```

`track todo done` はあくまでtrack DB上の完了です。マージやワークスペースの破棄まではやりません。

PRがマージされたら閉じます。

```bash
jj-task done fix-rate-limit-42
# ディスク上も片付けるなら:
# jj-task done fix-rate-limit-42 --forget

track archive
```

`track archive` は、jj-task側のphaseが `merged` になっていること（互換で `done` も見ます）を完了の目安にしています。

## DraftとIn reviewで何が違うか

PRの見え方に合わせて、jjでやってよいことが分かれます。

Draft（レビュー未依頼）のうちは、squashやsplit、rebaseで履歴を整え、必要ならforce pushして構いません。人に見せる前の段階で、コミット列を論理的にしておくのが目的です。

Readyになってレビュー依頼を出したあとは、既存コミットへのsquashは止め、先端への `jj commit` と通常のpushだけにします。指摘ごとの差分が追いやすくなるように、というのが意図です。

マップ上のphaseは `draft` / `in_review` / `merged` のどれかです。GitHub側の状態が変わったら `jj-task set` で揃えておくと、エージェントも迷いにくいです。

```text
Draft                         In review
─────────────────────         ─────────────────────────
jj squash ✓                   squash into old commits ✗
jj split ✓                    jj commit on tip ✓
prek before jj commit ✓       prek before jj commit ✓
rebase + force push ✓         force push ✗
gh pr create --draft          gh pr ready + re-request
```

タスクあたりPRは1本が既定です。レイヤがちゃんと分かれていて、それぞれ単体でレビューとCIが通るときに限ってstacked PRを検討してください。判断材料はagent-skill-jjの `stacked-prs` にあります。

## エージェントが読むJSON

エージェントは作業を始めるたび、だいたいこれを見ます。

```bash
track status --json
```

だいたいこんな形です。

```json
{
  "workflow": {
    "phase": "sync_required",
    "next_action": { "command": "jj-task start proj-123", "reason": "…" },
    "checklist": [
      {
        "id": "jj_task_start",
        "label": "jj-task start in /repo",
        "done": false,
        "command": "jj-task start proj-123"
      }
    ]
  },
  "jj": {
    "slug": "proj-123",
    "skill": "jj",
    "workspace_registered": false,
    "task_phase": null,
    "workspace_path": "/repo/.worktrees/proj-123",
    "start_command": "jj-task start proj-123",
    "path_command": "jj-task path proj-123",
    "repo_init_command": "jj-task repo init"
  },
  "guardrails": {
    "must_use_jj_skill": true,
    "jj_skill_name": "jj",
    "reopen_forbidden": true,
    "complete_requires_jj_merge": false
  }
}
```

`workflow.phase` が `setup` ならrepoやTODOを足し、未登録なら `jj-task repo init` です。`sync_required` ならchecklistどおりに `jj-task start` します。`execute` に入ったらスクラップや `todo done` を進めつつ、タスクWSの中で `$jj` にコミットとPRを任せます。`task_complete` になったら、必要なら `jj-task done` のあと `track archive` です。

```text
track status --json
        ↓
jj-task start <slug>     （sync_required のとき）
        ↓
cd "$(jj-task path <slug>)"
        ↓
$jj                      （Draft → Ready → In review）
        ↓
track scrap / todo done
        ↓
jj-task done → track archive
```

`guardrails.must_use_jj_skill` がtrueなら、コミット系は `$jj` に寄せてください。マップを見ずにパスを当てずっぽうで作ると、ワークスペースが二重になります。機能の編集はメインではなくタスクワークスペースで、というのも同じ約束です。

## マップとjj-task

マップの既定パスは `~/.config/jj/task-workspaces.json` です。リポジトリごとにメインのパス、`tasks_root`、各タスクのworkspace / bookmark / phase / pr_urlが入ります。作業前に `jj-task list` や `jj-task show <slug>` を一度見る癖をつけると安心です。

よく使うサブコマンドは次のとおりです。

| コマンド | 用途 |
|---|---|
| `jj-task repo init [--tasks-root PATH] [--trunk REV]` | リポジトリをマップに登録する |
| `jj-task start <slug> [--bookmark NAME]` | タスクWSを作る、または既存を使う（メインから） |
| `jj-task list [--all]` | 一覧 |
| `jj-task show <slug>` | 詳細 |
| `jj-task path <slug>` | パスを出す（`cd` 用） |
| `jj-task set <slug> [--phase PHASE] [--pr URL]` | phaseやPR URLを更新する |
| `jj-task done <slug> [--forget]` | マージ後に `merged` にする。`--forget` でWSも忘れる |

メイン側はこうしておくのが無難です。

```bash
cd "$MAIN_REPO"
jj git fetch
jj new main@origin
```

メインの `@` は、同期用の空に近い作業コピーとして保ちます。うっかりルートで編集してしまったら、正しいタスクWSへ `jj squash --into` や `jj rebase` で移してください。

## 誰が何を持つか

trackはタスクとTODOの寿命、スクラップ、リンク、チケット、エイリアス、それから `status --json` とWeb UIの `GET /api/status`、最後の `archive` を持ちます。

`$jj` と `jj-task` は、メインとタスクWSの分離、グローバルマップ、Conventional Commits、prek、Draft / In reviewの切り替え、pushと `gh pr` を持ちます。線引きが曖昧な操作は、だいたい後者に寄せると事故りにくいです。

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [CLIリファレンス](/projects/track/cli-reference/)
- [Web UI](/projects/track/webui/)
- [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md)
- [agent-skill-jj](https://github.com/manji-0/agent-skill-jj)
