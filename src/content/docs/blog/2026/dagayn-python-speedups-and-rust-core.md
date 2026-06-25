---
title: dagaynがコードグラフをSQLiteで取り扱うためのテクニック
description: SQLiteで有向コードグラフを表現し、Python実装のまま探索と更新を高速化するための実装技術について
sidebar:
  order: 1
---

SQLiteでコードグラフを扱う話を書く。

題材は `dagayn` である。dagaynはリポジトリ内のコード、ドキュメント、Terraform、Notebookなどをnode / edgeに分解し、SQLiteに保存して、AIエージェントから探索できるようにするツールである。

前回の記事では「何をグラフにしているか」を中心に書いた。

[すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/)

今回はもう少し一般化して、**SQLite 上で有向コードグラフをどう表現し、どう探索と更新を速くするか**という観点で整理する。

扱う話は大きく3つ。

1. SQLiteでコードグラフをどう表現するか
2. Python実装で探索・更新をどう速くするか
3. そこからRust core化について何が言えるか

「Rustにしたら速い」ではなく、「SQLiteに置いたグラフを速く扱うには、どこをmaterializeし、どこをbatch化し、どこでPython object化を避けるべきか」という話である。

## SQLiteでコードグラフを表現する

保存形式として特別なことをする必要はない。基本はnode tableとedge tableで足りる。

dagaynではだいたいこういう形になっている。

```sql
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    language TEXT,
    parent_name TEXT,
    params TEXT,
    return_type TEXT,
    modifiers TEXT,
    is_test INTEGER DEFAULT 0,
    file_hash TEXT,
    mtime_ns INTEGER DEFAULT 0,
    extra TEXT DEFAULT '{}',
    updated_at REAL NOT NULL
);

CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    source_qualified TEXT NOT NULL,
    target_qualified TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line INTEGER DEFAULT 0,
    extra TEXT DEFAULT '{}',
    confidence REAL DEFAULT 1.0,
    confidence_tier TEXT DEFAULT 'EXTRACTED',
    updated_at REAL NOT NULL
);
```

重要なのは、edgeが `source_id` / `target_id` ではなく `qualified_name` を持っているところである。

RDB的にはforeign keyの整数IDで結びたい。ただコードベースのグラフではqualified nameの方が扱いやすい場面は多い。

- parserがnode IDを知らない段階でedgeを吐ける
- incremental updateでfile単位に差し替えやすい
- JSON snapshotやparity testが安定しやすい
- MCP toolのレスポンスで人間が読める
- cross-artifact edgeでMarkdown / Terraform / code symbolを同じkey空間に置ける

もちろん、整数ID joinの方が速い場面はある。そこは後処理でmaterialized tableを持てばいい。最初のgraph identityは安定した文字列keyに寄せる、という設計にしている。

## edge kindはケチらない

グラフをただの `source -> target` として保存すると、探索時に全部のedgeが同じ意味になってしまう。

dagaynではedge kindを分けている。

- `CONTAINS`
- `CALLS`
- `IMPORTS_FROM`
- `INHERITS`
- `IMPLEMENTS`
- `DEPENDS_ON`
- `TESTED_BY`
- `REFERENCES`
- `CROSS_ARTIFACT`

これは検索品質のためだけではなく、性能のためにも効く。

例えば「依存方向の安定性」を見るときは `IMPORTS_FROM` / `DEPENDS_ON` / `INHERITS` / `IMPLEMENTS` だけを見たい。`CALLS` や `REFERENCES` まで混ぜると、動的言語ではedgeがノイズになりやすい。

逆にimpact radiusでは `CALLS` も欲しい。ドキュメント影響を見るなら `CROSS_ARTIFACT` が効く。

つまり、edge kindは「意味分類」であると同時に「探索時のindex selector」でもある。

```sql
CREATE INDEX idx_edges_source ON edges(source_qualified);
CREATE INDEX idx_edges_target ON edges(target_qualified);
CREATE INDEX idx_edges_kind ON edges(kind);
CREATE INDEX idx_edges_target_kind ON edges(target_qualified, kind);
CREATE INDEX idx_edges_source_kind ON edges(source_qualified, kind);
```

