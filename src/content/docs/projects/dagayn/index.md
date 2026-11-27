---
title: "はじめに"
description: "ローカル知識グラフで AI コードレビューを支える dagayn の概要（v11.2.0）"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [dagayn](https://github.com/manji-0/dagayn) · 対象バージョン: **v11.2.0**

**DAG is All You Need**。dagaynは、リポジトリをローカルのSQLiteグラフにし、AIコーディングエージェントが構造クエリでコードベースを辿れるようにするツールです。

## 目的

エージェントがファイルを開き直してgrepする反復を減らします。caller・import・テスト対応・設計書とコードの橋を、MCP経由でグラフに1回聞けば済むようにします。

## 背景

エージェントはタスクのたびにファイルを開き、全文検索で関連箇所を探します。リポジトリが大きいほど、その反復がトークンと待ち時間を消費します。「この関数のcallerは誰か」「この変更が触れていないcallerはどこか」「この設計書はどの実装を指しているか」は、一度パースした構造に聞く方が合理的です。

コアの着想は [code-review-graph](https://github.com/tirth8205/code-review-graph) にあります。dagaynはそのforkで、独立した製品として保守されています。主な追加点はTerraform、Markdown directive、設計書とコードをつなぐ `CROSS_ARTIFACT`、marimoノートブック、日本語FTS、SCIPによる呼び出し先の確定、複数ツール向けの `dagayn install` です。

## 想定する読み手

読み手はエージェントです。人が眺めるレポートや可視化、wiki、エディタ拡張は持ちません。1回の呼び出しで答え全体と「その答えが完全か」を返すことを重視します。dagaynが答える問いは、短いスクリプトでは答えにくいものです。

- 推移的なcaller・callee・importer・import
- 変更に届くテスト
- import循環と、より不安定なユニットへの依存
- ある節に依存する文書と、その節を実装するコード
- 変更が残したdangling参照や、編集されていないcaller

## 関連文書

| 種別 | リンク |
| --- | --- |
| ブログ | [すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/) |
| ブログ | [dagaynがコードグラフをSQLiteで取り扱うためのテクニック](/blog/2026/dagayn-python-speedups-and-rust-core/) |
| upstream | [POSITIONING.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/POSITIONING.md)、[ARCHITECTURE.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/ARCHITECTURE.md)、[SCHEMA.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/SCHEMA.md) |
| upstream | [CHANGELOG.md](https://github.com/manji-0/dagayn/blob/v11.2.0/CHANGELOG.md) |

## 目標

差分レビューでエージェントが読むトークン量と時間を減らします。設計書・Terraform・ソースを同じグラフで横断し、影響範囲の見落としを減らします。`fts-only` 運用ではソースを外部へ送らずに検索できます。

## 対象外

grepとLSPで足りる小さな単一言語リポジトリには向きません。短い `ast` スクリプトで答えられる問いでは、dagayn経由のほうがトークンを多く使う場合もあります。初回 `dagayn build` とhook更新のコストを払えない場合や、ローカルMCPを使えない環境でも利点は小さくなります。

## シナリオ

1. 開発者が認証モジュールの関数シグネチャを変更し、コミット前にエージェントへレビューを頼む。
2. エージェントが `review_tool(mode="changes")` を呼び、差分の外で確認すべき `findings` と次の呼び出し `next` を受け取る。
3. `query_graph_tool` の `callers_of` と `tests_for` で、呼び出し元とテストの届き方を確認する。
4. 設計書側は `docs_for` でたどり、文書の更新が要るかを判断する。
5. 編集hookが `dagayn queue add update` で積んだ更新のあと、新しいグラフを読んで指摘を返す。

## 構成

```diagram-design dagayn-pipeline
```

対応言語のソース、Markdown、Terraform、ノートブック（`.ipynb`、Databricks、marimoの `.py` / `.md`）をパースし、`.dagayn/graph.db` に載せます。パーサは基本がTree-sitterで、PythonはRuffのパーサを使います。

グラフストア、パーサ、FTS、コミュニティ、後処理はRust拡張（`dagayn._core`）が担います。Pythonのグラフエンジンはなく、`DAGAYN_BACKEND=python` はエラーになります。`build` / `update` / `status` はRust側のCLIが走り、`dagayn serve` も既定ツールの呼び出しにRust側で応答します。Pythonに残るのは、CLIとMCPサーバの残りの部分と、ハイブリッド検索のランキングとmanifest bridgeの抽出です。

## 制約

グラフは各開発者の `.dagayn/` にローカル保存します。チームでは共有せず、各自でビルドするのが基本です。編集hookは更新をキューに積むだけで、リポジトリごとに1つのworkerが構造だけをまとめて更新します。MCPの既定面は9つのツールに絞り、それ以外は `--tools` や `CRG_TOOLS` で出します。

## インタフェース

| 面 | 入口 |
| --- | --- |
| CLI | `dagayn build` / `update` / `status` / `detect-changes` / `serve` / `tool` など |
| MCP | `review_tool`、`query_graph_tool`、`semantic_search_nodes_tool` など |
| セットアップ | `dagayn install`（MCP設定、hooks、skills、指示ファイル） |

MCPを立てずに、`dagayn tool <ツール名>` でシェルから同じ実装を呼べます。出力は1行のJSONです。詳しくは [MCP ツール](/projects/dagayn/mcp-tools/) と [CLI リファレンス](/projects/dagayn/cli-reference/) を見てください。

## 依存

| 依存 | 役割 |
| --- | --- |
| CPython 3.12以上（3.15まで対応） | CLI・MCPサーバ・オーケストレーション |
| `dagayn._core`（Rust/PyO3、abi3） | パース、SQLite、FTS、コミュニティ、後処理、既定ツールの応答 |
| Tree-sitter grammars | 約30言語とMarkdown・Terraformのfork（PythonはRuffのパーサ） |
| SQLite | `graph.db`（埋め込みも同じDB） |
| Git worktree | 変更検出（staged / unstaged / untracked） |

Pythonの必須依存は `fastmcp`、`pydantic`、`watchdog` の3つです。v11.2.0で `networkx` と `numpy` への依存はなくなりました。

同じリポジトリに [rdra-ish](/projects/rdra-ish/) やkamae系を置くと、`CROSS_ARTIFACT` で設計書と実装をつなげます。どれも必須ではありません。

## 対応言語と支援の深さ

パーサが対応する言語は広く、支援の深さは言語ごとに違います。

| 区分 | 言語 |
| --- | --- |
| アプリケーション言語 | Python、JavaScript、TypeScript、TSX、Go、Rust、Java、C、C++、C#、Ruby、PHP、Kotlin、Swift、Scala、Dart、Lua、Objective-C、Bash、Elixir、Zig、PowerShell、Julia、Perl、R、GDScript、Vue、Svelte、Astro |
| 文書とインフラ | Markdown、Terraform（`.tf` / `.tfvars`） |
| ノートブック | Jupyter、Databricks、marimo |

PowerShellはFileノードだけを作ります。

エージェント実験で効果を測れているのはRustです。Rustの問いではトークンが0.74倍、時間が0.61倍で、正答率は同じでした。Goは「first-class」を目指して3回の事前登録実験（G8〜G10）を行いましたが、どれも基準に届きませんでした。v11.2.0の時点で、Goはまだfirst-classではありません。テスト到達の判定は、Python・Rust・Go・TypeScriptについて実カバレッジと比べ、CIが下限を割らないか検査しています。

## 検討して捨てた案

**リモート常時同期グラフ**：エージェントが触るのは手元リポジトリの構造です。ネットワーク越しのグラフDBの運用コストに見合いませんでした。

**リクエスト時のグラフ組み立て**：MCPのレイテンシを抑えるため、コミュニティとFTSはビルド後にmaterializeします。v11.2.0で、Rustがすでに答えている解析のPythonラッパー（networkxによる依存グラフ投影など）も削除しました。

**Pythonのみのグラフエンジン**：大規模リポジトリのパースと探索のため、Rustコアへ移行済みです。

**Pythonの埋め込み検索**：numpyの行列積と純Pythonのコサイン類似度は削除しました。意味検索は常にRustのネイティブ検索を使います。

## v11.1とv11.2での主な変更

| 版 | 変更 |
| --- | --- |
| v11.1.0 | `dagayn tool` が1行のJSONを出力するようになった（`--format summary` は従来どおり） |
| v11.1.0 | `query_graph_tool` が曖昧なターゲットに候補ごとの答え（`answers`）を返すようになった |
| v11.1.0 | Goの `go.mod` の外や `testdata` などの行を `outside_module` に分けるようになった |
| v11.1.0 | `tests_for` がcaller経由で届くテスト（`test_reach.through_callers`）を示すようになった |
| v11.2.0 | wheelが安定ABI（`cp312-abi3`）になり、Python 3.15に対応した |
| v11.2.0 | Pythonの埋め込み検索と、Rust解析のPythonラッパーを削除した |

v11.0.0での削除（wiki、visualize、VS Code拡張、重複ツールなど）は [CHANGELOG](https://github.com/manji-0/dagayn/blob/v11.2.0/CHANGELOG.md) を見てください。

## 次に読む

動かすなら [使い方](/projects/dagayn/usage/) です。パイプラインの詳細は [アーキテクチャ](/projects/dagayn/architecture/) へ。
