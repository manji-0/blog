---
title: "はじめに"
description: "開発タスクをコンテキストとして管理するCLI track の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [track](https://github.com/manji-0/track) · 対象バージョン: **v0.9.0**

**track** は、いま着手している開発タスクを「コンテキスト」として管理する軽量なCLIです。TODOやスクラップ、チケットURL、作業対象のリポジトリをタスク単位でまとめ、`track switch` で切り替えると、その後の操作を対象タスクに関連付けられます。

| 層 | 担当 |
| --- | --- |
| **何をやるか** | track（タスク、TODO、スクラップ、チケット、JSONのworkflowとhint） |
| **どこで書くか** | track（`.worktrees/<slug>/`、ブランチ／bookmark `track/<slug>`） |
| **どうコミットするか** | そのワークスペース内の git または jj |

コーディング用の作業コピーもtrackが持ちます。`git worktree` や `jj workspace add`、`jj-task` を手で叩く必要はありません。契約は [ワークスペース](/projects/track/workspace/) へ。エージェント向けの入口は [エージェント](/projects/track/agents/) です。ブラウザから触りたい人向けにWeb UIも同梱しています。

## どこから読むか

| 目的 | 読む順 |
| --- | --- |
| まず動かす | [インストール](/projects/track/installation/) → [クイックスタート](/projects/track/quickstart/) |
| ワークスペースの契約 | [ワークスペース](/projects/track/workspace/) |
| エージェントから使う | [エージェント](/projects/track/agents/) |
| コマンドを探す | [CLI リファレンス](/projects/track/cli-reference/) |

ブラウザUIは [Web UI](/projects/track/webui/)、ソースを触る人は [開発環境](/projects/track/development/) へ。

## まわりのツールとの関係

trackが「何をやるか」と「どこで書くか」を抱え、コミットやPRの作り方はワークスペース内のgit / jjに任せます。コードレビューの構造クエリが欲しければ [dagayn](/projects/dagayn/)、要件モデルなら [rdra-ish](/projects/rdra-ish/) が近くにあります。どれも必須ではありません。

## 向いていること / 向いていないこと

チケットと手元のTODOを同じコンテキストで追いたいとき、あるいはエージェントに「次はこれ」を機械可読で渡したいときに効きます。Todayタスクで前日の未完了を持ち越す使い方も想定しています。

一方で、スプリント計画やガントチャート、権限管理を備えたプロジェクト管理ツールの代替にはなりません。リポジトリのissueトラッカーでも、複数エージェントのプランナーでもありません。

## データの置き場

SQLiteはだいたいここです。

```text
$HOME/.local/share/track/track.db
```

XDG Base Directoryに従います。ライセンスはMITです。
