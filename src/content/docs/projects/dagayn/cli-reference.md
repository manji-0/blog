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
| `dagayn postprocess` | コミュニティ・FTS等の後処理のみ（`--no-communities` / `--no-fts`） |
| `dagayn watch` | ファイル変更を監視して自動更新 |
| `dagayn status` | グラフの有無・鮮度・統計・埋め込みカバレッジ |

### build

```bash
dagayn build
dagayn build --force-full-build   # graph.db を削除してクリーンビルド
dagayn build --local-embedding    # ビルド後にローカル埋め込み生成
dagayn build --scip               # SCIPインデクサで呼び出し先を確定
```

`--skip-flows` はコミュニティ検出を省略し、`--skip-postprocess` は後処理をすべて省略します。失敗したインデクサや後処理などのビルドの警告は、stderrに `WARNING:` 行で出ます。`--scip` の詳細は [使い方](/projects/dagayn/usage/) のSCIP節へ。

### update

`update` はtracked diff、staged、unstaged、untrackedをまとめて検出します。新規ファイルはステージしなくてもパース対象になります。

```bash
dagayn update
dagayn update --skip-flows          # コミュニティ検出を省略（コミット前hook）
dagayn update --local-embedding
dagayn update --budget-seconds 60   # 指定秒数で打ち切る
```

diff baseの既定はグラフをビルドしたコミットです。記録が無ければ `HEAD~1` を使います。hook経由（`DAGAYN_HOOK_UPDATE=1`）の更新は既定120秒で打ち切られます。

### status

グラフ合計、embedding coverage、provider別ベクトル数、`complete` / `partial` / `stale` / `empty` / `not_indexed` の状態を表示します。`Graph state:` にはグラフの鮮度と、それを解消するコマンドが出ます。

## dagayn install

AIツール向けMCP設定、hooks、skills、instructionファイルを書き込みます。

```bash
dagayn install [--platform <name>] [--mode <mode>] [--dry-run] [-y]
```

| プラットフォーム例 | 主な書き込み先 |
| --- | --- |
| cursor | リポジトリローカル MCP 設定, `~/.cursor/mcp.json`, Cursorのhook |
| codex | `~/.codex/config.toml`, `~/.codex/hooks.json` |
| claude | リポジトリの `.mcp.json`, `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.claude/skills/<name>/SKILL.md` |

編集hookは `dagayn queue add update` で更新をキューに積み、1つのworkerがまとめて処理します。セッション開始hookは `dagayn session prepare --budget-seconds 45` を実行します。workerは `DAGAYN_HOOK_UPDATE=1` で動き、重複実行は抑制されます。git hookはコミット前に `dagayn update --skip-flows` と `dagayn detect-changes --brief`、コミット後に `dagayn update` を実行します。

## 分析・レビュー

| コマンド | 用途 |
| --- | --- |
| `dagayn detect-changes` | Git差分＋worktreeから変更ノードを検出 |
| `dagayn tool --list` | 利用可能なMCPツール名一覧 |
| `dagayn eval` | 検索品質・影響範囲・エントリポイント検出などのベンチマーク |

ユニット間の安定度は `architecture_analysis_tool(mode="overview")` の `unstable_dependency` findingで見ます。

### detect-changes

```bash
dagayn detect-changes --base HEAD~1
dagayn detect-changes --brief       # サマリと finding を1行ずつ
```

`--base` の既定は、追跡ファイルに未コミットの変更があれば `HEAD`、なければ `HEAD~1` です。レスポンスには `change_file_sources`（base_diff / worktree / staged / unstaged / untracked）と、ノード・エッジの `change_status`（existing / added / unknown）が含まれます。

## MCPサーバ

```bash
dagayn serve
```

MCPクライアントはstdioまたは設定ファイル経由で `dagayn serve` を起動します。`dagayn install` が各ツール向けの起動引数を書き込みます。stdioではMCPのハンドシェイクと既定ツールの多くにRustのフロントエンドが応答し、残りだけPythonサーバが受けます。

```bash
dagayn serve --tools all          # 拡張面も含めて全ツールを公開
dagayn serve --http --port 5555   # localhostでStreamable HTTP
```

## セッション・キュー・worktree

| コマンド | 用途 |
| --- | --- |
| `dagayn session prepare` | セッション開始時に予算内でグラフを使える状態にする |
| `dagayn queue add` / `run` / `status` / `clear` | hook用のバックグラウンド更新キュー |
| `dagayn worktree sync` / `info` | メインcheckoutのグラフをworktreeへ引き継ぐ |
| `dagayn hook-repo` | hookのJSONペイロードからリポジトリルートを出す |
| `dagayn daemon start` / `stop` / `restart` / `status` / `logs` / `add` / `remove` | 複数リポジトリを監視するwatch daemon |

## ローカル埋め込み

`build` / `update` に `--local-embedding` を付けると、グラフ更新後に埋め込みを生成します。

```bash
dagayn build --local-embedding
dagayn build --local-embedding --mode llama-qwen3   # Qwen3 sidecar
dagayn build --local-embedding none                 # 埋め込みなし（明示）
```

関連オプション： `--local-embedding-timeout`, `--local-embedding-request-timeout`, `--local-embedding-batch-size`, `--local-embedding-bin auto`

## マルチリポジトリ

複数リポジトリを登録して横断検索する場合は `dagayn` のレジストリ機能と `cross_repo_search_tool`（MCP）を使います。daemon設定はupstreamの `docs/DAEMON-CONFIG.md` を参照してください。別コマンドだった `dagayn-daemon` はv11.0.0で削除され、`dagayn daemon` だけが残ります。

## 環境変数

| 変数 | 意味 |
| --- | --- |
| `DAGAYN_HOOK_UPDATE=1` | hook 経由の更新中を示す |
| `CRG_TOOLS` | `dagayn serve` で公開するツールの許可リスト（`--tools` と同じ） |
| `CRG_DATA_DIR` | グラフデータを作業ツリーの外に置く |
| `DAGAYN_PYTHON_CLI=1` | Rust CLIを使わず全コマンドをPython CLIで実行 |
| `DAGAYN_SCIP_ALLOW_BUILD=1` | `--scip` で `scip-java` の実行（プロジェクトのビルドを伴う）を許可 |
| `CRG_OPENAI_BATCH_SIZE` | リモート埋め込みAPIのバッチサイズ（sidecar 既定は1） |

## 次に読む

日常運用の手順は [使い方](/projects/dagayn/usage/) です。レビューフローは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
