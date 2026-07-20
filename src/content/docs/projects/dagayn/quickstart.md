---
title: "クイックスタート"
description: "dagayn を最短で動かす手順"
sidebar:
  order: 2
---

## インストール

CLIとMCP登録の詳細は [インストール](/projects/dagayn/installation/) にあります。最短ではこうです。

```bash
uv tool install dagayn
dagayn install --platform all --mode fts-only -y
```

## グラフを構築する

対象リポジトリのルートで：

```bash
cd your-repo
dagayn build
dagayn status
```

初回の `build` は規模に比例して時間がかかります。終わると `.dagayn/graph.db` に載ります。`status` ではノード数や最終更新、埋め込みがあればそのカバレッジ、鮮度（`complete` / `partial` / `stale` など）が見えます。

## 変更を反映する

日常はhookか手動のインクリメンタル更新です。

```bash
dagayn update
# フロー再計算を省略（hookの既定に近い）
dagayn update --skip-flows
```

フルでやり直したいときだけ：

```bash
dagayn build --force-full-build
```

## エージェントから見る

CursorやClaude Code、CodexなどからMCPツールを呼びます。たとえば「変更の影響を `review_tool` で」「`FooBar` のcallerを `query_graph_tool` で」「認証まわりを `semantic_search_nodes_tool` で」といった指示が通りやすいです。ツール一覧は [MCP ツール](/projects/dagayn/mcp-tools/) へ。

MCPなしでも差分は取れます。

```bash
dagayn detect-changes --base HEAD~1
```

trackedに加えてstaged / unstaged / untrackedもまとめて見ます。

## 日常のイメージ

```mermaid
flowchart LR
  A[コード編集] --> B[hook: dagayn update --skip-flows]
  B --> C[MCP で review_tool / query_graph]
  C --> D{大きな refactor?}
  D -->|Yes| E[dagayn build --force-full-build]
  D -->|No| A
```

hookは `dagayn install` が登録します。フロー再計算は重いので `--skip-flows` が既定寄りです。週次や大きなrefactorのあとだけ、フロー込みの `update` かフル `build` を走らせると安心です。

コマンド全般は [CLI リファレンス](/projects/dagayn/cli-reference/)、語彙は [グラフモデル](/projects/dagayn/graph-model/)、設計書を載せる話は [Markdown / Terraform 連携](/projects/dagayn/integrations/)、意味検索は [セマンティック検索](/projects/dagayn/semantic-search/) です。
