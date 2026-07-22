---
title: "Web UI"
description: "track webui のブラウザインターフェース"
sidebar:
  order: 5
---

```bash
track webui              # 既定ポート 3000
track webui --port 8080
track webui --open       # 起動してブラウザも開く
```

AxumとMiniJinja、HTMX、SSEで動くリアルタイムUIです。裏のデータはCLIと同じ `~/.local/share/track/track.db` です。

Todayタスクのビューでは、前日に終わらなかったTODOを持ち越せます（CLIの `track switch today` と同じ考え方）。カレンダーを出したければ `track config set-calendar <calendar-id>` を設定してください。

TODOのメモボタンから関連スクラップへ移動できます。スクラップを追加すると、その時点のアクティブTODOに自動的に紐づきます。「Make Next」でキューの先頭に移動したり、Focusモードで表示を絞ったりできます。接続中のブラウザ間はSSEでほぼ即時に同期されます。テーマはダークとライトに対応し、カレンダーの色にも追従します。

Markdownはサニタイズされ、生のHTMLは落ちます。リンクは新しいタブで開きます。

エージェント向けの状態は、CLIなら `track status --json`、webui起動中なら `GET /api/status` でも取れます。フィールドの意味はupstreamのLLM連携ドキュメントと [JJ連携](/projects/track/jj-integration/) を見てください。

ほかは [クイックスタート](/projects/track/quickstart/) か [JJ連携](/projects/track/jj-integration/) へどうぞ。
