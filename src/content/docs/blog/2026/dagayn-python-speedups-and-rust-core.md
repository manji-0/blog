---
title: dagaynがコードグラフをSQLiteで取り扱うためのテクニック
description: SQLiteで有向コードグラフを表現し、Python実装のまま探索と更新を高速化するための実装技術について
sidebar:
  order: 1
---

SQLite でコードグラフを扱う話を書く。

題材は `dagayn` である。dagayn はリポジトリ内のコード、ドキュメント、Terraform、Notebook などを node / edge に分解し、SQLite に保存して、AI エージェントから探索できるようにするツールである。

前回の記事では「何をグラフにしているか」を中心に書いた。

[すべてを有向グラフにする、俺とAI以外のやつが](/blog/2026/dagayn-knowledge-graph-for-code-review/)

今回はもう少し一般化して、**SQLite 上で有向コードグラフをどう表現し、どう探索と更新を速くするか**という観点で整理する。

扱う話は大きく3つ。

1. SQLite でコードグラフをどう表現するか
2. Python 実装で探索・更新をどう速くするか
3. そこから Rust core 化について何が言えるか

「Rust にしたら速い」ではなく、「SQLite に置いたグラフを速く扱うには、どこを materialize し、どこを batch 化し、どこで Python object 化を避けるべきか」という話である。

## SQLiteでコードグラフを表現する

保存形式として特別なことをする必要はない。基本は node table と edge table で足りる。

dagayn ではだいたいこういう形になっている。

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

重要なのは、edge が `source_id` / `target_id` ではなく `qualified_name` を持っているところである。

RDB 的には foreign key の整数 ID で結びたい。ただコードベースのグラフでは qualified name の方が扱いやすい場面は多い。

- parser が node ID を知らない段階で edge を吐ける
- incremental update で file 単位に差し替えやすい
- JSON snapshot や parity test が安定しやすい
- MCP tool のレスポンスで人間が読める
- cross-artifact edge で Markdown / Terraform / code symbol を同じ key 空間に置ける

もちろん、整数 ID join の方が速い場面はある。そこは後処理で materialized table を持てばいい。最初の graph identity は安定した文字列 key に寄せる、という設計にしている。

## edge kindはケチらない

グラフをただの `source -> target` として保存すると、探索時に全部の edge が同じ意味になってしまう。

dagayn では edge kind を分けている。

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

例えば「依存方向の安定性」を見るときは `IMPORTS_FROM` / `DEPENDS_ON` / `INHERITS` / `IMPLEMENTS` だけを見たい。`CALLS` や `REFERENCES` まで混ぜると、動的言語では edge がノイズになりやすい。

逆に impact radius では `CALLS` も欲しい。ドキュメント影響を見るなら `CROSS_ARTIFACT` が効く。

つまり、edge kind は「意味分類」であると同時に「探索時の index selector」でもある。

```sql
CREATE INDEX idx_edges_source ON edges(source_qualified);
CREATE INDEX idx_edges_target ON edges(target_qualified);
CREATE INDEX idx_edges_kind ON edges(kind);
CREATE INDEX idx_edges_target_kind ON edges(target_qualified, kind);
CREATE INDEX idx_edges_source_kind ON edges(source_qualified, kind);
```

このへんの index は地味だが、後から効いてくる。graph query はだいたい「この node から出る edge」「この node に入る edge」「この kind だけ」を繰り返すので、source / target / kind の組を最初から主要アクセスパターンとして扱う。

SQLite の接続設定も同じくらい地味に効く。

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA mmap_size=268435456;
PRAGMA temp_store=MEMORY;
```

writer benchmark では、SQLite 呼び出し回数だけでなく、connection 設定と transaction 粒度も効く。

## DAG制約は保存時に入れない

コードベースの知識グラフは、保存時には単なる directed graph として受け入れる。

現実のコードには import cycle、package cycle、ドキュメントの相互参照、Terraform module の複雑な参照がある。保存時に循環を弾くと、壊れた構造を観測できない。さらに、DAG として見たい部分グラフは edge kind によって違う。`CONTAINS` はほぼ木構造だが、`CALLS` は循環して当然で、`IMPORTS_FROM` は循環してほしくない。

だから DAG としての検査は後処理でやる。

dagayn では ADP、つまり Acyclic Dependencies Principle の検査として、依存 edge だけを抜いた package graph に対して cycle detection を走らせる。

```text
SQLite edges
  -> dependency edge subset
  -> package graph
  -> simple cycles
  -> severity = cycle length * edge weight
