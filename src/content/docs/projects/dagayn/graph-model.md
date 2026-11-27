---
title: "グラフモデル"
description: "dagayn のノード・エッジ・メトリクス・検索"
sidebar:
  order: 11
---

このページは、v11.2.0のdagaynのグラフ語彙を扱います。ノードとエッジの種類、確度、呼び出し先の解決規則、スキーマ、Markdownとの連携、検索が対象です。取り込みと保存の仕組みは [アーキテクチャ](/projects/dagayn/architecture/) を参照してください。MCPからの呼び方は [MCP ツール](/projects/dagayn/mcp-tools/) にあります。

## 対応アーティファクト

| 種別 | 形式 | 備考 |
| --- | --- | --- |
| ソースコード | Python、JavaScript、TypeScript、Go、Rust、Java、C / C++、C# など約30言語 | Vue、Svelte、Astro、Bash、PowerShell、Zigも含む |
| Markdown | `.md` | 見出し、本文、リンク、依存コメント、directive、コードスパン |
| Terraform | `.tf`、`.tfvars`、`.tftest.hcl` | blockの種類ごとにノードを作る |
| Notebook | `.ipynb`、Databricks、marimoの `.py` / `.md` | セル単位で行番号を保つ |

すべて1つのグラフに載り、同じノード種別とエッジkindで表します。

## ノード種別

ノード種別は次の7つです。Rustパーサでは閉じた列挙型 `NodeKind` で表し、保存するときは文字列です。

| kind | 意味 | qualified name の例 |
| --- | --- | --- |
| `File` | ファイル | `src/auth.py` |
| `Class` | クラス、構造体、Terraformのresourceなど | `src/auth.py::AuthService` |
| `Function` | 関数、メソッド | `src/auth.py::AuthService.login` |
| `Type` | 型定義 | `src/models.py::UserId` |
| `Test` | テスト関数 | `tests/test_auth.py::test_login` |
| `DocSection` | Markdownの見出し | `docs/arch.md::api-design` |
| `DocBody` | 見出し配下の本文、リスト、表、コードブロック | `docs/arch.md::api-design--body-1` |

qualified nameは `<ファイルパス>::<名前>` の形で、リポジトリ内で一意です。`DocSection` を `Class` と分けているのは、コードのシンボル検索にドキュメントが混ざらないようにするためです。

### テストの判定

ノードの `is_test` はテストコードかどうかを示します。`Test` ノードになるのは、言語がテストとして実行する関数だけです。

| 言語 | `is_test` | `Test` ノード |
| --- | --- | --- |
| 共通 | `tests/`、`test/`、`test_` 接頭辞、各言語のテスト用接尾辞のファイル | 言語ごとの規則による |
| Rust | `tests/` や `test/` 配下、`#[cfg(test)] mod` が読み込むファイル | `#[test]`、`#[tokio::test]`、`#[rstest]` などの属性を持つ関数と、`#[cfg(test)]` モジュールの関数 |
| Go | `_test.go` のファイル（名前の接尾辞だけで判定） | トップレベルの `TestX`、`BenchmarkX`、`FuzzX`、`ExampleX` |
| Terraform | `.tftest.hcl` の `run` などのblock | `run`、`mock_provider` など |

v11.1.0から、Rustの `tests/` 配下でもテスト属性のない関数は `Test` ではなく、`is_test` 付きの `Function` です。テストダブルのメソッドが、同名の本番メソッドのテストとして数えられないようにするためです。Goでは `Testify` のように接頭辞の直後が小文字の関数は `Test` になりません。suite型のメソッド `TestX` もテストコードですが `Test` ノードではありません。

### Terraformのblock

| block | kind | qualified name の例 |
| --- | --- | --- |
| `resource` / `data` / `ephemeral` | `Class` | `main.tf::resource.aws_s3_bucket.logs` |
| `module` / `provider` / `terraform` / `check` | `Class` | `main.tf::module.network` |
| `variable` / `output` / `locals` の各キー | `Function` | `variables.tf::var.region` |
| `run` / `mock_provider`（`.tftest.hcl`） | `Test` | `main.tftest.hcl::run.plan_ok` |
| `import` / `moved` / `removed` | ノードなし | エッジだけを作る |

