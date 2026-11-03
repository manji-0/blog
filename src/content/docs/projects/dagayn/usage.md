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
| Rust toolchain | Git/sourceインストール時のみ（1.99以上） |

## インストール

dagaynはPython 3.12以上で動作します。Rust拡張（`dagayn._core`）を含むwheelが配布されており、通常は追加のビルドツールなしでインストールできます。

```bash
# 推奨: uv tool で隔離環境にインストール
uv tool install dagayn

# pip でも可
pip install dagayn
```

v11.0.0のwheelは、PyPIとGitHub Releases（`v11.0.0`）の両方で配布されています。

一時的に実行だけしたい場合：

```bash
uvx --from dagayn dagayn --help
```

公開wheelがないプラットフォーム、または最新のmainを試す場合：

```bash
pip install git+https://github.com/manji-0/dagayn.git
uv tool install --from git+https://github.com/manji-0/dagayn.git dagayn
```

Git/sourceインストールはPyO3 Rust拡張をローカルでビルドします。Rust toolchain（1.99以上）、Cコンパイラ、macOSではCommand Line Toolsが必要になります。

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

初回の `build` は規模に比例して時間がかかります。終わると `.dagayn/graph.db` に載ります。`status` ではノード数、最終更新、グラフの鮮度（`Graph state:`）、埋め込みカバレッジ（`complete` / `partial` / `stale` など）が見えます。

## 日常更新

```bash
dagayn update
dagayn update --skip-flows   # コミュニティ検出を省略
```

フルでやり直したいときだけ：

```bash
dagayn build --force-full-build
```

```diagram-design dagayn-hook-loop
```

hookは `dagayn install` が登録します。編集hookは `dagayn queue add update` で更新をキューに積み、workerが構造だけをまとめて更新します。コミット前のgit hookは `dagayn update --skip-flows` と `dagayn detect-changes --brief` を、コミット後は `dagayn update` を走らせます。

## SCIPで呼び出し先を確定する

`dagayn build --scip` は、SCIPインデクサで `CALLS` エッジの呼び出し先を確定してから後処理に進みます。TypeScriptとPythonのインデクサはdagaynに同梱されており、別途のインストールは要りません。

```bash
dagayn build --scip
```

| 言語 | インデクサ | 扱い |
| --- | --- | --- |
| Rust | `rust-analyzer scip` | dagaynの解決を置き換える |
| TypeScript・JavaScript | 同梱（tsrsのchecker）。`node_modules` が無ければ `hint:` を出し、パッケージへの呼び出しは未確定のまま | dagaynの解決を置き換える |
| Go | `scip-go` | dagaynの解決を置き換える |
| Python | 同梱（tyのchecker）。プロジェクトの `.venv`、無ければ `VIRTUAL_ENV` を環境として渡す | dagaynの解決を置き換える |
| C/C++、C#、Ruby、Dart、PHP、R | `scip-clang`、`scip-dotnet` など | dagaynが解決できなかった分を埋める |
| Java / Kotlin | `scip-java` | 埋める。`DAGAYN_SCIP_ALLOW_BUILD=1` のときだけ走る |

インデクサが無い言語は `hint:` にインストール手順が出て、dagayn自身の解決のままです。失敗したインデクサは `WARNING:` 行に出ます。SCIPで確定した呼び出しは、`query_graph_tool` の `callers_of` / `callees_of` の行に `resolved_by: "scip"` が付きます。SCIPの反映はフル `build` のときだけです。`update` は次の `build --scip` まで通常の解決を使います。

## アップグレード後

1. MCPサーバを再起動します（Claude Codeなら `/mcp` から `dagayn` を再接続）。新しいネイティブ拡張を読み込むためです。
2. `dagayn update` を実行します。抽出器のバージョンが変わった言語のファイルだけが再パースされます。手動のフルビルドは要りません。
3. `dagayn install` を再実行します。CLAUDE.mdやAGENTS.mdに書いた古い指示セクションを更新します。

## エージェントからの利用

CursorやClaude Code、CodexなどからMCPツールを呼びます。IDE側でMCPが登録されているかを確認し、ツール一覧は `dagayn tool --list` でも見られます。

`--mode fts-only` では埋め込みを作りません。最初に試すなら `review_tool` と `query_graph_tool` の構造クエリが向いています。主要ツールの応答は最後に `next`（次に呼ぶ最大3件の呼び出しと理由）を返すので、エージェントはそれに沿って辿れます。意味検索を本格利用するときは埋め込みモードで入れ直すか [グラフモデル](/projects/dagayn/graph-model/) の検索節を読んでください。

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

編集hookは更新をキューに積むだけで、連続した編集は1回の構造更新にまとまります。hook経由の更新は既定120秒の予算（`--budget-seconds`）を超えると止まります。重いと感じたら `dagayn queue status` で滞留を確認してください。`.dagayn/hook-skip` を置くとhook経由の更新を止められます。

### セマンティック検索が効かない

```bash
dagayn status
```

埋め込みが `empty` / `partial` なら `dagayn build --local-embedding` で生成します。`fts-only` インストールの場合はFTSのみが正常動作です。

### Notebookのセル番号がずれる

notebook修正後に再ビルドしてください。大幅なフォーマット変更後は `dagayn build --force-full-build` が確実です。

## 次に読む

MCPツールの一覧は [MCP ツール](/projects/dagayn/mcp-tools/) です。差分レビューの流れは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
