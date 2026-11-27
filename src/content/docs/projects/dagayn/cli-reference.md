---
title: "CLI リファレンス"
description: "dagayn v11.2.0 の CLI コマンド、フラグ、環境変数"
sidebar:
  order: 3
---

このページは、dagayn v11.2.0の `dagayn` コマンドのサブコマンドとフラグ、読む環境変数を扱います。MCPツールの引数と応答は [MCP ツール](/projects/dagayn/mcp-tools/) へ。初回セットアップは [使い方](/projects/dagayn/usage/) へ。

## コマンド一覧

| コマンド | 用途 |
| --- | --- |
| `dagayn build` | グラフのフルビルド |
| `dagayn update` | 変更ファイルだけのインクリメンタル更新 |
| `dagayn postprocess` | 既存グラフへの後処理（コミュニティ、FTS）だけを実行 |
| `dagayn watch` | ファイル変更を監視して自動で更新 |
| `dagayn status` | グラフの統計と鮮度 |
| `dagayn detect-changes` | 変更のレビュー（`review_tool(mode="changes")` と同じ） |
| `dagayn tool` | MCPツールをシェルから呼ぶ |
| `dagayn eval` | ベンチマークと評価レポート |
| `dagayn install` / `dagayn init` | AIツール向けのMCP設定・hooks・skills・instructionを書き込む |
| `dagayn serve` | MCPサーバを起動 |
| `dagayn session prepare` | セッション開始時にグラフを使える状態にする |
| `dagayn queue` | hook用のバックグラウンド更新キュー |
| `dagayn worktree` | linked worktreeへのグラフの引き継ぎ |
| `dagayn hook-repo` | hookのJSONペイロードからリポジトリルートを出す |
| `dagayn register` / `unregister` / `repos` | マルチリポジトリのレジストリ |
| `dagayn daemon` | 複数リポジトリを監視するwatch daemon |

`dagayn -v`（`--version`）はバージョンを出します。引数なしの `dagayn` はバナーとコマンド一覧を出します。多くのサブコマンドは `--repo` でリポジトリルートを受け取り、省くと自動で検出します。

インストールされた `dagayn` は、`build`、`update`、`status` をRustのCLIで実行します。`--scip` や `--local-embedding` などRust側が扱わないフラグや状況では、同じ出力のPython CLIに切り替わります。`DAGAYN_PYTHON_CLI=1` を設定すると、すべてのコマンドをPython CLIで実行します。

## build

```bash
dagayn build [--repo PATH] [--force-full-build] [--skip-flows] [--skip-postprocess] [--scip] [ローカル埋め込みのフラグ]
```

| フラグ | 意味 |
| --- | --- |
| `--force-full-build`（`--force`） | 既存の `graph.db` とSQLiteのサイドカーを消してから作り直す |
| `--skip-flows` | コミュニティ検出を省く（シグネチャとFTSは作る） |
| `--skip-postprocess` | 後処理をすべて省く |
| `--scip` | 後処理の前にSCIPインデクサで呼び出し先を確定する |

`--scip` は、リポジトリ内のプロジェクトごとにインデクサを実行します。TypeScriptとPythonのインデクサはdagaynに同梱されています。Rust、Go、Java / Kotlin、C / C++、C#、Ruby、Dart、PHP、Rのインデクサは、マシンにあれば使います。無ければ `hint:` 行でインストール方法を示し、その言語はdagayn自身の解決のままです。`scip-java` はプロジェクトのビルドを伴うので、`DAGAYN_SCIP_ALLOW_BUILD=1` のときだけ実行します。

インデックスは `.dagayn/scip/` に書かれます。SCIPの上書きはフルの `build` でだけ働き、`update` が再パースしたファイルは次の `build --scip` まで通常の解決に戻ります。

失敗したインデクサや後処理などの警告は、stderrに `WARNING:` 行で出ます。

## update

```bash
dagayn update [--repo PATH] [--base REF] [--skip-flows] [--skip-postprocess] [--budget-seconds N] [ローカル埋め込みのフラグ]
```

