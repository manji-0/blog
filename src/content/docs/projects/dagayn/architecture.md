---
title: "アーキテクチャ"
description: "dagayn の内部構成と処理パイプライン"
sidebar:
  order: 10
---

このページは、v11.2.0のdagaynの内部構成を扱います。取り込みパイプライン、SQLiteへの保存、RustとPythonの分担、hookによる更新が対象です。ノード種別やエッジkindの語彙は [グラフモデル](/projects/dagayn/graph-model/) を参照してください。利用手順は [使い方](/projects/dagayn/usage/) にあります。

## 全体像

```diagram-design dagayn-pipeline
```

dagaynはリポジトリの内容をローカルの知識グラフに変換し、CLIとMCPから同じデータを問い合わせます。中核はTree-sitterとSQLiteです。グラフエンジンはRust拡張 `dagayn._core` にあり、Pythonは薄い入口として残ります。

処理は次の5段です。

1. ファイルの発見と言語の判定
2. パーサによるノードとエッジの抽出
3. SQLiteへの保存
4. 後処理（呼び出し先の解決、言語をまたぐ橋、FTS索引、コミュニティ）
5. クエリ時の分析（レビュー、検索、探索、リファクタ）

## Rustクレート

Rust側はCargo workspaceで、`crates/` に11個のクレートがあります。

| クレート | 役割 |
| --- | --- |
| `dagayn-parser` | 言語ごとの抽出器。ファイル単位でノードとエッジを出す |
| `dagayn-grammars` | 固定したgrammarソースのコンパイル。言語ごとに `lang-<language>` feature を持つ |
| `dagayn-graph` | GraphStore。SQLiteスキーマ、書き込み、クエリ、FTS、埋め込み検索 |
| `dagayn-postproc` | 後処理パイプラインとLeidenコミュニティ検出、マニフェスト橋の抽出 |
| `dagayn-build` | Pythonを介さないビルド。ファイル発見、パースと保存、後処理、タスクキュー |
| `dagayn-cli` | Rust版CLI。`build` / `update` / `status` を処理する |
| `dagayn-mcp` | `dagayn serve` のstdio前段。ハンドシェイクと一覧をPythonなしで返す |
| `dagayn-tools` | Rustで答えるMCPツール |
| `dagayn-scip-python` | ty checkerによるPythonのSCIPインデクサ |
| `dagayn-scip-typescript` | tsrs checkerによるTypeScriptのSCIPインデクサ |
| `dagayn-py` | PyO3バインディング。`dagayn._core` としてビルドされる |

Tree-sitterは0.27系です。Pythonの抽出にはRuffのパーサ（`ruff_python_parser`）を使います。JavaScript / TypeScriptの抽出仕様はupstreamの [docs/TYPESCRIPT-EXTRACTION.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/TYPESCRIPT-EXTRACTION.md) にあります。

## Pythonパッケージ

`dagayn/` 配下のPythonは、CLI、MCPサーバ、埋め込みプロバイダ、インストーラを受け持ちます。グラフの保存と分析はRustに任せます。

| モジュール | 役割 |
| --- | --- |
| `dagayn.graph` | `GraphStore` の公開入口。実体は `dagayn._core.GraphStore` |
| `dagayn.communities` / `dagayn.postprocessing` | `dagayn._core` に委ねるファサード |
| `dagayn.search` | ハイブリッド検索の順位づけ（RRF融合とブースト） |
| `dagayn.parser` | Rustパーサの互換ラッパー |
| `dagayn.cli` | Python版CLI。Rust版CLIが扱わない処理を引き受ける |
| `dagayn.server` | MCPサーバ（fastmcp） |
| `dagayn.tools` | MCPツールの実装 |
| `dagayn.embeddings*` | 埋め込みの生成、プロバイダ、保存 |
| `dagayn.local_embeddings` | ローカル埋め込みsidecarの起動と管理 |
| `dagayn.task_queue` | hook用のバックグラウンド更新キュー |
| `dagayn.daemon` / `dagayn.registry` | 複数リポジトリの監視daemonとレジストリ |
| `dagayn.skills` | エージェント向けのskillとhookのインストール |

v11.2.0では、Rustがすでに答えている分析のPythonラッパーが削除されました。`dagayn.architecture`、`dagayn.flows`、`dagayn.entry_point_heuristics`、`dagayn._scope`、`dagayn.contracts.dependency_profiles`、`dagayn.refactor` パッケージがそれに当たります。依存パッケージから `networkx` と `numpy` も外れました。これらのモジュールをimportしていたコードは、MCPツールか `GraphStore` のJSONメソッドに移る必要があります。ツールの答えは変わりません。

実行時の依存は `fastmcp`、`pydantic`、`watchdog` の3つです。Python 3.12以降に対応し、配布wheelはstable ABI（`cp312-abi3`）の1プラットフォーム1本です。