`.tfvars` のトップレベル属性は `var.<name>` ノードになり、対応する `variable` blockへ `REFERENCES` で結ばれます。

## エッジ種別

エッジkindは次の9つです。Rustパーサでは列挙型 `EdgeKind` で、保存時は大文字の文字列です。

| kind | 向き | 典型的な用途 |
| --- | --- | --- |
| `CONTAINS` | 親 → 子 | ファイル → シンボル、見出しの階層 |
| `CALLS` | 呼び出し元 → 呼び出し先 | 呼び出し元の一覧、影響範囲、エントリポイント |
| `IMPORTS_FROM` | importする側 → される側 | パッケージ依存、Markdownのリンク先ファイル |
| `INHERITS` | 子 → 親 | 継承 |
| `IMPLEMENTS` | 実装 → 契約 | traitやinterfaceへの適合 |
| `DEPENDS_ON` | 依存元 → 依存先 | Markdownの依存コメント |
| `REFERENCES` | 参照元 → 参照先 | 値としての関数の利用、Markdownの節リンク、Terraformの式 |
| `TESTED_BY` | テストされる側 → テスト | `login` → `test_login` |
| `CROSS_ARTIFACT` | 境界をまたぐ参照 | 文書 → コード、言語間の橋、Terraform → コード |

エッジkindは意味の分類で、同時に探索時の索引の選択にも使います。

メンバーは、型が同じファイルで宣言されていればその型のノードに含まれます。別ファイルならFileノードに含まれます。Rustでは後処理が、別ファイルの型への `impl` メンバーと `IMPLEMENTS` を型のノードへ移します。

### 分析ごとのkindの使い分け

| 分析 | 数えるkind | 数えないkind |
| --- | --- | --- |
| ユニット間の依存、importの循環 | `IMPORTS_FROM`、`DEPENDS_ON`、`INHERITS`、`IMPLEMENTS` | `CALLS`、`REFERENCES` |
| 呼び出しの影響範囲 | `CALLS` を含む | — |
| ドキュメントへの影響 | `CROSS_ARTIFACT`、`DEPENDS_ON` | — |

`CALLS` は実装上の結合で、パッケージ依存とは別物です。依存分析に混ぜると、宣言した依存より広い結合まで循環や違反として数えてしまいます。importの循環は、モジュールの読み込み時に実行されるimportだけを数えます。関数内のimport（`import_scope: "function"`）や `if TYPE_CHECKING:` の中のimport、TypeScriptの `import type` は数えません。

## 確度

エッジは `confidence`（数値）と `confidence_tier`（段階）を持ちます。括弧内の数値は呼び出しエッジでの値です。

| tier | 意味 |
| --- | --- |
| `EXTRACTED` | tierを指定しないエッジの既定値（`confidence` 1.0） |
| `HIGH`（0.9） | コードに書かれた根拠がある。同じファイル、直接importしたファイル、パッケージを通した呼び出しなど |
| `MEDIUM`（0.6） | 推定による。受け手の型が不明なメソッド、組み込み関数の名前、同名の呼び出しからの推定など |
| `LOW` | 何も説明できなかった呼び出しや、端点がノードでないエッジ |

このほかに `EXACT` もあり、`EXTRACTED` や `HIGH` と同じく確かなものとして扱われます。`query_graph_tool` は、返すエッジがすべて `EXACT`、`EXTRACTED`、`HIGH` のとき `confidence: "high"`、それ以外では `"medium"` を返します。

`LOW` は「グラフにも既知のパッケージにも、この呼び出しを説明するものがない」という意味です。パッケージへの呼び出しは、呼び出し先がノードでなくても `LOW` にはなりません。

## 呼び出し先の解決

