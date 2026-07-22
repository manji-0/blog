---
title: "クイックスタート"
description: "track を最短で動かす手順"
sidebar:
  order: 2
---

このページは **track単体** で一通り触る手順です。jjのタスクワークスペースまで使う場合は、後半の任意セクションと [JJ連携](/projects/track/jj-integration/) を読んでください。

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

調べものだけでワークスペースが要らない項目は、`--no-workspace` を付けておきます。

## メモと完了

```bash
track scrap add "Using bcrypt for password hashing"
track todo done 1
track status --json
```

ここまでで、タスク管理としてのtrackは一通り動きます。Gitだけで実装する場合も、この流れで十分です。

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

## （任意）jjのタスクワークスペースで実装する

コード変更をjjのタスクワークスペースに閉じたいときだけ使います。前提は [インストール](/projects/track/installation/) の「タスクワークスペースまで使うなら」と [JJ連携](/projects/track/jj-integration/) です。`jj-task` がPATHに無い状態では動きません。

```bash
jj-task repo init
jj-task start auth-456
cd "$(jj-task path auth-456)"
# ここで実装して jj commit、draft PR まで進める
```

slugの決まり方や、DraftとIn reviewで何が違うか、`status --json` の読み方は [JJ連携](/projects/track/jj-integration/) にまとめてあります。コミットまわりは `$jj` skillの仕事です。

コマンド一覧は [CLIリファレンス](/projects/track/cli-reference/) です。