このへんのindexは地味だが、後から効いてくる。graph queryはだいたい「このnodeから出るedge」「このnodeに入るedge」「このkindだけ」を繰り返すので、source / target / kindの組を最初から主要アクセスパターンとして扱う。

SQLiteの接続設定も同じくらい地味に効く。

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA mmap_size=268435456;
PRAGMA temp_store=MEMORY;
```

writer benchmarkでは、SQLite呼び出し回数だけでなく、connection設定とtransaction粒度も効く。

## DAG制約は保存時に入れない

コードベースの知識グラフは、保存時には単なるdirected graphとして受け入れる。

現実のコードにはimport cycle、package cycle、ドキュメントの相互参照、Terraform moduleの複雑な参照がある。保存時に循環を弾くと、壊れた構造を観測できない。さらに、DAGとして見たい部分グラフはedge kindによって違う。`CONTAINS` はほぼ木構造だが、`CALLS` は循環して当然で、`IMPORTS_FROM` は循環してほしくない。

だからDAGとしての検査は後処理でやる。

dagaynではADP、つまりAcyclic Dependencies Principleの検査として、依存edgeだけを抜いたpackage graphに対してcycle detectionを走らせる。

```text
SQLite edges
  -> dependency edge subset
  -> package graph
  -> simple cycles
  -> severity = cycle length * edge weight
```

「循環があるから保存できない」ではなく、「循環があるのでseverity順に直す」にする。

## 探索の基本はfrontier batching

SQLite上のgraph traversalで避けたいのは、訪問nodeごとにSQLを投げることである。

素朴にBFSを書くとこうなる。

```python
for qn in queue:
    node = get_node(qn)
    outgoing = get_edges_by_source(qn)
    incoming = get_edges_by_target(qn)
```

これはすぐN+1になる。

正しくは、frontierを層ごとにまとめる。

```text
frontier = [start]

while frontier:
  nodes = SELECT * FROM nodes WHERE qualified_name IN (...)
  edges = SELECT * FROM edges
          WHERE source_qualified IN (...)
             OR target_qualified IN (...)
  next_frontier = build in memory
```

dagaynの `traverse_graph` もこの形に寄せている。BFSでは現在のfrontier全体を `get_nodes_by_qualified_names` と `get_edges_by_endpoints` でまとめて取り、次のfrontierをPython側で作る。

DFSでも同じで、nodeごとにSQLを投げない。先に `get_local_subgraph(start, depth)` で局所subgraphを数クエリで取って、DFS orderだけをメモリ上で再現する。

SQLiteはin-processなので、ネットワークround tripもない。それでもSQL statementの発行、row materialization、Python object化、query plannerの起動はコストになる。

frontier batchingは、この固定費を訪問node数に比例させないための基本方針である。

## Recursive CTEはimpact radiusに向いている

frontier batchingはアプリケーション側でtraversalを制御する方法だが、到達可能集合だけが欲しいならSQLiteのrecursive CTEも使える。

イメージはこう。

```sql
WITH RECURSIVE impacted(qn, depth) AS (
  SELECT ?, 0
  UNION
  SELECT e.target_qualified, impacted.depth + 1
  FROM edges e
  JOIN impacted ON e.source_qualified = impacted.qn
  WHERE impacted.depth < ?
)
SELECT qn, depth FROM impacted;
```

`get_impact_radius` のように「このnodeから何が届くか」を知りたい場合、recursive CTEは相性が良い。

ただし、何でもCTEに押し込めばいいわけではない。

- edge kindごとの重み付け
- token budgetによる途中打ち切り
- MCP response用の整形
- incoming / outgoingを混ぜた双方向探索
- traversal orderの安定化

こういう処理が増えると、アプリケーション側でfrontier batchingした方が書きやすい。なのでdagaynでは「到達集合を一気に取りたい処理」はCTE、「応答形状や順序制御が重要な処理」はbatched traversal、という使い分けになる。

## 派生グラフはmaterializeする

グラフ探索でありがちな失敗は、毎回生の `nodes` / `edges` から全部計算することである。

例えば以下はrequest-timeに毎回やる処理ではない。

- flow derivation
- community detection
- hub score
- bridge score
- risk index
- FTS index rebuild

これらはbuild / update後のpostprocessでmaterializeしておくべきである。

dagaynでは既に `flows` / `flow_memberships` / `communities` / `risk_index` / `nodes_fts` のような派生テーブルを持っている。

```text
raw graph tables
  nodes
  edges