| フラグ | 意味 |
| --- | --- |
| `--base` | diffの比較先。既定はグラフをビルドしたコミットで、記録が無ければ `HEAD~1` |
| `--skip-flows` | コミュニティ検出を省く |
| `--skip-postprocess` | 後処理をすべて省く |
| `--budget-seconds` | この秒数を超えたら更新を止める。`0` で無制限 |

`update` は追跡ファイルのdiff、ステージ済み、未ステージ、未追跡のファイルをまとめて検出します。新しいファイルはステージしなくてもパースされます。

`--budget-seconds` の既定は、手動の実行では無制限です。hook経由（`DAGAYN_HOOK_UPDATE=1`）の実行では120秒です。

`build`、`update`、`watch` が対象にするファイルは同じです。Gitがインデックスできる集合（追跡ファイルと、gitignoreされていない未追跡ファイル）を使い、`.dagaynignore` はそこからさらに除外します。

## postprocess・watch・status

| コマンド | フラグ |
| --- | --- |
| `dagayn postprocess` | `--no-communities`（コミュニティ検出を省く）、`--no-fts`（FTSの再構築を省く） |
| `dagayn watch` | `--repo` だけ |
| `dagayn status` | `--repo` だけ |

`status` は、グラフの合計と埋め込みのカバレッジを表示します。埋め込みの状態（`complete`、`partial`、`stale`、`empty`、`not_indexed`）とプロバイダ別のベクトル数も出します。

`Graph state:` の行には、グラフの鮮度とそれを解消するコマンドが出ます。ビルド時と現在のブランチやコミットが違うときは警告します。hookの更新が予算超過で止まっているときは `Hook updates: stopped` の行が出ます。

## detect-changes

```bash
dagayn detect-changes [--repo PATH] [--base REF] [--brief]
```

| フラグ | 意味 |
| --- | --- |
| `--base` | 比較先。既定は、追跡ファイルに未コミットの変更があれば `HEAD`、なければ `HEAD~1` |
| `--brief` | summaryとfindingを1行ずつ出す（`detail_level="minimal"`） |

