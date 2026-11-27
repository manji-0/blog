---
title: "コード生成"
description: "rdra-ish v3.0.0 の codegen と check --code: モデルからTypeScript・Rust・Goのドメインコードを生成し、サービスのコードをモデルに照らして検査する"
sidebar:
  order: 4.6
---

このページは、`rdra-ish codegen` が生成するドメインコードと、サービスのコードをモデルに照らす `rdra-ish check --code` を説明します。生成先はTypeScript・Rust・Goの3言語です。完全な仕様はupstreamの [cli-reference.md の codegen](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#codegen) と [algebraic-codegen.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/design/algebraic-codegen.md) にあります。

## 位置づけ

モデルはすでにドメインの形を述べています。`variation` は値の集合、`entity` はレコード、`transitions` は状態の移り方、ルールは起きてはならない組み合わせです。`codegen` はこれを代数的なドメイン型と関数としてコードに写します。

生成物は、エージェントが仕上げる前提のコードです。永続化やモデルが抽象のまま残す値、配線はエージェントの仕事であり、rdra-ishは書きません。生成物は `check` と `verify` が検証した内容に沿い、そのままビルドできます。

生成コードの形はKamaeの原則に従います（v3.0.0から）。

| 言語 | 従う指針 |
|---|---|
| TypeScript | [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) |
| Rust | [kamae-rs](/projects/kamae-rs/) |
| Go | 同じ原則を標準ライブラリだけで写したもの |

どの言語でも外部ライブラリを使いません。`Result` 型や境界のパーサーも生成物の中に含まれます。

## コマンド

```bash
# Print the domain module to stdout, or write it with -o
rdra-ish codegen model/ --lang ts -o src/domain.ts
rdra-ish codegen model/ --lang rust -o src/domain.rs
rdra-ish codegen model/ --lang go -o domain/domain.go --package domain

# Also print the conformance port and harness, and write the traces
rdra-ish codegen model/ --lang rust -o src/domain.rs --conformance tests/traces.txt

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
| `--conformance-states <N>` | トレースのもとになるBFSが探索する状態数の上限です。既定は `65536` です。 |
| `--seal` | TypeScriptだけで使えます。状態型をモジュール外のオブジェクトリテラルで作れなくします。 |
| `--check <FILE>` | 生成し直して `FILE` と比べます。`-o` とは併用できません。 |
| `--allow-failing` | `check` が失敗するモデルでも生成します。 |
| `--format json` | 生成のもとになる契約をJSONで出力します。 |
| `--code` | `rdra.toml` の `[code.<lang>]` 表が指すファイルをすべて書きます。他のフラグとは併用できません。 |
| `--probe` | 表が指すプローブだけを書きます。 |

終了コードは、書き出しか一致で `0` です。`check` の失敗や名前の衝突、`--check` の差分は `1` になります。使い方の誤りは `2` です。

`codegen` は最初に `check` を走らせ、その境界をヘッダに書きます。生成物はすべて `check` が検証したルールの上に成り立ちます。

## 生成されるもの

出力は1つのコンパイル単位です。TypeScriptのモジュール、Rustのモジュールファイル、Goのファイルのいずれかになります。

| 部分 | TypeScript | Rust | Go |
|---|---|---|---|
| 状態型 | `kind` で区別する `Readonly` 型のunion | 構造体を持つenumと `kind()` | 状態ごとのinterfaceと `Kind()` |
| 行型 | `OrderRow` | `OrderRow` | `OrderRow`（`json` タグ付き） |
| 行との変換 | `Order.fromRow` / `Order.toRow` | `Order::from_row` / `into_row` | `OrderFromRow` / `OrderToRow` |
| id | `OrderId.parse` / `OrderId.is` | `OrderId::from` | `ParseOrderId` |
| 結果型 | `Result<T, E>` | `Result<T, E>` | `(T, error)` |
| 遷移関数 | `pay(order: OrderPending, ...)` | `pay(order: OrderPending, ...)` | `Pay(order OrderPending, ...)` |
| ディスパッチャ | `runPay` | `run_pay` | `RunPay` |
| ルール検査 | `orderPaidRuleViolations(row)` | `rule_violations(&self)` | `RuleViolations()` |

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

状態を作れるのは遷移関数と `fromRow` だけです。Rustではフィールドを非公開にし、Goでは非公開の構造体1つだけが状態のinterfaceを実装します。

### idとスカラー

単一列の主キーを持つエンティティにはid型ができます。TypeScriptでは `number & { readonly __brand: "OrderId" }` のようなブランド型です。`Money`・`Decimal`・`Date`・`DateTime` もブランド型のスカラーです。

どちらも型アサーションなしではパースでしか作れません。形の違う値は `InvalidValue` になります。スカラーは形だけを検査し、暦の正しさは見ません。プロジェクトに独自のスカラー型があれば差し替えられます。

### 遷移関数とディスパッチャ

ユースケースごとに、読む行の元状態の組み合わせ1つにつき1つの関数ができます（`cancelFromPending`、`cancelFromPaid`）。そのため、別の状態からの呼び出しはコンパイルが通りません。

関数は純粋です。元状態を値で受け取り、新しい値を返します。時計とストアは読みません。引数は読む行と、モデルが開いたまま残す値の入力です。戻り値の `<Name>Result` は次を含みます。

- 書く行と作る行
- 削除する行のid
- 発火するイベント
- 書く行ごとにコミット時点で保たれているべき元の状態（`order_expected`）

ディスパッチャ `runCancel` は行の状態に合う関数を呼びます。合う関数がなければ `NotEnabled` を返します。

分割されたユースケースはステップごとの関数になり、ランマーク（`OpenSettlementClaimMark1 { id }`）で次のステップへつながります。

`now` を読むユースケースや `links` を使うユースケースなど、まだ関数を出力しない形があります。その場合はヘッダに理由とともに並びます。対象の一覧はupstreamの [cli-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#codegen) の「Not printed yet」にあります。

### エラー

遷移関数とディスパッチャは `<UseCase>Error` を返します。ケースは、そのユースケースが起こしうるものだけです。

| ケース | 意味 |
|---|---|
| `NotEnabled` | 行がユースケースの実行元でない状態にあります。ディスパッチャだけが返します。 |
| `Rejected` | ユースケースに適用した条件が成り立ちません。 |
| `InvalidArgument` | 引数が検証済みのモデルの保つ性質を破っています。たとえば子の行が一緒に渡した親を指していません。 |

TypeScriptでは `kind` で区別するunionです。Rustでは `std::error::Error` を実装するenumです。Goでは `*<UseCase>Error` で、`errors.As` と `errors.Is`（`ErrNotEnabled` など）で扱えます。生成コードはpanicとthrowを使いません。例外はTypeScriptの `assertNever` だけです。

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

v3.0.0で義務は `O1`、`O2` のような番号から名前に変わりました。名前はモデルの無関係な宣言が増えても動かないので、後述の義務の台帳から名前で参照できます。

ヘッダには候補ルールも並びます。到達するすべての状態で値あり（または `null`）なのに、そう述べるルールがない `@null` 列です。業務上のルールなら書き足して型を絞り、偶然ならモデルの穴として扱います。

### 契約と適合ハーネス

関数かエントリポイントを持つユースケースごとに、契約 `<UseCase>UseCase` ができます。メンバーは `prepare*`（行を読み結果を返す、書かない）と `commit*`（結果を1トランザクションで保存する）です。TypeScriptでは `Promise` を返す `readonly` メンバーの型で、RustのtraitとGoのinterfaceは同期です。

アクターが実行するユースケースは、最初の引数に呼び出し元 `by: <UseCase>Caller` を取ります。そのアクターの能力の型からなり、`issue()` などでしか作れません。

`--conformance <FILE>` を付けると、適合ポート `ConformancePort` とハーネス `conform` も出力します。サービスはこのポートを実装します。

| メンバー | 役割 |
|---|---|
| `seed` | ストアを空にし、初期状態を保存する |
| `snapshot` | すべての行と保留中のランマークを返す |
| `prepare<Action>` / `commit<Action>` | 契約と同じ |

ハーネスはトレースごとに新しいポートを作り、seedして呼び出しを順に行います。呼び出しのたびにストアをモデルが追う範囲まで削り、状態BFSが到達した状態と比べます。拒まれるべき呼び出しは失敗し、何も変えてはいけません。最初の差分をトレースの行とともに返します。

```ts
// Run in the service's test
const report = await conform(() => newService(), traces);
```

トレースのファイルは `check` の境界でシステム全体をBFSして作ります。`# rdra-ish conformance traces 3` で始まり、次の行に指紋が続きます。v3.0.0でフォーマット3になったので、古いトレースは生成し直します。

### 指紋と --check

出力の2行目は `// rdra-ish codegen fingerprint: model=<hash> code=<hash>` です。`--check <FILE>` は同じ入力で生成し直して比べ、この行は無視します。差分があれば原因を `file edited`・`model changed`・`generator changed` のどれかで示します。

生成したファイルは編集しません。仕上げのコードは別のファイルに書きます。

## TypeScriptの例

upstreamのテスト `crates/rdra-ish-emit/src/codegen/tests.rs` は、次のモデルからTypeScriptを生成してスナップショットに固定しています。

```rdra
entity Order "Order" {
  id: Int @pk
  total: Money @check(total >= 0)
  status: Enum(pending "Pending", paid, cancelled) @default(pending)
  paid_at: DateTime @null
  method: PaymentMethod
  delivered_at: DateTime @null
  type: String @null
}
usecase Pay "Pay"
transitions(Pay, Order.status, pending -> paid)
sets(Pay, Order.paid_at == present)
invariant(Order).when(status == paid).then(paid_at == present)
forbidden(Order, status == pending, paid_at == present)
relate(Order, Customer, N:1)
```

スナップショット（[rdra_ish_emit__codegen__tests__typescript_snapshot.snap](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/crates/rdra-ish-emit/src/codegen/snapshots/rdra_ish_emit__codegen__tests__typescript_snapshot.snap)）の一部を抜き出します。doc commentは省きました。

```ts
export type OrderKind =
  | "Pending"
  | "Paid"
  | "Cancelled";

export type OrderPending = Readonly<{
  kind: "Pending";
  id: OrderId;
  total: Money;
  method: PaymentMethod;
  delivered_at: DateTime | null;
  type: string | null;
  customer_id: CustomerId;
  paid_at: null; // narrowed by the forbidden rule
}>;

export type OrderPaid = Readonly<{
  kind: "Paid";
  id: OrderId;
  total: Money;
  paid_at: DateTime; // narrowed by the invariant
  method: PaymentMethod;
  delivered_at: DateTime | null;
  type: string | null;
  customer_id: CustomerId;
}>;

// OrderCancelled omitted
export type Order =
  | OrderPending
  | OrderPaid
  | OrderCancelled;

// The flat row keeps the tag column status
export type OrderRow = Readonly<{
  id: OrderId;
  total: Money;
  status: OrderStatus;
  paid_at: DateTime | null;
  // ...
}>;

export type PayError = NotEnabled;

export type PayResult = Readonly<{
  order: OrderPaid;
  order_expected: ExpectedSource;
}>;

// Only an OrderPending can be paid
export function pay(order: OrderPending, orderPaidAt: DateTime): Result<PayResult, PayError> {
  // ...
}

export function runPay(order: Order, orderPaidAt: DateTime): Result<PayOutcome, PayError> {
  if (order.kind === "Pending") {
    return pay(order, orderPaidAt);
  }
  return { ok: false, error: { kind: "NotEnabled", usecase: "Pay" } };
}

export type PayUseCase = {
  readonly preparePay: (order: OrderId, orderPaidAt: DateTime) => Promise<Result<PayOutcome, PayError>>;
  readonly commitPay: (write: PayOutcome) => Promise<Result<void, PayError>>;
};
```

同じ出力のヘッダには、次の義務が並びます。

```text
// Unique_Customer_email: no two Customer rows share email.
// Ref_Order_customer_id: Order.customer_id names a present Customer.
// Check_Order_total_0 [checked]: every Order row satisfies total >= 0 (@check on total).
// Ref_OrderLine_order_id: OrderLine.order_id names a present Order.
// MinCard_OrderLine_Order [checked]: every present Order has at least one OrderLine through OrderLine.order_id.
// OneTransaction: each function runs in one transaction with the reads of its rows, marks, and events: ...
```

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

## 互換性の範囲

`codegen` の大部分は実験的です。[互換性契約](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/compatibility.md#the-typescript-types-of-codegen)が保証するのは、`check` が通るモデルに対する `codegen --lang ts [-o <FILE>]` の型だけです。

| 互換性契約の対象 | 実験的（どのリリースでも変わりうる） |
|---|---|
| `Result`、`InvalidValue`、`InvalidRow` | 遷移関数、結果型、イベント、ランマーク |
| スカラー（`Money` など）とid型 | ルール検査、ディスパッチャ |
| 値の集合（`PaymentMethod` など） | `NotEnabled`、`Rejected`、`InvalidArgument`、`<UseCase>Error` |
| 状態型と `<Entity>Kind` | ヘッダと義務、候補ルール |
| `<Entity>Row` | 契約 `<UseCase>UseCase`、適合ポートとハーネス |
| 上記のコンパニオンと `parse<Entity>Row` のシグネチャ | `--seal`、`--allow-failing`、`--check` と指紋 |
| | `--format json`、Rust と Go の出力 |
| | 状態型でないエンティティとDTOの型 |

`check --code` と `rdra.toml` の `[code]` 表、`Code*` の検出名も実験的です。契約が固定する型の名前規則（PascalCase化や接頭辞 `V`）は、upstreamの [compatibility.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/compatibility.md#the-typescript-types-of-codegen) にあります。

## 生成を拒むとき

`codegen` は `check` が拒むモデルからは生成しません（終了コード `1`）。`--allow-failing` を付けると生成しますが、状態型は列を絞らず、関数とルール検査もありません。`check` の各エラーは義務 `NotMet_<error>` になります。

`codegen` には `--buc` や `--entity` のような部分生成のフラグがありません。常にモデル全体を生成します。

2つの宣言が同じ型名を生む場合は `NameCollision` で失敗します。たとえばエンティティ `OrderStatus` と、`Order.status` のインライン `Enum` が衝突します。TypeScriptでは、モデルの型名が `Result`・`assertNever`・`Symbol` のときも `NameCollision` です。モデルの名前は、実験的な宣言とも名前空間を共有します。そのため、将来のリリースで新たに衝突する場合があります。

## check --code

`check --code` は、サービスのコードがモデルの要求するものを持っているかを確かめます。`codegen` と同じく実験的です。rdra-ishはサービスのコードを構文解析しません。`[code]` 表が指すファイルをすべて生成し直して比べ、`build` と `run` ではコンパイラのエラーを読みます。

モデルの検査の後に走り、モデルが `check` に失敗すると何も検査しません。

```bash
rdra-ish check model/ --code          # same as --code=fresh
rdra-ish check model/ --code=build
rdra-ish check model/ --code=run
```

| レベル | 検査すること |
|---|---|
| `fresh` | `codegen --code` が書く各ファイルが、モデルの今の生成物と一致する。コンパイラは走らない。 |
| `build` | `fresh` に加えてプローブをビルドし、サービスが契約どおりにコンパイルできるかを見る。コンパイラのエラーはユースケースに対応づける。 |
| `run` | `build` に加えて適合テストを走らせる。 |

| 言語 | `build` | `run` |
|---|---|---|
| Rust | `cargo check --test <probe> --message-format=json` | `cargo test --test <probe> -- rdra_conformance` |
| TypeScript | `tsc --noEmit --pretty false -p tsconfig.rdra.json` | `node <probe>`（Node 22.18以降） |
| Go | `go test -count=1 -run ^$ -gcflags=-e ./<probe dir>` | `go test -count=1 -run ^TestRdraConformance$ ./<probe dir>` |

最終行は `OK: code: what the model requires, at --code=<level>` か、`FAIL: code: <n> error(s) at --code=<level>`（終了コード `1`）です。`[code.rust]`・`[code.go]`・`[code.ts]` のどれもないモデルに `--code` を付けると終了コード `1` になります。何も検査しない実行が通ることはありません。LSPはビルドを走らせず、古くなった生成ファイルを `rdra.toml` の表の行に示します。

### rdra.toml の code 表

`[code.<lang>]` 表は、`codegen --code` が書くファイルを指定します。パスは `rdra.toml` のあるディレクトリからの相対パスです。必須は `domain` だけです。

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
| `traces` | 適合トレースです。指定すると `domain` に適合ポートとハーネスも入ります。 |
| `probe` | サービスが各ユースケースの契約を実装していると述べるファイルです。`build` に必要です。 |
| `service` | 契約を実装する型です。書き方は言語ごとに異なります。 |
| `new` | 新しいサービスを作る式です。Rustの適合テストでは必須です。 |
| `root` | ビルドを走らせ、台帳を探すディレクトリです。 |
| `build`, `run` | 既定のコマンドの代わりに走らせるコマンドです。 |

`module`・`package`・`seal`・`tsconfig`・`conformance_states` などのキーもあります。全体はupstreamの [The code tables](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#the-code-tables) を参照してください。未知のキーはエラーです。

### 義務の台帳

どのレベルでも、生成コードが挙げる各義務には持ち主が必要です。サービスのコードにマーカー行を書くか、`[code.obligations]` にファイルを書きます。

```ts
// rdra: obligation Unique_Order_note src/migrations/001_order.sql
```

マーカーはコメント記号（`//`、`#`、`--`）の後に置きます。ファイルを省くと、マーカーのあるファイルが持ち主になります。検査するのは持ち主がいることと、そのファイルが存在することだけです。義務が実際に守られているかは見ません。

### 主な検出

| 名前 | 起きるとき |
|---|---|
| `CodeMissingUseCase_<UseCase>` | サービスがユースケースの契約を実装していない |
| `CodeIncomplete_<UseCase>` | 契約の一部のメソッドがない |
| `CodeSignature_<UseCase>` | メソッドの引数か戻り値の型が契約と違う |
| `CodeConformance` | `run` で適合テストが失敗した |
| `CodeObligationUnowned_<name>` | 義務に持ち主がいない |
| `CodeObligationOwnerMissing_<name>` | 持ち主のファイルが存在しない |

```text
error[CodeObligationUnowned_Unique_Order_note]: no code owns the obligation Unique_Order_note
  model: model/order.rdra:6:1  no two Order rows share note.
  fix:   add `// rdra: obligation Unique_Order_note <file that keeps it>` or list it under [code.obligations]
```

`check --code` が見ないものもあります。契約を経由せずにストアを直接書くコードや並行性、ハーネスの境界を超える振る舞いです。詳しくはupstreamの [code-check.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/design/code-check.md#what-it-cannot-detect) にあります。

## typescript-states からの移行

`export --kind typescript-states` と `states --format typescript` はv3.0.0で削除されました。どちらも置き換え先を示す使い方の誤り（終了コード `2`）になります。

| 以前 | v3.0.0 |
|---|---|
| `rdra-ish export <INPUTS> --kind typescript-states -o x` | `rdra-ish codegen <INPUTS> --lang ts -o x.ts` |
| `rdra-ish states <INPUTS> --format typescript` | `rdra-ish codegen <INPUTS> --lang ts` |
| `order.status === "paid"` | `order.kind === "Paid"` |
| `orderFromRow(row)` | `Order.fromRow(row)`（`Result` を返す） |
| `1 as OrderId` | `OrderId.parse(1)`（`Result` を返す） |

その他の差分はupstreamの [CHANGELOG.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/CHANGELOG.md) の「TypeScript types」にあります。

## エージェントスキル

スキル [rdra-ish-implement](https://github.com/manji-0/rdra-ish-dsl/tree/v3.0.0/skills/rdra-ish-implement) は、モデルからサービスを実装する手順をエージェントに渡します。手順は次のとおりです。

1. モデルを `rdra-ish check` に通す。
2. `rdra.toml` に `[code.<lang>]` 表を書く。
3. `rdra-ish codegen model --code` で生成する。
4. 生成された契約に沿ってサービスを書く。
5. 各義務に持ち主を付ける。
6. `check --code=build` と `check --code=run` で確かめる。

CIでは `rdra-ish check model --code`（`fresh`）で生成ファイルの古さを検出できます。スキルの入れ方はupstreamの [skills/README.md](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/skills/README.md) にあります。

## 関連

- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [kamae-rs](/projects/kamae-rs/)：生成するRustが従う指針
- [kamae-model-translator](/projects/kamae-model-translator/)：kamaeのドメインモデルを言語間で移植する