```

「循環があるから保存できない」ではなく、「循環があるので severity 順に直す」にする。

## 探索の基本はfrontier batching

SQLite 上の graph traversal で避けたいのは、訪問 node ごとに SQL を投げることである。

素朴に BFS を書くとこうなる。

```python
for qn in queue:
    node = get_node(qn)
    outgoing = get_edges_by_source(qn)
    incoming = get_edges_by_target(qn)
```

これはすぐ N+1 になる。

正しくは、frontier を層ごとにまとめる。

```text
frontier = [start]

while frontier:
  nodes = SELECT * FROM nodes WHERE qualified_name IN (...)
  edges = SELECT * FROM edges
          WHERE source_qualified IN (...)
             OR target_qualified IN (...)
  next_frontier = build in memory
```

dagayn の `traverse_graph` もこの形に寄せている。BFS では現在の frontier 全体を `get_nodes_by_qualified_names` と `get_edges_by_endpoints` でまとめて取り、次の frontier を Python 側で作る。

DFS でも同じで、node ごとに SQL を投げない。先に `get_local_subgraph(start, depth)` で局所 subgraph を数クエリで取って、DFS order だけをメモリ上で再現する。

SQLite は in-process なので、ネットワーク round trip もない。それでも SQL statement の発行、row materialization、Python object 化、query planner の起動はコストになる。

frontier batching は、この固定費を訪問 node 数に比例させないための基本方針である。

## Recursive CTEはimpact radiusに向いている

frontier batching はアプリケーション側で traversal を制御する方法だが、到達可能集合だけが欲しいなら SQLite の recursive CTE も使える。

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

`get_impact_radius` のように「この node から何が届くか」を知りたい場合、recursive CTE は相性が良い。

ただし、何でも CTE に押し込めばいいわけではない。

- edge kind ごとの重み付け
- token budget による途中打ち切り
- MCP response 用の整形
- incoming / outgoing を混ぜた双方向探索
- traversal order の安定化

こういう処理が増えると、アプリケーション側で frontier batching した方が書きやすい。なので dagayn では「到達集合を一気に取りたい処理」は CTE、「応答形状や順序制御が重要な処理」は batched traversal、という使い分けになる。

## 派生グラフはmaterializeする

グラフ探索でありがちな失敗は、毎回生の `nodes` / `edges` から全部計算することである。

例えば以下は request-time に毎回やる処理ではない。

- flow derivation
- community detection
- hub score
- bridge score
- risk index
- FTS index rebuild

これらは build / update 後の postprocess で materialize しておくべきである。

dagayn では既に `flows` / `flow_memberships` / `communities` / `risk_index` / `nodes_fts` のような派生テーブルを持っている。

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

MCP tool はユーザー操作の前段にいるので、latency が体感に直結する。毎回全 edge を読み、NetworkX graph を作り、centrality や community を計算する形にはしない。

graph は「最新の raw data」と「探索しやすい derived data」を分けて持つ。全部を正規化された edge table から毎回復元するのは、綺麗だが遅い。

## 更新はfile単位のreplaceにする

コードベースの graph は incremental update が必要になる。

node / edge を1件ずつ diff して更新するより、file 単位で置き換える方が単純で速い。parser の出力も file 単位で決まる。

dagayn では基本的にこうする。

```text
changed file
  -> parse file
  -> DELETE old nodes/edges for file_path
  -> INSERT new nodes/edges
```

つまり file 単位の atomic replacement である。

これなら parser 側は「この file から見えた node / edge」を吐くだけでいい。過去との差分計算は DB 側で古い file のデータを消して差し替える。

さらに、複数 file をまとめて `store_file_batch` に入れる。

```text
BEGIN IMMEDIATE
  replace file A
  replace file B
  replace file C
COMMIT
```

SQLite は transaction の開始と commit に固定費がある。1 file ごとに transaction を張るより、複数 file をまとめた方が速い。

この設計は Rust backend でも効く。PyO3 境界を file ごとに越えるのではなく、batch ごとに越える。SQLite transaction と Python/Rust boundary crossing のどちらも、回数を減らす。

## file hashとmtimeで再parseを避ける

incremental update では、parse しないことが最も効く。

まず既存の file hash と `mtime_ns` をまとめて取る。

```text
get_file_meta_map()
```

filesystem の mtime が保存済み `mtime_ns` と一致する file は、中身を読まずに skip できる。

```text
stored mtime_ns == current mtime_ns
  -> skip read
  -> skip sha256
  -> skip parse
```

mtime が変わっていた場合だけ file bytes を読み、sha256 を計算する。hash が同じなら「touch されただけ」と見なして mtime だけ更新する。

これは探索そのものではないが、graph を最新に保つコストを下げる。AI agent から使う graph は鮮度が大事なので、update が重いと結局使われなくなる。

## 接続とcacheを捨てない

MCP tool handler は自然に書くと毎回こうなる。

```python
store = GraphStore(db_path)
try:
    ...
