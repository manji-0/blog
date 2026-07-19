---
title: "クイックスタート"
description: "track を最短で動かす手順"
sidebar:
  order: 2
---

## 1. タスクを作る

```bash
track new "Implement User Authentication" \
  --ticket AUTH-456 \
  --ticket-url https://jira.example.com/browse/AUTH-456
```

作成したタスクがアクティブになります。

## 2. リポジトリとTODOを登録

```bash
track repo add .
track todo add "Design database schema"
track todo add "Compare auth providers" --no-workspace   # 調査用（jjワークスペースなし）
```

## 3. JJワークスペースで実装（推奨）

リポジトリルート（メイン）で一度だけ初期化し、**タスクワークスペース**へ移動してから実装します。ルートでは機能編集しません。

```bash
jj-task repo init
jj-task start auth-456          # slugは alias / ticket から導出
cd "$(jj-task path auth-456)"
# ここで実装・jj commit・draft PR…
```

Draftではsquash自由、レビュー依頼後は積み上げコミットのみ、といった二段階PRの詳細は [JJ連携](/projects/track/jj-integration/) を厚めに書いてあります。コミット操作は `$jj` skill側の責務です。

## 4. メモと完了

```bash
track scrap add "Using bcrypt for password hashing"
track todo done 1
track status --json
```

## Todayタスク

```bash
track switch today
```

前日の未完了TODOを引き継ぐ日次タスクです。Googleカレンダー表示は `track config set-calendar <calendar-id>`。

## Web UI

```bash
track webui --open
```

ブラウザでタスク・TODO・スクラップを操作できます。[Web UI](/projects/track/webui/) 参照。

## 次のステップ

| やりたいこと | ページ |
| --- | --- |
| 全サブコマンド | [CLIリファレンス](/projects/track/cli-reference/) |
| jj開発ワークフロー（二層・二段階PR） | [JJ連携](/projects/track/jj-integration/) |
| ブラウザUI | [Web UI](/projects/track/webui/) |