パーサは1ファイルしか見ないため、別ファイルの呼び出し先は後処理で確定します。仕様はupstreamの [docs/CALL-RESOLUTION.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/CALL-RESOLUTION.md) にあります。

### 3つの結果

| 結果 | 呼び出し先 | tier | 例 |
| --- | --- | --- | --- |
| 解決済み | ノードのqualified name | `EXTRACTED`、`HIGH`、`MEDIUM` | `store.upsert_node()` → `PyGraphStore.upsert_node` |
| 外部 | パッケージ名（`extra.external: true`） | `HIGH`、`MEDIUM` | `subprocess.run(cmd)` → `subprocess` |
| 未解決 | 書かれたままの名前 | `LOW` | 型が不明な `obj.frobnicate()` |

標準ライブラリや依存パッケージへの呼び出しは、同名のプロジェクト関数ではなくパッケージ自体を指します。たとえばPythonの `len(x)` は `builtins`、Nodeの `fs.readFile()` は `node:fs` です。こうしたエッジは `extra` に `external`、`external_package`、`external_symbol` を持ち、標準ライブラリなら `stdlib` も持ちます。

### 素の名前の解決

素の名前は、呼び出し元のファイルから見える候補がちょうど1つのときだけ結びます。別の言語ファミリーの候補は見えません。言語をまたぐエッジは、明示的な橋を作る後処理（PyO3やFFI、Terraform、マニフェスト、Markdown）からだけ生まれます。

| 確度 | 候補 |
| --- | --- |
| `HIGH` | 同じファイルか直接importしたファイルの、トップレベルの関数やクラス |
| `MEDIUM` | メソッド、受け手の型が不明なもの、名前空間やクラス宣言を通してだけ見えるもの |

### 受け手の型

メンバー呼び出し（`x.m()` など）は、ファイルの構文が `x` について示すことで型を決めます。

1. 同じファイルのクラスなら、そのメソッドに結ぶ。
2. 別ファイルのクラスなら `receiver_type` を記録し、後処理で型ごとに結ぶ。
3. 標準ライブラリやパッケージの型なら、そのパッケージへの外部呼び出しにする。
4. どれでもなければ `receiver_unknown` を記録する。呼び出し結果を受けた値なら `receiver_from` も記録する。

後処理は、re-export、素の名前、enumのvariant、戻り値型、パッケージの型の順に解決を進めます。戻り値型の段は2回走り、1回目で型の付いた呼び出しから、次の呼び出しの型を決められます。最後に、型の付いた同名メソッドの呼び出しの9割以上が同じパッケージに届くなら、型が不明な呼び出しもそのパッケージとみなします（`MEDIUM`、`inferred_from: "observed_method"`）。

### Goの規則

Goのファイルは、パッケージのimport path（`go.mod` の `module` とディレクトリ）を名前空間として持ちます。同じパッケージのファイルは互いに見え、テストファイルもパッケージを見ます。

| 呼び出し | 解決 |
| --- | --- |
| 修飾なしの呼び出し（`encode(x)`） | 同じパッケージのトップレベルの関数か型にだけ結ぶ |
| パッケージ修飾（`huff0.Compress()`） | 名前では結ばず、`import_path` のパッケージのトップレベルの関数か型に結ぶ |
| 型の付いた受け手のメソッド | 型のディレクトリにあるメソッドに結ぶ。埋め込み型はGoのセレクタ規則で探す |
| 受け手の型が不明 | 名前では結ばない |

v11.1.0で、Goの解決は次のように変わりました。