finally:
    store.close()
```

リソース管理としては普通だが、graph query では遅くなることがある。

dagayn の `GraphStore` は NetworkX graph cache を持っている。毎回 close すると、次の tool call でまた SQLite から全 edge を読み、NetworkX graph を作り直す。

そこで read-only tool 用に process-level store cache を入れる。

- cache key は SQLite DB path
- staleness は DB file の `st_mtime`
- cached store は `_pinned = True`
- `close()` は lease を返すだけで、即 close しない
- build / update のような write tool では cache を evict する

既存 handler の `finally: store.close()` はそのまま動く。呼び出し側の形を変えずに、read-heavy な tool だけ接続と cache を使い回せる。

SQLite の接続を保持するだけなら小さい話に見えるが、実際には「接続 + schema 初期化 + Python object cache + NetworkX graph cache」を捨てない、という意味になる。

## FTSとembeddingはgraph探索の入口

Graph traversal は start node が決まっていないと始まらない。AI agent から使う場合、最初の query は大体自然言語で来る。

```text
"authentication middleware"
"Terraform module that wires the API"
"where is this Markdown spec connected to code?"
```

なので search を先に挟み、その後 graph traversal へ進む必要がある。

SQLite では `nodes_fts` を作っておくと、qualified name / file path / signature に対する keyword search が速い。

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

embedding search も使う場合、ここにも落とし穴がある。保存済み vector を1件ずつ Python loop で cosine similarity にかけると遅い。

これは graph の話というより数値計算の話なので、NumPy に渡す。

```python
matrix @ q
```

provider / DB mtime ごとに `numpy.ndarray` を process-level cache し、query vector との類似度を1回の BLAS 呼び出しにする。NumPy がない環境では pure Python fallback を残す。

探索の入口で詰まると、どれだけ traversal を速くしても体感は悪い。

## Python実装で効いたこと

ここまでの改善は、ほとんど Python のままでできる。

- SQLite PRAGMA tuning
- 適切な index
- file 単位 replacement
- batch transaction
- frontier batching
- recursive CTE
- derived table の materialize
- process-level store cache
- FTS
- NumPy による embedding search

つまり、Python 実装が遅いとき、最初に見るべきは言語そのものではない。SQL の打ち方、transaction の粒度、cache の寿命、derived data の持ち方である。

dagayn でもここを直している。`CodeParser` を worker process ごとに使い回し、`store_file_batch` で書き込みをまとめ、`traverse_graph` は node ごとの SQL から frontier batching に変えた。Embedding search も Python loop ではなく NumPy matrix に寄せている。

直近で特に効いたのは、探索と更新の粒度を変えたことだった。

- `mtime_ns` を保存し、mtime が一致する file は read / sha256 / parse を避ける
- hop ごとの dependent 探索を file 単位に batch 化し、`get_direct_dependents` でまとめて取る
- `get_impact_radius_sql` では大きな `IN (...)` や Python 側 edge 集合構築を避け、temp table と JOIN に寄せる
- node / edge の bulk insert は `executemany` と `ON CONFLICT DO UPDATE` に寄せる
- SQLite connection の PRAGMA を writer 向けに調整する

重要なのは、どれも「Python を Rust に置き換える」話ではないことだ。SQL の発行回数を減らす、transaction をまとめる、読み直しを避ける、Python loop を SQLite や NumPy に押し出す。そういう変更だけで、多くの性能差は消える。

## writer benchmarkから分かること

Rust backend の writer も測ったが、結論は同じだった。writer だけを Rust にしても大きな差は出ない。

Python 側の perf commit を取り込んだ状態で、release build の Rust extension と比較するとこうなる。

| Mode                           | Python avg | Rust avg |
|--------------------------------|-----------:|---------:|
| writer-only                    |     0.267s |   0.282s |
| full build, `postprocess=none` |   2.681s |   2.597s |
| full build, `postprocess=full` |   3.102s |   3.000s |

writer-only では Python の `sqlite3.executemany` が強く、Rust はほぼ同等だが大きく勝ってはいない。一方で E2E では Rust backend が少し上回った。

この結果から言えるのは、言語差よりも境界と粒度の方が支配的だということだ。Python parser が作った node / edge を後から Rust writer に渡すだけだと、Python object 化と marshalling が残る。Rust 側にも Python writer と同じ方針を入れた。

- SQLite PRAGMA を Python 実装と揃える
- batch 内の file 削除を file ごとの DELETE ではなく chunked `IN (...)` DELETE にする
- 空の `extra` に対して `serde_json::to_string` しない
- `store_file_batch_json` では compact tuple を通常の `NodeInput` / `EdgeInput` に詰め替えず、そのまま SQLite に投入する

このあたりを揃えると writer はほぼ同等になる。まず Python 実装の SQL と batch 粒度を直すのが先で、Rust 化はその次の話である。

## Rust化の方針

Rust 化は、Python 実装を細切れに置き換える方向では進めない。

今回の benchmark では、writer だけを Rust にしても Python writer とほぼ同等だった。Python 側で SQL、transaction、cache、batch 粒度を直すだけで大きな差は消える。したがって、Rust 化の目的は「SQLite を叩く関数を Rust にする」ことではなく、Python object 化と PyO3 marshalling が発生する境界を減らすことに置く。

方針は3つある。

1つ目は、parity first で進めること。Rust 側で独自 parser を再実装しない。構文解析は既存と同じ Tree-sitter grammar に任せ、dagayn 固有の抽出と正規化だけを Rust に寄せる。Python 実装が `manji-0/tree-sitter-terraform` のような pinned grammar を使っているなら、Rust 側も同じ grammar と同じ query semantics に合わせる。`tree-sitter-hcl` のような近い別物に置き換えると、抽出できる node / edge が変わり、parity test で一致しなくなる。

2つ目は、境界を粗くすること。node / edge 1件ごと、file 1件ごとに PyO3 境界を越えない。越えるなら file batch 単位、できれば build / update 単位にする。Python は MCP と CLI の interface layer に寄せ、parse orchestration、extraction、normalization、writer、postprocess は同じ側に置く。

3つ目は、release build と E2E で判断すること。debug build の Rust extension で writer-only を測ると差が大きく見えるが、実運用の比較には使えない。writer-only だけでも不十分で、parse、write、postprocess、tool query まで含めて見る。

最終的に狙う形はこうである。

```text
file discovery
  -> Tree-sitter parse orchestration in Rust
  -> Rust node/edge extraction and normalization
  -> Rust graph writer
  -> Rust postprocess
  -> thin Python MCP/CLI shell
