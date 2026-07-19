---
title: "Web UI"
description: "track webui のブラウザインターフェース"
sidebar:
  order: 5
---

```bash
track webui              # 既定: ポート 3000
track webui --port 8080
track webui --open       # 起動してブラウザを開く
```

Axum + MiniJinja + HTMX + SSEによるリアルタイムUIです。CLIと同じSQLite（`~/.local/share/track/track.db`）を共有します。

## 主な機能

- **Todayタスク** — 前日の未完了TODOを引き継ぐ日次ビュー（`track switch today` と同等）
- **カレンダー連携** — `track config set-calendar <calendar-id>` でTodayビューにGoogleカレンダーを表示
- **Todo–Scrapリンク** — メモボタンから関連スクラップへジャンプ。スクラップ作成時はアクティブTODOに自動紐づけ
- **Todo並べ替え** —「Make Next」で作業キュー先頭へ
- **リアルタイム更新** — SSEで接続ブラウザ間に即時反映
- **Focusモード** — 概要と集中表示の切替
- **テーマ** — ダーク / ライト（カレンダー色にも追従）
- **安全なMarkdown** — サニタイズし生HTMLは除去。リンクは新しいタブで開く

## エージェントAPI

Webサーバー経由でもステータスを取れます（詳細はupstreamのLLM連携ドキュメント）。

- CLI: `track status --json`
- HTTP: `GET /api/status`（webui起動中）

## 関連ページ

- [クイックスタート](/projects/track/quickstart/)
- [JJ連携](/projects/track/jj-integration/)
