---
title: "Web UI"
description: "track webui のブラウザインターフェース"
sidebar:
  order: 3
---

このページは `track webui` のブラウザ操作です。起動以外のCLIは [CLI リファレンス](/projects/track/cli-reference/) へ。JSONの読み方は [エージェント](/projects/track/agents/) へ。

```bash
track webui              # 既定ポート 3000
track webui --port 8080
track webui --open       # 起動してブラウザも開く
```

AxumとMiniJinja、HTMX 2、SSEで動くリアルタイムUIです。名前付きSSEイベントが `hx-trigger` を駆動し、mutationの応答HTMLで画面を差し替えます。裏のデータはCLIと同じ `~/.local/share/track/track.db` です。

Todayタスクのビューでは、前日に終わらなかったTODOを持ち越せます（CLIの `track switch today` と同じ考え方）。カレンダーを出したければ `track config set-calendar <calendar-id>` を設定してください。

TODOのメモボタンから関連スクラップへ移動できます。スクラップを追加すると、その時点のアクティブTODOに自動的に紐づきます。「Make Next」でキューの先頭に移動したり、Focusモードで表示を絞ったりできます。接続中のブラウザ間はSSEでほぼ即時に同期されます。テーマはダークとライトに対応し、カレンダーの色にも追従します。

Markdownはサニタイズされ、生のHTMLは落ちます。リンクは新しいタブで開きます。

## 次に読む

人手の一周は [クイックスタート](/projects/track/quickstart/) です。コマンド表は [CLI リファレンス](/projects/track/cli-reference/) へ。
