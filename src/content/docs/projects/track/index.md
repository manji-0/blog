---
title: "はじめに"
description: "JJワークスペース連携付きの開発タスク管理CLI track の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [track](https://github.com/manji-0/track) · 対象バージョン: **v0.7.0**

**track** は、開発タスクをコンテキストとして扱い、TODO・スクラップ・チケット・リポジトリ登録を一箇所にまとめる軽量CLIです。Jujutsu（jj）のタスクワークスペース（`jj-task`）と組み合わせると、エージェント向けの「何をやるか」と「どうコミットするか」を層に分けて回せます。Web UIも同梱しています。

## 何をするか

- **コンテキスト型タスク管理** — `track switch` でアクティブタスクを切り替えると、以降のTODO・スクラップ・repo操作がそのタスクに紐づく
- **チケット連携** — Jira / GitHub Issues / GitLab IssuesなどのURLをタスクに紐づけられる
- **JJワークスペース** — [agent-skill-jj](https://github.com/manji-0/agent-skill-jj) の `jj-task` と組み合わせ、並列開発用の作業ディレクトリをタスク単位で扱う
- **Web UI** — Axum + HTMX + SSEによるブラウザUI（Todayタスク、カレンダー連携など）
- **エージェント向けJSON** — `track status --json` でworkflow / next_actionを返す

## ドキュメントの読み方

1. [インストール](/projects/track/installation/)
2. [クイックスタート](/projects/track/quickstart/)
3. [CLIリファレンス](/projects/track/cli-reference/)
4. [JJ連携](/projects/track/jj-integration/) — エージェント二層スタック
5. [Web UI](/projects/track/webui/)
6. [開発環境](/projects/track/development/)

## 他プロジェクトとの関係

| レイヤ | 役割 |
| --- | --- |
| **track** | タスク・TODO・スクラップ・チケット（WHAT） |
| **[agent-skill-jj](https://github.com/manji-0/agent-skill-jj)** | jjワークスペース・コミット・PR（HOW） |
| **[dagayn](/projects/dagayn/)**（任意） | コード構造グラフでのレビュー支援 |
| **[rdra-ish](/projects/rdra-ish/)**（任意） | 要件モデル |

## 使うべき場面 / 使わない場面

**向いているケース**

- チケットとローカルTODOを同じコンテキストで追いたい
- jjのタスクワークスペースで並列に実装したい
- エージェントに `status --json` で次アクションを渡したい
- Todayタスクで日次の未完了TODOを引き継ぎたい

**向いていないケース**

- フル機能のプロジェクト管理（スプリント計画・ガント・権限管理）の代替
- Git専用フローでjjを使わない場合でもCLIは使えるが、ワークスペース連携の価値は薄い

## データ保存先

```text
$HOME/.local/share/track/track.db
```

XDG Base Directoryに準拠。ライセンスはMIT。