## GraphStoreとRust境界

```diagram-design dagayn-layers
```

`from dagayn.graph import GraphStore` が返すのはネイティブストアです。`DAGAYN_BACKEND=python` はエラーになり、Pythonのグラフエンジンへのフォールバックはありません。新しい呼び出し側は、SQLiteハンドルを直接読まずに `GraphStore` のメソッドを使います。

CLIとMCPも、できるところはRustが答えます。

- `dagayn` コマンドは `build` / `update` / `status` を `dagayn._core` 内のRust CLIで処理します。`--scip` や `--local-embedding`、jjやSVNの作業コピー、壊れたグラフなど、Rust版が扱わない場合はPython CLIに回します。
- `dagayn serve` はRustの前段がMCPのハンドシェイクとツール一覧に答えます。既定のツールと、`dagayn-tools` が実装する一部のツールもRustで答えます。答えられない呼び出しが来た時点でPythonサーバを起動し、以後はそちらに渡します。
- `DAGAYN_PYTHON_CLI=1` を設定すると全コマンドがPython CLIを通ります。`python -m dagayn` も常にPython CLIです。

## 処理パイプライン

### ファイル発見と言語判定

対象ファイルはgitがインデックスできる集合（追跡済みと未追跡、gitignore除外）です。`build`、`update`、`watch` は同じ範囲を使います。`.dagaynignore` はこの集合をさらに絞るもので、`.gitignore` の代わりにはなりません。インデックス後にgitignoreされたファイルは、次の `update` か `build` で消えます。

言語は拡張子で判定します。拡張子のないスクリプトはshebangから判定します。アプリコード、Markdown、Terraform、Notebook（Jupyter、Databricks、marimoの `.py` / `.md`）を1つのグラフに混在できます。

### パーサ抽出

パーサの出力は常にファイル単位のノード・エッジ列です。パーサは1ファイルしか見ないため、呼び出し先の確定は後処理に回します。fork固有のgrammarはcommit pinで取得します。

| 形式 | 備考 |
| --- | --- |
| Terraform | fork `tree-sitter-terraform`。`.tf` / `.tfvars` |
| Markdown | fork `tree-sitter-markdown`。依存コメントと `dagayn:` directive に対応 |
| Notebook | セル単位で行番号を保つ。Jupyter、Databricks、marimo |
| Python | `ruff_python_parser` |
| JavaScript / TypeScript | 独自の抽出器。Vue、Svelte、Astroのscriptも同じ抽出器を通る |

### 抽出器のバージョン

各抽出器は出力バージョンを持ち、グラフのメタデータ `extractor_versions` に記録します。バージョンが記録より新しくなると、次の `dagayn update` はその抽出器が担当する全ファイルを再パースします。ファイルが変わっていなくても、古い抽出器のノードやエッジが残らないようにするためです。v11.2.0での主な値は次のとおりです。

| 抽出器 | バージョン |
| --- | --- |
| `rust` | 29 |
| `go` | 20 |
| `python` | 17 |
| `javascript`（TypeScript、TSX、Vue、Svelteを含む） | 16 |
| `markdown` | 3 |
| `terraform` | 3 |
| `shared`（全言語共通の後段） | 2 |