- 同じパッケージ内で結んだ呼び出しは `MEDIUM` ではなく `HIGH` になりました。パッケージはコンパイラが検査する1つの名前空間だからです（go抽出器17）。
- 標準ライブラリの関数が返した値へのメソッド呼び出し（`zw := gzip.NewWriter(&buf); zw.Reset(&buf)`）は、そのパッケージへの外部呼び出しになりました。ただし、型パラメータを持つ標準パッケージ（`slices` など）や依存パッケージの関数が返した値は対象外です（go抽出器18）。
- 値として使われた関数（`New: gzkp.NewWriter`、`run(helper)`）は `REFERENCES` エッジになりました（go抽出器16）。
- Fileノードが `go_module_dir`（`go.mod` のディレクトリ）を記録します。`query_graph_tool` はこれを使い、`_examples/` や `testdata/`、入れ子の `go.mod` の下の行を `results` から `outside_module` に分けます（go抽出器19）。
- ポインタや複合リテラルで書かれた標準ライブラリの値（`t *testing.T`、`&bytes.Buffer{}`）へのメソッド呼び出しは `receiver_concrete` を記録します。interfaceではないと分かるので、`callers_of` はそれをリポジトリのメソッドに届きうる呼び出しとして数えません（go抽出器20）。
- dot import（`import . "example.com/m/q"`）はimportエッジに `dot_import` として記録されます。

### Rustの規則

Rustでは、型が不明な受け手の呼び出しを名前では結びません。enumのvariantの呼び出し（`Kind::File(..)`）はenumのノードに結びます。`Deref` の先の型や、`Result` を返すコンストラクタのメソッドも追います。

v11.2.0から、Rustの解決は言語規則により忠実です（rust抽出器29）。

- `use` で取り込んだ名前の素の呼び出し（`use crate::query::f; f()`）は、そのモジュールのre-export（`pub(crate) use rows::f`）を通って関数に届きます。別の `f` が見えていても同じです。
- `let f = |..| f(..)` のクロージャ内の `f` は、クロージャ自身ではなく、`let` の前に見えていた `f` を指します。
- タプル、配列、構造体フィールドの値に置かれた関数（`Some((is_builtin, "k"))`）は参照として記録します。
- 構造体パターンの省略形フィールド（`let S { ranges } = s`）はローカル変数で、同名の関数への参照ではありません。

### SCIPオーバーレイ

`dagayn build --scip` では、後処理の前にSCIPインデックスが `CALLS` を確定します。RustとTypeScriptのインデックスは抽出器の答えを置き換えます。それ以外の言語は、抽出器が解決できなかったエッジだけを埋めます。インデックスで確定したエッジは `resolved_by: "scip"` を持ち、`query_graph_tool` の `callers_of` / `callees_of` の行に表れます。

### 既知の限界

- 型の追跡は字句的で、多くの言語では関数単位です。ブロックや制御フローの経路ごとには追いません。
- リポジトリの関数と標準型のメソッドが同じ名前を持つと、受け手の型が分からない限り未解決のままです。
- Goでは、interfaceで宣言された値のメソッドは動的ディスパッチで、どの実装にも結びません。
- Rustの `macro_rules!` は、定義したファイルの中でだけ展開を追います。

## テストのつながり

`TESTED_BY` は、テストされる本番シンボルからテストへ向かうエッジです。テストの `CALLS` から作り、呼び出しが解決されると同じ呼び出し先と確度を引き継ぎます。テストされるシンボルがノードでないもの（素の `helper` やパッケージ）は捨てます。アサーションやモックのAPI、外部パッケージへの呼び出しからは作りません。

テストの到達（test reach）は、対象から呼び出し元へさかのぼって最も近いテストを探します。

| 項目 | 内容 |
| --- | --- |
| 0ホップ | `TESTED_BY` か、テスト側の `dagayn: tests` 宣言による直接のテスト |
| nホップ | n段上の呼び出し元のテスト |
| 値の利用 | 値として渡された関数は、渡した先から呼ばれたものとみなす |
| ホップ数の上限 | TypeScript / JavaScriptは8、Rustは上限なし、それ以外は4 |
| Goの除外 | `_examples/` や `testdata/`、別の `go.mod` の下にあるテストと呼び出し元はたどらない |

`query_graph_tool(pattern="tests_for")` の `test_reach` と、`review_tool` の `untested_change` がこの探索を使います。読み方は [レビューと影響分析](/projects/dagayn/review-analysis/) を参照してください。