derived tables
  nodes_fts
  flows
  flow_memberships
  communities
  risk_index
```

MCP toolはユーザー操作の前段にいるので、latencyが体感に直結する。毎回全edgeを読み、NetworkX graphを作り、centralityやcommunityを計算する形にはしない。

graphは「最新のraw data」と「探索しやすいderived data」を分けて持つ。全部を正規化されたedge tableから毎回復元するのは、綺麗だが遅い。

## 更新はfile単位のreplaceにする

コードベースのgraphはincremental updateが必要になる。

node / edgeを1件ずつdiffして更新するより、file単位で置き換える方が単純で速い。parserの出力もfile単位で決まる。

dagaynでは基本的にこうする。

```text
changed file
  -> parse file
  -> DELETE old nodes/edges for file_path
  -> INSERT new nodes/edges
```

つまりfile単位のatomic replacementである。

これならparser側は「このfileから見えたnode / edge」を吐くだけでいい。過去との差分計算はDB側で古いfileのデータを消して差し替える。

さらに、複数fileをまとめて `store_file_batch` に入れる。

```text
BEGIN IMMEDIATE
  replace file A
  replace file B
  replace file C
COMMIT
```

SQLiteはtransactionの開始とcommitに固定費がある。1 fileごとにtransactionを張るより、複数fileをまとめた方が速い。

この設計はRust backendでも効く。PyO3境界をfileごとに越えるのではなく、batchごとに越える。SQLite transactionとPython/Rust boundary crossingのどちらも、回数を減らす。

## file hashとmtimeで再parseを避ける

incremental updateでは、parseしないことが最も効く。

まず既存のfile hashと `mtime_ns` をまとめて取る。

```text
get_file_meta_map()
```

filesystemのmtimeが保存済み `mtime_ns` と一致するfileは、中身を読まずにskipできる。

```text
stored mtime_ns == current mtime_ns
  -> skip read
  -> skip sha256
  -> skip parse
```

mtimeが変わっていた場合だけfile bytesを読み、sha256を計算する。hashが同じなら「touchされただけ」と見なしてmtimeだけ更新する。

これは探索そのものではないが、graphを最新に保つコストを下げる。AI agentから使うgraphは鮮度が大事なので、updateが重いと結局使われなくなる。

## 接続とcacheを捨てない

MCP tool handlerは自然に書くと毎回こうなる。

```python
store = GraphStore(db_path)
try:
    ...
finally:
    store.close()
