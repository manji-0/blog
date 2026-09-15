---
title: "使い方"
description: "dagayn のインストールから日常運用まで"
sidebar:
  order: 1
---

このページは、dagaynのインストール、初回ビルド、日常更新、よくあるトラブルまでを扱います。CLI全コマンドは [CLI リファレンス](/projects/dagayn/cli-reference/) へ。MCPツールの詳細は [MCP ツール](/projects/dagayn/mcp-tools/) へ。

## 前提条件

| 項目 | 要件 |
| --- | --- |
| Python | 3.12以上（CIは3.13想定） |
| ディスク | リポジトリ規模に応じて `.dagayn/` に数百MB〜数GB |
| ネットワーク | `fts-only` なら不要。埋め込みsidecar初回はモデル取得で必要 |
| Rust toolchain | Git/sourceインストール時のみ |

## インストール

dagaynはPython 3.12以上で動作します。Rust拡張（`dagayn._core`）を含むwheelが配布されており、通常は追加のビルドツールなしでインストールできます。

```bash
# 推奨: uv tool で隔離環境にインストール
uv tool install dagayn

# pip でも可
pip install dagayn
```

一時的に実行だけしたい場合：

```bash
uvx --from dagayn dagayn --help
```

公開wheelがないプラットフォーム、または最新のmainを試す場合：

```bash
pip install git+https://github.com/manji-0/dagayn.git
uv tool install --from git+https://github.com/manji-0/dagayn.git dagayn
```

Git/sourceインストールはPyO3 Rust拡張をローカルでビルドします。Rust toolchain、Cコンパイラ、macOSではCommand Line Toolsが必要になります。

```bash
dagayn --version
dagayn --help
```

## MCPとhooksの登録

パッケージインストール後、MCP設定・hooks・skillsをAIツールへ書き込みます。

```bash
dagayn install
```

| フラグ | 用途 |
| --- | --- |
| `--platform all` | 検出された全プラットフォームへ登録 |
| `--platform cursor` / `codex` / `claude` 等 | 特定ツールのみ |
| `--mode fts-only` | 埋め込みなし（最も軽い） |
| `--mode local-embedding` | ローカル埋め込み（BGE-M3 sidecar） |
| `--dry-run` | 書き込み前に生成内容をプレビュー |
| `--no-skills` / `--no-hooks` / `--no-instructions` | 任意セットアップをスキップ |
| `-y` | 確認プロンプトを省略 |

```bash
dagayn install --platform all --mode fts-only -y
```

## 初回ビルド

対象リポジトリのルートで：

```bash
cd your-repo
dagayn build
dagayn status
```

初回の `build` は規模に比例して時間がかかります。終わると `.dagayn/graph.db` に載ります。`status` ではノード数、最終更新、埋め込みカバレッジ、鮮度（`complete` / `partial` / `stale` など）が見えます。

## 日常更新

```bash
dagayn update
dagayn update --skip-flows   # hookの既定に近い
```

フルでやり直したいときだけ：

```bash
dagayn build --force-full-build
```

```diagram-design dagayn-hook-loop
```

hookは `dagayn install` が登録します。週次や大きなrefactorのあとだけ、フロー込みの `update` かフル `build` を走らせると安心です。

## エージェントからの利用

CursorやClaude Code、CodexなどからMCPツールを呼びます。IDE側でMCPが登録されているかを確認し、ツール一覧は `dagayn tool --list` でも見られます。

`--mode fts-only` では埋め込みを作りません。最初に試すなら `review_tool` と `query_graph_tool` の構造クエリが向いています。意味検索を本格利用するときは埋め込みモードで入れ直すか [グラフモデル](/projects/dagayn/graph-model/) の検索節を読んでください。

MCPなしでも差分は取れます。

```bash
dagayn detect-changes --base HEAD~1
```

## トラブルシューティング

### `dagayn install` がエディタに反映されない

`--dry-run` で生成内容を確認し、対象 `--platform` が検出されているか見てください。

```bash
dagayn install --dry-run --platform cursor
```

### グラフが空、または古い

```bash
dagayn build
dagayn status
```

リポジトリをディスク上で移動した場合は `dagayn build --force-full-build` が必要です。

### MCPがドキュメントセクションを見つけられない

リポジトリまたはインストールパッケージに `docs/LLM-OPTIMIZED-REFERENCE.md` があるか確認してください。自前リポジトリではMarkdown directiveと見出しslugが [グラフモデル](/projects/dagayn/graph-model/) のMarkdown節どおりか確認します。

### `dagayn._core` が見つからない

wheelにRust拡張が含まれていない、またはsource checkoutで未ビルドです。

```bash
pip install git+https://github.com/manji-0/dagayn.git
# source checkout:
uvx maturin develop --release
```

旧Pythonパーサ実装は削除済みです。`_core` なしでは動作しません。

### hookが重い

hookは既定で `dagayn update --skip-flows` を実行します。対象リポジトリが非常に大きい、または一度に大量ファイルを保存した場合、日常運用では `--skip-flows` のままにしてください。週次や大変更後に `dagayn build` でフロー込み再計算します。

### セマンティック検索が効かない

```bash
dagayn status
```

埋め込みが `empty` / `partial` なら `dagayn build --local-embedding` で生成します。`fts-only` インストールの場合はFTSのみが正常動作です。

### Notebookのセル番号がずれる

notebook修正後に再ビルドしてください。大幅なフォーマット変更後は `dagayn build --force-full-build` が確実です。

## 次に読む

MCPツールの一覧は [MCP ツール](/projects/dagayn/mcp-tools/) です。差分レビューの流れは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
