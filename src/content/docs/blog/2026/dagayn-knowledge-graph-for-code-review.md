---
title: すべてを有向グラフにする、俺とAI以外のやつが
description: すべてを有向グラフに表現して解析できるツールを作った
sidebar:
  order: 1
---

`dagayn` というツールについて書く。

ざっくり一言で言うと「リポジトリを Tree-sitter でパースして DAG にして SQLite に保存し、AI エージェントに DAG 経由で問い合わせさせる」ためのツールである。スローガンは **DAG is All You Need**。

経緯としては、

* 新しい職場に着任して1週間が経過したのだけど、そこそこ高い給料を貰ってるのに研修動画を延々見ているだけというのも居心地が悪く、チームとしても早めに成功体験を積ませたいという方針だったので、1つ大きなプロジェクトの実施判断のためのドキュメントを書くことになった。
  * 依頼が来たのは入社4日目で、ドキュメントは入社6日目でFix。
* どうやって新入りが爆速で仕事の立ち上がりをしたのかというネタで入社7日目に全社発表したところそこそこウケたので、せっかくならそのやり方をツール化してやろうと思ってこの土日でズバっと書いてみた

という流れです。

## dagaynとは


[dagayn](https://github.com/manji-0/dagayn)


目的はrepo内の「すべて」を有向グラフにして効率的に探索 & 明確なエンティティ間の意味的依存関係、歴史的事情などを把握できるようにすることである。

実体としては、

- リポジトリ内の対応言語ファイルを片っ端から Tree-sitter でパースしてノード(File / Class / Function / Type / Test)を抽出する
- ノード間の関係(CALLS / IMPORTS_FROM / INHERITS / IMPLEMENTS / CONTAINS / DEPENDS_ON / TESTED_BY / REFERENCES / CROSS_ARTIFACT)をエッジとして抽出する
- これらをローカル SQLite に格納する
- 後処理でフルテキスト検索インデックス、Leiden コミュニティ、実行フロー、各種構造メトリクスを計算する
- MCP サーバとして起動し、AI エージェントが構造クエリを発行できるようにする

という構成で、CLI(`dagayn build` / `dagayn serve` / `dagayn install` 等)と MCP ツールセット(40 個前後)を提供している。AI コーディングアシスタント側からは、Claude Code / Cursor / Copilot 等で MCP サーバとして登録するだけで使える。


## dagayn が計測しているもの

`dagayn build` を走らせると、リポジトリ全体が Tree-sitter でパースされ、ノード(File / Class / Function / Type / Test)とエッジ(CALLS / IMPORTS_FROM / INHERITS / IMPLEMENTS / CONTAINS / DEPENDS_ON / TESTED_BY / REFERENCES / CROSS_ARTIFACT)に分解されて SQLite に格納される。さらに後処理で全文検索インデックス、コミュニティ、フロー、各種メトリクスが計算される。

このうち、特に「コードベースの構造的な健康診断」として効くメトリクスがいくつかある。

### Community Cohesion

[Leiden アルゴリズム](https://www.nature.com/articles/s41598-019-41695-z)でグラフをコミュニティ分割し、各コミュニティについて **凝集度(cohesion)** を計算する。これは「コミュニティ内のエッジ数 / そのコミュニティに接続している全エッジ数」で、1.0 に近いほど内側に閉じている = 独立したサブシステムとして成立している、低いほど外と絡まっていることを示す。

凝集度が低くてサイズが大きいコミュニティは、Leiden が「どこで切ればいいのか分からなかった塊」である。これが見つかったら、ほぼ間違いなくその領域には内部境界が無い。

### Hub Nodes(fan-in / fan-out)

入次数が異常に高いノードは **type coupling** か **utility coupling**(誰からも参照されている)。出次数が異常に高いノードは **dispatcher coupling**(あらゆる場所に手を伸ばしている)。前者は名前変更や移動コストを跳ね上げ、後者はそのノードの変更が周囲に広範囲な影響を与える。

### Bridge Nodes(betweenness centrality)

最短経路に対する媒介中心性が高いノード。グラフを道路網に例えると、そこを閉じると最も交通量が落ちる橋。コードでは「触ると blast radius が大きいノード」「壊れると到達性が一気に失われるチョークポイント」を意味する。

### Robert C. Martin の Package Principles — ADP / SDP / SAP

Robert C. Martin が "Clean Architecture" 等で提唱しているパッケージ設計原則のうち、計測可能な 3 つを dagayn で実装している。

依存グラフの母集団は共通で、`IMPORTS_FROM`(明示的なモジュール import)、`DEPENDS_ON`(Terraform や Markdown 等 import 概念のない言語向け汎用依存)、`INHERITS`(継承)、`IMPLEMENTS`(interface / protocol / trait 適合)の 4 種類のエッジ。`CALLS` や `REFERENCES` は動的言語でノイズが多いので除外している(`len()` を呼ぶたびに依存が増えるのは困る)。粒度はファイル単位かパッケージ単位を選べる。

#### ADP — Acyclic Dependencies Principle

「パッケージ間に循環依存があってはならない」という原則。循環があると、変更の波及が双方向に走るため、どちらか一方を独立にビルド・テスト・デプロイできなくなる。

dagayn では NetworkX の `simple_cycles` で循環を全列挙し、各サイクルに以下の重み付けを付ける。

- `length`: サイクルに含まれるパッケージ数
- `edge_weight`: サイクル内のエッジ重みの合計(同方向の重複エッジは集約済み)
- `severity = length × edge_weight`

severity 降順でソートして出すので、「短くて軽い循環は放っておく」「長くて重い循環は最優先で潰す」が自動的に決まる。デフォルトでは `min_cycle_size=2` / `max_cycle_length=10` で、長すぎる循環は計算量が爆発するので打ち切る。

#### SDP — Stable Dependencies Principle

「依存は **安定した方** に向くべき」という原則。

各パッケージについて以下を定義する。

- `Ca` (afferent couplings) = 入次数 = このパッケージを依存している外部パッケージ数
- `Ce` (efferent couplings) = 出次数 = このパッケージが依存している外部パッケージ数
- **`I = Ce / (Ca + Ce)`** が **不安定度 (instability)**

`I = 0` は「他から大量に依存されているが自分はどこにも依存していない = 最も安定」、`I = 1` は「自分は他に依存しまくっているが誰からも参照されていない = 最も不安定」。`Ca + Ce = 0` のパッケージ(他から完全に独立)は `I = 0` として扱う。

SDP 違反は「依存元の方が依存先より安定している」エッジで、`I(source) < I(target) − min_delta` で検出する(default `min_delta = 0.1`)。安定側が不安定側に依存していると、不安定側の変更が安定側に逆流してくるので、安定であるはずのパッケージが頻繁に巻き込まれる事態になる。

#### SAP — Stable Abstractions Principle

「安定したパッケージほど **抽象的** であるべき」という原則。SDP と組で運用する。

各パッケージについて以下を定義する。

- `Na` = 抽象型(interface / protocol / trait / Python ABC など)の数
- `Nt` = 全 top-level 型の数
- **`A = Na / Nt`** が **抽象度 (abstractness)**

そして SDP の `I` と組み合わせて

- 理想線: `A + I = 1`(これを **main sequence** と呼ぶ)
- **`D = |A + I − 1|`** が main sequence からの距離

を計算する。`D = 0` が理想で、`D = 1` が最悪。最悪のケースは 2 種類あって、

- `A = 1, I = 0`(完全抽象 + 完全安定): 拡張も呼び出しもされない、宣言だけのパッケージ。**Useless zone**
- `A = 0, I = 1`(完全具体 + 完全不安定): 全部具体実装で誰からも依存されないが自分は何にでも依存している、触ると壊れる塊。**Pain zone**

「安定なら抽象に寄せろ、具体なら不安定でもいい(他から依存されてないので変更コストは局所)」というのが SAP の主張で、`A + I` をプロットすると Pain zone と Useless zone を避けながら main sequence 周辺に配置されるのが健康的、ということになる。

抽象判定は言語ごとに違って、Java / C# / PHP の interface、Swift の protocol、Scala の trait、Python の ABC、Julia の abstract type をそれぞれ抽象としてマークしている。`extra.is_abstract` / `extra.is_contract` / `extra.type_role` というメタデータが各ノードに付与されており、SAP 計算はこれを使う。

#### 3 つを並べると

- **ADP**: グラフに循環があってはならない(=本当に DAG であれ)
- **SDP**: グラフのエッジ向きが安定度の不安定→安定であるべき
- **SAP**: グラフの各ノードの抽象度と安定度がバランスすべき

という、同じ依存グラフを別の角度から見る 3 つの原則が並ぶ。dagayn ではそれぞれに対応する CLI コマンド(`detect-adp` / `sdp-metrics` / `detect-sdp` / `sap-metrics` / `detect-sap`)と MCP ツール(`detect_adp_violations_tool` / `compute_sdp_metrics_tool` / `detect_sdp_violations_tool` / `compute_sap_metrics_tool` / `detect_sap_violations_tool`)が用意されている。

### Flows

エントリポイント(CLI コマンドや HTTP ハンドラ、MCP ツールハンドラ)から葉に向かって到達可能な経路を実行フローとして抽出する。後処理で全フローを事前計算しておき、`get_flow_tool` / `list_flows_tool` / `get_affected_flows_tool` で参照できる。「この関数を変更したらどのフローが影響を受けるか」を調べるのに使う。

### Communities と Hub / Bridge の組み合わせ運用

実運用では、コミュニティを上位構造として捉え、その中で Hub / Bridge / 大関数を見つけにいくのが定石になる。`get_architecture_overview_tool` がこの組み合わせを 1 ショットで返してくれるので、リポジトリの初見診断として最初に叩くのは大体これ。

### 何が嬉しいのか

これらが揃っていると、リファクタリングの **観測フェーズ** でソースを 1 行も読まずに「どこに手を入れるべきか」を出せる。これがそこそこ革命的で、僕は最近、ファイルを開く前にまず `list_communities_tool` と `get_hub_nodes_tool` と `get_bridge_nodes_tool` を叩く、という習慣ができてしまった。

しかも、リファクタリング後に同じツールを叩けば「数字が動いたか」で結果検証ができる。「このリファクタは綺麗になった気がする」みたいな主観評価ではなく、「`CodeParser` の betweenness が 0.0209 から top-10 圏外に落ちた」という客観的な記述で勝敗が決まる。これがとても気持ちいい。

## アイデアの元：code-review-graph

dagayn は [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) の fork である。MIT ライセンスで、原作は Tirth Kanani 氏。

original 版は「ローカル SQLite に知識グラフを保存し、MCP 経由で AI エージェントから検索可能にする」というコアコンセプトを既に確立しており、Tree-sitter ベースのパーサ、impact radius 計算、コミュニティ検出、フロー抽出までだいたい揃っていた。AI コーディングアシスタント文脈で「グラフをコンテキストにする」という発想自体は、僕の発明では全然ない。

dagayn でやっているのは、その上にいくつかのレイヤを積んだもの。

- **Terraform を 1st-class 化**: 後述。HCL ベースだが Terraform 固有の構造(`resource_block` / `module_block` / `data_block` 等)を別ノード種別として扱う
- **Markdown の依存関係抽出**: 後述。HTML コメント形式の directive(`<!-- constrained-by ... -->` 等)を Markdown 文書間の `DEPENDS_ON` エッジとして抽出
- **Cross-artifact edges**: Markdown 中のコードスパン(`` `FunctionName` `` 形式)を repo 内のシンボルにマッチさせ、`CROSS_ARTIFACT` エッジとしてドキュメント→コードの bridge を作る。「この関数を説明している文書」を逆引きできる
- **ADP / SDP / SAP メトリクス**: 上述。Robert C. Martin の 3 つの原則を計測
- **AI ツール統合**: `dagayn install` 一発で Claude Code / Cursor / Copilot / Codex CLI / Cline の各設定ファイルに MCP サーバを登録する流れ。各ツールの設定ファイル形式の差分は dagayn 側で吸収する

要するにコアコンセプトは原作のまま、ポリグロット + インフラ寄りなリポジトリで実用するために必要なものを積んでいる。fork として明示的に名乗っており、`NOTICE` で原作にクレジットを入れている。

## tree-sitter-markdown と tree-sitter-terraform を fork した話

dagayn のために、Tree-sitter grammar 自体も 2 つ fork している。

### tree-sitter-markdown — 依存関係 directive を文法に組み込む

Markdown は本来「ドキュメントの間に意味的な依存関係なんてない」前提のフォーマットである。しかし、技術ドキュメントで運用していると当然「この設計書は前提として X を要請する」「この章は仕様 Y を superseding している」みたいな関係が出てくる。これを後付けで人間が grep するのは無理筋だし、生 Markdown のままだと renderer に余計なものを表示させずに記述する手段がない。

そこで、**HTML コメント形式の directive を文法に組み込んだ fork** を用意した。

```markdown
<!-- constrained-by path/to/spec.md#section -->
<!-- blocked-by    path/to/issue.md -->
<!-- supersedes    path/to/old.md#chapter -->
<!-- derived-from  path/to/source.md -->
```

HTML コメントなので GitHub 等の標準レンダラからは透明、しかし grammar はこれらを directive として認識する。dagayn 側はこれを `DEPENDS_ON` エッジに落として、ドキュメント間の構造もコードの DAG と同じグラフに混ぜて検索できるようにしている。

ついでに `# Section` の ID を GitHub 互換の slug 規則(重複時の `-1` / `-2` 接尾辞付与含む)で発行するように直した。Markdown は標準が無いに等しいフォーマットなので、こういうところで実装ごとに挙動がブレやすい。

実装は [manji-0/tree-sitter-markdown](https://github.com/manji-0/tree-sitter-markdown) に置いてある。元 fork の上に dependency directive サポートと CI を足した形。

### tree-sitter-terraform — block 種別ごとに専用ノードを持たせる

[tree-sitter-grammars/tree-sitter-hcl](https://github.com/tree-sitter-grammars/tree-sitter-hcl) は HCL 全般をパースしてくれるが、Terraform で使うときに困ることが 1 つある。`resource` も `data` も `module` も `variable` も全部、汎用の `block` ノードに落ちてくる。種別を取り出すには子ノード(`identifier`)を見て分岐する必要があり、構造的に「これは resource ですか?」と聞いても 1 ステップで答えが返ってこない。

これは Terraform を 1st-class に扱いたい場合には地味にコスト高い。インデクサや LSP 風のツールでも「block の種別ごとに専用 visitor を書きたい」のだが、汎用 block しかないとパース木を歩きながら識別する処理が随所に挟まる。

そこで fork して、block の種別ごとに専用ノード型を生やした。

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

これで「resource の type と name を取り出す」のが 1 クエリで済む。dagayn 側のパーサコードもかなり読みやすくなった。

実装は [manji-0/tree-sitter-terraform](https://github.com/manji-0/tree-sitter-terraform)。119 ケースの corpus テストと CI 付き。

### Grammar の配布戦略

Tree-sitter grammar はビルド済みバイナリを配るのが厄介(プラットフォーム多すぎ)で、かといって `npm install` 系の流儀をそのまま Python パッケージに持ち込むと CI で詰む。dagayn では以下の手順を踏んでいる。

1. **コミット SHA で pin**: `dagayn/vendor_grammars.py` の `GRAMMAR_SPECS` に `(owner, repo, commit, required_paths, inject_python_binding)` を書き込む。ブランチではなくコミット SHA を直接書くので、上流のリビジョンが動いても影響を受けない
2. **オンデマンド fetch**: 初回パーサ初期化時に GitHub の codeload(`https://codeload.github.com/{owner}/{repo}/tar.gz/{commit}`)からアーカイブを取りに行く。バイナリではなくソースを取るので、配布側はクロスプラットフォームを気にしなくていい
3. **キャッシュへ展開**: ローカルキャッシュにコミット SHA をディレクトリ名にして展開する。展開先は OS ごとにデフォルトが違って、macOS なら `~/Library/Caches/dagayn/grammars/`、Linux は `~/.cache/dagayn/grammars/` か `$XDG_CACHE_HOME/dagayn/grammars/`、Windows は `%LOCALAPPDATA%\dagayn\grammars\`。`DAGAYN_GRAMMAR_CACHE_DIR` 環境変数で全プラットフォーム共通でオーバーライド可能
4. **Python binding shim を注入**: tree-sitter-markdown は upstream の Python binding が dagayn のレイアウトとは合わないので、`bindings/python/binding.c` を fork 側で生成・注入する。これがないと `import tree_sitter_markdown` が成立しない
5. **`cc` でビルド**: `setuptools` の `cc` を呼んで `parser.c` / `scanner.c` を共有ライブラリにし、Python から capsule として読み込ませる。grammar 初期化が `tree_sitter.Language(capsule)` を返す形になるよう仕上げる

キャッシュキーは「リポジトリ名 + コミット SHA」なので、`GRAMMAR_SPECS` の SHA を更新すれば自動的に新しいキャッシュディレクトリが切られる。古いキャッシュは別の名前で残るので、ロールバックは pin を戻すだけで済む。これがビルド再現性の根拠になっている。

CI では起動前に明示的に prefetch するスクリプトを走らせて、テスト中の fetch を排除している。

## dagayn で dagayn を直す

ここからが今回の本題。dagayn を作っていると、当然 dagayn 自身が「dagayn が観測対象とするポリグロットなコードベース」になる。Python コア + TypeScript 製 VS Code 拡張 + Markdown ドキュメント + 自身を解析するためのテスト用 Terraform リポジトリ、と素材は揃っている。

ある日、AI エージェントに対して以下のプロンプトを投げた。

> 全体的な凝集、安定の状態を見てリファクタリングプランを立てて

ファイルパスも症状も何も指定していない。dagayn 側の MCP ツールしか手がかりがない、という条件である。

### 観測フェーズ — ソースを 1 行も読まずに 4 つの問題を発見

エージェントが叩いたツールは 6 つだけだった。

| ツール                           | 出てきた事実                                                              |
|----------------------------------|---------------------------------------------------------------------------|
| `list_graph_stats_tool`          | Nodes 3518 / Edges 29070 / Files 194                                      |
| `get_architecture_overview_tool` | `dagayn-tool` という 1 個のコミュニティが 687 ノードを抱えていた          |
| `list_communities_tool`          | 上記コミュニティの cohesion = **0.1335**                                  |
| `get_hub_nodes_tool`             | `NodeInfo` in=191、`EdgeInfo` in=152、`GraphStore` in=84、`main` out=320  |
| `get_bridge_nodes_tool`          | betweenness top: `CodeParser` **0.0209**(#1)、`GraphStore` **0.0165**(#3) |
| `find_large_functions_tool`      | `_parse_rescript` 405行、`main` 912行、`_extract_from_tree` 298行         |

ここから読めることはわりと明確である。

1. **God community**: `dagayn/` 全体が 1 コミュニティに収まっている。Leiden が内部境界を見つけられなかった。実際 `parser.py`(7572 行)、`graph.py`(1453 行)、`cli.py`(1252 行)が flat ファイルで並んでいた
2. **2 つのチョークポイント**: `CodeParser` と `GraphStore` が betweenness top1 / top3。どちらか触ると blast radius が大きい
3. **Monolithic dispatcher**: `cli.py::main` が出次数 320 の単一関数。912 行の if-elif の山だった
4. **Type coupling**: `NodeInfo` / `EdgeInfo` が `parser.py` の中に定義されているせいで、データ型を使うために 7572 行の parser モジュール全体が import チェーンに乗っていた

ここまで、ソースは 1 行も読んでいない。

### 計画フェーズ — 数字から優先順位が落ちてくる

優先順位の付け方は「blast radius が大きいものから直す」が基本。

- **P1**: `parser.py` を `parser/` パッケージに分割。`NodeInfo` / `EdgeInfo` を `parser/types.py` に切り出すだけで 191+152 の fan-in が分散する。言語別エクストラクタを将来的にサブモジュール化する余地も生まれる
- **P2**: `graph.py` を `graph/` パッケージに分割。書き込み / 読み取り / ヘルパを別モジュール化し、`GraphStore` の bridge 中心性を下げる
- **P3**: `cli.py::main` をサブコマンド単位に分解。純粋に保守性向上目的

### 実行フェーズ — 3 コミットで全部やった

各リファクタは worktree 隔離した sub-agent に投げ、`__init__.py` で再エクスポートして外部 API は 1 行も変えない、という制約を課した。1319 件のテストは全コミットで緑のまま。

| Commit    | 変更                           | 構成                                                              |
|-----------|--------------------------------|-------------------------------------------------------------------|
| `0dcbd0c` | `parser.py`(7572L) → `parser/` | `__init__.py` / `types.py` / `core.py`                            |
| `bc30884` | `graph.py`(1453L) → `graph/`   | `__init__.py` / `types.py` / `helpers.py` / `core.py`             |
| `502f23e` | `cli.py`(1252L) → `cli/`       | `__init__.py` / `app.py` / `utils.py` / `commands/`(9 モジュール) |

### 検証フェーズ — 数字を再計測

同じ 6 ツールをもう一度叩く。

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

cohesion はほぼ動かなかった。理由ははっきりしていて、「3 ファイルを 3 パッケージに分けた」だけでは Leiden から見ると依然として 1 個のクラスタにしか見えていない。Cohesion を本当に動かすには、`parser/core.py` をさらに `parser/languages/markdown.py` `parser/languages/terraform.py` …のように言語別に分割する次の段階が必要で、これは次の sprint に積んだ。

### コードレベルの効用

数字の動きはともかく、現実的な恩恵としては:

- `NodeInfo` を使うために 7572 行の parser モジュール全体を import チェーンに乗せる必要が無くなった。`parser/types.py` は 66 行で済む
- `GraphStore` の writes / reads / helpers が分離されたので、書き込みセマンティクスを変える時に読み出し系の挙動を全部頭に入れる必要がなくなった
- `cli/main` が 912 行から 65 行に縮んだ。新しいサブコマンドの追加は 50 行程度のファイルを 1 つ作るだけ
- すべての変更は後方互換。`__init__.py` の再エクスポートで、リポジトリ内のどの import 文も書き換える必要が無かった

## やったこと

- `code-review-graph` を fork し、Terraform 1st-class、Markdown directive、cross-artifact edges、ADP / SDP / SAP メトリクスを足した `dagayn` を作った
- そのために `tree-sitter-markdown` と `tree-sitter-terraform` を fork し、commit pin → fetch → cc ビルドの流儀で配布する仕組みを書いた
- `dagayn` 自身に `dagayn` をかけてリファクタプランを生成し、3 コミットで `parser.py` / `graph.py` / `cli.py` をパッケージ化した。bridge top1 / top3 をレーダーから消した

## 思ったこと

1. **観測コストが本当にゼロに近いと、リファクタは性格が変わる**。「どこを直すか」を決めるのに 6 ツールコール、ソースを 1 行も読まないというのは、`grep` と `find` で済ませていた頃の勘 driven なリファクタとは全然違う体験だった。「とりあえずファイル開く前に数字見るか」という習慣が定着してしまった
2. **数値で反証可能なリファクタは精神衛生に良い**。「`CodeParser` を bridge top10 から落とす」は yes/no で答えが出る目標であり、結果検証で迷う余地がない。「綺麗になった気がする」が消えた
3. **Cohesion は嘘をつかないが、ゆっくり動く**。3 ファイルをパッケージ化した程度では Leiden は動かなかった。Cohesion は構造変更に対して遅行指標で、本当に動かすには切り込みを深くするしかない。逆に言えば、cohesion を動かせるリファクタは大きい
4. **fork の自由度は強い**。汎用文法では取り切れないものを文法側に組み込む選択肢があると、上位レイヤの実装が劇的に楽になる。`tree-sitter-terraform` の block 種別分離はその典型で、parser コードの可読性が見違えた
5. **AI ツールの設計思想として、コンテキストを「ファイル」ではなく「グラフ」として渡す方向はかなり効く**。トークン効率もそうだが、「どの関数の caller を全部知りたい」みたいなクエリはファイル前提では絶対に効率的に答えられない。これは grep でも RAG でもない、もう一段レイヤーが要るタイプの問題だと思う

## 展望: コア部分の Rust 化

dagayn は今のところ全部 Python で書かれているが、これはそのうち厳しくなることが分かっている。リポジトリが大きくなると `dagayn build` の支配項はパース → 後処理 → 書き込みの順で、いずれも CPU バウンドかつ並列化余地が大きい。Python の GIL を抱えたまま走らせるのはもったいなく、また Tree-sitter 自体は C 製で Rust binding が一級品なので、コア部分を Rust に下ろす方が素直である。

そういうわけで、コア部分を **PyO3 / maturin** で Rust 拡張(`dagayn._core`)として書き換える計画を立てて、設計を凍結したところ。やることは大体こんな構成になる予定。

```
crates/
  dagayn-core/      # 公開 API、統合テスト
  dagayn-graph/     # SQLite I/O、upsert、incremental、migrations(rusqlite)
  dagayn-postproc/  # FTS、flows、communities、traversal
  dagayn-parser/    # Tree-sitter orchestration、言語検出、ipynb、Markdown
  dagayn-grammars/  # build.rs で grammar fetch + cc ビルド
  dagayn-py/        # PyO3 entry point。maturin が dagayn._core wheel を作る
```

移行は **Graph → Post-processing → Parser** の順で進める。サブプロセス越しではなく PyO3 経由なので、Python 側の CLI や MCP 層は引き続き Python のまま、ホットパスだけ Rust 拡張を呼ぶハイブリッド構成にできる。`DAGAYN_BACKEND={python,rust}` の環境変数で切り替えて、各フェーズで両バックエンドの出力を canonical JSON で比較してパリティを確認しながら進める。

配布は macOS arm64 / x86_64、Linux x86_64 / aarch64 の 4 wheel をターゲットにして、CI で `cibuildwheel` を回す。Rust toolchain がない環境向けには sdist のフォールバックも維持する。

性能の受け入れ基準も数値で決めてある。

- `build` の DB 書き込みフェーズ: 100k 行規模の fixture で Python 比 **0.4× 以下**(Phase 1 受け入れ条件)
- `postprocess` 全体: 10k ノード fixture で Python 比 **0.3× 以下**(Phase 2 受け入れ条件)
- `update` 単一ファイル replace: p95 **200ms 以下**

リファクタで `parser/` `graph/` `cli/` をパッケージ化したのが効いてくるのもこの段階で、Rust 側のクレート分割と Python 側のパッケージ分割が 1:1 になっているので、移植は「モノリスから切り出す」ではなく「既存のパッケージを 1 個ずつ Rust 化する」作業になる。`parser/` をさらに `languages/markdown.py` `languages/terraform.py` …のように言語別に切る次の sprint も、Rust 側の `dagayn-parser/src/{markdown,terraform,...}.rs` への 1:1 マッピングを意識した粒度で進める予定。

Grammar の配布戦略も Rust 側で再構成する。今 Python の `vendor_grammars.py` がやっている fetch + cc ビルドは、Rust 側では `dagayn-grammars` クレートの `build.rs` に置き換わる。`cc` クレートで Tree-sitter の C ソースをコンパイルして、Rust の `tree-sitter` クレートから Language として読み込ませる構成。Python 側のキャッシュとは名前空間を分けて衝突を避ける。

外側の Python 表面(CLI UX、`dagayn install` の各 AI ツール対応、daemon、wiki 生成、embedding プロバイダ統合など)は Rust 化のスコープには入れない。これらは性能クリティカルではないし、Python のエコシステム(各種 SDK、テンプレートエンジン等)に乗っている方が便利なので、当面は Python 側のシェルとして残る予定である。

Phase 0 は凍結したばかり。次は Phase 1 で `dagayn-graph` を切るところから。何か書けるネタが溜まったら続編を書きます。

ソースは [manji-0/dagayn](https://github.com/manji-0/dagayn)。
