---
title: "CLI リファレンス"
description: "rdra-ish CLI のサブコマンドとフラグ、終了コード、エディタ連携（v3.0.0）"
sidebar:
  order: 5
---

このページは `rdra-ish` の各サブコマンドが何をするかをまとめます。DSLの意味は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。`verify` の判定の意味は [形式検証](/projects/rdra-ish/formal-verification/) へ。原文はupstreamの [docs/cli-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md) です。

```
rdra-ish <COMMAND> <INPUTS...> [OPTIONS]
rdra-ish --version        # or -V
rdra-ish <COMMAND> --help # or -h
```

| コマンド | すること |
|---|---|
| [`check`](#check) | 型チェックと整合性検査をし、ライフサイクルを探索する。ファイルは書かない |
| [`lint`](#lint) | カバレッジとレビュー準備の所見を出す |
| [`next`](#next) | 各BUCのモデリングStageと、次のStageで足すものを出す |
| [`files`](#files) | 入力が読み込む `.rdra` ファイルを出す |
| [`fmt`](#fmt) | `.rdra` を整形する |
| [`diagram`](#diagram) | Mermaid図を書く |
| [`csv`](#csv) | CSVかMarkdownの表を書く |
| [`list`](#list) | モデル要素を表・JSON・CSV・Markdownで出す |
| [`states`](#states) | エンティティごとの到達可能な状態パターンを導出する |
| [`export`](#export) | OpenAPI、AsyncAPI、DBML、SQL、JSON Schema、Mermaid ER、TLA+を書く |
| [`verify`](#verify) | すべての規則と時相性質を、それぞれのconeで検証する |
| [`codegen`](#codegen) | ドメインの型と関数をTypeScript・Rust・Goで出す |

## 共通の約束

### 入力

`<INPUTS...>` は1つ以上のファイルかディレクトリで、省略できません。ディレクトリは再帰的に `.rdra` を探します。ファイルは渡した順に、ディレクトリは各階層を名前順に読むので、読み込み順はどのプラットフォームでも同じです。読み込んだファイルは1つのモデルにマージされます。`import` は入力のレイアウトから導いたinclude pathで解決します。読み込み系のコマンドは [`rdra.toml`](#プロジェクトマニフェスト) も読みます。

### 診断

診断はstderrに出ます。読み込みと整合性の診断は `error: ...` か `warning: ...` です。ライフサイクルの所見は安定した名前を持ち、`error[<Name>]: ...`、`warning[<Name>]: ...`、`info[<Name>]: ...` の形で出ます。名前の一覧はupstreamの [state-derivation.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/state-derivation.md#diagnostics) にあります。ソース位置は解決済みの絶対パスで `file:line:col` と出ます。

`check`、`states`、`verify` は検査の境界を示す `bounds:` 行を出します。`check` と `states` ではstderrの先頭、`verify` ではstdoutです。`check` のstdoutの最終行は判定です。

| 行 | 出る場合 |
|---|---|
| `OK: no errors within <bounds>` | errorがない |
| `OK: no errors in the selected scope, within <bounds>` | `--buc` か `--entity` で絞った範囲にerrorがない |
| `FAIL: <E> errors, <W> warnings within <bounds>` | errorがある。info所見は数えない |
| `FAIL: <E> errors, <W> warnings; the model did not load, so nothing was explored` | 読み込みでerrorになった |

`<bounds>` は `1 instance per entity, Int 0..5` のように読めます。

### 生成系の前提

どの生成系コマンドも、parse errorかresolve errorがあると何も書きません。`fmt` はパースできれば動き、意味解析をしません。`files` と `fmt` は `rdra.toml` を読みません。

## ライフサイクルのerror

到達性の結果を印字する出力は **fail-closed** です。`check` がライフサイクルのerrorを報告している間、その出力は書かれません。それ以外の出力は書かれて終了コード0で終わります。宣言された事実やデータ層だけを読む出力は、ライフサイクルを探索しないので何も言いません。ライフサイクルのerrorは `check` で確かめます。

| 出力 | 読むもの | ライフサイクルのerrorがあるとき |
|---|---|---|
| `list` の全kind | 宣言された事実 | 書く |
| `csv` の全kind | 宣言された事実とデータ層 | 書く |
| `diagram --kind state` | 各状態モデルの初期状態と到達状態 | 止まる。errorがすべてデッドロックなら、デッドロックを色分けして書く |
| `state` 以外の `diagram`（`sequence` を含む） | 宣言された事実 | 書く |
| `export --kind tla` | `--instance-count` / `--int-range-max` で組み立てた遷移系 | noteを付けて書く。遷移系の構築時のerrorでは止まる |
| `tla` 以外の `export` | データ層 | 書く |
| `states` | 導出そのもの | `[error]` 行を含めて表を出し、終了コード1 |

`export --kind tla` のnoteは、error件数と、モデル全体の `.cfg` が規則だけを検査することを伝えます。あわせて、デッドロックとwitnessは隣の `StateModel_` specでTLCにかけられることと、`verify` を案内します。

[`codegen`](#codegen) は `check` がerrorを報告している間は止まります（終了コード1）。`--allow-failing` を渡すと生成します。`verify` は自分の遷移系の構築時のerrorで止まり、それ以外の所見は自分で報告します。

ライフサイクルを探索する生成系（`codegen`、`next`、`diagram --kind state`、`export --kind tla`）は、`check` の既定の上限で探索します。メモリ上限は `[check]` の `memory` です。上限を超えたconeはerror `MemoryCapReached_<E>` になります。このerrorで `codegen` と状態図は止まり、TLA+のexportはnoteの件数に数えます。

## check

モデルの型チェックと整合性検査をし、ライフサイクルを探索します。ファイルは書きません。

```
rdra-ish check <INPUTS...> [--strict] [--deny-deprecated] [--guards] [--code[=fresh|build|run]]
               [--max-patterns <N>] [--max-states <N>] [--memory <SIZE>]
               [--instance-count <N>] [--instances <ENTITY=N>]... [--int-range-max <N>]
               [--buc <ID>]... [--entity <ID>]... [--without-usecase <ID>]...
               [--without-buc <ID>]... [--actor <ID>]...
```

`check` は最初の読み込みerrorで止まります。そうでなければ整合性検査をし、規則とエンティティビューごとに1つのconeでライフサイクルを探索します。検査するのは安全性だけです。規則、`after` アサーション、状態モデルの所見を見ます。`property` は評価しません。それは [`verify`](#verify) の仕事で、モデルに時相性質があると `check` は `note: <n> temporal properties were not model-checked by check; use verify` を出します。

整合性検査が見るもの：

- `requires_permission` に対するアクターの権限の不足と過剰。実行経路から推論する
- APIの呼び出しと、APIのエンティティ操作のギャップ
- システム境界と、システムをまたぐエンティティの連携
- FKとAPIのトランザクション境界
- イベントのつながり。raiseされないイベント、誰も消費しないイベント（`outbox(Event)` で黙る）、どのBUCにも属さない起動されるUC
- ライフサイクルの所見。到達しない値、witnessのない状態、デッドロック、実行されないUC、違反した規則と `after`、空虚に成り立つ規則（`Vacuous_<name>`）、束縛できない条件、上限で止まったcone

### フラグ

| フラグ | 既定 | 意味 |
|---|---|---|
| `--strict` | off | 権限とアクセスのギャップ（`ActorPermissionMissing` など）をerrorにする |
| `--deny-deprecated` | off | 非推奨構文の `DeprecatedSyntax` warningをerrorにする |
| `--guards` | off | errorがなければ、各ガードがどの規則を守っているかを出す（[ガードの依存](#ガードの依存)） |
| `--code[=<LEVEL>]` | off（値なしなら `fresh`） | errorがなければ、`[code]` 表が指すサービスのコードを検査する。値は `=` で書く（[check --code](#check---code)） |
| `--max-patterns <N>` | n = `--instance-count` のとき 2^(10 + 8·(n − 1))（`1024`、`262144` …） | coneごとの、エンティティの異なるパターン数の上限。超えるとerror `PatternCapReached` |
| `--max-states <N>` | なし | 1つのconeの結合状態数の上限。超えるとerror `StateCapReached` |
| `--memory <SIZE>` | `[check]` の `memory`、なければ `4GiB` | 実行が保持してよい量。超えたconeはerror `MemoryCapReached` で止まる |
| `--instance-count <N>` | `1` | エンティティごとのスロット数、`1..=255`。2行で初めて破れる規則は `2` から見える |
| `--instances <ENTITY=N>` | `[check]` の `instances` | 1つのエンティティのスロット数、`1..=255`。繰り返し可 |
| `--int-range-max <N>` | `5` | Intの値域を `0..=N` にする、`1..=255` |
| `--buc`、`--entity`、`--without-usecase`、`--without-buc`、`--actor` | モデル全体 | モデルの一部を検査する。どれも繰り返し可（[部分実行](#部分実行)） |

`--memory` のサイズは整数と2進単位で書きます（`4GiB`、`512MiB`、`64KiB`、`1TiB`）。`G` と `GB` は `GiB` と同じ意味です。単位なしの数、`0`、小数は受け付けません。

終了コードは、errorがなければ0、errorが1つでもあれば1です。

### 所見の出方

違反した規則や `after` アサーションは、最短の反例トレース付きで1回だけ出ます。各ステップはUC名（分割したUCなら `Pay_1, transaction 1 of Pay`）、束縛したインスタンス、位置を示します。その下に `+ E#k`（作成）、`- E#k`（削除）、`now: a -> b`（時計）、`E#k.col: a -> b`（変更）が並びます。

```
error[MultiForbidden_Order_0]: invariant MultiForbidden_Order_0 is violated: ...
  rule: cross_order_payment_split.rdra:44:1
  counterexample (3 steps):
    1. Place [Order#1, Payment#1]                            cross_order_payment_split.rdra:17:1
         + Order#1 (status=pending)
         + Payment#1 (status=pending, owner Order=Order#1)
    2. Pay_1, transaction 1 of Pay [Payment#1]               cross_order_payment_split.rdra:18:1
         Payment#1.status: pending -> captured               cross_order_payment_split.rdra:39:1
    3. Cancel [Order#1]                                      cross_order_payment_split.rdra:19:1
         Order#1.status: pending -> cancelled                cross_order_payment_split.rdra:38:1
```

状態モデルの所見は次の3つです。

| 名前 | 重大度 | 内容 |
|---|---|---|
| `Witness_*` | error | どの到達状態も持たない状態。そこへ入るはずの遷移を並べる |
| `Runs_*` | warning | どの遷移も運ばないUC、または分割したUCの1トランザクション。妨げているもの（`needs:` か `guard:`）だけを示す |
| `Deadlock_*` | error | 出口があるのに、どの経路も出ない状態に留まるインスタンス。出口ごとに妨げているものと、その状態への最短経路を示す |

出口に足りないのが新しい行のスロットだけなら、モデルではなく境界が妨げています。その場合はwarning `deadlock at the bound` になります。上限で止まったconeが決められなかった所見は `not checked:` の下に並びます。これはerrorとwarningのどちらにも数えません。

### check --code

`check --code` は、サービスのコードがモデルの求めるものを持っているかを確かめる実験的な機能です。レベルは `fresh`（生成ファイルが最新か）、`build`（加えてコンパイル）、`run`（加えて適合性テスト）の3つです。モデルが `check` に通らなければ何も検査しません。詳細は [コード生成](/projects/rdra-ish/codegen/) を参照してください。

### 部分実行

`check`、`states`、`verify` は同じスコープ用フラグを受け付けます。どれも繰り返せます。存在しないidはerrorです。

| フラグ | 残すもの | witness、デッドロック、実行されないUCを判定するか |
|---|---|---|
| `--buc <ID>` | そのBUCから届くUC | しない。外したUCが到達させたり解いたりしうるので **not decided** になる |
| `--entity <ID>` | そのエンティティのビュー、そのエンティティを束縛する規則と `after` | 選んだ対象について判定する |
| `--without-usecase <ID>` | そのUC以外。そのUCは実行されないとみなす | その前提で判定する |
| `--without-buc <ID>` | そのBUCだけが届くUC以外 | その前提で判定する |
| `--actor <ID>` | そのアクターが実行するUCと、アクターのいないUC | その前提で判定する |

`--actor` では、ほかのアクターのUCでしか抜けられない状態がデッドロックになります。たとえば `check --actor Staff` は、スタッフ自身のUCでは抜けられない状態を見つけます。

選んだconeが読まないエンティティの構築時のerrorは **deferred** として `not checked:` に並び、実行を失敗させません。`--entity` を渡さなければ、構築時のerrorはすべて実行を失敗させます。stderrでは `bounds:` 行の後に、渡したスコープを示す `scope:` 行が続きます。

### ガードの依存

`check --guards` は、各ガードがどの規則を守っているかを出します。ガードとは、`applies_to` でUCに適用した `holds` 条件と、ある列の `transitions` / `chooses` / `sets` に付いた `.when` 条件です。ガードを1つずつ外してconeを探索し直し、そこで失敗する規則を挙げます。

```
guards: 2 guards: 1 protect a rule, 1 no rule depends on; 2 cones explored again
guard: condition PaidOnly on Ship   unprotected.rdra:28:1
  protects: 「A shipped order was paid」
guard: condition StockChecked on Ship   unprotected.rdra:32:1
  no rule depends on this guard; it is either a business rule nobody wrote as a rule, or not needed
```

どの規則も依存しないガードが誤りとは限りません。規則として書かれていない業務ルールか、不要なガードです。`--guards` は所見を増やさず、終了コードも変えません。

## lint

カバレッジとレビュー準備の所見を、`check` の診断と並べて出します。

```
rdra-ish lint <INPUTS...> [--format table|json|csv|markdown]
```

`--format` の既定は `table` です。`markdown` はCSVと同じ列のMarkdown表です。各行は重大度、ルール、対象のkindとid、メッセージ、ヒントを持ちます。読み込みとモデルのerrorは `semantic-error` 行になります。`semantic-error` 行があれば終了コード1、なければ0で、warningでは失敗しません。

主なルールを挙げます。全ルールはupstreamの [docs/cli-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#lint) にあります。

| ルール | 重大度 | 内容 |
|---|---|---|
| `api-contract-missing` | warning | `method` も `path` もないAPI。OpenAPIのexportから落ちる |
| `api-unused` | warning | どのUCも `invokes` しないAPI |
| `buc-empty` | warning | UCを1つも持たないBUC。skeleton Stageより前なら `info` |
| `comparison-trivial-in-range` | warning | Int / Money / Decimal列とリテラルの比較を、`0..5` のすべての値が満たす（`qty >= 0`） |
| `comparison-unsatisfiable-in-range` | warning | 同じ比較を、`0..5` のどの値も満たさない（`qty > 5`） |
| `condition-applied-without-body` | info | `holds` 本体も `combines` もない条件をUCかAPIに `applies_to` している |
| `deprecated-syntax` | warning | 非推奨構文。`fmt --write` で書き換わる |
| `enum-attribute` | warning | どの `transitions` も `sets` も動かさないインラインの `Enum` 列。`variation` で型付けする |
| `field-column-unwritten` | warning | どの `sets` も `chooses` も埋めない `@null` 列に対応付けたfield |
| `multi-rule-unscoped` | warning | キーで関連するエンティティをまたぐ `forbidden` / `invariant` / `property` に、`.along(...)` も `.global()` もない。メッセージは最短のキー経路の `.along(...)` を示す |
| `orphan-node` | warning | どの述語ともつながらない要素 |
| `query-index-missing` | warning | どのインデックスも支えない検索。`rows` が10000未満なら出さない |
| `rdra-*` | warning | RDRAシートの不整合列。どのBUCからも届かない要素などを示す |
| `requirement-untraced` | warning | どのBUCも `motivates` しない要求 |
| `rule-unlabeled` | info | `.label("...")` のない規則 |
| `stage-readiness` | info | 各BUCのStageと次のStage。[`next`](#next) と同じ判定 |
| `triggered-usecase-unguarded` | info | イベントかタイマーだけが起動し、書き込むのに、ガードも `transitions` の遷移元もないUC |
| `coverage-score` | info | 0から100の準備度。空のモデルは `0` |

## next

各BUCが [段階的モデリング](/projects/rdra-ish/incremental-modeling/) のどのStageにいるかと、次のStageで何が要るかを出します。

```
rdra-ish next <INPUTS...> [--buc <ID>]... [--format text|json]
```

| フラグ | 既定 | 意味 |
|---|---|---|
| `--buc <ID>` | すべてのBUC | 指定したBUCだけを出す。繰り返し可。存在しないidはerror |
| `--format` | `text` | `text` か `json` |

Stageごとに条件の集まり（gate）があります。必須の条件が満たされなければギャップで、Stageは **open** です。助言の条件が満たされなければレビュー注記になり、BUCを止めません。条件を満たしても、そのStageに `check` のerror（`Witness_`、`Deadlock_`、違反した規則）があれば **blocked** です。どちらでもなければ **met** です。BUCは、必須のStage 0〜6のうちmetが続く最後のStageにいます。規則のStage 7A〜7Cは任意です。

テキスト出力は、BUCごとに各Stageの判定（`[x]` met、`[ ]` open、`[!]` blocked）を並べます。続いて最初の未達のStageについて、問い、`Gaps:`、`Notes:`、`Findings:`、`Ask:`、レビュー用のコマンドを出します。JSON出力は `{"bucs": [...], "unowned_findings": [...]}` で、各Stageは安定したidの `slug` を持ちます。

終了コードはどのStageでも0です。モデルに読み込みかモデルのerrorがあれば1です。`next` は `check` と同じようにライフサイクルを探索するので、同じだけ時間がかかります。

## files

入力が読み込む `.rdra` ファイルを、読み込み順に1行ずつ出します。

```
rdra-ish files <INPUTS...>
```

入力に `.rdra` が1つもなければ終了コード1です。

## fmt

`.rdra` ファイルを整形します。

```
rdra-ish fmt <INPUTS...> [--write | --check]
```

| フラグ | 意味 |
|---|---|
| `--write` | ファイルをその場で書き換える |
| `--check` | 何も変えない。差があるファイルごとに `needs formatting:` 行を出し、終了コード1 |

フラグなしでは整形結果をstdoutに出し、ファイルは変えません。parse errorか、`--check` で差があると終了コード1です。

`fmt` はパースしたファイルを出力し直します。モデルの意味は変えず、2回目の実行では何も変わりません。非推奨構文は現在の形で出るので、`fmt --write` で移行できます。削除された構文はparse errorです。コメントは元の行の末尾か、次の行の上に残ります。

## diagram

RDRAの図を1つ、Mermaidテキスト（`.mmd`）で書きます。

```
rdra-ish diagram <INPUTS...> [--kind <KIND>] [--buc <ID>]... [--usecase <ID>]... [--entity <ID>]...
                 [--actor <ID>]... [--node-kind <KIND>]... [--edge-kind <KIND>]...
                 [--title] [--legend] [--format mermaid] [-o <OUT>]
rdra-ish diagram <INPUTS...> --all [--title] [--legend] -o <DIR>
```

出力は、人間やツールが読み戻せる形です。`%%` のヘッダー、どの図でも同じ `<kind>__<DSL id>` のノードid、kindごとの `:::<kind>` タグと形、RDRAのレイヤー名を持ちます。この符号化はupstreamの [Encoding contract](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#encoding-contract) が定めます。

### フラグ

| フラグ | 既定 | 意味 |
|---|---|---|
| `--kind <KIND>` | `rdra` | 図の種類（[図の種類](#図の種類)） |
| `--buc <ID>` | モデル全体 | 指定したBUCから届くものを描く。繰り返し可。全kindで使える |
| `--usecase <ID>` | モデル全体 | 指定したUCを描く。`usecase`、`robustness`、`sequence`（1つだけか `--buc`） |
| `--entity <ID>` | モデル全体 | `state` はそのエンティティの状態モデル。`er` と `information` はそのエンティティと `relate` 先。`usecase` と `robustness` はそれを読み書きするUC |
| `--actor <ID>` | モデル全体 | そのアクターが実行するUC。`usecase` と `robustness` |
| `--node-kind <KIND>` | すべて | `rdra` だけ。描くノードのkindを絞る。別名 `--kind-filter` |
| `--edge-kind <KIND>` | すべて | `rdra` だけ。描く関係を絞る。別名 `--edge-filter` |
| `--all` | off | `-o` のディレクトリにレビュー用の図一式を書く。スコープ指定や `--node-kind` / `--edge-kind` とは併用できない |
| `--title` | off | RDRAの図名とスコープのラベルでMermaidのtitleを付ける |
| `--legend` | off | `flowchart` に `凡例` のsubgraphを足す |
| `--format` | `mermaid` | 唯一の形式。画像は `mmdc` などで描く |
| `-o`, `--out <OUT>` | stdout | 出力ファイル。拡張子は常に `.mmd`。`--all` ではディレクトリ |

`--usecase`、`--entity`、`--actor`、`--buc` は、表で組み合わせを示した場合を除き1種類ずつ使います。存在しないidはerrorです。削除された値（`--kind event-flow` や `--format svg` など）は終了コード2で、置き換え先を示します。

図が大きすぎてMermaidの既定の上限（50000文字、500辺）を超えると、warningを出したうえで書きます。描くものがなければ `note: nothing to draw: ...` を出し、ヘッダーだけを書きます。終了コードは、書けば0、読み込みerror・存在しないid・止まった状態図なら1です。

### 図の種類

| kind | RDRAの図 | 描くもの |
|---|---|---|
| `rdra` | RDRAGraph | すべての要素とすべての関係をレイヤーごとに |
| `context` | システムコンテキスト | アクターと外部システムからシステムへの辺。ラベルはBUCや交換するイベント |
| `requirement` | 要求モデル | ゴール、それを達成する要求、要求が `motivates` するBUC |
| `business` | 業務の流れ図 | 業務ごとのBUCと、イベントによるBUC間の受け渡し |
| `usecase` | UC複合図 | UCとアクター、画面、読み書きするエンティティ、イベント、条件、遷移 |
| `robustness` | ロバストネス図 | アクター、バウンダリ、コントロール、エンティティ |
| `sequence` | シーケンス図 | 1つのUCを順に。ガード、書き込み、raiseするイベント |
| `flow` | 業務フロー | フローのステップとその順序、アクターごとのレーン |
| `screen` | 画面遷移図 | 画面と `navigates`。宣言がなければ業務上の順番を破線で |
| `information` | 情報モデル | エンティティと `relate`、状態モデル、列のバリエーション |
| `condition` | バリエーション・条件 | 条件、組み合わせるバリエーションと状態モデル、適用先 |
| `state` | 状態モデル | スコープなしでは状態モデルの索引。`--entity` か `--buc` で、ライフサイクル検査で色分けした状態モデル |
| `event` | システム間連携（イベント） | UC、BUC、外部システム、イベント、タイマーの間の `raises` と `triggers` |
| `er` | 論理データモデル | 列と `relate` の多重度を持つ `erDiagram` |

ライフサイクルを読むのは `state` だけです。ほかのkindは宣言された事実を描きます。

### レビュー用の一式

`--all -o <dir>` は図を1つずつファイルに書きます。

- モデル全体で読める図は `<kind>.mmd`。`context`、`requirement`、`business`、`information`、`condition`、`er`、`screen`、`event`、`state`（索引）
- BUCごとの図は `<kind>__<BucId>.mmd`。`usecase`、`robustness`、`flow`、`sequence`
- 状態モデルを持つエンティティごとに `state__<EntityId>.mmd`

描くもののない図は省かれ、最後の行がその数を示します（`wrote 58 diagrams to docs/diagrams (1 with nothing to draw left out)`）。ライフサイクルのerrorがあれば、`state` の図はnote付きで省かれます。

```bash
rdra-ish diagram samples/ec-site --kind usecase --buc BucOrder
rdra-ish diagram samples/clinic-ops --all --out diagrams
```

## csv

表を1つ、CSVかMarkdownでファイルに書きます。

```
rdra-ish csv <INPUTS...> [--kind <KIND>] [--format csv|markdown] [-o <OUT>]
```

| フラグ | 既定 | 意味 |
|---|---|---|
| `--kind <KIND>` | `entity` | 表の種類 |
| `--format` | `csv` | `markdown` はMarkdown表で書く |
| `-o`, `--out <OUT>` | `out` | 拡張子があればそのまま使う。なければ `.<kind>.csv`（または `.<kind>.md`）を付ける |

| kind | 行 |
|---|---|
| `actor` | アクター |
| `entity` | 各エンティティの列。型、キー、インデックス、check、マーカー |
| `matrix` | UC × エンティティのCRUD |
| `api` | APIの契約 |
| `api-matrix` | API × エンティティのCRUD |
| `screen-constraints` | 画面 × UC / APIの権限と媒体の経路 |
| `permission-callables` | 権限ごとに、それを要求するUCとAPI |
| `actor-permission-audit` | アクター × 権限の `missing` と `excess` |
| `business-inputs`（別名 `actor-inputs`） | アクター × 推論した入力field × UC |

stdoutには行を出さず、`wrote <path>` を出します。終了コードは書けば0、読み込みerrorなら1です。

## list

モデル要素をstdoutに出します。

```
rdra-ish list <INPUTS...> [--kind <KIND>] [--format table|json|csv|markdown]
```

`--kind` の既定は `actor`、`--format` の既定は `table` です。kindは次のとおりです。

| 分類 | kind |
|---|---|
| 要求と業務 | `goal`、`requirement`、`nfr`、`constraint`、`quality`、`adr`、`adr-impact`、`buc`、`flow`、`step` |
| アクターと画面 | `actor`、`screen`、`field`、`event`、`timer`、`buc-roles` |
| UCとシステム | `usecase`、`system`、`api`、`dto` |
| データと規則 | `entity`、`variation`、`condition`、`rule`、`transition` |
| 権限と入力 | `permission-callables`、`actor-permission-audit`、`business-inputs`（別名 `actor-inputs`） |
| 公開 | `surface` |

- `rule` は規則と条件を `kind,label,entities,rule,applies_to,site` の列で並べます。
- `transition` は `diagram --kind state` の元になる表で、描く遷移ごとに1行です。
- `buc-roles` はアクターと外部システムを行に、BUCを列にした表です。セルは `担当`、`イベント送信`、`イベント受信` です。
- `surface` は他のモデルへ公開する要素（`exposes` と `shares`）を固定の書式で出します。消費側のlockがこのテキストを記録します。`--format` はほかの値を受け付けません。

結果が空なら、`table` はそう書き（`No APIs found.`）、CSVはヘッダーだけ、JSONは `[]` を出します。終了コードは0です。読み込みerrorなら1、使い方の誤りなら2です。

## states

各エンティティの到達可能な状態パターンを、BUCをまたいで導出します。

```
rdra-ish states <INPUTS...> [--format table|csv|json]
                [--max-patterns <N>] [--max-states <N>] [--memory <SIZE>]
                [--instance-count <N>] [--instances <ENTITY=N>]... [--int-range-max <N>]
                [--buc <ID>]... [--entity <ID>]... [--without-usecase <ID>]...
                [--without-buc <ID>]... [--actor <ID>]...
```

`--format` は `table`、`csv`、`json` です。それ以外のフラグの既定と意味は `check` と同じです。スコープ用フラグは [部分実行](#部分実行) を参照してください。上限を超えたビューは `truncated` になり、`PatternCapReached` か `StateCapReached` がerrorになります。

表では各エンティティが `axes:` 行で始まり、軸ごとの値域を示します。`--format json` では各パターンが `witness`（最初の状態への最短経路）を持ちます。stderrには `bounds:` 行、エンティティを名指さない診断、`not checked:` のブロックが出ます。

終了コードはどの形式でも、error所見があれば1（表は出る）、なければ0です。v3.0.0で `--format typescript` は削除されました。指定すると終了コード2で、[`codegen --lang ts`](#codegen) を案内します。

## export

機械可読の成果物を1つ書きます。

```
rdra-ish export <INPUTS...> [--kind <KIND>] [-o <OUT>] [--dialect postgres|sqlite]
                [--instance-count <N>] [--instances <ENTITY=N>]... [--int-range-max <N>]
```

| フラグ | 既定 | 意味 |
|---|---|---|
| `--kind <KIND>` | `openapi` | `openapi`、`asyncapi`、`dbml`、`sql`、`json-schema`、`mermaid-er`、`tla` |
| `-o`, `--out <OUT>` | `out` | 出力先 |
| `--dialect` | `postgres` | `sql` だけ。`postgres` か `sqlite` |
| `--instance-count <N>` | `2` | `tla` だけ。エンティティごとのスロット数、`1..=255`。`1` はwarning |
| `--instances <ENTITY=N>` | `[verify]` の `instances` | `tla` だけ。1つのエンティティのスロット数。繰り返し可 |
| `--int-range-max <N>` | `5` | `tla` だけ。`IntRange == 0..N`、`1..=255` |

| kind | 書くもの |
|---|---|
| `openapi` | OpenAPI 3.0のJSON。`method` と `path` を両方持つAPIだけがoperationになる。DTOは `components.schemas` |
| `asyncapi` | AsyncAPI 3.1。イベントごとにchannelとmessage。`raises` と `outbox` は `send`、`triggers` は `receive` |
| `dbml` | エンティティごとのテーブル、Enum型、インデックス、unique、キーごとの `Ref` |
| `sql` | SQLのDDL（[SQL](#sql)） |
| `json-schema` | Draft 2020-12の定義。`$defs` の下に `Dto.<id>` と `Entity.<id>` |
| `mermaid-er` | `diagram --kind er` と同じテキスト（ヘッダーの `model=` なし） |
| `tla` | ライフサイクルと規則のTLA+モジュールとTLCの設定 |

拡張子のないパスには、kindごとの接尾辞が付きます（`out.openapi.json`、`out.schema.sql` など）。`tla` では `.tla` で終わるパスがモジュール名になり、隣に `.cfg` が書かれます。それ以外のパスはディレクトリとして扱い、`RdraSpec.tla` と `RdraSpec.cfg` を書きます。その隣に、状態モデルを持つエンティティのconeごとに `StateModel_<E>.tla`、`StateModel_<E>.cfg`、`StateModel_<E>_witnesses.cfg` を書きます。これらでデッドロックとwitnessをTLCだけで検査できます（[形式検証](/projects/rdra-ish/formal-verification/)）。

```bash
rdra-ish export src/ --kind openapi -o out/api
rdra-ish export src/ --kind sql --dialect sqlite -o out/schema.sql
rdra-ish export src/ --kind tla -o /tmp/rdra-tla
```

削除されたkindは終了コード2で、置き換え先を示します。`plantuml-er` は `mermaid-er` へ、`typescript-states` は `codegen <INPUTS> --lang ts -o <FILE>.ts` へ移りました。終了コードは書けば0、読み込みerrorか止まった `tla` なら1です。

### SQL

`export --kind sql` は、空のデータベースにデータモデルを作るスクリプトを1つ書きます。エンティティごとの `CREATE TABLE`、インデックス、（PostgreSQLでは）外部キーの順です。どのサンプルのスクリプトもSQLiteとPostgreSQL 16に読み込めます。

| モデル | PostgreSQL | SQLite |
|---|---|---|
| `Int` | `INTEGER` | `INTEGER` |
| `String` / `String(n)` | `TEXT` / `VARCHAR(n)` | `TEXT` / `VARCHAR(n)` |
| `Money`、`Decimal` / `(p, s)` 付き | `NUMERIC` / `NUMERIC(p, s)` | `NUMERIC` / `NUMERIC(p, s)` |
| `DateTime` / `DateTime(local)` | `TIMESTAMPTZ` / `TIMESTAMP` | `TEXT`（ISO 8601） |
| `Date` | `DATE` | `TEXT`（ISO 8601） |
| `Bool` | `BOOLEAN` | `BOOLEAN` |
| `Enum(...)` | `CREATE TYPE ... AS ENUM` | `TEXT` と `CHECK (... IN (...))` |
| variation | `CREATE TYPE ... AS ENUM` | `Enum` と同じ |

- `@pk` は `PRIMARY KEY`、`@unique` と1:1のキーは `UNIQUE`、`relate` のキーは `FOREIGN KEY` になります。
- `@soft_delete` 列があれば、uniqueの組は生きている行の中だけで成り立つ部分インデックスになります。
- エンティティ単独の規則は `CHECK` になり、名前は `check` の名前（`Forbidden_<E>_<n>` など）です。null許容列の比較は、nullの場合を明示して書きます。
- 複数エンティティの規則、`.has` / `.none`、最小多重度、`.when(Condition)` 付きの規則、`now` を読む規則には `CHECK` を付けません。末尾のコメントに、アプリケーションかトリガーの責務として並べます。
- 末尾には、検索が求めるのに存在しないインデックスと、宣言した読み取りの `SELECT` をコメントで出します。

## verify

各invariant、`after` アサーション、時相性質を、それぞれのconeでネイティブの検査器により検査します。`--with-tlc` を渡さない限りJVMは起動しません。何をどう判定するかは [形式検証](/projects/rdra-ish/formal-verification/) を参照してください。

```
rdra-ish verify <INPUTS...> [--with-tlc [--tlc-jar <PATH>]] [-o <DIR>]
                [--instance-count <N>] [--instances <ENTITY=N>]... [--int-range-max <N>]
                [--max-states <N>] [--max-patterns <N>] [--memory <SIZE>] [--symmetry never|always]
                [--temporal-budget <SECS>] [--deny-undecided]
                [--prove [--deny-unproved] [--z3 <PATH>]]
                [--buc <ID>]... [--entity <ID>]... [--without-usecase <ID>]...
                [--without-buc <ID>]... [--actor <ID>]...
```

### フラグ

| フラグ | 既定 | 意味 |
|---|---|---|
| `--with-tlc` | off | すべてのconeと性質の実行でTLCも動かす。2つのエンジンの判定が違えば終了コード1。TLCが必要 |
| `--backend tlc` | なし | `--with-tlc` の非推奨の書き方。warningを出す。次のメジャーリリースで削除 |
| `-o`, `--out <DIR>` | なし（`--with-tlc` では一時ディレクトリ） | TLCを手で動かすためのspecを書く。ネイティブの検査器はこれを読まない |
| `--instance-count <N>` | `2` | エンティティごとのスロット数、`1..=255`。`1` はwarning |
| `--instances <ENTITY=N>` | `[verify]` の `instances` | 1つのエンティティのスロット数。繰り返し可 |
| `--int-range-max <N>` | `5` | `IntRange == 0..N`、`1..=255` |
| `--max-states <N>` | なし | すべてのBFS実行の状態数の上限。超えた実行は `not decided` |
| `--max-patterns <N>` | `256` | スクリプト互換のために受け付ける。`verify` では何も止めない |
| `--memory <SIZE>` | `[verify]` の `memory`、なければ `16GiB` | BFSが使える量。`--with-tlc` ではその半分をBFS、残りをTLCが使う |
| `--symmetry` | `[verify]` の `symmetry`、なければ `never` | 実験的。`always` はインスタンスの対称性でまとめて探索する |
| `--temporal-budget <SECS>` | `300` | coneで決まらない性質に、モデル全体の実行が使える秒数 |
| `--deny-undecided` | off | 決まらなかった所見があれば終了コード1。`--buc` / `--entity` で外したものは数えない |
| `--prove` | off | 実験的。各状態規則が任意の行数と任意の非負Intで成り立つことをz3で証明する。z3が必要 |
| `--deny-unproved` | off | `--prove` と併用。証明できない規則があれば終了コード1 |
| `--z3 <PATH>` | `RDRA_Z3`、なければ `PATH` の `z3` | `--prove` が使うz3 |
| `--tlc-jar <PATH>` | `RDRA_TLC_JAR` | `--with-tlc` と併用。`tla2tools.jar` を `java -cp` で動かす |
| `--buc`、`--entity`、`--without-usecase`、`--without-buc`、`--actor` | モデル全体 | [部分実行](#部分実行) と同じ。スコープを絞った実行は性質を検査しない |

`--with-tlc` ではTLCを `--tlc-jar`、`RDRA_TLC_JAR`、`PATH` の `tlc` / `tlc2` の順に探します。見つからなければ終了コード1です。Nixでインストールすると `tlc` と `z3` も入ります（[使い方](/projects/rdra-ish/usage/)）。

`--memory` の上限は、v3.0.0ではプロセス全体の使用量をまだ縛りません。数えるのは状態ストアの保持量で、プロセスはそれを超えることがあります。coneが上限で止まるときは、使えるメモリの半分ほどを指定してください。

### 出力

stdoutは境界（`bounds: 2 instances per entity, Int 0..5 (TLA+ InstanceCount=2, IntRange=0..5); ...`）、coneの数、各実行の結果を出します。違反は `check` と同じ書式で、最初に破ったconeの最短トレース付きで1回だけ出ます。

```
Cone_MultiForbidden_Order_0 [MultiForbidden_Order_0]: counterexample (31 states)
error[MultiForbidden_Order_0]: invariant MultiForbidden_Order_0 is violated: ...
result: counterexample
Error: verification failed: 1 invariant or after-assert violation(s)
```

エンティティのconeの集計は `state models (BFS on 2 entity cones): 2 state models, 5 states witnessed, 0 deadlocks, 0 use cases that never run` のように出ます。`--prove` では規則ごとに `proved:`、`unproved:`、`out of scope:` のどれかの行が出ます。`--with-tlc` では各TLC実行の `tlc:` 行が加わり、`result:` の後に `tlc_result: ok|counterexample|tool_error` が続きます。

### result 行

検査まで進んだ実行は、必ず `result:` 行を出します。`ok` はstdoutに、それ以外はstderrに出ます。スクリプトはこの行だけを読めば失敗を見落としません。

| result | 意味 | 終了コード |
|---|---|---|
| `ok` | すべての検査が成り立ち、決まらないものがない | 0 |
| `not decided` | 失敗はないが、上限・予算・`--deny-unproved` で決まらないものが残った | 0。`--deny-undecided` か `--deny-unproved` では1 |
| `counterexample` | 検査か性質が破れた。または状態モデルの所見（デッドロック、witnessのない状態、`can_reach` のerror）で失敗した | 1 |
| `tool_error` | ネイティブの反例が自己検査に失敗した、エンジンの判定が食い違った、またはTLCの実行がモデルの違反なしに失敗した | 1 |

使い方の誤りは終了コード2です。

```bash
rdra-ish verify src/
rdra-ish verify src/ --instance-count 3 --memory 8GiB --deny-undecided
rdra-ish verify src/ --with-tlc -o /tmp/rdra-tla
rdra-ish verify src/ --prove --entity Order
```

## codegen

モデルのドメインの型と関数を、TypeScript・Rust・Goで出します。エージェントがその先を書き上げる前提の出力です（`rdra-ish codegen <INPUTS...> --lang ts|rust|go [-o <FILE>]`）。`codegen` はまず `check` を走らせ、errorがあれば止まります。`--format json` は契約をデータで出します。`--code` は `rdra.toml` の `[code]` 表が指すファイルを書きます。互換性の対象は `--lang ts` が出すTypeScriptの型だけで、ほかは実験的です。フラグと出力の詳細は [コード生成](/projects/rdra-ish/codegen/) を参照してください。

## プロジェクトマニフェスト

モデルのルートに `rdra.toml` を置けます。`files` と `fmt` 以外の読み込み系コマンドが読みます。

```toml
[model]
name = "shop"                       # required

[dependencies]                      # parsed, not used yet; free-form
auth = { path = "../auth-model" }

[check]                             # check, states; memory also for the generators
memory = "4GiB"
instances = { Loan = 4 }

[verify]                            # verify and export --kind tla
memory = "16GiB"
instances = { Loan = 4 }
symmetry = "always"
```

| 表 | キー | 意味 |
|---|---|---|
| `[model]` | `name` | モデル名。必須 |
| `[dependencies]` | 任意 | 読み込むが、まだ使わない |
| `[check]`、`[verify]` | `memory` | そのコマンドのメモリ上限 |
| `[check]`、`[verify]` | `instances` | エンティティごとのスロット数、`1..=255` |
| `[verify]` | `symmetry` | `never` か `always` |
| `[code]` | `obligations`、`rust`、`go`、`ts` | `codegen --code` と `check --code` が使う（[コード生成](/projects/rdra-ish/codegen/)） |

フラグは対応するキーより優先します。`--instances` は表の同じエンティティの値だけを置き換えます。

v3.0.0から、未知の表やキーはerrorです。たとえば `[verfiy]` の綴り誤りで読み込み系コマンドは終了コード1になり、`rdra.toml` と行番号を示します。自由形式なのは `[dependencies]` だけです。`[model] name` の欠落、サイズとして読めない `memory`、`1..=255` 外の `instances` も同じく終了コード1です。

```
Error: /work/shop/rdra.toml:3: unknown field `verfiy`, expected one of `model`, `dependencies`, `check`, `verify`, `code`
```

`rdra.toml` は入力のディレクトリから親へ向かって探します。`.git` を持つディレクトリかファイルシステムのルートで探索をやめるので、リポジトリより上の `rdra.toml` は効きません。入力が複数なら全部のマニフェストを読み、すべて正しければ最初の入力のものを使います。

## 環境変数

| 変数 | 読むコマンド | 効果 |
|---|---|---|
| `RDRA_JOBS` | `check`、`states`、`verify`、生成系 | 同時に探索するconeの数など。`1` ですべて1スレッドで順に動く。出力は変わらない |
| `RDRA_TLC_JAR` | `verify --with-tlc` | `--tlc-jar` を省いたときの `tla2tools.jar` |
| `RDRA_TLC_HEAP` | `verify --with-tlc` | 各TLCのJVMのヒープ（`4g` など） |
| `RDRA_Z3` | `verify --prove` | `--z3` を省いたときのz3 |

## 終了コード

| コード | 意味 |
|---|---|
| `0` | 成功。warningとinfoの所見では変わらない |
| `1` | 失敗。読み込みerror、error所見、止まった出力、`--check` の差分、不正な `rdra.toml`、必要なツールが動かない |
| `2` | 使い方の誤り。未知のフラグ、不正な値、削除された値（メッセージが置き換え先を示す）、併用できないフラグ |

## 互換性

rdra-ishはセマンティックバージョニングに従います。次のものはメジャーリリースでしか壊れません。詳細はupstreamの [compatibility.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/compatibility.md) にあります。

- サブコマンドとフラグの名前、意味、受け付ける値（各 `--kind` と `--format`）
- 終了コード
- `lint`、`next`、`list`、`states` の `--format json` のキーと、`lint`、`list`、`states`、`csv` の `--format csv` の列。リリースで追加はあるが、改名・削除・並べ替えはしない
- `bounds:`、`result:`、`tlc_result:` 行の形
- 診断名とlintのルールid
- Mermaid図の符号化

対象外なのは、メッセージの文言、状態数と実行時間、どの反例が出るか、図のレイアウトです。`codegen` のTypeScriptの型以外、`check --code`、`verify --prove`、`verify --symmetry` も対象外の実験的な機能です。リリースをまたいで結果を再現したいときは、既定値に頼らず `--instance-count`、`--int-range-max`、`--max-patterns`、`--max-states` をフラグで渡してください。

## VS CodeとLSP

`rdra-ish-lsp` は言語サーバーです。upstreamの [`editors/vscode`](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/editors/vscode) にVS Code拡張があります。

| 機能 | 内容 |
|---|---|
| 診断 | `check` と同じ診断 |
| 定義・参照・リネーム | シンボル間の移動と一括リネーム |
| 補完、ホバー、シグネチャヘルプ | 述語、kind、参照の補完と情報表示 |
| シンボル | ドキュメントとワークスペースのシンボル |
| フォーマット | `fmt` と同じ整形 |
| セマンティックトークン | kind別の色分け |
| コードアクション、コードレンズ、インレイヒント | 修正の提案と関係の表示 |
| リンク編集、折りたたみ | 対応する箇所の同時編集と折りたたみ |

- ワークスペースはCLIと同じように読みます。ワークスペースのルート以下のすべての `.rdra` と開いているバッファが対象です。
- `rdra.toml` が不正なら診断を消し、メッセージでerrorを示します。サーバーは動き続けます。
- `codegen` とビルドは実行しません。`[code]` のファイルが古いときは、`rdra.toml` の表の行にinformationの診断を出します。

### セットアップ

1. `rdra-ish-lsp` をインストールします。NixかCargoで入ります（[使い方](/projects/rdra-ish/usage/)）。PyPIのパッケージとGitHub Releaseのバイナリには含まれません。
2. `editors/vscode` で `npm run package` を実行してVSIXを作り、VS Codeにインストールします。
3. 拡張は `PATH` の `rdra-ish-lsp` を使います。別の場所に置いたときは `rdra-ish.languageServerPath` で指定します。

```json
{
  "rdra-ish.languageServerPath": "/path/to/rdra-ish-lsp",
  "rdra-ish.trace.server": "off"
}
```

拡張は `.rdra` に対して、保存時のフォーマット、セマンティックハイライト、インレイヒントを既定で有効にします。`rdra-ish.trace.server` を `messages` か `verbose` にすると、LSPの通信を記録します。

## 次に読む

- [使い方](/projects/rdra-ish/usage/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [コード生成](/projects/rdra-ish/codegen/)