```

リソース管理としては普通だが、graph queryでは遅くなることがある。

dagaynの `GraphStore` はNetworkX graph cacheを持っている。毎回closeすると、次のtool callでまたSQLiteから全edgeを読み、NetworkX graphを作り直す。

そこでread-only tool用にprocess-level store cacheを入れる。

- cache keyはSQLite DB path
- stalenessはDB fileの `st_mtime`
- cached storeは `_pinned = True`
- `close()` はleaseを返すだけで、即closeしない
- build / updateのようなwrite toolではcacheをevictする

既存handlerの `finally: store.close()` はそのまま動く。呼び出し側の形を変えずに、read-heavyなtoolだけ接続とcacheを使い回せる。

SQLiteの接続を保持するだけなら小さい話に見えるが、実際には「接続 + schema初期化 + Python object cache + NetworkX graph cache」を捨てない、という意味になる。

## FTSとembeddingはgraph探索の入口

Graph traversalはstart nodeが決まっていないと始まらない。AI agentから使う場合、最初のqueryは大体自然言語で来る。

```text
"authentication middleware"
"Terraform module that wires the API"
"where is this Markdown spec connected to code?"
```

なのでsearchを先に挟み、その後graph traversalへ進む必要がある。

SQLiteでは `nodes_fts` を作っておくと、qualified name / file path / signatureに対するkeyword searchが速い。

```sql
CREATE VIRTUAL TABLE nodes_fts USING fts5(
    name,
    qualified_name,
    file_path,
    signature,
    content='nodes',
    content_rowid='rowid'
);
```

embedding searchも使う場合、ここにも落とし穴がある。保存済みvectorを1件ずつPython loopでcosine similarityにかけると遅い。

これはgraphの話というより数値計算の話なので、NumPyに渡す。

```python
matrix @ q
```

provider / DB mtimeごとに `numpy.ndarray` をprocess-level cacheし、query vectorとの類似度を1回のBLAS呼び出しにする。NumPyがない環境ではpure Python fallbackを残す。

探索の入口で詰まると、どれだけtraversalを速くしても体感は悪い。

## Python実装で効いたこと

ここまでの改善は、ほとんどPythonのままでできる。

- SQLite PRAGMA tuning
- 適切なindex
- file単位replacement
- batch transaction
- frontier batching
- recursive CTE
- derived tableのmaterialize
- process-level store cache
- FTS
- NumPyによるembedding search

つまり、Python実装が遅いとき、最初に見るべきは言語そのものではない。SQLの打ち方、transactionの粒度、cacheの寿命、derived dataの持ち方である。

dagaynでもここを直している。`CodeParser` をworker processごとに使い回し、`store_file_batch` で書き込みをまとめ、`traverse_graph` はnodeごとのSQLからfrontier batchingに変えた。Embedding searchもPython loopではなくNumPy matrixに寄せている。

直近で特に効いたのは、探索と更新の粒度を変えたことだった。

- `mtime_ns` を保存し、mtimeが一致するfileはread / sha256 / parseを避ける
- hopごとのdependent探索をfile単位にbatch化し、`get_direct_dependents` でまとめて取る
- `get_impact_radius_sql` では大きな `IN (...)` やPython側edge集合構築を避け、temp tableとJOINに寄せる
- node / edgeのbulk insertは `executemany` と `ON CONFLICT DO UPDATE` に寄せる
- SQLite connectionのPRAGMAをwriter向けに調整する

重要なのは、どれも「PythonをRustに置き換える」話ではないことだ。SQLの発行回数を減らす、transactionをまとめる、読み直しを避ける、Python loopをSQLiteやNumPyに押し出す。そういう変更だけで、多くの性能差は消える。

## writer benchmarkから分かること

Rust backendのwriterも測ったが、結論は同じだった。writerだけをRustにしても大きな差は出ない。

Python側のperf commitを取り込んだ状態で、release buildのRust extensionと比較するとこうなる。

| Mode                           | Python avg | Rust avg |
|--------------------------------|-----------:|---------:|
| writer-only                    |     0.267s |   0.282s |
| full build, `postprocess=none` |   2.681s |   2.597s |
| full build, `postprocess=full` |   3.102s |   3.000s |

writer-onlyではPythonの `sqlite3.executemany` が強く、Rustはほぼ同等だが大きく勝ってはいない。一方でE2EではRust backendが少し上回った。

この結果から言えるのは、言語差よりも境界と粒度の方が支配的だということだ。Python parserが作ったnode / edgeを後からRust writerに渡すだけだと、Python object化とmarshallingが残る。Rust側にもPython writerと同じ方針を入れた。

- SQLite PRAGMAをPython実装と揃える
- batch内のfile削除をfileごとのDELETEではなくchunked `IN (...)` DELETEにする
- 空の `extra` に対して `serde_json::to_string` しない
- `store_file_batch_json` ではcompact tupleを通常の `NodeInput` / `EdgeInput` に詰め替えず、そのままSQLiteに投入する

このあたりを揃えるとwriterはほぼ同等になる。まずPython実装のSQLとbatch粒度を直すのが先で、Rust化はその次の話である。

## Rust化の方針

Rust化は、Python実装を細切れに置き換える方向では進めない。

今回のbenchmarkでは、writerだけをRustにしてもPython writerとほぼ同等だった。Python側でSQL、transaction、cache、batch粒度を直すだけで大きな差は消える。したがって、Rust化の目的は「SQLiteを叩く関数をRustにする」ことではなく、Python object化とPyO3 marshallingが発生する境界を減らすことに置く。

方針は3つある。

1つ目は、parity firstで進めること。Rust側で独自parserを再実装しない。構文解析は既存と同じTree-sitter grammarに任せ、dagayn固有の抽出と正規化だけをRustに寄せる。Python実装が `manji-0/tree-sitter-terraform` のようなpinned grammarを使っているなら、Rust側も同じgrammarと同じquery semanticsに合わせる。`tree-sitter-hcl` のような近い別物に置き換えると、抽出できるnode / edgeが変わり、parity testで一致しなくなる。

2つ目は、境界を粗くすること。node / edge 1件ごと、file 1件ごとにPyO3境界を越えない。越えるならfile batch単位、できればbuild / update単位にする。PythonはMCPとCLIのinterface layerに寄せ、parse orchestration、extraction、normalization、writer、postprocessは同じ側に置く。

3つ目は、release buildとE2Eで判断すること。debug buildのRust extensionでwriter-onlyを測ると差が大きく見えるが、実運用の比較には使えない。writer-onlyだけでも不十分で、parse、write、postprocess、tool queryまで含めて見る。

最終的に狙う形はこうである。

```text
file discovery
  -> Tree-sitter parse orchestration in Rust
  -> Rust node/edge extraction and normalization
  -> Rust graph writer
  -> Rust postprocess
  -> thin Python MCP/CLI shell
