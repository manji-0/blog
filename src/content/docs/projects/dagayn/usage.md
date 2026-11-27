---
title: "使い方"
description: "dagayn v11.2.0 のインストールから日常運用まで"
sidebar:
  order: 1
---

このページは、dagaynのインストール、初回ビルド、日常更新、よくあるトラブルまでを扱います。CLIの全コマンドは [CLI リファレンス](/projects/dagayn/cli-reference/) へ。MCPツールの詳細は [MCP ツール](/projects/dagayn/mcp-tools/) へ。

## 前提条件

| 項目 | 要件 |
| --- | --- |
| Python | CPython 3.12以上（CIは3.12〜3.15でテスト） |
| Git | 変更検出に使う。jjのworkspaceはcolocatedなものに対応 |
| ネットワーク | `fts-only` なら不要。ローカル埋め込みは初回にGGUFモデルを取得する |
| `llama-server` | ローカル埋め込みを使うときだけ（llama.cpp） |
| Rust toolchain | 公開wheelがない環境でソースからビルドするときだけ（1.99以上） |

## インストール

PyPIのパッケージ名は `dagayn` です。

```bash
# isolated CLI environment
uv tool install dagayn

# or plain pip (pipx also works)
pip install dagayn
```

インストールせずに一度だけ動かす場合は `uvx` を使います。

```bash
uvx --from dagayn dagayn --help
```

### 配布されるwheel

v11.2.0のwheelは安定ABI（`cp312-abi3`）です。1プラットフォームにつき1つのwheelが、CPython 3.12以降のすべてで動きます。

| プラットフォーム | 配布物 |
| --- | --- |
| Linux x86_64 | abi3 wheel（PyPIとGitHub Releases） |
| macOS arm64 | abi3 wheel（PyPIとGitHub Releases） |
| その他 | sdistからローカルビルド |

wheelにはRust拡張（`dagayn._core`）が入っており、追加のビルドツールは要りません。それ以外のプラットフォームでは、pipがsdistからPyO3拡張をビルドします。Rust toolchain（1.99以上）とCコンパイラが必要で、macOSではCommand Line Toolsも要ります。

### mainを試す

```bash
pip install git+https://github.com/manji-0/dagayn.git
uv tool install --from git+https://github.com/manji-0/dagayn.git dagayn
```

Gitからのインストールも、ローカルでRust拡張をビルドします。リポジトリの `flake.nix` は開発用シェル（`nix develop`）で、利用者向けのインストール手段ではありません。

### extras

| extra | 入るもの |
| --- | --- |
| `dagayn[google-embeddings]` | Googleの埋め込みプロバイダ（`google-genai`） |
| `dagayn[eval]` | 評価用の `pyyaml` |

v11.2.0で `numpy` extraは削除されました。ベクトル検索はRust側で完結するため、numpyは要りません。

```bash
dagayn --version
dagayn --help
```

## MCPとhooksの登録

パッケージを入れたら、MCP設定・hooks・skills・指示ファイルをAIツールへ書き込みます。

```bash
dagayn install
```

TTYで引数なしに実行すると、埋め込みモードを対話で選びます。`-y` を付けたときや標準入力がTTYでないときは、`--mode` の指定が必須です。

```bash
dagayn install --platform all --mode fts-only -y
```

| フラグ | 用途 |
| --- | --- |
| `--platform <name>` | 対象を1つに絞る。既定は `all`（検出されたすべて） |
| `--mode fts-only` | 埋め込みなし。最も軽い |
| `--mode local-embedding` | ローカル埋め込み（BGE-M3のsidecar） |
| `--mode local-embedding-llama --preset low` | ローカル埋め込み（Qwen3-Embedding-0.6Bのsidecar） |
| `--mode remote-embedding --provider <p>` | リモート埋め込み（`openai` / `google` / `minimax`） |
| `--dry-run` | 書き込まずに生成内容を表示 |
| `--no-skills` / `--no-hooks` / `--no-instructions` | 任意のセットアップを省く |
| `-y` | 確認プロンプトを省略 |

