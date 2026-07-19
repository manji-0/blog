---
title: "JJ連携"
description: "track と jj-task / $jj による開発ワークフロー"
sidebar:
  order: 4
---

trackと[agent-skill-jj](https://github.com/manji-0/agent-skill-jj)は、エージェント向けに役割を分けた **二層スタック** です。このページでは「タスクを作ってからマージしてアーカイブするまで」のjj開発ワークフローを、人間の手作業とエージェントの両方の視点で説明します。

| レイヤ | ツール | 責務 |
|---|---|---|
| **Task** | `track` + track skills | 何をやるか — タスク、TODO、スクラップ、チケット、`status --json` |
| **JJ / PR** | `$jj` skill + `jj-task` | どうコミットするか — ワークスペース、squash、二段階PR、prek、push |

完全な仕様はupstreamの [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md) と [agent-skill-jj](https://github.com/manji-0/agent-skill-jj) を参照。

## なぜこのモデルか

Gitのブランチ＋worktreeをそのまま真似するのではなく、jjの **bookmark** と **workspace** を前提にしています。

| 原則 | 意味 |
|---|---|
| **メインは同期専用** | リポジトリルート（メインワークスペース）では機能実装しない。`jj git fetch` と `jj-task` の管理だけ |
| **タスク＝1ワークスペース** | 1つのtrackタスクに対し `.worktrees/<slug>/` を1つ。TODOごとには切らない |
| **調査TODOはWSなし** | `track todo add "…" --no-workspace` は計画・調査用。実装はタスクWSで行う |
| **コミットは `$jj`** | 素の `jj describe` だけでPRフェーズを進めない。DraftとIn reviewで操作が変わる |

旧来の「TODOごとにworktree」「`track sync` してからルートで編集」は **レガシー** です（後述）。

## 用語対応

| Git感覚 | jj / track |
|---|---|
| branch | bookmark（通常はslugと同名） |
| worktree | workspace（`.worktrees/<slug>/`） |
| 機能ブランチ上の作業 | タスクワークスペース内の `@` |
| force pushで履歴整形 | Draftフェーズのみ許可 |

## インストール

```bash
# Track側スキル（WHAT）
npx skills add manji-0/track \
  -s track -s track-task-setup -s track-task-execute -s track-advanced -g -y

# JJ / PR側スキル（HOW）
npx skills add manji-0/agent-skill-jj -s jj -g -y

# jj-task を PATH に
ln -s /path/to/agent-skill-jj/skills/jj/scripts/jj-task.sh ~/.local/bin/jj-task
```

前提： 対象リポジトリでjjが使えること（多くは `jj git init --colocate`）。パスは環境に合わせて調整してください。

## 全体像（人間向けウォークスルー）

典型的な機能開発は次の順です。

### 1. trackでタスクを立てる

```bash
track new "Fix rate limit edge cases" \
  --ticket PROJ-123 \
  --ticket-url https://github.com/acme/example/issues/123

track repo add .
track todo add "Reproduce and add failing test"
track todo add "Implement validation"
track todo add "Check existing rate-limit docs" --no-workspace
```

- 実装TODOは通常どおり追加
- 調査・読書だけの項目は `--no-workspace`
- アクティブタスクの `jj.slug` は後述の規則で決まる（例：チケットなら `proj-123`）

必要なら読みやすいslugを明示：

```bash
track alias set fix-rate-limit-42
```

### 2. リポジトリを一度だけjj-taskに登録

**メインワークスペース（リポジトリルート）** で：

```bash
cd /path/to/example-service
jj git init --colocate    # 未設定のときだけ
jj-task repo init         # グローバルマップにリポジトリを登録
```

`jj-task repo init` は既定で `tasks_root = <main>/.worktrees`、trunkは `main@origin` を想定します。

### 3. タスクワークスペースを開始して移動する

```bash
# まだメインにいる
jj git fetch
jj-task start fix-rate-limit-42   # または track が返す slug
cd "$(jj-task path fix-rate-limit-42)"
```

`jj-task start` が行うこと：

1. `jj workspace add` で `.worktrees/<slug>/` を作る（既存なら再利用）
2. グローバルマップ `~/.config/jj/task-workspaces.json` に登録（初期 `phase: draft`）
3. bookmark名をslugに揃える（オプションで変更可）

**ここから先の編集・コミット・pushはすべてこのディレクトリ内** で行います。ルートに戻って機能コードを触らない。

### 4. Draftフェーズで実装と履歴整形

タスクWS内：

```bash
jj new main@origin

# 実装…
jj commit -m 'feat(api): add rate limit validation'
jj commit -m 'test(api): cover limit edge cases'

# bookmark を用意して draft PR
jj bookmark create fix-rate-limit-42 -r @-
jj bookmark track fix-rate-limit-42
jj git push --bookmark fix-rate-limit-42

gh pr create --draft --base main
jj-task set fix-rate-limit-42 --pr 'https://github.com/acme/example/pull/N'
```

**レビュー依頼前（Draft）** は履歴を自由に直せます。

```bash
jj squash                 # WIPを親に畳む
jj squash --into REV
jj split -i               # 大きすぎるchangeを分割
jj rebase -b fix-rate-limit-42 -d main@origin
jj bookmark move fix-rate-limit-42 --to @-
jj git push --bookmark fix-rate-limit-42   # force push可
```

`.pre-commit-config.yaml` または `prek.toml` があるリポジトリでは、`jj commit` の前に **`prek`** を実行します（`pre-commit` コマンドは使わない）。

### 5. In reviewへ移る

自己レビューとCIが通ったら：

```bash
# Conventional Commitsで件名を整えた最終スタックをpush
jj bookmark move fix-rate-limit-42 --to @-
jj git push --bookmark fix-rate-limit-42
gh pr ready
jj-task set fix-rate-limit-42 --phase in_review
```

**ここからフェーズが変わります。** レビュー済みベースへのsquashやforce pushは原則禁止。

### 6. レビュー対応は積み上げコミットのみ

```bash
jj new fix-rate-limit-42
# フィードバック反映…
prek run … -a             # 設定がある場合
jj commit -m 'fix(api): validate token expiry edge case'
jj bookmark move fix-rate-limit-42 --to @-
jj git push               # force なし
```

GitHub上ではコミットハッシュ（または `jj log` のchange ID）を返信し、再レビュー依頼します。

レビュー中にmainが進んだ場合の既定は **force pushを避ける** こと。チームがGitHubの「Update branch」を使うならそちらを優先。どうしてもrebase＋forceが必要なときはレビュアと合意してから。

### 7. track側の進捗とメモ

実装の合間にtrackへ記録します（どのディレクトリからでも可。アクティブタスクに紐づく）:

```bash
track scrap add "Chose sliding window over fixed window for burst traffic"
track todo done 1
track status --json       # 次アクション確認
```

`track todo done` は **track DB上の完了** です。jjのマージやワークスペース削除はしません。

### 8. マージ後のクローズ

PRがマージされたら：

```bash
jj-task done fix-rate-limit-42
# ディスク上のWSも片付けるなら:
# jj-task done fix-rate-limit-42 --forget

track archive
```

`track archive` はjj-taskの `phase` が `merged`（またはレガシーの `done`）であることを完了条件として扱います。

## 二段階PR（チートシート）

| | **Phase 1 — Draft** | **Phase 2 — In review** |
|---|---|---|
| GitHub | Draft、レビュー未依頼 | Ready / レビュー依頼済み |
| 履歴 | squash / split / rebase自由 | 古いコミットへのsquash禁止 |
| push | force push可 | 追記のみ（force禁止が既定） |
| 目的 | レビュー前に論理的なスタックへ整える | 差分を積み上げてレビュアが追いやすくする |

```text
Draft, no review yet          Open / review requested
─────────────────────         ─────────────────────────
jj squash ✓                   jj squash into old commits ✗
jj split ✓                    only jj commit on top ✓
prek before jj commit ✓       prek before jj commit ✓
jj rebase + force push ✓      force push ✗
gh pr create --draft          gh pr ready + re-request
```

既定は **タスクあたり1PR**。レイヤが独立にレビュー・CI可能で依存が明確なときだけstacked PRを検討します（agent-skill-jjの `stacked-prs` 参照）。

## エージェント向けループ

エージェントは毎回まずコンテキストを読みます。

```bash
track status --json
```

代表的なフィールド：

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

### workflow.phaseごとの動き

| Phase | track側 | jj側 |
|---|---|---|
| `setup` | `track repo add`、`track todo add` | `jj-task repo init`（リポジトリごと1回） |
| `sync_required` | `workflow.checklist` に従う | `jj-task start <slug>`（登録済みrepoごと） |
| `execute` | `scrap add`、`todo done` | `$jj` でsquash / commit / PR / push（**タスクWS内**） |
| `task_complete` | `track archive`（`jj-task done` → `merged` のあと） | 未マージなら `$jj` でクローズ処理 |

ループの要約：

```text
track status --json
        ↓
jj-task start <slug>     （sync_requiredのとき）
        ↓
cd "$(jj-task path <slug>)"
        ↓
$jj skill                （Draft整形 → Ready → In review積み上げ）
        ↓
track scrap / todo done
        ↓
（繰り返し）→ jj-task done → track archive
```

`guardrails.must_use_jj_skill` がtrueのときは、コミット操作を `$jj` に任せます。マップに無いパスを推測して新規WSを二重に作らないこと。

## グローバルタスクマップ

既定パス： `~/.config/jj/task-workspaces.json`（上書きは `JJ_TASK_MAP`）。

リポジトリごとに `main_workspace`・`tasks_root`・各タスクの `workspace` / `bookmark` / `phase` / `pr_url` を保持します。`phase` は `draft` | `in_review` | `merged`。エージェントは作業前に `jj-task list` / `jj-task show <slug>` で状態を確認します。

## jj.slugの導出

trackが現在タスクから導出します。

1. `track alias` があればそれ
2. なければ `ticket_id`（例：`PROJ-123` → `proj-123`）
3. なければ `task-{id}`

チケットIDがslugに向かないとき：

```bash
track alias set fix-oauth-refresh
```

## jj-taskコマンド一覧

| コマンド | 用途 |
|---|---|
| `jj-task repo init [--tasks-root PATH] [--trunk REV]` | リポジトリをマップに登録 |
| `jj-task start <slug> [--bookmark NAME]` | タスクWS作成/再利用（メインから実行） |
| `jj-task list [--all]` | タスク一覧 |
| `jj-task show <slug>` | 詳細 |
| `jj-task path <slug>` | WSパスを表示（`cd`用） |
| `jj-task set <slug> [--phase PHASE] [--pr URL]` | phase / PR URLを同期 |
| `jj-task done <slug> [--forget]` | マージ後に `merged`。`--forget`でWS忘れ |

## コミットメッセージ

Conventional Commits（type + 任意scope + What、本文にWhy）。プロセスだけの件名（`fix ci`、`address review` のみ等）は避けます。詳細はagent-skill-jjの `conventional-commits` 参照。

## メインワークスペースの衛生

```bash
cd "$MAIN_REPO"
jj git fetch
jj new main@origin    # 空の作業コピーに戻す（任意）。ここで機能をコミットしない
```

誤ってルートで編集してしまったら、正しいタスクWSへ `jj squash --into` / `jj rebase` で移します。

## 旧ワークフローからの移行

| 旧（track単独jj想定） | 新（jj-first） |
|---|---|
| `track sync` してからコーディング | `jj-task start <slug>` |
| ルート（sync後）で実装 | `.worktrees/<slug>/` だけで実装 |
| `jj describe` してから `todo done` | `$jj` がPRフェーズに応じてsquash/commit |
| TODOごとのworktree | タスクにつき1WS |
| `task/PROJ-123` bookmark（ルート） | タスクWS内の `<slug>` bookmark |

`track todo add --worktree` は **削除済み** です。古いDB行が残っている場合：

```bash
track migrate legacy-worktrees --dry-run
track migrate legacy-worktrees
# ダーティでも消すなら --force
jj-task start <slug>
```

JJモードの `track sync` は、レガシーTODOが残っているとき、または明示的に `--legacy` を付けたときだけ動きます。

## 責務の境界（再掲）

**track**

- タスク / TODOライフサイクル、スクラップ、リンク、チケット、エイリアス
- `track status --json` / WebUIの `GET /api/status`
- `track archive`

**`$jj` / jj-task**

- メイン＝同期専用、タスクWS＝実装
- グローバルマップ、Conventional Commits、prek、二段階PR、push / `gh pr`

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [CLIリファレンス](/projects/track/cli-reference/)
- [Web UI](/projects/track/webui/)
- upstream: [JJ_INTEGRATION.md](https://github.com/manji-0/track/blob/main/docs/JJ_INTEGRATION.md)
- upstream: [agent-skill-jj](https://github.com/manji-0/agent-skill-jj)
