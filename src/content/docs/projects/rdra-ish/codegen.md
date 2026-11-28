---
title: "コード生成"
description: "rdra-ish の codegen と check --code（main 169cdf3）: モデルからTypeScript・Rust・Goのドメインコードを生成し、サービスのコードをモデルに照らして検査する"
sidebar:
  order: 4.6
---

このページは、`rdra-ish codegen` が生成するドメインコードと、サービスのコードをモデルに照らす `rdra-ish check --code` を説明します。生成先はTypeScript・Rust・Goの3言語です。

対象：main `169cdf3`（v3.0.0以降の未リリース版）

upstreamでは、生成物の中身と保証を [codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/codegen.md) がまとめています。フラグと検出名の完全な一覧は [cli-reference.md の codegen](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#codegen) に、設計は [algebraic-codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/algebraic-codegen.md) にあります。

## 位置づけ

モデルはすでにドメインの形を述べています。`variation` は値の集合、`entity` はレコード、`transitions` は状態の移り方、ルールは起きてはならない組み合わせです。`codegen` はこれを代数的なドメイン型と関数としてコードに写します。

生成物は、エージェントが仕上げる前提のコードです。永続化やモデルが抽象のまま残す値、配線はエージェントの仕事であり、rdra-ishは書きません。生成物は `check` と `verify` が検証した内容に沿い、そのままビルドできます。

生成コードの形はKamaeの原則に従います。

| 言語 | 従う指針 |
|---|---|
| TypeScript | [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) |
| Rust | [kamae-rs](/projects/kamae-rs/) |
| Go | 同じ原則を標準ライブラリだけで写したもの |

どの言語でも外部ライブラリを使いません。`Result` 型や境界のパーサーも生成物の中に含まれます。例外はRustの `serde = true` で、このときクレートに `serde` が要ります（後述）。

## コマンド

```bash
# Print the domain module to stdout, or write it with -o
rdra-ish codegen model/ --lang ts -o src/domain.ts
rdra-ish codegen model/ --lang rust -o src/domain.rs
rdra-ish codegen model/ --lang go -o domain/domain.go --package domain

# Also print the conformance port and harness, and write the traces
rdra-ish codegen model/ --lang rust -o src/domain.rs --conformance tests/traces.txt

# Print the model adapter in place of the domain code (experimental)
rdra-ish codegen model/ --lang go --conformance svc/traces.txt --adapter

# Also write a Verus crate (experimental, Rust only)
rdra-ish codegen model/ --lang rust -o src/domain.rs --verus verus/

# Compare a generated file with what the model generates now
rdra-ish codegen model/ --lang ts --check src/domain.ts

# Write every file the [code.<lang>] tables of rdra.toml name
rdra-ish codegen model/ --code
```

| フラグ | 意味 |
|---|---|
| `--lang ts\|rust\|go` | 生成する言語です（`typescript` も可）。`--format json` と `--code` と `--probe` 以外では必須です。 |
| `-o`, `--out <FILE>` | 出力先のファイルです。省略すると標準出力に書きます。 |
| `--package <NAME>` | Goのパッケージ名です。既定は `domain` です。 |
| `--conformance <FILE>` | 適合ポートとハーネスも出力し、トレースを `FILE` に書きます。 |
| `--conformance-states <N>` | トレースのもとになるBFSが探索する状態数の上限です。既定は `65536` です。書き終えると、トレースが何を覆うかを標準エラーに出します。 |
| `--adapter` | 実験的です。`--conformance` と一緒にだけ使えます。ドメインコードの代わりにモデルアダプタを出力します。 |
| `--verus <DIR>` | 実験的です。`--lang rust` だけで使えます。通常の出力に加えて、`DIR` にVerusのクレートを書きます。 |
| `--seal` | TypeScriptだけで使えます。状態型をモジュール外のオブジェクトリテラルで作れなくします。 |
| `--check <FILE>` | 生成し直して `FILE` と比べます。`-o` とは併用できません。 |
| `--allow-failing` | `check` が失敗するモデルでも生成します。 |
| `--format json` | 実験的です。生成のもとになる契約をJSONで出力します。 |
| `--code` | `rdra.toml` の `[code.<lang>]` 表が指すファイルをすべて書きます。他のフラグとは併用できません。 |
| `--probe` | 表が指すプローブだけを書きます。 |

`--adapter` は `--code`・`--probe`・`--seal`・`--verus` と併用できません。`--verus` は `--code`・`--probe`・`--check`・`--conformance` と併用できません。

終了コードは、書き出しか一致で `0` です。`check` の失敗や名前の衝突、`--check` の差分は `1` になります。使い方の誤りは `2` です。

`codegen` は最初に `check` を走らせ、その境界をヘッダに書きます。生成物はすべて `check` が検証したルールの上に成り立ちます。

## 生成されるもの

出力は1つのコンパイル単位です。TypeScriptのモジュール、Rustのモジュールファイル、Goのファイルのいずれかになります。冒頭のヘッダには、`check` が通った境界、義務、関数ができなかったユースケースとその理由、候補ルールが並びます。

| 部分 | TypeScript | Rust | Go |
|---|---|---|---|
| 状態型 | `kind` で区別する `Readonly` 型のunion | 非公開フィールドの構造体を持つenumと `kind()` | 状態ごとのinterfaceと `Kind()`、visitor |
| 行型 | `OrderRow` | `OrderRow` | `OrderRow`（`json` タグ付き） |
| 行との変換 | `Order.fromRow` / `Order.toRow` | `Order::from_row` / `into_row` | `OrderFromRow` / `OrderToRow` |
| id | `OrderId.parse` / `OrderId.is` | `OrderId::from` | `ParseOrderId` |
| 結果型 | `Result<T, E>` | `Result<T, E>` | `(T, error)` |
| 遷移関数 | `pay(order: OrderPending, ...)` | `pay(order: OrderPending, ...)` | `Pay(order OrderPending, ...)` |
| ディスパッチャ | `runPay` | `run_pay` | `RunPay` |
| ルール検査 | `orderPaidRuleViolations(row)` | `rule_violations(&self)` | `RuleViolations()` |
| 書き込みの一覧 | `PayResult.writes(r)` | `into_writes()` | `Writes()` |
| 直列化 | `parse<Entity>Row` が `unknown` から行を読む | `serde = true` でserdeをderive | 行の `json` タグ |

### 状態型と行型

タグ列が `transitions` で動くインライン `Enum` であるエンティティは、状態型になります。タグ列は `transitions` が指す列から選びます。`status` があればそれを使い、なければ `*_status` の列、それもなければ名前順で最初の列です。

状態型はタグの値ごとに1つのバリアントを持ちます。到達しない値にもバリアントができます。バリアントを区別する判別子は `kind` で、値はタグ値のPascalCase（`"Pending"`）です。その型は `<Entity>Kind` です。

状態型のバリアントはタグ列を持ちません。タグ列は平らな行型 `<Entity>Row` だけにあります。`kind` という名前の列は状態型の中で `kind_` になり、行型では `kind` のままです。

`@null` の列を状態ごとに絞るのは、ルールがそう述べる場合だけです。

| ルール | 絞り方 |
|---|---|
| `invariant(E).when(status == v).then(x == present)` | `v` で `x` を値ありにする |
| `forbidden(E, status == v, x == present)` | `v` で `x` を `null` にする |
| `required(E, x == present)` | すべての状態で `x` を値ありにする |

`.when(Cond)` を持つルールや、他の原子式を含むルールは何も絞りません。

`fromRow` は行を状態に変えます。その状態が許さない値を持つ列があれば、列名を添えた `InvalidRow` を返します。`toRow` は失敗しません。TypeScriptの `parse<Entity>Row(value: unknown)` は、ストアやワイヤから来た値を列ごとの型のパーサーで読みます。

状態と行は直列化の形が違います。状態は `kind` にバリアント名（`"Paid"`）を持ち、行はタグ列にモデルの値（`status: "paid"`）を持ちます。書き込みに結果を返し、読み出しに保存した行を返すAPIは、1つのエンティティに2つの形を返すことになります。そろえるには、結果の各状態を `Order.toRow` に通すか、各行を `Order.fromRow` に通します。

状態を作れるのは遷移関数と `fromRow` だけです。Rustではフィールドを非公開にし、Goでは非公開の構造体1つだけが状態のinterfaceを実装します。Goの状態型にはvisitor（`OrderVisitor[R]`、`MatchOrder`）も付きます。新しい状態のメソッドを持たないvisitorはコンパイルが通りません。

### idとスカラー

単一列の主キーを持つエンティティにはid型ができます。TypeScriptでは `number & { readonly __brand: "OrderId" }` のようなブランド型です。`Money`・`Decimal`・`Date`・`DateTime` もブランド型のスカラーです。

どちらも型アサーションなしではパースでしか作れません。形の違う値は `InvalidValue` になります。スカラーは形だけを検査し、暦の正しさは見ません。プロジェクトに独自のスカラー型があれば差し替えられます。

TypeScriptはスカラーを型と同名のコンパニオンオブジェクトとしてexportします。そのため `Date` を名前でimportすると、グローバルの `Date` が隠れます。名前を変えてimportする（`import { Date as IsoDate } from "./domain.ts"`）か、名前空間としてimportします。

### 遷移関数とディスパッチャ

ユースケースごとに、読む行の元状態の組み合わせ1つにつき1つの関数ができます（`cancelFromPending`、`cancelFromPaid`）。そのため、別の状態からの呼び出しはコンパイルが通りません。

関数は純粋です。元状態を値で受け取り、新しい値を返します。時計とストアは読みません。引数は読む行と、モデルが開いたまま残す値の入力です。戻り値の `<Name>Result` は次を含みます。

- 書く行と作る行
- 削除する行のid
- 発火するイベント
- 書く行ごとにコミット時点で保たれているべき元の状態（`order_expected`）

ディスパッチャ `runCancel` は行の状態に合う関数を呼びます。合う関数がなければ `NotEnabled` を返します。

分割されたユースケースはステップごとの関数になり、ランマーク（`OpenSettlementClaimMark1 { id }`）で次のステップへつながります。最後のステップは、終わらせるランマーク（`ended_<row>_mark`）も返します。イベントは、マークした各行のidを持ちます。

`links` / `relinks` / `unlinks` は、子のキーに対する条件 `Links_<Child>_<role>` として関数になります。別の行からのコピーや、作る行の任意のキーを `null` のまま残す形も関数になります。

一方で、まだ関数を出力しない形があります。`now` を読むもの、比較の命題を使うもの、数えるイベント（`triggers(..).counted(k)`）を扱うもの、複数列のキーを使うものなどです。読む行の元状態の組み合わせが16を超えるユースケースも対象です。こうしたユースケースはヘッダの `Use cases with no function` に `- <UseCase>: <reason>` の形で並びます。契約にはエントリポイント（`run_<action>`）ができ、サービスがその中身をすべて書きます。理由の一覧はupstreamの [codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/codegen.md#transition-functions-dispatchers-and-contracts) にあります。

関数が計算できない `@derived` 列を含んでいても、関数はできます。たとえば算術式や `now`、入力を読む列です。その列は入力になり、関数のdocに理由が書かれます。

### エラー

遷移関数とディスパッチャは `<UseCase>Error` を返します。どのユースケースの `<UseCase>Error` も `NotEnabled`・`NotFound`・`StoreFailed` を持ちます。`Rejected` と `InvalidArgument` は、そのユースケースが起こしうる場合だけ持ちます。

| ケース | 意味 | HTTPでの対応 |
|---|---|---|
| `NotFound` | 呼び出しがidで指す行が存在しません。`usecase`、`entity`、`id` を持ちます。 | 404 |
| `NotEnabled` | 行がユースケースの実行元でない状態にあります。 | 409 |
| `Rejected` | ユースケースに適用した条件が成り立ちません。 | 422 |
| `InvalidArgument` | 引数が検証済みのモデルの保つ性質を破っています。たとえば子の行が一緒に渡した親を指していません。 | 400 |
| `StoreFailed` | ストアが失敗しました。ストアのエラーを `cause` に持ちます。 | 500 |

`NotFound` と `StoreFailed` を返すのは、サービスの読み込みとコミットだけです。生成された関数は読み込み済みの行を受け取るので、この2つを返しません。条件付きの書き込みがどの行にも当たらないコミットは、`NotEnabled` のままです。

TypeScriptでは `kind` で区別するunionです。Rustでは `std::error::Error` を実装するenumで、`StoreFailed::new(usecase, cause)` で作ります。Goでは `*<UseCase>Error` で、`errors.As` と `errors.Is`（`ErrNotEnabled`、`ErrNotFound`、`ErrRejected`、`ErrInvalidArgument`、`ErrStoreFailed`）で扱えます。Goの `*StoreFailed` はストアのエラーへunwrapします。遷移関数とディスパッチャはpanicとthrowをしません。例外はTypeScriptの `assertNever` だけです。

### ルール検査

レコードと状態型の各型に、行が破っているルールの名前を返す関数ができます。名前は `check` が報告するもの（`Forbidden_Order_0`、`Check_Order_qty_0`）と同じです。状態型がすでに保証するルールは含みません。複数行にまたがるルールは、次に述べる義務になります。

### 義務

出力の冒頭には義務（obligations）が並びます。`check` と `verify` がデータについて仮定し、どの型も強制しない事柄です。各義務には名前と場所が付きます。

| 名前の例 | 内容 |
|---|---|
| `Unique_Customer_email` | 2つの `Customer` 行が `email` を共有しない |
| `Ref_Order_customer_id` | `Order.customer_id` が存在する `Customer` を指す |
| `Check_Order_total_0` `[checked]` | `@check` を満たす（`check` も同じ名前で検査する） |
| `OneTransaction` | 関数1回を1トランザクションで実行し、条件付きで書く |
| `RunMarks_<UseCase>` | ランマークの保存のしかた |

義務の名前は、モデルに無関係な宣言が増えても動きません。そのため、後述の義務の台帳から名前で参照できます。

`OneTransaction` の条件付きの書き込みは、`<row>_expected` が示す状態のままの行だけを書くことです（`UPDATE .. WHERE id = ? AND status = ?`）。どの行にも当たらなければ `NotEnabled` としてロールバックし、ストアのエラーは `StoreFailed` にします。

ヘッダには候補ルールも並びます。到達するすべての状態で値あり（または `null`）なのに、そう述べるルールがない `@null` 列です。業務上のルールなら書き足して型を絞り、偶然ならモデルの穴として扱います。

### 結果のコミット

各結果型とディスパッチャの結果型は、コミットで書くものの一覧を返します。行の書き込み（`RowWrite`）、ランマークの書き込み（`MarkWrite`）、発火するイベント（`RaisedEvent`）を、`Writes` にまとめたものです。この一覧の出力は実験的です。

書く道具として `commit_writes` / `CommitWrites` / `commitWrites` があります。サービスは `CommitStore` を1回だけ実装します。中身は、行を書く、マークを書く、イベントを記録する、の3つです。ヘルパーは一覧を順に書き、書く行かマークが期待どおりでなければ、そこで `NotEnabled` を返して止まります。ストアのエラーは `StoreFailed` になります。トランザクションの開始と終了はヘルパーの外で、呼び出し側が受け持ちます。

この一覧は、出力の上にサービスを3つ作ったとき、どれも同じつなぎのコードを手で書いたことから加わりました。詳しくはupstreamの [Committing a result](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/algebraic-codegen.md#committing-a-result) にあります。

### 契約と未実装ポート

書き込むユースケースごとに、契約 `<UseCase>UseCase` ができます。メンバーは `prepare*`（行をidで読み関数を走らせる、書かない）と `commit*`（結果を1トランザクションで保存する）です。関数を持たないアクションには `run_<action>` が加わります。TypeScriptでは `Promise` を返す `readonly` メンバーの型で、RustのtraitとGoのinterfaceは同期です。

アクターが実行するユースケースは、最初の引数に呼び出し元 `by: <UseCase>Caller` を取ります。そのアクターの能力の型からなり、`issue()` などでしか作れません。

契約と適合ポートは、すべてのエンティティが `Bool` でない単一列の主キーを持つことを前提にします。そうでないモデルではヘッダに `No contracts: <why>.` と書かれ、契約とポートはできません。

ドメインコードには未実装ポートも含まれます。サービスが書きかけのうちに契約の代わりとして使うもので、すべてのメソッドがそろう前からビルドが通ります。

| 言語 | 未実装ポート | 失敗のしかた |
|---|---|---|
| Go | 埋め込む構造体 `UnimplementedConformancePort` | `ErrUnimplemented` を返す |
| TypeScript | 継承するクラス `UnimplementedConformancePort` | `Unimplemented` でrejectする |
| Rust | 契約ごとのマーカーtrait（`impl UnimplementedPayUseCase for Service {}`） | `unimplemented!` でpanicする |

代わりになるのは `prepare` と `commit` のメソッドです。`--conformance` のときは、GoとTypeScriptでは `Seed` / `seed` と `Snapshot` / `snapshot` も代わりになります。エントリポイントの代わりにはなりません。サービスが宣言したメソッドは未実装ポートのものより優先されます。`check --code=build` は未実装ポートを使うサービスを通します。違いが見えるのは `run` です（後述）。

### 適合ポートとハーネス

`--conformance <FILE>` を付けると、適合ポート `ConformancePort` とハーネス `conform` も出力します。サービスはこのポートを実装します。

| メンバー | 役割 |
|---|---|
| `seed` | ストアを空にし、初期状態を保存する |
| `snapshot` | すべての行と保留中のランマーク、トリガーされるユースケースが読むイベントを返す |
| `prepare<Action>` / `commit<Action>` | 契約と同じ |

Goでは `Seed` が `error` を返し、`Snapshot` が `(StoreSnapshot, error)` を返します。ストアが失敗すると、`Conform` は `the service's Seed failed: ...` で終わります。

ハーネスはトレースごとに新しいポートを作り、seedして呼び出しを順に行います。呼び出しのたびにストアをモデルが追う範囲まで削り、状態BFSが到達した状態と比べます。追う範囲とは、enumの値、`null` かどうか、整数、キーの親です。拒まれるべき呼び出しは、指定された種類のエラーで失敗し、何も変えてはいけません。最初の差分をトレースの行とともに返します。

```ts
// Run in the service's test
const report = await conform(() => newService(), traces);
```

TypeScriptの `traces` は、ファイルの中身の文字列か、行を `AsyncIterable<string>` として返す関数です。Nodeの文字列の上限（約512 MB）を超えるファイルも読めます。

seedする状態は、親の行のない子の行を含むことがあります。`check` はこのとき `PreExistingChildOfCreatedParent_*` を警告します。`Ref_*` を外部キーとして強制するストアは、`Seed` の間だけその検査を止めます。ハーネスは欠けた親を作りません。

### トレース

トレースのファイルは `check` の境界でシステム全体をBFSして作ります。関数を持つユースケースの動きをすべて通り、各状態でモデルが拒む呼び出しもすべて試します。

```text
S 2
A Order 1 status=paid paid_at=+
T 0
G
X NotFound Pay 101 2026-01-01T00:00:00Z
X NotFound Cancel 101
C 1 Place 1
C 2 Pay 1 2026-01-01T00:00:00Z
X NotEnabled Pay 1 2026-01-01T00:00:00Z
...
```

| 行 | 意味 |
|---|---|
| `S` / `A` | 状態とその行を定義する |
| `T` | トレースを始める |
| `R` / `G` | seedが保存する行 / seedの終わり |
| `C` | 呼び出しと、それが到達する状態 |
| `X <kind>` | 拒まれるべき呼び出しと、拒む種類（`-` はどの種類でもよい） |
| `I <state> <call> \| <call>` | 1つ目をprepareし、2つ目を実行してから1つ目をコミットする。1つ目は拒まれなければならない |

上の例は、後述の「例」のモデルのトレースです。`X` の種類は `NotEnabled`・`Rejected`・`InvalidArgument`・`NotFound` のいずれか、またはどの種類でもよい `-` です。最初のトレースは、既存の行1つを読むユースケースを、どの行も持たないidで1回ずつ呼びます。これは `NotFound` で拒まれなければならず、`NotEnabled` では通りません。idはエンティティごとに帯を分けます（`Customer 1`、`Order 101`、`Shipment 201`）。別のエンティティのidで行を探すサービスは、行を見つけられません。

ファイルは `# rdra-ish conformance traces 5` で始まり、次の行に指紋が続きます。v3.0.0のトレースはフォーマット3なので、生成し直します。

### モデルアダプタ

モデルアダプタは実験的です。取り込んだドメインコードを改名したり分割したりしたプロジェクトは、そのコードで `fresh` を通せません。サービスも生成されたポートを実装しなくなります。その場合は、`codegen --adapter`（表では `adapter`）が書くアダプタでサービスをトレースに結びつけます。

アダプタのファイルはドメインコードの型を使いません。中身は次のとおりです。

- モデルの状態を表すただのデータ `ModelState`
- 呼び出し `Call`
- インターフェイス `ModelAdapter`（`reset`、`seed`、`observe`、`invoke`。任意で `prepare` と `commit` の組）
- ハーネス `conform` / `Conform`

`invoke` は、呼び出しが走ったか、拒んだ種類を返します。ハーネスは同じトレースを読み、同じ言葉で差分を報告します。詳しくはupstreamの [The model adapter](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#the-model-adapter) にあります。

### Verusのクレート

Verusのクレートは実験的です。`--lang rust --verus <DIR>` は、通常のRust出力とは別に、`verus DIR/main.rs` で検査するクレートを `DIR` に書きます。通常の出力は変わりません。ユーザーが編集するのは `core.rs` だけです。

Verusがエラーを出さなければ、次の3つが成り立ちます。

1. モデルは行の数によらずルールを保つ。
2. コアが契約を満たす。
3. ポートの各呼び出しがストアをモデルの1ステップどおりに動かすか、まったく動かさない。

信頼する部分はストア、出力するプリンタ、Verus自身です。

対象は、追う列がすべて `Enum`・`Bool`・キーで、ユースケースが1ステップのモデルです。そのステップは、行の条件や関連する行への量化子と個数で守られた作成・更新・遷移・削除です。`Int` や `@null` の列、`now`、ランマーク、分割されたユースケース、イベントなどは対象外です。対象外のモデルでは通常の出力を書き、理由を1行ずつ出して終了コード `1` になります。各関数がどのエラーを返すかも検査しません。`Rejected` と `InvalidArgument` は区別されません。

```text
  Order.paid_at: nullable columns are not covered
  Order.paid_at: only Enum, Bool and key columns are covered
  Pay: the input order_paid_at is not covered (only ids of created rows and related rows are)
Error: --verus does not cover this model (3 reason(s) above); the ordinary output is unaffected
```

詳しくはupstreamの [verus.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/verus.md) にあります。

### JSONの契約

`--format json` は実験的です。コードのもとになる契約を1つのJSONオブジェクトとして出力します。フォーマットは `"rdra-ish codegen json 1"` で、同じフォーマットの中ではキーが増えるだけです。

データベースのマッパーに要る情報も入っています。たとえば次のものです。

- ユースケースが発火するイベントと、マークする行のid（`events`）
- ユースケースを実行するアクター（`actors`）
- エンティティの各フィールドの `primary_key` と `unique`
- 各義務の `kind`、`entity`、`columns`、`parent`

### 指紋と --check

出力の2行目は `// rdra-ish codegen fingerprint: model=<hash> code=<hash>` です。`--check <FILE>` は同じ入力で生成し直して比べ、この行は無視します。差分があれば原因を `file edited`・`model changed`・`generator changed` のどれかで示します。`--conformance` を付けた場合は、トレースもハッシュで比べます。

生成したファイルは編集しません。仕上げのコードは別のファイルに書きます。

## 例

upstreamの [codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/codegen.md#files) は、次のモデルで出力を示しています。

```rdra
entity Order "Order" {
  id: Int @pk
  status: Enum(pending, paid, cancelled) @default(pending)
  paid_at: DateTime @null
}

usecase Place "Place an order"
usecase Pay "Pay for an order"
usecase Cancel "Cancel an order"
creates(Place, Order)
transitions(Pay, Order.status, pending -> paid)
sets(Pay, Order.paid_at == present)
transitions(Cancel, Order.status, (pending, paid) -> cancelled)
invariant(Order).when(status == paid).then(paid_at == present)
forbidden(Order, status == pending, paid_at == present)
```

このモデルから `--lang ts` は650行、`--lang rust` は1,338行、`--lang go` は1,023行を出力します。`--conformance` を付けるとRustのファイルは1,706行、トレースは57行です。

`paid_at` は2つのルールにより、`pending` では `null`、`paid` では値ありに絞られます。TypeScriptの `paid` の状態型は次のとおりです。

```ts
/** Order in the state `paid` of status. */
export type OrderPaid = Readonly<{
  kind: "Paid";
  /** Primary key. */
  id: OrderId;
  /** Present in this state by a rule (order.rdra:14:1). */
  paid_at: DateTime;
}>;
```

Goでは状態ごとのinterfaceになります。

```go
type OrderPaid interface {
	Order
	// Id returns id.
	Id() OrderId
	// PaidAt returns paid_at.
	PaidAt() DateTime
	isOrderPaid()
}
```

Rustの遷移関数 `pay` は `OrderPending` だけを受け取ります。

```rust
pub fn pay(order: OrderPending, order_paid_at: DateTime) -> ::core::result::Result<PayResult, PayError> {
    ::core::result::Result::Ok(PayResult {
        order: OrderPaid {
            id: order.id,
            paid_at: order_paid_at,
        },
        order_expected: ExpectedSource::In { column: "status", value: "pending" },
    })
}
```

`Cancel` には `cancel_from_pending` と `cancel_from_paid` ができます。TypeScriptの契約は次のとおりです。

```ts
export type PayUseCase = {
  /** Runs Pay (the action Pay). */
  readonly preparePay: (order: OrderId, orderPaidAt: DateTime) => Promise<Result<PayOutcome, PayError>>;
  readonly commitPay: (write: PayOutcome) => Promise<Result<void, PayError>>;
};
```

このモデルの義務は `OneTransaction` だけです。

サービス側では、外から来た値を `parseOrderRow` で読み、`Order.fromRow` で状態にしてからディスパッチャに渡します。

```ts
// Service code (written by hand or by an agent)
const row = parseOrderRow(json);
if (!row.ok) return row;
const order = Order.fromRow(row.value);
if (!order.ok) return order;
const paidAt = DateTime.parse("2026-11-27T09:00:00+09:00");
if (!paidAt.ok) return paidAt;
const result = runPay(order.value, paidAt.value);
```

## 保証の範囲

### 型が強制すること

- 遷移関数は元状態の行だけを受け取るので、別の状態からの呼び出しはコンパイルが通りません。
- 状態は、その状態が許す列だけを持ちます。
- 生成されたモジュールの外では、状態を作ることもフィールドを変えることもできません。Rustのフィールドは非公開、Goの構造体は非公開、TypeScriptは `--seal` のときです。

型を回り込むコードは止められません。

- `--seal` のないTypeScriptでは、状態をオブジェクトリテラルで書けます。遷移関数とルール検査を飛ばします。`--seal` があっても型アサーション（`as unknown as`）で偽造できます。
- Goではゼロ値と `nil` の状態や呼び出し元を禁止できません。関数は `nil` の状態を `InvalidArgument` で拒みます。
- `issue` を呼ぶコードがアクターを認証したかは検査しません。
- 複数行にまたがるルール、キー、一意性は型でなく義務です。

### 前提にしている境界

状態型と関数は、`check` が検証したルールの上に成り立ちます。その `check` はエンティティごとに1インスタンス、`Int 0..5` で探索します。その境界で `check` が見えないルールは、より大きな境界で破れる可能性があります。それには [`verify`](/projects/rdra-ish/formal-verification/) を走らせます。境界が何を意味するかは [検証の意味論](/projects/rdra-ish/theory/semantics/) にあります。

トレースは別のBFSから作ります。こちらは `--conformance-states` の状態数で止まり、メモリ上限には数えません。

## 互換性の範囲

`codegen` の大部分は実験的です。[互換性契約](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/compatibility.md#the-typescript-types-of-codegen)が保証するのは、`check` が通るモデルに対する `codegen --lang ts [-o <FILE>]` の型だけです。

| 互換性契約の対象 | 実験的（どのリリースでも変わりうる） |
|---|---|
| `Result`、`InvalidValue`、`InvalidRow` | 遷移関数、結果型、イベント、ランマーク |
| スカラー（`Money` など）とid型 | ルール検査、ディスパッチャ |
| 値の集合（`PaymentMethod` など） | `NotEnabled`、`NotFound`、`Rejected`、`InvalidArgument`、`StoreFailed`、`<UseCase>Error` |
| 状態型と `<Entity>Kind` | ヘッダと義務、候補ルール |
| `<Entity>Row` | 契約 `<UseCase>UseCase`、未実装ポート、適合ポートとハーネス |
| 上記のコンパニオンと `parse<Entity>Row` のシグネチャ | 書き込みの一覧と `commit_writes` |
| | `--seal`、`--allow-failing`、`--check` と指紋 |
| | `--format json`、`--adapter`、`--verus`、Rust と Go の出力 |
| | 状態型でないエンティティとDTOの型 |

`check --code` と `rdra.toml` の `[code]` 表、`Code*` の検出名も実験的です。契約が固定する型の名前規則（PascalCase化や接頭辞 `V`）は、upstreamの [compatibility.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/compatibility.md#the-typescript-types-of-codegen) にあります。

## 生成を拒むとき

`codegen` は `check` が拒むモデルからは生成しません（終了コード `1`）。`--allow-failing` を付けると生成しますが、状態型は列を絞らず、関数とルール検査もありません。`check` の各エラーは義務 `NotMet_<error>` になります。

`codegen` には `--buc` や `--entity` のような部分生成のフラグがありません。常にモデル全体を生成します。

2つの宣言が同じ型名を生む場合は `NameCollision` で失敗します。たとえばエンティティ `OrderStatus` と、`Order.status` のインライン `Enum` が衝突します。モデルの型名が `NotEnabled`・`NotFound`・`StoreFailed` のとき（Goでは `ErrNotFound`・`ErrStoreFailed` も）も `NameCollision` です。TypeScriptでは、`Result`・`assertNever`・`Symbol` も同じです。モデルの名前は、実験的な宣言とも名前空間を共有します。そのため、将来のリリースで新たに衝突する場合があります。

## check --code

`check --code` は、サービスのコードがモデルの要求するものを持っているかを確かめます。`codegen` と同じく実験的です。rdra-ishはサービスのコードを構文解析しません。`[code]` 表が指すファイルをすべて生成し直して比べ、`build` と `run` ではコンパイラのエラーを読みます。

モデルの検査の後に走り、モデルが `check` に失敗すると何も検査しません。

```bash
rdra-ish check model/ --code          # same as --code=fresh
rdra-ish check model/ --code=build
rdra-ish check model/ --code=run
rdra-ish check model/ --code=run --deny-incomplete
```

| レベル | 検査すること |
|---|---|
| `fresh` | `codegen --code` が書く各ファイルが、モデルの今の生成物と一致する。コードはテキストで、トレースはハッシュで比べる。コンパイラは走らない。 |
| `build` | `fresh` に加えてプローブをビルドし、サービスが契約どおりにコンパイルできるかを見る。コンパイラのエラーはユースケースに対応づける。 |
| `run` | `build` に加えて適合テストを走らせ、続けて自己検査を走らせる。 |

| 言語 | `build` | `run` |
|---|---|---|
| Rust | `cargo check --test <probe> --message-format=json` | `cargo test --test <probe> -- rdra_conformance --nocapture` |
| TypeScript | `tsc --noEmit --pretty false -p tsconfig.rdra.json` | `node <probe>`（Node 22.18以降） |
| Go | `go test -count=1 -run ^$ -gcflags=-e ./<probe dir>` | `go test -count=1 -v -run ^TestRdraConformance$ ./<probe dir>` |

TypeScriptのプローブとドメインコードはESモジュールです。npm 11の `npm init -y` が書く `"type": "commonjs"` のままだと失敗します。`verbatimModuleSyntax` の下では `build` が `CodeCommonJs` で、そうでなければ `run` が `CodeConformance` で失敗します。`package.json` に `"type": "module"` を書きます。

コンパイラの出力全体をまず標準エラーへ出し、その後で検出を並べます。最終行は `OK: code: what the model requires, at --code=<level>` か、`FAIL: code: <n> error(s) at --code=<level>`（終了コード `1`）です。`[code.rust]`・`[code.go]`・`[code.ts]` のどれもないモデルでは、`--code` は終了コード `1` になります。何も検査しない実行が通ることはありません。LSPはビルドを走らせず、古くなった生成ファイルを `rdra.toml` の表の行に示します。

### rdra.toml の code 表

`[code.<lang>]` 表は、`codegen --code` が書くファイルを指定します。`[code.ts]` は `[code.typescript]` とも書けますが、両方を書くとエラーです。パスは `rdra.toml` のあるディレクトリからの相対パスです。表は `domain` か `adapter` のどちらか一方を必ず持ちます。

```toml
[code.ts]
domain = "../web/src/domain.ts"
traces = "../web/src/traces.txt"
probe = "../web/src/rdra_contract.ts"
service = "../web/src/order_service.ts#OrderService"
seal = true

[code.obligations]
Unique_Payment_Order = "../service/migrations/003_payment.sql"
```

| キー | 意味 |
|---|---|
| `domain` | 生成するドメインコードのファイルです。 |
| `adapter` | `domain` の代わりに、モデルアダプタを書くファイルです。`traces` が必要です。`fresh` はこのファイルとトレース、プローブだけを比べます。 |
| `traces` | 適合トレースです。指定すると `domain` に適合ポートとハーネスも入ります。 |
| `probe` | サービスが各ユースケースの契約を実装していると述べるファイルです。`build` に必要です。 |
| `service` | 契約を実装する型です。書き方は言語ごとに異なります。 |
| `new` | 新しいサービスを作る式です。Rustの適合テストでは必須です。 |
| `root` | ビルドを走らせ、台帳を探すディレクトリです。 |
| `build`, `run` | 既定のコマンドの代わりに走らせるコマンドです。 |
| `seal` | TypeScriptで `--seal` と同じ出力にします。upstreamは `true` を勧めています。状態をオブジェクトリテラルで作るサービスは、`run` を通ってしまう代わりに `build` で失敗します。 |
| `serde` | Rustで `true` にすると、データ型に `::serde::Serialize` と `::serde::Deserialize` をderiveします。既定は `false` です。 |

`serde = true` のとき、idは値として、スカラーと値の集合はモデルの綴りで直列化されます。状態を持つエンティティは `<Entity>Row` として直列化し、`from_row` を通して戻します。状態の構造体、エラー、結果、適合の型にはderiveが付きません。`serde` を `[code.go]` や `[code.ts]` に書くか、`adapter` の表で `true` にすると、`--code` は終了コード `1` になります。

`module`・`package`・`tsconfig`・`conformance_states` などのキーもあります。全体はupstreamの [The code tables](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#the-code-tables) を参照してください。未知のキーはエラーです。

Rustの契約は同期です。非同期のデータベースクレートを使うサービスの組み方は、upstreamの [An async Rust service](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#an-async-rust-service) にあります。I/Oを純粋なドメイン関数の外側で行い、適合テストでは同じ非同期メソッドを `block_on` で呼びます。

### 義務の台帳

どのレベルでも、生成コードが挙げる各義務には持ち主が必要です。サービスのコードにマーカー行を書くか、`[code.obligations]` にファイルを書きます。

```ts
// rdra: obligation Unique_Order_note src/migrations/001_order.sql
```

マーカーはコメント記号（`//`、`#`、`--`）の後に置きます。文字列リテラルの中のマーカーは読みません。ファイルを省くと、マーカーのあるファイルが持ち主になります。検査するのは持ち主がいることと、そのファイルが存在することだけです。義務が実際に守られているかは見ません。マーカーと `[code.obligations]` の項目がまだ1つもないうちは、注記を出してどの義務も検査しません。

### run が覆う範囲

`--code=run` は、要約行の前に、各表のトレースが何を覆うかを標準出力に書きます。upstreamのフィクスチャでの例です。

```text
coverage of [code.rust]: bounded conformance to the model, not equivalence
  bound: 1 row created per entity, Int 0..5
  BFS: complete, 6 states; 6 reached by the traces' calls
  moves: 5 of 5 run
  refused calls: 13 tried (NotEnabled 10, NotFound 2, Rejected 1); interleaved commits: 7
  seeded at a reached state: 2 traces, each then one call (H1: seed and path agree)
  never refused: 1 (Place)
  assumes: H1 the service answers from the tracked columns and the call alone; H2 every reachable call is tried; H3 seed and snapshot reach the real store; H4 every write goes through the port, one call one transaction; H5 the rules read tracked columns only
  cannot show: writes outside the port, locking, races, external effects, liveness, who issues a capability, data outside the model
```

通った実行が示すのは、境界のある適合（bounded conformance）です。等価性ではありません。H1からH5の前提のもとで、モデルが検証した安全性のルールが、ポート経由の実行で保たれることを示します。各エンティティで作る行は1つまでです。

トレースのBFSが `conformance_states` で止まると、その先の動きは走りません。存在する行への拒否も試しません。モデルが拒む呼び出しを走らせるサービスでも通ってしまいます。このとき実行は `warning[CodeCoverageIncomplete]` を出し、終了コードは `0` のままです。`--deny-incomplete` を付けるとエラーになります。試していない拒否（1つの状態で束縛が64を超えるユースケース）や、トレースが一度も走らせないユースケースは同じ扱いです。完全にするには `conformance_states` を上げて `codegen --code` をやり直します。

upstreamの「Costs」節の数値（rdra-ish 3.0.0で計測）では、`samples/clinic-ops` のトレースは既定の上限で止まり、ファイルは236,971,795バイトです。ハーネスはトレースごとに `new` を呼ぶので、181,111回になります。`new` は安く作り、1つのデータベースを共有して `seed` で空にします。

トレースのファイルをやめ、BFSからその場で生成したケースをソケットで流す設計案もupstreamにあります（[conformance-stream.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/conformance-stream.md)）。これは設計の検討で、実装されていません。

### 未実装ポートの報告

ハーネスは、未実装ポートに届いた呼び出しを数えます。モデルの走らせる呼び出しが届くと、そのトレースはそこで止まります。拒まれるべき呼び出しが届いた場合は、拒否と数えません。プローブのテストは常に `rdra-ish conformance: unimplemented: none` などの行を出します。

届いた呼び出しがあると、覆う範囲の記述に1行加わり、`CodeUnimplemented` の警告が出ます。`--deny-incomplete` を付けるとエラーです。

```text
  unimplemented: 1 use case (Cancel): 7 calls reached the unimplemented port; 4 traces stopped there
warning[CodeUnimplemented]: [code.go]: the service has not implemented Cancel (7 calls): a trace stops at such a call the model runs, so nothing after it is checked, and such a refused call is no refusal
```

表の `run` コマンドがテストの出力を隠すと、この行も隠れます。その場合は `unimplemented: not reported` となり、同じ警告が出ます。

### 自己検査

`run` が通った後、`check --code=run` は検査そのものを検査します。ミュータントのトレースでrunコマンドをもう一度走らせます。ミュータントは本物のトレースの1つを1行の後で切り、その行をモデルが決してしない内容に変えたものです。

| 種類 | 変えた行 |
|---|---|
| `refused-call-runs` | モデルが拒む呼び出しを、走るものとして期待する |
| `call-refused` | モデルが走らせる呼び出しを、拒まれるものとして期待する |
| `wrong-state` | 別の状態に到達するものとして期待する |
| `absent-row` | どの行も持たないidの呼び出しを、走るものとして期待する |
| `guard-removed` | 条件が拒む呼び出しを、その条件を外したモデルどおりに走るものとして期待する |

既定では各種類を1つずつ使い（`guard-removed` はトレースが拒む条件ごとに1つ）、`--mutant-seed`（既定 `0`）で選びます。`--mutants <N>` で種類ごとの数を決め、`0` で自己検査を止めます。プローブのテストは、環境変数 `RDRA_ISH_TRACES` が指すファイルからトレースを読みます。自己検査はミュータントごとにこの変数を設定します。

適合するサービスは、どのミュータントにも変えた行で失敗します。通ってしまったミュータントは `CodeMutantSurvived` のエラーで、終了コードは `1` です。`absent-row` 以外が通るのは、runコマンドが渡されたトレースでハーネスを走らせていないときです。`absent-row` が通るのは、サービスが行をidで探さずに呼び出しを走らせるときです。サービスのコードは変えません。未実装ポートが確かめずに残した行のミュータントは、生き残りでなく別に数えます。

```text
  self-check: 5 of 5 mutant traces failed at their changed row (seed 0); guard-removed mutants: Big
```

### 主な検出

| 名前 | 起きるとき |
|---|---|
| `CodeMissingUseCase_<UseCase>` | サービスがユースケースの契約を実装していない |
| `CodeIncomplete_<UseCase>` | 契約の一部のメソッドがない |
| `CodeSignature_<UseCase>` | メソッドの引数か戻り値の型が契約と違う |
| `CodeServiceNotFound` | プローブが `service` の型を解決できない |
| `CodeCommonJs` | `verbatimModuleSyntax` の下で、TypeScriptのプローブがCommonJSとしてコンパイルされた |
| `CodeConformance` | `run` で適合テストが失敗した |
| `CodeMutantSurvived` | 自己検査のミュータントが通った |
| `CodeUnimplemented` | 未実装ポートに呼び出しが届いた（警告。`--deny-incomplete` でエラー） |
| `CodeCoverageIncomplete` | トレースが上限で止まった、拒否を試していない、走らせないユースケースがある（警告。`--deny-incomplete` でエラー） |
| `CodeObligationUnowned_<name>` | 義務に持ち主がいない |
| `CodeObligationOwnerMissing_<name>` | 持ち主のファイルが存在しない |

```text
error[CodeObligationUnowned_Unique_Order_note]: no code owns the obligation Unique_Order_note
  model: model/order.rdra:6:1  no two Order rows share note.
  fix:   add `// rdra: obligation Unique_Order_note <file that keeps it>` or list it under [code.obligations]
```

`CodeConformance` の `code:` 行は、ハーネスの最初の差分を `model only:` と `store only:` の行とともに示します。

### 見ないもの

`check --code` が見ないものもあります。

- ポートを経由しない書き込み、マイグレーション、以前の版が保存したデータ、外部への作用、活性
- 並行性（ハーネスは1スレッドなので、`SELECT .. FOR UPDATE` や実際の接続どうしの競合は示せない）
- モデルが追わない列
- 上限を超えた動き
- ハーネスが比べないもの（数えるトリガー、比較の命題、時計）
- 関数を持たないユースケースの動き

`build` の `OK` は、プローブが届かないバイナリやハンドラ、ファイルについて何も言いません。詳しくはupstreamの [codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/codegen.md#what-is-not-checked) と [code-check.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/code-check.md#what-it-cannot-detect) にあります。

## v3.0.0 からの移行

v3.0.0の生成物を使うサービスは、次の変更に合わせます。どれも実験的な出力の変更です。

- **`<UseCase>Error` の2つのケース（破壊的変更）。** Rustの網羅的な `match`、TypeScriptの `assertNever` で終わる `switch`、Goの `Kind` の `switch` に、`NotFound` と `StoreFailed` の腕を足します。`prepare` が渡されたidの行を見つけられないときは、`NotEnabled` でなく `NotFound` を返します。
- **Goの `Seed` と `Snapshot`（`ConformancePort` を実装するサービスでは破壊的変更）。** メモリ上のサービスなら `return nil` と `, nil` を足します。
- **生成ファイル。** トレースのフォーマットが5になり、ハーネスとプローブの中身も変わりました。`codegen --code` でドメインコード、トレース、プローブを生成し直します。古いものは `check --code=fresh` が報告します。
- **独自の `run` コマンド（要対応）。** 自己検査は表の `run` コマンドを、`RDRA_ISH_TRACES` にミュータントのファイルを設定して走らせ直します。生成されたプローブの適合テストを走らせないコマンドや、変数を渡さないコマンドは、`CodeMutantSurvived` で失敗します。コマンドがこの変数を環境に持ったままプローブのテストを走らせるようにします。代わりに `--mutants 0` で自己検査を止めることもできますが、runがトレースを読んだかはわからなくなります。

## typescript-states からの移行

`export --kind typescript-states` と `states --format typescript` はv3.0.0で削除されました。どちらも置き換え先を示す使い方の誤り（終了コード `2`）になります。

| 以前 | v3.0.0 以降 |
|---|---|
| `rdra-ish export <INPUTS> --kind typescript-states -o x` | `rdra-ish codegen <INPUTS> --lang ts -o x.ts` |
| `rdra-ish states <INPUTS> --format typescript` | `rdra-ish codegen <INPUTS> --lang ts` |
| `order.status === "paid"` | `order.kind === "Paid"` |
| `orderFromRow(row)` | `Order.fromRow(row)`（`Result` を返す） |
| `1 as OrderId` | `OrderId.parse(1)`（`Result` を返す） |

その他の差分はupstreamの [CHANGELOG.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/CHANGELOG.md) のv3.0.0の節にある「TypeScript types」にあります。

## エージェントスキル

スキル [rdra-ish-implement](https://github.com/manji-0/rdra-ish-dsl/tree/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/rdra-ish-implement) は、モデルからサービスを実装する手順をエージェントに渡します。手順は次のとおりです。

1. モデルを `rdra-ish check` に通す。
2. `rdra.toml` に `[code.<lang>]` 表を書く。
3. `rdra-ish codegen model --code` で生成する。
4. ヘッダの義務と候補ルール、関数ができなかったユースケースを読む。
5. 生成された契約に沿ってサービスを書く。
6. 各義務に持ち主を付ける。
7. `check --code=build` と `check --code=run` で確かめる。

CIでは `rdra-ish check model --code`（`fresh`）で生成ファイルの古さを検出できます。スキルはClaude Codeのプラグインとしても入れられます。入れ方はupstreamの [skills/README.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/README.md) にあります。

## 関連

- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [理論](/projects/rdra-ish/theory/)：検査器の保証と前提
- [kamae-rs](/projects/kamae-rs/)：生成するRustが従う指針
- [kamae-model-translator](/projects/kamae-model-translator/)：kamaeのドメインモデルを言語間で移植する