`review_tool(mode="changes")` と同じ `findings` を出します。`update` と同じく、未追跡のファイルも変更として扱います。Gitリポジトリの外では終了コード1で終わります。findingの種類は [MCP ツール](/projects/dagayn/mcp-tools/#review_tool) へ。

## tool

```bash
dagayn tool --list
dagayn tool <ツール名> [--repo PATH] [--arg KEY=VALUE ...] [--json-args JSON] [--format json|summary]
```

| フラグ | 意味 |
| --- | --- |
| `--list` | 呼べるツール名を一覧する |
| `--arg KEY=VALUE` | ツールの引数。値はJSONとして読み、読めなければ文字列。繰り返して複数渡す |
| `--json-args` | 引数をまとめたJSONオブジェクト |
| `--repo` | `repo_root` として渡す |
| `--format` | `json`（既定）または `summary`（応答の `summary` だけ） |

MCPツールと同じ実装を、MCPサーバなしで呼びます。拡張面を含む16個のツールすべてを呼べます。末尾の `_tool` を省いた名前（`review`、`flow` など）も受け付けます。v11.1.0から、出力はインデントなしの1行のJSONです。

```bash
dagayn tool review_tool --arg mode='"changes"' --arg 'changed_files=["src/app.py"]'
dagayn tool flow_tool --arg mode='"entry_points"' --arg target='"save_user"'
dagayn tool query_graph_tool --arg pattern='"callers_of"' --arg target='"save_user"' | jq .
```

## eval

```bash
dagayn eval [--benchmark NAMES] [--repo NAMES] [--all] [--report] [--profile P] [--no-semantic-report] [--output-dir DIR]
```

| フラグ | 意味 |
| --- | --- |
| `--benchmark` | 実行するベンチマーク（カンマ区切り） |
| `--repo` | 評価設定のリポジトリ名（カンマ区切り） |
| `--all` | すべてのベンチマークを実行 |
| `--report` | 結果からレポートを生成する |
| `--profile` | レポートの要約の観点。`search`、`review`、`architecture`、`operability`、`regression`、`all`（既定） |
| `--no-semantic-report` | 観点別の節を持たない以前の簡易レポートにする |
| `--output-dir` | 結果の出力先 |

ベンチマーク名は次の13種類です。

- `token_efficiency`
- `impact_accuracy`
- `flow_completeness`
- `search_quality`
- `doc_fuzzy_search`
- `embedding_text_modes`
- `embedding_materials`
- `build_performance`
- `nplusone_count`
- `mcp_latency`
- `recent_changes_effects`
- `query_performance`
- `scale_performance`

`--all`、`--repo`、`--benchmark` のどれも無いと、何も実行しません。

## install

```bash
dagayn install [--platform NAME] [--mode MODE] [--dry-run] [-y] [--no-skills] [--no-hooks] [--no-instructions]
```

| フラグ | 意味 |
| --- | --- |
| `--platform` | 対象のプラットフォーム。既定は `all`（検出したものすべて） |
| `--mode` | 埋め込みの方式。`fts-only`、`local-embedding`、`local-embedding-llama`、`remote-embedding` |
| `--preset low` | `--mode local-embedding-llama` のプリセット（Qwen3-Embedding-0.6B） |
| `--provider` | `--mode remote-embedding` のプロバイダ。`openai`、`google`、`minimax` |
| `--dry-run` | 書き込まずに、行う内容を表示する |
| `-y` / `--yes` | instructionの書き込みを確認なしで行う |
| `--no-skills` | skillファイルを生成しない |
| `--no-hooks` | hookを入れない |
| `--no-instructions` | `~/.claude/CLAUDE.md` や `AGENTS.md` などにinstructionを書かない |

`dagayn init` は `install` の別名です。`--mode` を省くと、TTYでは対話で選びます。`-y` を付けたときと標準入力がTTYでないときは、エラーで終わります。ローカル埋め込みのポート・バイナリ・タイムアウトのフラグも受け付け、MCP設定に書き込みます。

`--platform` には `codex`、`claude`、`claude-code`、`cursor`、`windsurf`、`zed`、`continue`、`opencode`、`antigravity`、`qwen`、`kiro`、`qoder`、`qcoder`、`pi`、`hermes`、`all` を渡せます。

| プラットフォーム | 主な書き込み先 |
| --- | --- |
| `claude` | リポジトリの `.mcp.json`、`~/.claude/settings.json`（hooks）、`~/.claude/CLAUDE.md`、`~/.claude/skills/<name>/SKILL.md` |
| `codex` | `~/.codex/config.toml`、`~/.codex/hooks.json`、Codexのskills |
| `cursor` | `.cursor/mcp.json` と `~/.cursor/mcp.json`、`~/.cursor/hooks.json` と `~/.cursor/hooks/` |
| `pi` | `.pi/mcp.json`、`~/.pi/agent/skills/`、`~/.pi/agent/hook/` |
| `hermes` | `~/.hermes/config.yaml`、`~/.hermes/skills/` |

編集hookは `dagayn queue add update` で更新をキューに積みます。セッション開始hookは `dagayn session prepare --budget-seconds 45` を実行します。Gitのhookは、コミット前に `dagayn update --skip-flows` と `dagayn detect-changes --brief` を、コミット後に `dagayn update` を実行します。

## serve

```bash
dagayn serve [--repo PATH] [--tools LIST] [--http [--host ADDR] [--port PORT]] [--local-embedding [MODE]] [--remote-embedding PROVIDER]
```

| フラグ | 意味 |
| --- | --- |
| `--tools` | 公開するツール名のカンマ区切り。`all`、`full`、`*` で全ツール。省くと `CRG_TOOLS`、それも無ければ既定の9ツール |
| `--http` | localhostでStreamable HTTPを待ち受ける |
| `--host` | `--http` のバインドアドレス（既定 `127.0.0.1`） |
| `--port` | `--http` のポート（既定 `5555`） |
| `--local-embedding` | 管理されたローカル埋め込みサイドカーで検索する |
| `--remote-embedding` | 検索の既定のリモートプロバイダ。`openai`、`google`、`minimax` |

既定はstdioです。`--host` と `--port` は `--http` と一緒にだけ使えます。`--local-embedding` と `--remote-embedding` は同時に使えません。

`--remote-embedding` を省いた場合、必要な環境変数がそろっているプロバイダが1つだけなら、それを既定にします。`--repo` を固定したサーバは、グラフに保存済みのローカル埋め込みの設定も引き継ぎます。

## session prepare

```bash
dagayn session prepare [--repo PATH] [--from-hook] [--force] [--budget-seconds N] [--embedding auto|defer|skip|inline] [--json] [--no-seed-worktree]
```

| フラグ | 意味 |
| --- | --- |
| `--from-hook` | 標準入力のhookペイロードからリポジトリを探す |
| `--force` | 同期済みに見えても更新する |
| `--budget-seconds` | 実行時間の予算。`0` で無制限 |
| `--embedding` | 埋め込みの更新をいつ行うか。`auto`（予算が残れば。既定）、`defer`、`skip`、`inline` |
| `--json` | 結果をJSONで出す |
| `--no-seed-worktree` | linked worktreeへのグラフの引き継ぎを省く |

空のグラフを作るか、HEADやワークツリーとずれたグラフを予算内で更新します。linked worktreeでは先にメインのグラフを引き継ぎます。ローカル埋め込みのフラグも受け付けます。

## queue

| コマンド | フラグ |
| --- | --- |
| `dagayn queue add <kind>` | `--priority`、`--no-worker`、`--idle-seconds`（既定60）、ローカル埋め込みのフラグ |
| `dagayn queue run` | `--idle-seconds`（既定60）、`--max-tasks` |
| `dagayn queue status` | `--json` |
| `dagayn queue clear` | なし |

`kind` は `update`、`embed`、`postprocess`、`prepare` です。既定の優先度は `update` と `prepare` が10、`embed` と `postprocess` が0です。

キューは `.dagayn/task_queue.db` にあり、リポジトリごとに1つのworkerが処理します。workerはキューが空のまま `--idle-seconds` 経つと終わります。失敗したタスクは3回まで再試行し、それでも失敗すると `dead` になります。`.dagayn/hook-skip` を作ると、workerはhookの更新をしません。

## worktree・hook-repo

| コマンド | フラグ |
| --- | --- |
| `dagayn worktree sync` | `--from-hook`、`--base`、`--seed-only`、`--no-copy-config`、`--build-if-missing`、`--json`、ローカル埋め込みのフラグ |
| `dagayn worktree info` | `--repo` だけ |
| `dagayn hook-repo` | `--no-cwd-fallback` |

`worktree sync` は、メインのcheckoutのgitignoreされたMCP設定とskillファイルをコピーします。続いて `graph.db` をSQLiteのバックアップAPIでコピーし、ブランチの差分だけを再パースします。

| フラグ | 意味 |
| --- | --- |
| `--seed-only` | コピーだけで、更新はしない |
| `--no-copy-config` | MCP設定をコピーしない |
| `--build-if-missing` | メイン側にグラフが無ければフルビルドする |

`hook-repo` は、標準入力のhookペイロードが指すリポジトリのルートを出します。`--no-cwd-fallback` を付けると、見つからないときにカレントディレクトリへ戻らず失敗します。

## マルチリポジトリとdaemon

| コマンド | 引数とフラグ |
| --- | --- |
| `dagayn register <path>` | `--alias` |
| `dagayn unregister <path_or_alias>` | なし |
| `dagayn repos` | なし |
| `dagayn daemon start` / `restart` | `--foreground` |
| `dagayn daemon stop` / `status` | なし |
| `dagayn daemon logs` | `--repo`（エイリアス）、`--follow`、`--lines`（既定50） |
| `dagayn daemon add <path>` | `--alias` |
| `dagayn daemon remove <path_or_alias>` | なし |

レジストリは `~/.dagayn/registry.json` にあり、MCPの `list_repos_tool` と `cross_repo_search_tool` が使います。daemonの設定はupstreamの [docs/DAEMON-CONFIG.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/DAEMON-CONFIG.md) を参照してください。

## ローカル埋め込みのフラグ

`build`、`update`、`serve`、`session prepare`、`queue add`、`worktree sync` は、次のフラグを共通で受け付けます。

| フラグ | 既定 | 意味 |
| --- | --- | --- |
| `--local-embedding [MODE]` | `none` | 値なしでBGE-M3のサイドカー。`low` はQwen3のサイドカー、`none` は埋め込みなし |
| `--mode` | なし | `bge-m3` または `llama-qwen3` |
| `--local-embedding-port` | BGE-M3は18080、Qwen3は18081 | サイドカーのポート |
| `--local-embedding-bin` | `auto` | サイドカーの実行ファイル（`auto` は `llama-server`） |
| `--keep-local-embedding-server` | なし | dagaynが起動したサイドカーを終了時に残す |
| `--local-embedding-timeout` | 300 | サイドカーの起動を待つ秒数 |
| `--local-embedding-request-timeout` | 60 | 1回の埋め込みリクエストを待つ秒数 |
| `--local-embedding-batch-size` | 1 | 1リクエストあたりのテキスト数 |

```bash
dagayn build --local-embedding
dagayn build --local-embedding --mode llama-qwen3
```

## 環境変数

dagaynのコードが読む環境変数のうち、利用者が設定するものです。

| 変数 | 意味 |
| --- | --- |
| `CRG_TOOLS` | `dagayn serve` が公開するツール（`--tools` と同じ） |
| `CRG_DATA_DIR` | グラフデータを作業ツリーの外に置く。リポジトリとworktreeごとにサブディレクトリを作る |
| `CRG_REPO_ROOT` | リポジトリルートを明示する |
| `DAGAYN_ALLOW_WIDE_ROOT=1` | ホームディレクトリやファイルシステムのルートをルートとして使うことを許す |
| `DAGAYN_PYTHON_CLI=1` | Rust CLIを使わず、全コマンドをPython CLIで実行する |
| `DAGAYN_HOOK_UPDATE=1` | hook経由の更新として扱う（予算の監視、書き込みロックを待たない） |
| `DAGAYN_SESSION_PREPARE_BUDGET_SECONDS` | `session prepare` の既定の予算 |
| `DAGAYN_WORKTREE_SEED=0` | worktreeへのグラフの引き継ぎを止める |
| `DAGAYN_SCIP_ALLOW_BUILD=1` | `--scip` で `scip-java` の実行を許す |
| `DAGAYN_SCIP_<LANGUAGE>` | SCIPインデクサのコマンドを置き換える（`DAGAYN_SCIP_RUST`、`DAGAYN_SCIP_GO` など） |
| `DAGAYN_SCIP_TIMEOUT` | インデクサ1回あたりの制限秒数（既定900） |
| `DAGAYN_READ_LOCK_TIMEOUT` | 読み取りロックを待つ秒数（既定10） |
| `DAGAYN_WRITE_LOCK_TIMEOUT` | 書き込みロックを待つ秒数（既定120） |
| `CRG_GIT_TIMEOUT` | gitコマンドの制限秒数（既定30） |
| `CRG_OPENAI_API_KEY` / `CRG_OPENAI_BASE_URL` / `CRG_OPENAI_MODEL` | `openai` プロバイダ（OpenAI互換API）の設定 |
| `CRG_OPENAI_BATCH_SIZE` | リモート埋め込みAPIのバッチサイズ |
| `GOOGLE_API_KEY` | `google` プロバイダのAPIキー |
| `MINIMAX_API_KEY` | `minimax` プロバイダのAPIキー |
| `CRG_ACCEPT_CLOUD_EMBEDDINGS=1` | クラウドへ送る前の警告を抑える |
| `DAGAYN_EMBEDDING_TEXT_MODE` | 埋め込みに使うテキストの作り方 |
| `DAGAYN_BACKEND` | `rust` 以外を指定すると拒否される |

v11.2.0で `DAGAYN_EMBEDDING_SEARCH_BACKEND` は読まれなくなりました。ベクトル検索は常にRustのネイティブ実装を使います。

## 終了コード

終了コードの一覧はupstreamのドキュメントにありません。コードから分かるものだけを挙げます。

| 状況 | 終了コード |
| --- | --- |
| 正常終了 | 0 |
| グラフのDBが壊れている（DBを退避し、`dagayn build` を案内する） | 1 |
| `detect-changes` をGitリポジトリの外で実行した | 1 |
| `dagayn tool` でツール名が無い、または引数が不正 | 2 |

## 次に読む

日常の運用は [使い方](/projects/dagayn/usage/) です。レビューの流れは [レビューと影響分析](/projects/dagayn/review-analysis/) へ。