`--platform` に渡せる名前は次のとおりです。

| 名前 | 対象 |
| --- | --- |
| `claude`（`claude-code`） | Claude Code |
| `codex` | Codex |
| `cursor` | Cursor |
| `windsurf` / `zed` / `continue` | Windsurf、Zed、Continue |
| `opencode` | OpenCode |
| `antigravity` / `qwen` / `kiro` | Antigravity、Qwen Code、Kiro |
| `qoder`（`qcoder`） | Qoder |
| `pi` / `hermes` | Pi、Hermes Agent |

指示ファイルは、Claudeでは `~/.claude/CLAUDE.md` です。Codexは `~/.codex/AGENTS.md`、OpenCodeは `~/.config/opencode/AGENTS.md` に書きます。dagaynが管理するのは目印の付いた節だけで、再実行すると古い節だけを置き換えます。自分のメモは別の `##` 見出しの下に置いてください。

## 初回ビルド

対象リポジトリのルートで実行します。

```bash
cd your-repo
dagayn build
dagayn status
```

初回の `build` は規模に比例して時間がかかります。終わると `.dagayn/graph.db` にグラフが載ります。対象は、gitが追跡するファイルと未追跡のファイルから、gitignore済みのものを除いた集合です。さらに `.dagaynignore` で絞れます。

`status` は、ノード数、グラフの鮮度（`Graph state:`）、埋め込みのカバレッジを表示します。カバレッジの状態は `complete` / `partial` / `stale` / `empty` / `not_indexed` のどれかです。

## 日常更新とhooks

```bash
dagayn update               # incremental refresh
dagayn update --skip-flows  # skip community detection
dagayn watch                # refresh on file changes
```

`update` は、追跡中の差分、staged、unstaged、未追跡のファイルをまとめて検出します。差分の基準は、グラフを作ったときのコミットです。フルでやり直したいときだけ、次のようにします。

```bash
dagayn build --force-full-build
```

```diagram-design dagayn-hook-loop
```

hookは `dagayn install` が登録します。

| きっかけ | 実行されるもの |
| --- | --- |
| エージェントの編集 | `dagayn queue add update`（更新をキューに積むだけ） |
| セッション開始 | `dagayn session prepare --budget-seconds 45` |
| コミット前 | `dagayn update --skip-flows` と `dagayn detect-changes --brief` |
| コミット後（git hook） | `dagayn update` |

キューはリポジトリごとに1つのworkerが処理します。連続した編集は、1回の構造だけの更新にまとまります。キューは `.dagayn/task_queue.db` にあり、`dagayn queue status` で滞留を確認できます。

## SCIPで呼び出し先を確定する

`dagayn build --scip` は、SCIPインデクサで `CALLS` エッジの呼び出し先を確定してから後処理に進みます。TypeScriptとPythonのインデクサはdagaynに同梱されています。

```bash
dagayn build --scip
```

| 言語 | インデクサ | 扱い |
| --- | --- | --- |
| Rust | `rust-analyzer scip` | dagaynの解決を置き換える |
| TypeScript・JavaScript | 同梱（tsrsのchecker） | dagaynの解決を置き換える |
| Go | `scip-go` | dagaynの解決を置き換える |
| Python | 同梱（tyのchecker） | dagaynの解決を置き換える |
| C/C++、C#、Ruby、Dart、PHP、R | `scip-clang`、`scip-dotnet` など | dagaynが解決できなかった分を埋める |
| Java / Kotlin | `scip-java` | 埋める。`DAGAYN_SCIP_ALLOW_BUILD=1` のときだけ走る |

TypeScriptは `node_modules` がないと `hint:` を出し、パッケージへの呼び出しは未確定のままです。Pythonはプロジェクトの `.venv` を使い、なければ `VIRTUAL_ENV` を使います。