```

この形なら、小さい record を `Vec<Node>` / `Vec<Edge>` として密に持てる。Python object から Rust struct への変換も消える。SQLite row -> Python object -> NetworkX -> dict -> SQLite row という往復も減らせる。

段階としては、まず parity が取りやすい言語や処理から移す。dagayn では、その最初の一歩として Markdown の抽出処理を Rust 側に寄せている。

方針としては、Markdown の構文解析そのものは pinned した Tree-sitter Markdown grammar に任せる。その AST から、heading / section node、`CONTAINS` edge、directive、link、code span 由来の edge を dagayn の graph record に落とす部分を Rust 側に持つ。

`parse_markdown_compact_json(file_path, source)` は、その結果を compact node / edge array として返す境界である。

`DAGAYN_BACKEND=rust` のとき、Markdown file は Python `CodeParser` を経由せず、次の形で流れる。

```text
Tree-sitter Markdown parse in Rust
  -> Rust Markdown node/edge extractor
  -> compact nodes / edges
  -> Rust graph writer
```

`markdown_only` と `mixed` の parity snapshot はこの経路で Python 出力と一致している。

これは「Rust writer を呼ぶ」より本質に近い。Tree-sitter AST から graph record を作るところから writer まで同じ compact representation のまま流し、boundary と object 変換を減らす。

## まとめ

SQLite でコードグラフを速く扱うには、まず SQL と保存設計をちゃんとやる。

- node / edge table をシンプルに保つ
- graph identity は安定した key にする
- edge kind を探索条件として使う
- source / target / kind に index を張る
- SQLite PRAGMA と transaction 粒度を実 workload に合わせる
- traversal は node ごとではなく frontier ごとに batch する
- 到達集合は recursive CTE も使う
- flow / community / centrality / FTS は materialize する
- incremental update は file 単位 replacement にする
- connection と graph cache を捨てない

ここまでは Python でもできる。

今回の Python 側 perf 変更で見えたのは、SQLite 上の graph workload は、言語より先に粒度で決まるということだった。node ごと、file ごと、tool call ごとに処理すると遅い。frontier、batch、derived table、cache という単位に揃えると速くなる。

Rust 化も、この延長線上にある。言語を変えるだけでは速くならない。Rust writer 単体では、release build でようやく Python writer とほぼ同等というところだった。

今後 Rust に寄せるなら、parity を保ったまま、Tree-sitter orchestration、node / edge extraction、normalization、writer、postprocess をまとめて移す。Python object 化、PyO3 marshalling、NetworkX 用の再構築、process 間 serialize といったコストを減らすには、境界を粗くする必要がある。

SQLite 上の graph 探索を速くする本質は、SQL の小技だけではなく、**graph をどの段階でどの形に materialize し、どの境界を越えさせないか**にある。
