---
title: "クイックスタート"
description: "track を最短で動かす手順"
sidebar:
  order: 2
---

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

## タスクワークスペースで実装する

メイン（リポジトリルート）で登録し、ワークスペースへ移ってからコードを書きます。ルートで機能を触らない方が安全です。

```bash
jj-task repo init
jj-task start auth-456
cd "$(jj-task path auth-456)"
# ここで実装して jj commit、draft PR まで進める
```

slugの決まり方や、DraftとIn reviewで何が違うか、`status --json` の読み方は [JJ連携](/projects/track/jj-integration/) にまとめてあります。コミットまわりは `$jj` skillの仕事です。

## メモと完了

```bash
track scrap add "Using bcrypt for password hashing"
track todo done 1
track status --json
```

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

コマンド一覧は [CLIリファレンス](/projects/track/cli-reference/)、jjの手順は [JJ連携](/projects/track/jj-integration/) です。