インデクサがない言語では、`hint:` にインストール手順が出ます。SCIPの反映はフル `build` のときだけで、`update` は次の `build --scip` まで通常の解決を使います。確定した呼び出しは `callers_of` / `callees_of` の行に `resolved_by: "scip"` が付きます。

| 環境変数 | 用途 |
| --- | --- |
| `DAGAYN_SCIP_<LANGUAGE>` | インデクサのコマンドを差し替える（例：`DAGAYN_SCIP_GO`） |
| `DAGAYN_SCIP_TIMEOUT` | 1回の実行の上限秒数（既定900） |
| `DAGAYN_SCIP_ALLOW_BUILD` | `1` でscip-javaの実行を許す |

## 複数リポジトリとデーモン

複数リポジトリを横断して検索するにはregistryを使います。

```bash
dagayn register /path/to/app --alias app
dagayn register /path/to/infra --alias infra
dagayn repos
dagayn build --repo /path/to/app
dagayn build --repo /path/to/infra
```

registryは `~/.dagayn/registry.json` です。`graph.db` のないリポジトリは検索から外れます。横断検索の `cross_repo_search_tool` は既定のMCP面にありません。`dagayn tool` で呼ぶか、`dagayn serve --tools` で出してください。

複数リポジトリを常時watchするなら、デーモンを使います。tmuxなどの外部ツールは要りません。

```bash
dagayn daemon add /path/to/app --alias app
dagayn daemon start
dagayn daemon status
dagayn daemon logs --repo app
dagayn daemon stop
```

デーモンの設定は `~/.dagayn/watch.toml` です。`dagayn register` は検索用のregistryを、`dagayn daemon add` はwatchの設定を更新します。両方ほしいときは両方を実行します。

## 埋め込みとfts-only

`semantic_search_nodes_tool` は、FTSと埋め込みの結果をRRFで統合します。埋め込みがなければFTSだけで動きます。日本語はLindera IPADICの形態素とCJKバイグラムで索引するため、活用形の違う問い合わせも一致します。

| 目的 | コマンド |
| --- | --- |
| グラフだけ（ベクトルなし） | `dagayn build` |
| BGE-M3のsidecarで埋め込む | `dagayn build --local-embedding` |
| Qwen3のsidecarで埋め込む | `dagayn build --local-embedding --mode llama-qwen3` |
| BGE-M3でMCPを動かす | `dagayn serve --local-embedding` |
| OpenAI互換APIでMCP検索する | `dagayn serve --remote-embedding openai` |

ローカル埋め込みには、`PATH` 上の `llama-server` が必要です。sidecarの既定ポートはBGE-M3が18080、Qwen3が18081です。

リモート埋め込みでは、AIツールを起動するシェルで環境変数を設定します。

| プロバイダ | 環境変数 |
| --- | --- |
| `openai` | `CRG_OPENAI_API_KEY`、`CRG_OPENAI_BASE_URL`、`CRG_OPENAI_MODEL` |
| `google` | `GOOGLE_API_KEY`（`dagayn[google-embeddings]` も必要） |
| `minimax` | `MINIMAX_API_KEY` |

クラウドへ送る前に、dagaynは送る内容を標準エラーに警告します。内容を確認したら `CRG_ACCEPT_CLOUD_EMBEDDINGS=1` で警告を止められます。`CRG_OPENAI_BASE_URL` がlocalhostなら警告は出ません。

ベクトル検索は常にRustのネイティブ検索です。SIMDで内積を計算し、BLASなどの外部ライブラリは使いません。v11.2.0で `DAGAYN_EMBEDDING_SEARCH_BACKEND` は読まれなくなりました。

## 最初のクエリ

IDE側にMCPの `dagayn` サーバが登録されているかを確認します。既定のMCP面は次の9ツールです。

| 用途 | ツール |
| --- | --- |
| 状況の把握とグラフの準備 | `get_minimal_context_tool`、`ensure_graph_tool` |
| レビューと解析 | `review_tool`、`flow_tool`、`architecture_analysis_tool`、`refactor_tool` |
| 検索と構造クエリ | `query_graph_tool`、`semantic_search_nodes_tool` |
| 文書 | `get_docs_section_tool` |

