---
title: "CLIリファレンス"
description: "track CLI サブコマンド一覧"
sidebar:
  order: 3
---

```text
track <SUBCOMMAND> [OPTIONS]
```

多くの操作は、いまアクティブなタスクに対して走ります。切り替えるときは `track switch` です。

## タスク

| コマンド | 説明 |
|---|---|
| `track new <name>` | タスク作成しアクティブ化 |
| `track new <name> --template <task_ref>` | 既存タスクをテンプレートにTODOをコピー |
| `track list [--all]` | タスク一覧 |
| `track switch <task_id>` | タスク切替 |
| `track switch today` | Todayタスクへ（なければ作成） |
| `track status [id]` | タスク情報 |
| `track status --json` | エージェント向けJSON |
| `track status --all` | スクラップも含めて表示 |
| `track desc [description]` | 説明の表示/設定 |
| `track ticket <ticket_id> <url>` | チケット紐づけ |
| `track alias set <alias>` | エイリアス設定 |
| `track alias set <alias> --force` | 他タスク上のエイリアスを上書き |
| `track alias remove` | エイリアス削除 |
| `track archive [task_id]` | アーカイブ |

## 設定

| コマンド | 説明 |
|---|---|
| `track config set-calendar <calendar-id>` | Todayビュー用GoogleカレンダーID |
| `track config show` | 設定表示 |

## TODO

| コマンド | 説明 |
|---|---|
| `track todo add <text> [--no-workspace]` | TODO追加（`--no-workspace`は調査・計画向け） |
| `track todo list` | 一覧 |
| `track todo update <index> <status>` | 状態更新 |
| `track todo done <index>` | 完了 |
| `track todo workspace <index> [...]` | ワークスペース表示/再作成 |
| `track todo next <index>` | 先頭へ移動（次に着手） |
| `track todo delete <index> [--force]` | 削除 |

## リンク / スクラップ

| コマンド | 説明 |
|---|---|
| `track link add <url> [title]` | 参照URL追加 |
| `track link list` / `track link delete <index>` | 一覧 / 削除 |
| `track scrap add <content>` | 作業メモ追加 |
| `track scrap list` | メモ一覧 |

## リポジトリ

| コマンド | 説明 |
|---|---|
| `track repo add [path]` | 現タスクにリポジトリ登録 |
| `track repo add --base <bookmark>` | ベースbookmark指定で登録 |
| `track repo list` / `track repo remove <id>` | 一覧 / 解除 |
| `track sync` | 登録リポジトリの同期（通常の実装フローでは [JJ連携](/projects/track/jj-integration/) の `jj-task start` を使う） |

## Web UI / 補完

| コマンド | 説明 |
|---|---|
| `track webui [--port N] [--open]` | Web UI起動（既定ポート3000） |
| `track completion <shell> [--dynamic]` | シェル補完スクリプト生成 |

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [JJ連携](/projects/track/jj-integration/)
- [Web UI](/projects/track/webui/)