## CROSS_ARTIFACT

`CROSS_ARTIFACT` は成果物の境界をまたぐ参照です。`extra` に `bridge_kind`、`relationship_role`、`evidence_kind`、`confidence_tier` を持ちます。

### Markdownのコードスパン

Markdownのインラインコードスパンは、後処理でコードのシンボルと照合します。対象は、英数字と `_` のドット区切り識別子です。3文字未満は対象外です。`_` と `.` のどちらも含まないものは、10文字未満なら対象外です。

| Markdown以外のノードとの一致数 | 結果 |
| --- | --- |
| 0 | エッジを捨てる |
| 1 | `CROSS_ARTIFACT` を残す（`MEDIUM`） |
| 2以上 | 曖昧なのでエッジを捨てる |

### directive

`<!-- dagayn: implemented-by path::symbol -->` のようなdirectiveは、作者が宣言した義務です。対象の節やシンボルがまだ無いあいだも `LOW` でグラフに残り、対象ができると元の確度に戻ります。書式は [Markdown連携](#markdown連携) を参照してください。

`query_graph_tool` の `docs_for`（コード → 文書）と `implementations_of`（文書 → 実装）がこの向きをたどります。

### 言語をまたぐ橋

コードやビルド設定に書かれたものと完全に一致したときだけ、言語をまたぐ `CROSS_ARTIFACT`（`HIGH`）を張ります。ネイティブ側の変更が、別言語の呼び出し元まで影響範囲で届きます。

| 橋 | `relationship_role` の例 |
| --- | --- |
| Python ↔ Rust（maturin、PyO3） | `loads_native_module`、`calls_native_function` |
| 共有ライブラリ（`ctypes.CDLL`、`System.loadLibrary` など） | `loads_shared_library` |
| FFI（C# `[DllImport]`、JNI、cgo、cxx、UniFFIなど） | `calls_native_function` など |
| WebAssembly（wasm-bindgen、Go、Emscriptenなど） | `loads_wasm_module`、`calls_wasm_export` |
| Node.jsのネイティブアドオン | `loads_node_addon` |
| マニフェスト（`Cargo.toml`、`pyproject.toml`、OpenAPI生成など） | `builds_from_source`、`builds_artifact`、`generates_code`、`binds_generated_client` |

### Terraformからコードへ

Terraformのリテラルを、moduleの `var.<input>`、`locals`、入れ子のmodule呼び出しへと追います。`filename`、`source_dir`、`handler`、`entry_point`、`data "external"` の `program` / `query` などに届けば、そのコードへの `CROSS_ARTIFACT` を張ります。module経由の橋は `binding: module_input` を持ちます。ディレクトリを指すパスは、その下のインデックス済みコードファイルそれぞれへの橋になります。

### リクエスト境界

Cloudflare Workerでは、HTTPリクエストも呼び出しとして数えます。テスト到達がこの `CALLS` をたどります。

- `cloudflare:test` の `SELF.fetch` を呼ぶテストは、最寄りのwrangler設定の `main` が指すWorkerの `default.fetch` を呼びます。
- Honoのアプリを別ファイルから参照する `app.route(prefix, sub)` などは、アプリを宣言したファイルを呼びます。
- importしたアプリへの `app.fetch(..)` / `app.request(..)` も、そのファイルへの呼び出しになります。

## Markdown連携

Markdownの見出しは `DocSection`、本文は直近の見出しの下の `DocBody` になります。執筆の指針はupstreamの [docs/MARKDOWN-AUTHORING.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/MARKDOWN-AUTHORING.md) にあります。

### 見出しのslug

見出しのslugは、英数字を小文字にし、空白とハイフンを `-` にし、`_` を残し、その他の記号を除いたものです。重複する見出しには `-1`、`-2` を付けます。

### 依存コメント

ある節や文書が別の節や文書に継続的に縛られるときに書きます。

```markdown
<!-- constrained-by ./decisions/adr-001.md#context -->
<!-- blocked-by ./specs/open-issue.md -->
<!-- supersedes ./old-api.md#endpoint-design -->
<!-- derived-from ./research/background.md#findings -->
```

種類は `constrained-by`、`blocked-by`、`supersedes`、`derived-from` の4つです。各コメントは `DEPENDS_ON` エッジになり、`markdown_directive_kind` に種類が入ります。対象が別ファイルなら、ファイル間の `IMPORTS_FROM`（`markdown_import_kind: "directive"`）も作ります。行頭から始まるコメントなら、節の中のどこに置いても数えます。

### dagayn directive

文書と別の成果物の間に、レビューで確かめるべき義務を作るときに書きます。

```markdown
<!-- dagayn: implemented-by dagayn/tools/query.py::query_graph -->
```

実装側から文書を指す向きは、Python、Rust、C#、Terraformのコメントで書けます。

```python
# dagayn: implements docs/auth-spec.md#Token Refresh
```

| directive | `relationship_role` |
| --- | --- |
| `implemented-by` | `implemented_by` |
| `implements` | `implements_contract` |
| `explained-by` | `explained_by` |
| `has-runbook` | `has_runbook` |
| `problem-described-by` | `problem_described_by` |
| `discussed-by` | `discussed_by` |
| `discusses` | `discusses_artifact` |
| `raises-issue-for` | `raises_issue_for` |
| `describes` | `describes_symbol` |
| `tests` | `tests`（テストが対象のコードを宣言する） |

インラインコードやフェンスの中にある依存コメントとdirectiveは例として扱い、エッジを作りません。インデックス対象外のファイル（設定ファイル、URL、リポジトリ外のパス）を指すdirectiveは判定しません。単なる根拠として名前を挙げるだけなら、directiveではなく普通の文で書きます。

### リンク

| 形式 | エッジ |
| --- | --- |
| `[text](./path.md#section)` | ファイルへの `IMPORTS_FROM` と節への `REFERENCES` |
| `[text](#local-section)` | 同じファイルの節への `REFERENCES` |
| `[text](./path.md)` | ファイルへの `IMPORTS_FROM` |

外部URL（`http://`、`https://`、`mailto:`、`tel:`）と `/` で始まるパスは無視します。`importers_of` / `imports_of` に `import_kind="directive"` か `"link"` を渡すと、依存コメントとリンクを分けてたどれます。

## Terraform連携

fork版の `tree-sitter-terraform` で `.tf` / `.tfvars` をパースします。

| kind | 抽出元 |
| --- | --- |
| `REFERENCES` | `var.x`、`local.x`、`module.x`、`data.type.name`、`resource_type.name` などの式 |
| `CALLS` | `merge()`、`length()` などの組み込み関数 |
| `IMPORTS_FROM` | `module` の `source`、`terraform.required_providers` |
| `CONTAINS` | ファイル → block |

Terraformは1ディレクトリの全ファイルを1つのmoduleとして扱います。そのため後処理が、別ファイルで宣言された `var.region` などへの参照を結びます。`module` の `source` がローカルパスなら、影響範囲がmoduleの境界を越えて届きます。

## スキーマ

スキーマのバージョンは20です。仕様はupstreamの [docs/SCHEMA.md](https://github.com/manji-0/dagayn/blob/v11.2.0/docs/SCHEMA.md) にあります。

### nodes

| 列 | 内容 |
| --- | --- |
| `kind`、`name`、`qualified_name` | ノード種別、名前、一意な修飾名 |
| `file_path`、`line_start`、`line_end`、`language` | 位置と言語 |
| `parent_name` | 所属する型やモジュール |
| `params`、`return_type`、`signature` | 引数、宣言された戻り値型、後処理で作るシグネチャ |
| `modifiers` | 宣言の修飾子。Rustでは `pub`、`pub(crate)` などの可視性 |
| `is_test` | テストコードか |
| `file_hash`、`mtime_ns` | 変更検出用 |
| `community_id` | 所属コミュニティ |
| `extra` | 形式ごとのメタデータ（JSON） |

Rustの `modifiers` は宣言された可視性で、到達可能性ではありません。クレートの外から見えるのは `pub` だけで、`pub(crate)` は `pub` に含まれません。

### edges

| 列 | 内容 |
| --- | --- |
| `kind` | エッジkind |
| `source_qualified`、`target_qualified` | 端点の修飾名 |
| `target_name` | 呼び出し先の名前部分（名前での検索用） |
| `file_path`、`line` | エッジが書かれた位置 |
| `confidence`、`confidence_tier` | 確度 |
| `extra` | 解決に使うメタデータ（JSON） |

エッジはnode IDではなく修飾名の文字列で結びます。パーサはnode IDを知らない段階でエッジを出せ、ファイル単位の置き換えが単純になります。

### extraの主なキー

| キー | 意味 |
| --- | --- |
| `external`、`stdlib`、`external_package`、`external_symbol` | パッケージへの呼び出し |
| `receiver_type`、`receiver_unknown`、`receiver_from` | 受け手の型の手がかり |
| `receiver`、`import_path` | パッケージ修飾やモジュールを通した呼び出し |
| `receiver_field`、`receiver_package`、`receiver_concrete` | Goの受け手の手がかり |
| `inferred_from` | 推定の根拠（`observed_method`、`return_table`） |
| `resolved_by` | SCIPで確定したら `"scip"` |
| `import_scope`、`import_kind` | 読み込み時に実行されないimportの印 |
| `bridge_kind`、`relationship_role`、`evidence_kind` | `CROSS_ARTIFACT` の分類 |

ノード側では、`extra.field_types`（構造体のフィールドの型）、`extra.embedded`（Goの埋め込み型）、`extra.variants`（Rustのenum）、`extra.namespaces`（Goのimport path）などを解決に使います。

## 構造メトリクスで数える辺

`architecture_analysis_tool` は宣言されたユニット（Cargo crate、npm package、Go package、Python import package、Terraform module）とその間の依存を扱います。依存と循環には `IMPORTS_FROM`、`DEPENDS_ON`、`INHERITS`、`IMPLEMENTS` を数え、`CALLS` は数えません。コミュニティはLeidenアルゴリズムで分割し、凝集度とともに保存します。指標と読み方は [設計の評価](/projects/dagayn/design-review/) を参照してください。

## 検索

`semantic_search_nodes_tool` は、FTS5の全文検索と埋め込みのベクトル検索を順に走らせ、RRF（k=10）で融合します。埋め込みが無い環境ではFTSだけで動きます。

FTSは問い合わせ全体で1回引き、さらに問い合わせから取り出した識別子（snake_case、PascalCase、camelCase）ごとに引き直します。`"tests for embed_graph"` でも `embed_graph` に直接当たります。日本語は活用形の違いを吸収し、`検索する` で `検索を行う` に当たります。

融合後に次の補正をかけます。

| 補正 | 内容 |
| --- | --- |
| kindのブースト | PascalCaseならクラスや型、snake_caseなら関数、ドット区切りなら修飾名を優先 |
| 文脈ファイル | `context_files` に渡したファイルのノードを1.5倍 |
| 意図による並べ替え | 目的を問う文は `material`、処理を問う文は `narrative` の埋め込みを使う |
| テストの抑制 | テストコードを0.6倍。テストを探す問い合わせでは抑制しない |

応答の `search_mode` は、どちらの経路が結果を返したかを示します。

```text
hybrid → fts_only → embedding_only → keyword_fallback (LIKE)
```

どちらも結果を返さなければ `LIKE` のキーワード検索を走らせ、それも空なら `empty` です。埋め込みの生成と保存は [アーキテクチャ](/projects/dagayn/architecture/#埋め込み) を参照してください。

## 次に読む

差分レビューでの使い方は [レビューと影響分析](/projects/dagayn/review-analysis/) です。インストールとビルドは [使い方](/projects/dagayn/usage/) を参照してください。