最初は `get_minimal_context_tool` で状況をつかみ、差分レビューなら `review_tool(mode="changes", detail_level="minimal")` を呼びます。`findings` は差分の外で確認すべき場所の一覧で、空なら差分の外に確認点はありません。どの応答も `next` に次に呼ぶべき呼び出しを引数つきで返すので、エージェントはそれに沿って辿れます。

MCPなしでもシェルから同じ実装を呼べます。`dagayn tool` の出力は1行のJSONです。

```bash
dagayn tool --list
dagayn tool review_tool --arg mode='"changes"' | jq .
dagayn tool architecture_analysis_tool --arg mode='"overview"' --format summary
dagayn detect-changes --base HEAD~1
```

## v11.0.0からのアップグレード

1. MCPサーバを再起動します（Claude Codeなら `/mcp` から `dagayn` を再接続）。起動中のサーバは古い実装のまま動くためです。
2. `dagayn update` を実行します。GoとRustの抽出器が新しくなったので、該当するファイルだけを再パースします。手動のフルビルドは要りません。
3. `dagayn tool` の出力を読むスクリプトは、1行のJSONを前提にしてください。整形して読むなら `jq` に渡します。
4. `DAGAYN_EMBEDDING_SEARCH_BACKEND` と `dagayn[numpy]` の指定は、もう効かないので外します。
5. `dagayn.architecture`、`dagayn.flows`、`dagayn.refactor` などをimportしていたコードは、MCPツールか `GraphStore` のメソッドに移します。

## トラブルシューティング

### `dagayn install` がエディタに反映されない

`--dry-run` で生成内容を確認し、対象のプラットフォームが検出されているかを見てください。

```bash
dagayn install --dry-run --platform cursor
```

### グラフが空、または古い

```bash
dagayn build
dagayn status
```

`Graph state:` の行に、状態を直すコマンドが出ます。リポジトリをディスク上で移動した場合は、再ビルドしてください。

### 別のリポジトリの結果が返る

MCPの応答の `_repo` で、どの `repo_root` から答えたかを確認します。`source: "auto"` で想定外のルートなら、サーバはどのプロジェクトか判断できていません。ツールに `repo_root` を渡すか、プロジェクト単位の設定で `--repo` を指定してください。

### `dagayn._core` が見つからない

wheelにRust拡張が入っていないか、ソースのcheckoutで未ビルドです。Pythonだけで動く実装はないため、`_core` なしでは動作しません。

```bash
pip install dagayn
# source checkout:
uvx maturin develop --release
```

### `database disk image is malformed` が出る

長く動いているMCPサーバが、古い接続を持ち続けていることがあります。まずMCPサーバを再起動してください。新しいプロセスでも失敗するときだけ再ビルドします。

### hookが重い、または止まった

hook経由の更新には既定120秒の予算があり、超えると止まります。`dagayn status` に `Hook updates: stopped` が出たら、`dagayn update` を手で実行してください。hook経由の更新を止めたいときは `.dagayn/hook-skip` を置きます。

### `build --scip` が `hint:` や警告を出す

`hint:` はインデクサが未インストールという意味で、インストール手順が書かれています。`SCIP overlay (...)` の警告は、インデクサが走って失敗したという意味です。多くは、プロジェクトがビルドできないか依存が入っていないことが原因です。

### セマンティック検索が効かない

`dagayn status` で埋め込みが `empty` や `partial` なら、`dagayn build --local-embedding` で生成します。`fts-only` でインストールした場合は、FTSだけで動くのが正常です。

### ノートブックのセル番号がずれる

ノートブックを直したら再ビルドしてください。

## 次に読む

MCPツールの一覧は [MCP ツール](/projects/dagayn/mcp-tools/) です。差分レビューの流れは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
