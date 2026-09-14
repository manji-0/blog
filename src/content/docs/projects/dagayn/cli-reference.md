---
title: "CLI リファレンス"
description: "dagayn CLI コマンド一覧"
sidebar:
  order: 3
---

このページは、dagayn CLIのグラフライフサイクル、分析、MCP起動、AIツール統合コマンドを扱います。MCPツール側の詳細は [MCP ツール](/projects/dagayn/mcp-tools/) へ。初回セットアップは [使い方](/projects/dagayn/usage/) へ。

## グラフライフサイクル

| コマンド | 用途 |
| --- | --- |
| `dagayn build` | フルビルド（初回または再構築） |
| `dagayn update` | 変更ファイルのインクリメンタル更新 |
| `dagayn postprocess` | フロー・コミュニティ・FTS等の後処理のみ |
| `dagayn watch` | ファイル変更を監視して自動更新 |
| `dagayn status` | グラフの有無・鮮度・統計・埋め込みカバレッジ |

### build

```bash
dagayn build
dagayn build --force-full-build   # graph.db を削除してクリーンビルド
dagayn build --local-embedding    # ビルド後にローカル埋め込み生成
```

### update

`update` はtracked diff、staged、unstaged、untrackedをまとめて検出します。新規ファイルはステージしなくてもパース対象になります。

```bash
dagayn update
dagayn update --skip-flows          # フロー再計算を省略（hook 既定）
dagayn update --local-embedding
```

### status

グラフ合計、embedding coverage、provider別ベクトル数、`complete` / `partial` / `stale` / `empty` / `not_indexed` の状態を表示します。

## dagayn install

AIツール向けMCP設定、hooks、skills、instructionファイルを書き込みます。

```bash
dagayn install [--platform <name>] [--mode <mode>] [--dry-run] [-y]
```

| プラットフォーム例 | 主な書き込み先 |
| --- | --- |
| cursor | リポジトリローカル MCP 設定 |
| codex | `~/.codex/config.toml`, `~/.codex/hooks.json` |
| claude | `~/.claude/settings.json`, `~/.claude/CLAUDE.md` |

hookは `dagayn update --skip-flows` をファイル保存後やセッション開始時に実行します。`DAGAYN_HOOK_UPDATE=1` が設定され、重複実行は抑制されます。

## 分析・レビュー

| コマンド | 用途 |
| --- | --- |
| `dagayn detect-changes` | Git差分＋worktreeから変更ノードを検出 |
| `dagayn tool --list` | 利用可能なMCPツール名一覧 |
| `dagayn visualize` | GraphML / Mermaid C4 / SVG 等のエクスポート |
| `dagayn wiki` | リポジトリWikiページ生成 |
| `dagayn eval` | 検索・guidance精度のベンチマーク |

### detect-changes

```bash
dagayn detect-changes --base HEAD~1
```

レスポンスには `change_file_sources`（base_diff / worktree / staged / unstaged / untracked）と、ノード・エッジの `change_status`（existing / added / unknown）が含まれます。

## MCPサーバ

```bash
dagayn serve
```

MCPクライアントはstdioまたは設定ファイル経由で `dagayn serve` を起動します。`dagayn install` が各ツール向けの起動引数を書き込みます。

## ローカル埋め込み

`build` / `update` に `--local-embedding` を付けると、グラフ更新後に埋め込みを生成します。

```bash
dagayn build --local-embedding
dagayn build --local-embedding --mode llama-qwen3   # Qwen3 sidecar
dagayn build --local-embedding none                 # 埋め込みなし（明示）
```

関連オプション： `--local-embedding-timeout`, `--local-embedding-request-timeout`, `--local-embedding-batch-size`, `--local-embedding-bin auto`

## マルチリポジトリ

複数リポジトリを登録して横断検索する場合は `dagayn` のレジストリ機能と `cross_repo_search_tool`（MCP）を使います。daemon設定はupstreamの `docs/DAEMON-CONFIG.md` を参照してください。

## 環境変数

| 変数 | 意味 |
| --- | --- |
| `DAGAYN_HOOK_UPDATE=1` | hook 経由の更新中を示す |
| `CRG_OPENAI_BATCH_SIZE` | リモート埋め込みAPIのバッチサイズ（sidecar 既定は1） |

## 次に読む

日常運用の手順は [使い方](/projects/dagayn/usage/) です。レビューフローは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
