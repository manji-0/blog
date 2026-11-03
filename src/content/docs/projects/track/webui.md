---
title: "Web UI"
description: "track webui のブラウザインターフェース"
sidebar:
  order: 3
---

このページは `track webui` のブラウザ操作です。起動以外のCLIは [CLI リファレンス](/projects/track/cli-reference/) へ。JSONの読み方は [エージェント](/projects/track/agents/) へ。

## 起動

```bash
track webui              # 既定ポート 3000
track webui --port 8080
track webui --open       # 起動してブラウザも開く
```

AxumとMiniJinja、HTMX 2、SSEで動くリアルタイムUIです。名前付きSSEイベントが `hx-trigger` を駆動し、mutationの応答HTMLで画面を差し替えます。裏のデータはCLIと同じ `~/.local/share/track/track.db` です。

## タブごとに1タスク

1つの `track webui` が全タスクを配信します。ブラウザのタブごとに別のタスクを表示できます。

| URL | 表示 |
| --- | --- |
| `/` | singleモードではカレントタスク（`track switch` に追従）。multiモードではタスク一覧 |
| `/tasks` | アクティブなタスク一覧。各リンクは新しいタブで開く |
| `/tasks/<ref>` | そのタスクだけ（ID、`t:<ticket>`、`a:<alias>`、名前）。`track switch` 後も同じタスクのまま |

トップバーの **Tasks** から一覧を開けます。**Pin ↗** は今のタスクを専用タブで開きます。タスクのページは、HTMXのリクエストごとに `X-Track-Task` ヘッダーでタスクIDを送ります。SSEもそのタスクの分だけ購読します。あるタブや `track --task N ...` で編集すると、タスクNを表示しているタブだけが更新されます。

## Todayタスク

Todayタスクのビューでは、前日に終わらなかったTODOを持ち越せます（CLIの `track switch today` と同じ考え方）。カレンダーを出したければ `track config set-calendar <calendar-id>` を設定してください。

## 操作

TODOのメモボタンから関連スクラップへ移動できます。スクラップを追加すると、その時点のアクティブTODOに自動的に紐づきます。「Make next」でキューの先頭に移動できます。接続中のブラウザ間はSSEでほぼ即時に同期されます。テーマはダークとライトに対応し、カレンダーの色にも追従します。

## セキュリティ

Markdownはサニタイズされ、生のHTMLは落ちます。リンクは新しいタブで開きます。

## 次に読む

人手の一周は [使い方](/projects/track/usage/) です。コマンド表は [CLI リファレンス](/projects/track/cli-reference/) へ。
