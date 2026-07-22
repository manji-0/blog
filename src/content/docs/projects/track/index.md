---
title: "はじめに"
description: "開発タスクをコンテキストとして管理するCLI track の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [track](https://github.com/manji-0/track) · 対象バージョン: **v0.7.0**

**track** は、いま着手している開発タスクを「コンテキスト」として管理する軽量なCLIです。TODOやスクラップ、チケットURL、作業対象のリポジトリをタスク単位でまとめ、`track switch` で切り替えると、その後の操作を対象タスクに関連付けられます。

Jujutsu（jj）側では [agent-skill-jj](https://github.com/manji-0/agent-skill-jj) の `jj-task` と組むのが前提に近い使い方です。trackが「何をやるか」を抱え、コミットやPRの進め方は `$jj` に任せる、という分担になります。ブラウザから触りたい人向けにWeb UIも同梱しています。

エージェント向けには `track status --json` があります。いまのphaseや次に打つコマンドがJSONで返るので、スキルやCIの入口にしやすいです。

## どこから読むか

まずは [インストール](/projects/track/installation/) と [クイックスタート](/projects/track/quickstart/) で、track単体のタスク管理を一通り動かしてください。コマンド一覧は [CLI リファレンス](/projects/track/cli-reference/)、ブラウザUIは [Web UI](/projects/track/webui/) です。

jjのタスクワークスペースまで使う場合だけ、[JJ連携](/projects/track/jj-integration/) に進みます。ソースを触る人は [開発環境](/projects/track/development/) へ。

## まわりのツールとの関係

track単体でもタスク管理はできますが、並列にコードを書くならjjのタスクワークスペースとセットで考えると筋が通ります。コードレビューの構造クエリが欲しければ [dagayn](/projects/dagayn/)、要件モデルなら [rdra-ish](/projects/rdra-ish/) が近くにあります。どれも必須ではありません。

## 向いていること / 向いていないこと

チケットと手元のTODOを同じコンテキストで追いたいとき、あるいはエージェントに「次はこれ」を機械可読で渡したいときに効きます。Todayタスクで前日の未完了を持ち越す使い方も想定しています。

一方で、スプリント計画やガントチャート、権限管理を備えたプロジェクト管理ツールの代替にはなりません。jjを使わずGitだけで運用する環境でもCLI自体は動きますが、ワークスペース連携の利点は小さくなります。

## データの置き場

SQLiteはだいたいここです。

```text
$HOME/.local/share/track/track.db
```

XDG Base Directoryに従います。ライセンスはMITです。