```

この形なら、小さいrecordを `Vec<Node>` / `Vec<Edge>` として密に持てる。Python objectからRust structへの変換も消える。SQLite row -> Python object -> NetworkX -> dict -> SQLite rowという往復も減らせる。

段階としては、まずparityが取りやすい言語や処理から移す。dagaynでは、その最初の一歩としてMarkdownの抽出処理をRust側に寄せている。

方針としては、Markdownの構文解析そのものはpinnedしたTree-sitter Markdown grammarに任せる。そのASTから、heading / section node、`CONTAINS` edge、directive、link、code span由来のedgeをdagaynのgraph recordに落とす部分をRust側に持つ。

`parse_markdown_compact_json(file_path, source)` は、その結果をcompact node / edge arrayとして返す境界である。

`DAGAYN_BACKEND=rust` のとき、Markdown fileはPython `CodeParser` を経由せず、次の形で流れる。

```text
Tree-sitter Markdown parse in Rust
  -> Rust Markdown node/edge extractor
  -> compact nodes / edges
  -> Rust graph writer
```

`markdown_only` と `mixed` のparity snapshotはこの経路でPython出力と一致している。

これは「Rust writerを呼ぶ」より本質に近い。Tree-sitter ASTからgraph recordを作るところからwriterまで同じcompact representationのまま流し、boundaryとobject変換を減らす。

## まとめ

SQLiteでコードグラフを速く扱うには、まずSQLと保存設計をちゃんとやる。

- node / edge tableをシンプルに保つ
- graph identityは安定したkeyにする
- edge kindを探索条件として使う
- source / target / kindにindexを張る
- SQLite PRAGMAとtransaction粒度を実workloadに合わせる
- traversalはnodeごとではなくfrontierごとにbatchする
- 到達集合はrecursive CTEも使う
- flow / community / centrality / FTSはmaterializeする
- incremental updateはfile単位replacementにする
- connectionとgraph cacheを捨てない

ここまではPythonでもできる。

今回のPython側perf変更で見えたのは、SQLite上のgraph workloadは、言語より先に粒度で決まるということだった。nodeごと、fileごと、tool callごとに処理すると遅い。frontier、batch、derived table、cacheという単位に揃えると速くなる。

Rust化も、この延長線上にある。言語を変えるだけでは速くならない。Rust writer単体では、release buildでようやくPython writerとほぼ同等というところだった。

今後Rustに寄せるなら、parityを保ったまま、Tree-sitter orchestration、node / edge extraction、normalization、writer、postprocessをまとめて移す。Python object化、PyO3 marshalling、NetworkX用の再構築、process間serializeといったコストを減らすには、境界を粗くする必要がある。

SQLite上のgraph探索を速くする本質は、SQLの小技だけではなく、**graph をどの段階でどの形に materialize し、どの境界を越えさせないか**にある。