一覧と各バージョンの変更点は [crates/dagayn-parser/src/extractor_version.rs](https://github.com/manji-0/dagayn/blob/v11.2.0/crates/dagayn-parser/src/extractor_version.rs) にあります。11.1.0と11.2.0をまたいで更新すると、GoとRustのファイルは次の `update` で再パースされます。

### 後処理

後処理には3つのレベルがあります。

| レベル | 内容 | 指定方法 |
| --- | --- | --- |
| `full` | `minimal` の全段に加え、コミュニティ検出と要約 | 既定 |
| `minimal` | シグネチャ、FTS索引、エッジの解決と橋 | `--skip-flows` |
| `none` | 生のパースのみ | `--skip-postprocess` |

`minimal` の段は次の順で走ります。1つの段が失敗しても警告として記録し、次の段に進みます。

| 段 | 内容 |
| --- | --- |
| SCIPオーバーレイ | `build --scip` のときだけ、最初にSCIPインデックスで `CALLS` を確定する |
| シグネチャ計算 | 未計算のノードのシグネチャを作る |
| FTS索引 | `nodes_fts` を作り直す。`update` では変更ファイルの分だけ同期する |
| 呼び出し先の解決 | re-export、素の名前、戻り値型、標準ライブラリやパッケージ、`TESTED_BY` の整合 |
| 継承先の解決 | `INHERITS` / `IMPLEMENTS` の素の名前を解決する |
| Rust implの付け替え | 別ファイルで宣言された型の `impl` メンバーを型のノードへ移す |
| Terraform moduleの参照 | 同じディレクトリの別ファイルにある `var.x` などの宣言へ `REFERENCES` を結ぶ |
| 未解決エッジの格下げ | 端点がノードでないエッジを `LOW` にする |
| Markdownの解決 | コードスパンとdirectiveを、コードのシンボルに結ぶ |
| Terraformからコードへの橋 | `handler` や `filename` が指すコードへの `CROSS_ARTIFACT` |
| マニフェスト橋 | `pyproject.toml`、`package.json`、`wrangler.toml` などから `CROSS_ARTIFACT` を作る |
| ネイティブ橋 | Python ↔ Rust、FFI、WebAssemblyの `CROSS_ARTIFACT` |
| リクエスト境界 | Cloudflare Workerのテストの `SELF.fetch` やHonoの `app.fetch` などを `CALLS` にする |

解決の規則は [グラフモデル](/projects/dagayn/graph-model/#呼び出し先の解決) にまとめています。`dagayn postprocess` は既存のグラフに後処理だけをかけ直します。`--no-communities` と `--no-fts` で段を省けます。

保存フローはv10.0.0で廃止され、エントリポイントはクエリ時に計算します。v11.0.0でcentralityの表とコミュニティ要約の表も削除されました。

### インクリメンタル更新

`dagayn update` はファイル単位の置き換えです。変更されたファイルをパースし、そのファイルの古いノードとエッジを消してから新しいものを書き込みます。

変更の検出は追跡済みの差分に加え、staged、unstaged、未追跡のファイルも含みます。新しいファイルはステージしなくてもパースされます。差分の基点は、グラフを作ったコミット（`git_head_sha`）が既定です。記録がないグラフでは `HEAD~1` を使います。`--base` で基点を変えられます。

Goのパッケージのように、変更ファイルをimportする側も再パースが必要な場合は、それらを依存先として一緒に再パースします。

### SCIPによる呼び出し解決

`dagayn build --scip` は、後処理の前にSCIPインデクサで呼び出し先を確定します。TypeScriptとPythonのインデクサはdagaynに同梱されています。rust-analyzerやscip-goなどは、マシンに入っていれば使います。入っていない言語は `hint:` を出して、dagayn自身の解決に任せます。インデックスは `.dagayn/scip/` に書かれます。オーバーレイは完全な `build` でのみ走り、`update` は次の `build --scip` まで従来の解決を使います。

## 保存

### ファイル配置

| パス | 内容 |
| --- | --- |
| `.dagayn/graph.db` | ノード、エッジ、派生テーブル、埋め込み |
| `.dagayn/task_queue.db` | hook用のバックグラウンド更新キュー |
| `.dagayn/scip/` | `build --scip` のSCIPインデックス |
| `.dagayn/hook-skip` | 作るとhookによる更新を止める |

パスはリポジトリルート相対で保存します。symlink経由の一時パスの差を吸収し、マシン間でも結果が変わりません。グラフはローカルで完結します。通常は `.dagayn/` をgitignoreし、各開発者が手元で `dagayn build` します。

### テーブル

スキーマのバージョンは20です。

| テーブル | 内容 |
| --- | --- |
| `nodes` | ノード。`qualified_name` はUNIQUE |
| `edges` | エッジ。端点は `qualified_name` の文字列で結ぶ |
| `metadata` | スキーマバージョン、ビルド時刻、VCS情報、リポジトリルート、抽出器バージョン |
| `nodes_fts` | FTS5の仮想テーブル |
| `communities` | コミュニティと凝集度 |
| `risk_index` | ノードごとのリスク値（呼び出し元数、テスト状況など） |
| `embeddings` | ノードの埋め込みベクトル。プロバイダごとに分かれる |
| `embeddings_generation` | 埋め込みの書き込みで増えるカウンタ |

列の詳細は [グラフモデル](/projects/dagayn/graph-model/#スキーマ) にあります。グラフより新しいdagaynでは、次回のオープン時にマイグレーションが走ります。dagaynより新しいスキーマのグラフは開けず、dagaynの更新か再ビルドを求められます。

### 接続設定

GraphStoreは接続ごとに次のPRAGMAを設定します。

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA mmap_size=0;
PRAGMA temp_store=MEMORY;
-- plus journal_size_limit to cap the WAL file
```

WALはhookの頻繁な `update` とMCPのクエリが並ぶ用途に向きます。`mmap_size` は0です。WALとmmapを併用すると、別接続のcheckpointで `sqlite_master` が壊れたためです。`journal_size_limit` は、大きなビルドでWALファイルが膨らみ続けるのを抑えます。読み取りは共有ロック、書き込みは排他ロックを取るので、両者は重なりません。

### 循環とDAG制約

保存時にDAG制約は入れません。importの循環やドキュメントの相互参照は実際に存在するためです。循環はクエリ時に `architecture_analysis_tool(mode="import_cycles")` で検出します。

### FTS索引

`nodes_fts` はFTS5の仮想テーブルで、トークナイザは `porter unicode61` です。列は `name`、`qualified_name`、`file_path`、`signature`、`identifier_tokens`、`doc_text` です。`identifier_tokens` には識別子を語に分けたもの（`OpenAIEmbeddingProvider` → `open ai embedding provider`）が入ります。`doc_text` にはdocstringやMarkdownの本文が入ります。

日本語・CJK・ハングルは、Lindera IPADICの形態素とCJKバイグラムの両方で索引します。辞書の読み込みに失敗したときは、重ならないバイグラムで代替します。検索側の挙動は [グラフモデル](/projects/dagayn/graph-model/#検索) を参照してください。

### 埋め込み

埋め込みは `graph.db` の `embeddings` テーブルに入り、プロバイダとテキストモードごとに分かれます。同じノードに `material` と `narrative` の2種類のベクトルを持てます。生成は `embed_graph_tool` か、`build` / `update` の `--local-embedding` で行います。

ベクトル検索はRustのネイティブ実装だけです。v11.2.0でPythonのnumpy経路と純Pythonのcosineループは削除され、`DAGAYN_EMBEDDING_SEARCH_BACKEND` は読まれなくなりました。ネイティブ検索はベクトル行列をメモリに保持し、`embeddings_generation` のカウンタが変わったときだけ読み直します。

## hookとバックグラウンド更新

`dagayn install` が書くエージェント向けのhookは、編集のたびに `dagayn update` を走らせません。その代わり、`dagayn queue add update` でキューへ積みます。積む操作はSQLiteへの1回のinsertで、保留中の `update` があればそれにまとめます。ワーカーはリポジトリ単位で1つだけ動き、キューを処理します。そのため連続した編集は1回の構造更新（`postprocess=minimal`、埋め込みなし）にまとまります。

| 仕組み | 内容 |
| --- | --- |
| タスクの種類 | `update`（優先度10）、`embed`、`postprocess`（優先度0） |
| 予算 | hook由来の実行は `DAGAYN_HOOK_UPDATE=1` で予算付きになる。既定は120秒 |
| 再試行 | 失敗したタスクは3回まで再試行し、その後 `dead` になる |
| 停止の報告 | 予算超過で `dead` の `update` が残ると、`dagayn status` が `Hook updates: stopped` を出す |
| 止め方 | `.dagayn/hook-skip` を作る |

ワーカーはキューが空のまま60秒たつと終了し、次の編集までグラフのロックを持ちません。キューを `graph.db` と別のファイルにしているのは、ビルドが書き込みロックを持っている間も、タスクを積めるようにするためです。

セッション開始時のhookは `dagayn session prepare` を予算付きで実行し、グラフを作業コピーに追いつかせます。git hookのコミット前チェックは `dagayn update --skip-flows` を同期で実行します。

## マルチリポジトリ

`dagayn register` で複数のリポジトリをレジストリ（`~/.dagayn/registry.json`）に登録すると、`cross_repo_search_tool` で横断検索できます。`dagayn daemon` は `~/.dagayn/watch.toml` に書いたリポジトリを監視して更新します。設定項目はupstreamの [docs/DAEMON-CONFIG.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/DAEMON-CONFIG.md) を参照してください。

## 設計上の判断

| 判断 | 理由 |
| --- | --- |
| エッジを `qualified_name` で結ぶ | パーサがnode IDを知らなくてもエッジを出せる。ファイル単位の置き換えが単純になる |
| 保存時にDAG制約を入れない | 循環を観測できるようにする。検出はクエリ時 |
| ファイル単位で置き換える | 差分の適用より単純で速い |
| edge kindを分ける | 意味の分類と、探索時の索引の選択を兼ねる |
| 派生データを保存する | MCPの応答時間を抑える |
| グラフエンジンをRustに一本化する | Pythonとの二重実装による食い違いをなくす |

## ソースから開発する

ローカル開発は `uv sync --extra dev` が基本です。このときPyO3拡張 `dagayn._core` もビルドされます。Rustツールチェーン（1.99以上、`rust-toolchain.toml` で固定）とCコンパイラが必要です。詳しくはupstreamの [CONTRIBUTING.md](https://github.com/manji-0/dagayn/blob/v11.2.0/CONTRIBUTING.md) と [docs/ARCHITECTURE.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/ARCHITECTURE.md) を参照してください。

## 次に読む

ノードとエッジの語彙は [グラフモデル](/projects/dagayn/graph-model/) です。差分レビューは [レビューと影響分析](/projects/dagayn/review-analysis/) を参照してください。
