---
title: すべてを有向グラフにする、俺とAI以外のやつが
description: すべてを有向グラフに表現して解析できるツールを作った
sidebar:
  order: 2
---

`dagayn` というツールについて書く。

ざっくり一言で言うと「リポジトリをTree-sitterでパースしてDAGにしてSQLiteに保存し、AIエージェントにDAG経由で問い合わせさせる」ためのツールである。スローガンは **DAG is All You Need**。

経緯としては、

* 新しい職場に着任したのだけど、そこそこ高い給料を貰ってるのに研修動画を延々見ているだけというのも居心地が悪く、チームとしても早めに成功体験を積ませたいという方針だったので、1つ大きなプロジェクトの実施判断のためのドキュメントを書くことになった。
  * 依頼が来たのは入社4日目で、ドキュメントは入社6日目でFix。
* どうやって新入りが爆速で仕事の立ち上がりをしたのかというネタで入社7日目に全社発表したところそこそこウケたので、せっかくならそのやり方をツール化してやろうと思ってこの土日でズバっと書いてみた。

という流れである。

## dagaynとは


[dagayn](https://github.com/manji-0/dagayn)


目的はrepo内の「すべて」を有向グラフにして効率的に探索 & 明確なエンティティ間の意味的依存関係、歴史的事情などを把握できるようにすることである。

実体としては、

- リポジトリ内の対応言語ファイルを片っ端からTree-sitterでパースしてノード(File / Class / Function / Type / Test)を抽出する
- ノード間の関係(CALLS / IMPORTS_FROM / INHERITS / IMPLEMENTS / CONTAINS / DEPENDS_ON / TESTED_BY / REFERENCES / CROSS_ARTIFACT)をエッジとして抽出する
- これらをローカルSQLiteに格納する
- 後処理でフルテキスト検索インデックス、Leidenコミュニティ、実行フロー、各種構造メトリクスを計算する
- MCPサーバとして起動し、AIエージェントが構造クエリを発行できるようにする

という構成で、CLI（`dagayn build` / `dagayn serve` / `dagayn install` 等）とMCPツールセット（40個前後）を提供している。AIコーディングアシスタント側からは、Claude Code / Cursor / Copilot等でMCPサーバとして登録するだけで使える。


## dagayn が計測しているもの

`dagayn build` を走らせると、リポジトリ全体がTree-sitterでパースされる。

ノード(File / Class / Function / Type / Test)と各種エッジに分解される。エッジ種別はCALLS / IMPORTS_FROM / INHERITS / IMPLEMENTS / CONTAINS / DEPENDS_ON / TESTED_BY / REFERENCES / CROSS_ARTIFACTなど。

分解結果はSQLiteへ格納される。

さらに後処理で全文検索インデックス、コミュニティ、フロー、各種メトリクスが計算される。

このうち、特に「コードベースの構造的な健康診断」として効くメトリクスがいくつかある。

### Community Cohesion

[Leiden アルゴリズム](https://www.nature.com/articles/s41598-019-41695-z)でグラフをコミュニティ分割し、各コミュニティについて **凝集度(cohesion)** を計算する。これは「コミュニティ内のエッジ数 / そのコミュニティに接続している全エッジ数」で、1.0に近いほど内側に閉じている = 独立したサブシステムとして成立している、低いほど外と絡まっていることを示す。

凝集度が低くてサイズが大きいコミュニティは、Leidenが「どこで切ればいいのか分からなかった塊」である。これが見つかったら、ほぼ間違いなくその領域には内部境界が無い。

### Hub Nodes(fan-in / fan-out)

入次数が異常に高いノードは **type coupling** か **utility coupling**（誰からも参照されている）。出次数が異常に高いノードは **dispatcher coupling**（あらゆる場所に手を伸ばしている）。前者は名前変更や移動コストを跳ね上げ、後者はそのノードの変更が周囲に広範囲な影響を与える。

### Bridge Nodes(betweenness centrality)

最短経路に対する媒介中心性が高いノード。グラフを道路網に例えると、そこを閉じると最も交通量が落ちる橋。コードでは「触るとblast radiusが大きいノード」「壊れると到達性が一気に失われるチョークポイント」を意味する。

### Robert C. Martin の Package Principles — ADP / SDP / SAP

Robert C. Martinが "Clean Architecture" 等で提唱しているパッケージ設計原則のうち、計測可能な3つをdagaynで実装している。

依存グラフの母集団は共通で、次の4種類のエッジがある：

* `IMPORTS_FROM` — 明示的なモジュールimport
* `DEPENDS_ON` — TerraformやMarkdown等import概念のない言語向け汎用依存
* `INHERITS` — 継承
* `IMPLEMENTS` — interface / protocol / trait適合

`CALLS` や `REFERENCES` は動的言語でノイズが多いので除外している(`len()` を呼ぶたびに依存が増えるのは困る)。粒度はファイル単位かパッケージ単位を選べる。

#### ADP — Acyclic Dependencies Principle

「パッケージ間に循環依存があってはならない」という原則。循環があると、変更の波及が双方向に走るため、どちらか一方を独立にビルド・テスト・デプロイできなくなる。

dagaynではNetworkXの `simple_cycles` で循環を全列挙し、各サイクルに以下の重み付けを付ける。

- `length`: サイクルに含まれるパッケージ数
- `edge_weight`: サイクル内のエッジ重みの合計（同方向の重複エッジは集約済み）
- `severity = length × edge_weight`

severity降順でソートして出すので、「短くて軽い循環は放っておく」「長くて重い循環は最優先で潰す」が自動的に決まる。デフォルトでは `min_cycle_size=2` / `max_cycle_length=10` で、長すぎる循環は計算量が爆発するので打ち切る。

#### SDP — Stable Dependencies Principle

「依存は **安定した方** に向くべき」という原則。

各パッケージについて以下を定義する。

- `Ca` (afferent couplings) = 入次数 = このパッケージを依存している外部パッケージ数
- `Ce` (efferent couplings) = 出次数 = このパッケージが依存している外部パッケージ数
- **`I = Ce / (Ca + Ce)`** が **不安定度 (instability)**

`I = 0` は「他から大量に依存されている一方で自分はどこにも依存していない = 最も安定」である。

`I = 1` は「自分は他へ依存しまくっているが誰からも参照されていない = 最も不安定」である。`Ca + Ce = 0` のパッケージ（他から完全に独立）は `I = 0` として扱う。

SDP違反は、依存元より依存先の方が不安定なエッジとして検出する(`I(source) < I(target) − min_delta`, default `min_delta = 0.1`)。安定側が不安定側へ依存していると、不安定側の変更が安定側へ逆流する。その結果、安定であるはずのパッケージが頻繁に巻き込まれる。

#### SAP — Stable Abstractions Principle

「安定したパッケージほど **抽象的** であるべき」という原則。SDPと組で運用する。

各パッケージについて以下を定義する。

- `Na` = 抽象型（interface / protocol / trait / Python ABCなど）の数。
- `Nt` = 全top-level型の数。
- **`A = Na / Nt`** が **抽象度 (abstractness)**。

そしてSDPの `I` と組み合わせて、次を計算する。

- 理想線： `A + I = 1`（これを **main sequence** と呼ぶ）
- **`D = |A + I − 1|`** がmain sequenceからの距離

を計算する。`D = 0` が理想で、`D = 1` が最悪。最悪のケースは2種類あって、

- `A = 1, I = 0`（完全抽象 + 完全安定）: 拡張や呼び出しはどちらもされない、宣言だけのパッケージ。**Useless zone**
- `A = 0, I = 1`（完全具体 + 完全不安定）: 全部具体実装で誰からも依存されないが自分は何にでも依存している、触ると壊れる塊。**Pain zone**

「安定なら抽象に寄せろ、具体なら不安定でもいい（他から依存されてないので変更コストは局所）」というのがSAPの主張で、`A + I` をプロットするとPain zoneとUseless zoneを避けながらmain sequence周辺に配置されるのが健康的、ということになる。

抽象判定は言語ごとに違って、Java / C# / PHPのinterface、Swiftのprotocol、Scalaのtrait、PythonのABC、Juliaのabstract typeをそれぞれ抽象としてマークしている。`extra.is_abstract` / `extra.is_contract` / `extra.type_role` というメタデータが各ノードに付与されており、SAP計算はこれを使う。

#### 3 つを並べると

- **ADP**: グラフに循環があってはならない（=本当にDAGであれ）
- **SDP**: グラフのエッジ向きが安定度の不安定→安定であるべき
- **SAP**: グラフの各ノードの抽象度と安定度がバランスすべき

という、同じ依存グラフを別の角度から見る3つの原則が並ぶ。dagaynではそれぞれに対応するCLIコマンド(`detect-adp` / `sdp-metrics` / `detect-sdp` / `sap-metrics` / `detect-sap`)が用意されている。

MCPツール(`detect_adp_violations_tool` / `compute_sdp_metrics_tool` / `detect_sdp_violations_tool` / `compute_sap_metrics_tool` / `detect_sap_violations_tool`)も同様である。

### Flows

エントリポイント（CLIコマンドやHTTPハンドラ、MCPツールハンドラ）から葉に向かって到達可能な経路を実行フローとして抽出する。後処理で全フローを事前計算しておき、`get_flow_tool` / `list_flows_tool` / `get_affected_flows_tool` で参照できる。「この関数を変更したらどのフローが影響を受けるか」を調べるのに使う。

### Communities と Hub / Bridge の組み合わせ運用

実運用では、コミュニティを上位構造として捉え、その中でHub / Bridge / 大関数を見つけにいくのが定石になる。`get_architecture_overview_tool` がこの組み合わせを1ショットで返してくれるので、リポジトリの初見診断として最初に叩くのは大体これ。

### 何が嬉しいのか

これらが揃っていると、リファクタリングの **観測フェーズ** でソースを1行も読まずに「どこに手を入れるべきか」を出せる。後述するが、dagayn自身に当てたときも実際にそうなった。

しかも、リファクタリング後に同じツールを叩けば「数字が動いたか」で結果検証ができる。「このリファクタは綺麗になった気がする」みたいな主観評価ではなく、「`CodeParser` のbetweennessが0.0209からtop-10圏外に落ちた」という客観的な記述で勝敗が決まる。

## アイデアの元：code-review-graph

dagaynは [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) のforkである。MITライセンスで、原作はTirth Kanani氏。

original版は「ローカルSQLiteに知識グラフを保存し、MCP経由でAIエージェントから検索可能にする」というコアコンセプトを既に確立しており、Tree-sitterベースのパーサ、impact radius計算、コミュニティ検出、フロー抽出までだいたい揃っていた。AIコーディングアシスタント文脈で「グラフをコンテキストにする」という発想自体は、僕の発明では全然ない。

dagaynでやっているのは、その上にいくつかのレイヤを積んだもの。

- **Terraform を 1st-class 化**: 後述。HCLベースだがTerraform固有の構造（`resource_block` / `module_block` / `data_block` 等）を別ノード種別として扱う
- **Markdown の依存関係抽出**: 後述。HTMLコメント形式のdirective（`<!-- constrained-by ... -->` 等）をMarkdown文書間の `DEPENDS_ON` エッジとして抽出
- **Cross-artifact edges**: Markdown中のコードスパン（`` `FunctionName` `` 形式）をrepo内のシンボルにマッチさせ、`CROSS_ARTIFACT` エッジとしてドキュメント→コードのbridgeを作る。「この関数を説明している文書」を逆引きできる
- **ADP / SDP / SAP メトリクス**: 上述。Robert C. Martinの3つの原則を計測
- **AI ツール統合**: `dagayn install` 一発でClaude Code / Cursor / Copilot / Codex CLI / Clineの各設定ファイルにMCPサーバを登録する流れ。各ツールの設定ファイル形式の差分はdagayn側で吸収する

要するにコアコンセプトは原作のまま、ポリグロット + インフラ寄りなリポジトリで実用するために必要なものを積んでいる。forkとして明示的に名乗っており、`NOTICE` で原作にクレジットを入れている。

## tree-sitter-markdown と tree-sitter-terraform を fork した話

dagaynのために、Tree-sitter grammar自体も2つforkしている。

### tree-sitter-markdown — 依存関係 directive を文法に組み込む

Markdownは本来「ドキュメントの間に意味的な依存関係なんてない」前提のフォーマットである。しかし、技術ドキュメントで運用していると当然「この設計書は前提としてXを要請する」「この章は仕様Yをsupersedingしている」みたいな関係が出てくる。これを後付けで人間がgrepするのは無理筋だし、生Markdownのままだとrendererに余計なものを表示させずに記述する手段がない。

そこで、**HTML コメント形式の directive を文法に組み込んだ fork** を用意した。

```markdown
<!-- constrained-by path/to/spec.md#section -->
<!-- blocked-by    path/to/issue.md -->
<!-- supersedes    path/to/old.md#chapter -->
<!-- derived-from  path/to/source.md -->
```

HTMLコメントなのでGitHub等の標準レンダラからは透明、しかしgrammarはこれらをdirectiveとして認識する。dagayn側はこれを `DEPENDS_ON` エッジに落として、ドキュメント間の構造もコードのDAGと同じグラフに混ぜて検索できるようにしている。

ついでに `# Section` のIDをGitHub互換のslug規則（重複時の `-1` / `-2` 接尾辞付与含む）で発行するように直した。Markdownは標準が無いに等しいフォーマットなので、こういうところで実装ごとに挙動がブレやすい。

実装は [manji-0/tree-sitter-markdown](https://github.com/manji-0/tree-sitter-markdown) に置いてある。元forkの上にdependency directiveサポートとCIを足した形。

### tree-sitter-terraform — block 種別ごとに専用ノードを持たせる

[tree-sitter-grammars/tree-sitter-hcl](https://github.com/tree-sitter-grammars/tree-sitter-hcl) はHCL全般をパースしてくれるが、Terraformで使うときに困ることが1つある。`resource`、`data`、`module`、`variable` はいずれも汎用の `block` ノードに落ちてくる。種別を取り出すには子ノード(`identifier`)を見て分岐する必要があり、構造的に「これはresourceか」と1ステップで答えが返ってこない。

これはTerraformを1st-classに扱いたい場合には地味にコスト高い。インデクサやLSP風のツールでもblock種別ごとに専用visitorを書きたいが、汎用blockしかないとパース木を歩きながら識別する処理が随所に挟まる。

そこでforkして、blockの種別ごとに専用ノード型を生やした。

| Block keyword | Node type         | Labels         |
|---------------|-------------------|----------------|
| `resource`    | `resource_block`  | `type`, `name` |
| `data`        | `data_block`      | `type`, `name` |
| `variable`    | `variable_block`  | `name`         |
| `output`      | `output_block`    | `name`         |
| `module`      | `module_block`    | `name`         |
| `provider`    | `provider_block`  | `name`         |
| `locals`      | `locals_block`    | —              |
| `terraform`   | `terraform_block` | —              |

これで「resourceのtypeとnameを取り出す」のが1クエリで済む。dagayn側のパーサコードもかなり読みやすくなった。

実装は [manji-0/tree-sitter-terraform](https://github.com/manji-0/tree-sitter-terraform)。119ケースのcorpusテストとCI付き。

### Grammar の配布戦略

Tree-sitter grammarはビルド済みバイナリを配るのが厄介（プラットフォーム多すぎ）で、かといって `npm install` 系の流儀をそのままPythonパッケージに持ち込むとCIで詰む。dagaynでは以下の手順を踏んでいる。

1. **コミット SHA で pin**: `dagayn/vendor_grammars.py` の `GRAMMAR_SPECS` に `(owner, repo, commit, required_paths, inject_python_binding)` を書き込む。ブランチではなくコミットSHAを直接書くので、上流のリビジョンが動いても影響を受けない
2. **オンデマンド fetch**: 初回パーサ初期化時にGitHubのcodeload(`https://codeload.github.com/{owner}/{repo}/tar.gz/{commit}`)からアーカイブを取りに行く。バイナリではなくソースを取るので、配布側はクロスプラットフォームを気にしなくていい
3. **キャッシュへ展開**: ローカルキャッシュにコミットSHAをディレクトリ名にして展開する。展開先のデフォルトはOSごとに異なる：
   - macOS: `~/Library/Caches/dagayn/grammars/`
   - Linux: `~/.cache/dagayn/grammars/` または `$XDG_CACHE_HOME/dagayn/grammars/`
   - Windows: `%LOCALAPPDATA%\dagayn\grammars\`
   
   `DAGAYN_GRAMMAR_CACHE_DIR` 環境変数で全プラットフォーム共通の上書きも可能。
4. **Python binding shim を注入**: tree-sitter-markdownはupstreamのPython bindingがdagaynのレイアウトとは合わないので、`bindings/python/binding.c` をfork側で生成・注入する。これがないと `import tree_sitter_markdown` が成立しない
5. **`cc` でビルド**: `setuptools` の `cc` を呼んで `parser.c` / `scanner.c` を共有ライブラリにし、Pythonからcapsuleとして読み込ませる。grammar初期化が `tree_sitter.Language(capsule)` を返す形になるよう仕上げる

キャッシュキーは「リポジトリ名 + コミットSHA」なので、`GRAMMAR_SPECS` のSHAを更新すれば自動的に新しいキャッシュディレクトリが切られる。古いキャッシュは別の名前で残るので、ロールバックはpinを戻すだけで済む。これがビルド再現性の根拠になっている。

CIでは起動前に明示的にprefetchするスクリプトを走らせて、テスト中のfetchを排除している。

## dagayn で dagayn を直す

ここからが今回の本題。土曜にコアが大体動くようになったので、日曜はdagayn自身にdagaynをかけてみることにした。dagaynはPythonコア + TypeScript製VS Code拡張 + Markdownドキュメント + テスト用Terraformリポジトリという素材が揃っているので、ポリグロット解析の自己評価として丁度よかった。

プロンプトはこれだけ。

> 全体的な凝集、安定の状態を見てリファクタリングプランを立てて

ファイルパスや症状は一切指定せず、dagayn側のMCPツールしか手がかりがない、という条件である。

### 観測フェーズ — ソースを 1 行も読まずに 4 つの問題を発見

エージェントが叩いたツールは6つだけだった。

| ツール                           | 出てきた事実                                                              |
|----------------------------------|---------------------------------------------------------------------------|
| `list_graph_stats_tool`          | Nodes 3518 / Edges 29070 / Files 194                                      |
| `get_architecture_overview_tool` | `dagayn-tool` という 1 個のコミュニティが 687 ノードを抱えていた          |
| `list_communities_tool`          | 上記コミュニティの cohesion = **0.1335**                                  |
| `get_hub_nodes_tool`             | `NodeInfo` in=191、`EdgeInfo` in=152、`GraphStore` in=84、`main` out=320  |
| `get_bridge_nodes_tool`          | betweenness top: `CodeParser` **0.0209**(#1)、`GraphStore` **0.0165**(#3) |
| `find_large_functions_tool`      | `_parse_rescript` 405行、`main` 912行、`_extract_from_tree` 298行         |

ここから読めることはわりと明確である。

1. **God community**: `dagayn/` 全体が1コミュニティに収まっている。Leidenが内部境界を見つけられなかった。実際 `parser.py`（7572行）、`graph.py`（1453行）、`cli.py`（1252行）がflatファイルで並んでいた
2. **2 つのチョークポイント**: `CodeParser` と `GraphStore` がbetweenness top1 / top3。どちらか触るとblast radiusが大きい
3. **Monolithic dispatcher**: `cli.py::main` が出次数320の単一関数。912行のif-elifの山だった
4. **Type coupling**: `NodeInfo` / `EdgeInfo` が `parser.py` の中に定義されているせいで、データ型を使うために7572行のparserモジュール全体がimportチェーンに乗っていた

ここまで、ソースは1行も読んでいない。

### 計画フェーズ — 数字から優先順位が落ちてくる

優先順位の付け方は「blast radiusが大きいものから直す」が基本。

- **P1**: `parser.py` を `parser/` パッケージに分割。`NodeInfo` / `EdgeInfo` を `parser/types.py` に切り出すだけで191+152のfan-inが分散する。言語別エクストラクタを将来的にサブモジュール化する余地も生まれる
- **P2**: `graph.py` を `graph/` パッケージに分割。書き込み / 読み取り / ヘルパを別モジュール化し、`GraphStore` のbridge中心性を下げる
- **P3**: `cli.py::main` をサブコマンド単位に分解。純粋に保守性向上目的

### 実行フェーズ — 3 コミットで全部やった

各リファクタはworktree隔離したsub-agentに投げ、`__init__.py` で再エクスポートして外部APIは1行も変えない、という制約を課した。1319件のテストは全コミットで緑のまま。

| Commit    | 変更                           | 構成                                                              |
|-----------|--------------------------------|-------------------------------------------------------------------|
| `0dcbd0c` | `parser.py`(7572L) → `parser/` | `__init__.py` / `types.py` / `core.py`                            |
| `bc30884` | `graph.py`(1453L) → `graph/`   | `__init__.py` / `types.py` / `helpers.py` / `core.py`             |
| `502f23e` | `cli.py`(1252L) → `cli/`       | `__init__.py` / `app.py` / `utils.py` / `commands/`(9 モジュール) |

### 検証フェーズ — 数字を再計測

同じ6ツールをもう一度叩く。

**Hub nodes**:

| Node                                   | Before  | After                                        |
|----------------------------------------|---------|----------------------------------------------|
| `cli.py::main`                         | out=322 | `cli/app.py::main` で out=65(−80%)           |
| `CodeParser`                           | in=173  | `parser/core.py::CodeParser` で in=118(−32%) |
| `NodeInfo` / `EdgeInfo` / `GraphStore` | top hub | サブモジュールに分散して top 圏外へ          |

**Bridge nodes**:

| Node         | Before     | After       |
|--------------|------------|-------------|
| `CodeParser` | 0.0209(#1) | top-10 圏外 |
| `GraphStore` | 0.0165(#3) | top-10 圏外 |

**Community cohesion**:

|               | Before | After  |
|---------------|--------|--------|
| `dagayn-tool` | 0.1335 | 0.1297 |

cohesionはほぼ動かなかった。理由ははっきりしていて、「3ファイルを3パッケージに分けた」だけではLeidenから見ると依然として1個のクラスタにしか見えていない。Cohesionを本当に動かすには、`parser/core.py` をさらに `parser/languages/markdown.py` `parser/languages/terraform.py` …のように言語別に分割する次の段階が必要で、これは次のsprintに積んだ。

**ADP — 循環依存の変化**:

|                | Before                                 | After                 |
|----------------|----------------------------------------|-----------------------|
| 違反サイクル数 | 5                                      | 6                     |
| 最大 severity  | 232(4連: dagayn/eval/benchmarks/tools) | 82(2連: dagayn/tools) |
| 最悪の形       | 4 パッケージにまたがる長い循環         | 最長 3 パッケージ     |

違反数は微増した。これはパッケージ分割で新しく `dagayn/parser` `dagayn/graph` が見えるようになり、既存の循環の一部が別の形で顕在化したためである。一方、最大severityが232 → 82に急落した。4連サイクルがほぼ消えて2連 / 3連に分解されている。長いサイクルはblast radiusも大きいので、「サイクル数」より「最大severity」が実態を反映しやすい指標だと分かった。

**SDP — 可視パッケージの変化**:

| パッケージ            | Before I         | After I |
|-----------------------|------------------|---------|
| `dagayn`              | 0.2500           | 0.2727  |
| `dagayn/tools`        | 0.2000           | 0.2857  |
| `dagayn/cli/commands` | (存在しなかった) | 1.0000  |
| `dagayn/cli`          | (存在しなかった) | 0.5000  |
| `dagayn/graph`        | (存在しなかった) | 0.2857  |
| `dagayn/parser`       | (存在しなかった) | 0.2000  |

計測対象パッケージが4個 → 8個に増えた。パッケージが実際に分割されたことで、SDPがより細かい粒度で問題を指摘できるようになった。新しく現れた `dagayn/cli/commands`(I=1.0)は葉ノードなので完全不安定で正しい。`dagayn/parser`(I=0.2)と `dagayn/graph`(I=0.2)が比較的安定に位置しているのは、それぞれ `parser/core.py` と `graph/core.py` が下位から依存されていることの反映。

**SAP — main sequence からの距離**:

| パッケージ      | Before D | Before A | After D | After A |
|-----------------|----------|----------|---------|---------|
| `dagayn`        | 0.713    | 0.037    | 0.727   | 0.000   |
| `dagayn/tools`  | 0.800    | 0.000    | 0.714   | 0.000   |
| `dagayn/parser` | (なし)   | —        | 0.800   | 0.000   |
| `dagayn/graph`  | (なし)   | —        | 0.714   | 0.000   |

`dagayn` パッケージ全体でみるとbeforeはNa=1（1つだけ抽象型が存在）でわずかにA=0.037があった。パッケージ分割後は型が各サブパッケージに散らばり、`dagayn` 直下のNa=0になった。Dが0.713 → 0.727とわずかに悪化している。Pain zone（A=0の低安定）から脱出するには抽象型の導入が必要で、単純なパッケージ分割ではSAPは改善しない。これはcohesionと同じく「次の打ち手」を示す遅行指標である。

### コードレベルの効用

数字の動きはともかく、現実的な恩恵としては：

- `NodeInfo` を使うために7572行のparserモジュール全体をimportチェーンに乗せる必要が無くなった。`parser/types.py` は66行で済む
- `GraphStore` のwrites / reads / helpersが分離されたので、書き込みセマンティクスを変える時に読み出し系の挙動を全部頭に入れる必要がなくなった
- `cli/main` が912行から65行に縮んだ。新しいサブコマンドの追加は50行程度のファイルを1つ作るだけ
- すべての変更は後方互換。`__init__.py` の再エクスポートで、リポジトリ内のどのimport文も書き換える必要が無かった

## やったこと

- `code-review-graph` をforkし、Terraform 1st-class、Markdown directive、cross-artifact edges、ADP / SDP / SAPメトリクスを足した `dagayn` を作った
- そのために `tree-sitter-markdown` と `tree-sitter-terraform` をforkし、commit pin → fetch → ccビルドの流儀で配布する仕組みを書いた
- `dagayn` 自身に `dagayn` をかけてリファクタプランを生成し、3コミットで `parser.py` / `graph.py` / `cli.py` をパッケージ化した。bridge top1 / top3をレーダーから消した

## 思ったこと

1. **観測コストが本当にゼロに近いと、リファクタは性格が変わる**。「どこを直すか」を決めるのに6ツールコール、ソースを1行も読まないというのは、`grep` と `find` で済ませていた頃の勘drivenなリファクタとは全然違う体験だった。数字を先に出してから手を動かす流れが定着しそう
2. **数値で反証可能なリファクタは精神衛生に良い**。「`CodeParser` をbridge top10から落とす」はyes/noで答えが出る目標であり、結果検証で迷う余地がない。「綺麗になった気がする」が消えた
3. **AI ツールの設計思想として、コンテキストを「ファイル」ではなく「グラフ」として渡す方向はかなり効く**。トークン効率もそうだが、「どの関数のcallerを全部知りたい」みたいなクエリは、ファイル前提だと効率的に答えられない。これはgrepやRAGとは別で、もう一段レイヤーが要るタイプの問題だと思う

## 展望: コア部分の Rust 化

今のところ全部Pythonで動いているが、そのうち厳しくなることは分かっている。パース、コミュニティ検出、betweenness / SAP計算、FTS構築はいずれもCPUバウンドで、リポジトリ規模に対して素直にスケールする。今は `dagayn build` が現実的な時間で終わっているが、数万ファイル規模のmonorepoに当てるとボトルネックになっていく。PyO3 / maturinで段階的にRust拡張に置き換えていく予定。

ここで面白くなってくるのが、**Rust 化の最中の dagayn 自身も、dagayn にとっての観測対象として一級である** という点である。

dagaynは元々、コード / Markdown / Terraformといった異なるartifactを同じグラフに乗せて、artifact間の関係を `CROSS_ARTIFACT` エッジで表現するように作ってある。これはMulti-Artifactなリポジトリを解析するために必要だった機能だが、Python ↔ RustのPyO3 bindingもちょうど同じ形をしている。Pythonの関数 `_core.GraphStore.upsert_node` がRustの `dagayn_core::graph::upsert_node` を呼ぶ、というのは「Pythonというartifact上のノード」と「Rustというartifact上のノード」を結ぶ1本のエッジに過ぎない。

つまりPyO3 binding境界そのものをdagaynのグラフにedgeとして張れる。そうすると、

- Python側の関数が今どのRust関数に委譲しているか、グラフから直接見える
- 「このPython関数がまだRust化されていない」「このRust関数のcallerがPython側で何処にいるか」が可視化される
- リファクタや言語移植でPython側のbridge / hubがどう変化しているかをSAP / SDP / ADPの数字で追える
- Rust化の進捗が「Pythonノード数」「Rustノード数」「PyO3境界エッジ数」の推移として観測できる

要するに、dagaynが自分自身のRust化過程をメトリクスで監視できる構造になる。Multi-Artifact性のおかげで、PythonファイルとMarkdownの解析をRustへ移植する間も、グラフは整合し続ける。移植の進み方そのものをグラフで眺められる。

この「Artifact単位で独立して置き換えられる + 境界もグラフ化できる」という性質は、もともとはコード / ドキュメント / インフラを同じグラフへ載せるために必要だったものだった。コードの言語間バインドなどの依存関係をedge化できる機能は思い付きで適当に作ったんだけど、結構役立つケースは多そう。

---

作って思ったがちょっと人類に速すぎる概念を実装してしまったかもしれない。人力ではなくAIに任せて使ってください。

