---
title: "CLI リファレンス"
description: "track CLI サブコマンド一覧"
sidebar:
  order: 6
---

このページはサブコマンドの一覧です。ワークスペースの契約は [ワークスペース](/projects/track/workspace/) へ。`--json` とhintの読み方は [エージェント](/projects/track/agents/) へ。

```text
track <SUBCOMMAND> [OPTIONS]
```

多くの操作は、いまアクティブなタスクに対して走ります。切り替えるときは `track switch` です。

## タスク

| コマンド | 説明 |
|---|---|
| `track new <name> [--json]` | タスク作成しアクティブ化 |
| `track new <name> --template <task_ref>` | 既存タスクをテンプレートにTODOをコピー |
| `track list [--all] [--json]` | タスク一覧 |
| `track switch <task_id> [--json]` | タスク切替 |
| `track switch today` | Todayタスクへ（なければ作成） |
| `track status [id]` | タスク情報 |
| `track status --json` | エージェント向けJSON |
| `track status --all` | スクラップも含めて表示 |
| `track desc [description]` | 説明の表示/設定 |
| `track ticket <ticket_id> <url>` | チケット紐づけ |
| `track alias set <alias>` | エイリアス設定（ワークスペースslugの最優先） |
| `track alias set <alias> --force` | 他タスク上のエイリアスを上書き |
| `track alias remove` | エイリアス削除 |
| `track archive [task_id] [--json]` | アーカイブ（ワークスペースディレクトリも削除） |
| `track archive [task_id] --force` | dirtyチェックをスキップしてアーカイブ。ディレクトリは消える |

## 設定

| コマンド | 説明 |
|---|---|
| `track config show` | 設定表示 |
| `track config set vcs-mode git\|jj` | git worktree（新規DBの既定）または colocated jj |
| `track config set aggressive-mode on\|off` | タスクごとの空revisionと `refs/notes/track` |
| `track config set-calendar <calendar-id>` | Todayビュー用GoogleカレンダーID |
| `track import [path] [--json]` | 現在のブランチ上の git notes からタスクを復元 |
| `track notes push [--remote]` | `refs/notes/track` を公開 |
| `track notes fetch [--remote]` | `refs/notes/track` を受け取る |

## TODO

| コマンド | 説明 |
|---|---|
| `track todo add <text> [--no-workspace] [--json]` | TODO追加（`--no-workspace`は調査・計画向け） |
| `track todo list` | 一覧 |
| `track todo update <index> <status> [--json]` | 状態更新 |
| `track todo done <index> [--json]` | 完了（aggressive modeでは未公開WIPをTODO 1件あたり1コミットに畳む） |
| `track todo workspace <index> [...]` | ワークスペース表示/再作成 |
| `track todo next <index> [--json]` | 先頭へ移動（次に着手） |
| `track todo delete <index> --force [--json]` | 削除（確認なし。TTY以外では `--force` 必須） |

完了・キャンセルしたTODOの再オープンはできません。続きは新しいTODOを足します。

## リンク / スクラップ

| コマンド | 説明 |
|---|---|
| `track link add <url> [title]` | 参照URL追加 |
| `track link list` / `track link delete <index>` | 一覧 / 削除 |
| `track scrap add <content> [--share] [--json]` | 作業メモ追加（既定はローカル。`--share` は対応するTODOコミットの git notes） |
| `track scrap list` | メモ一覧 |
| `track scrap share <id> [--json]` | 既存スクラップをnotes対象にする |
| `track scrap unshare <id> [--json]` | ローカルのみに戻す |

## リポジトリ

| コマンド | 説明 |
|---|---|
| `track repo add [path] [--json]` | 現タスクにリポジトリ登録し、ワークスペースを作る |
| `track repo add --base <bookmark>` | ベースbookmark指定で登録 |
| `track repo list` / `track repo remove <id>` | 一覧 / 解除 |
| `track sync` | `.worktrees/<slug>` を `track/<slug>` 上に作成／更新する |

## Web UI / 補完

| コマンド | 説明 |
|---|---|
| `track webui [--port N] [--open]` | Web UI起動（既定ポート3000） |
| `track completion <shell> [--dynamic]` | シェル補完スクリプト生成 |

## 次に読む

契約は [ワークスペース](/projects/track/workspace/) です。ブラウザ操作は [Web UI](/projects/track/webui/) へ。
