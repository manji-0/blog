---
title: serde_jsonとzod・valibot・arktypeに同じJSONを同じように読ませる
description: PureCrateがサーバーのserde_jsonと同じ規則でJSONを読み書きするスキーマを生成するために、serde_jsonの挙動を実測して仕様にした話。JSON.parseが捨てる情報の取り戻し方と、3つのスキーマライブラリでの揃え方もまとめる
---

[前回](/blog/2026/purecrate-semantics-preservation/)は、Rustのドメインロジックを素のTypeScriptへ翻訳する[PureCrate](https://github.com/manji-0/purecrate-ts)で、意味を保つための定義と制約について書いた。今回はその境界の話を書く。サーバーのRustがserde_jsonで書いたJSONを、クライアントのTSがserde_jsonとまったく同じ規則で読み、同じバイト列で書き戻すための仕組みである。

対象のバージョンは0.23.0である。コード例は、記事用の小さなクレートを `purecrate-ts build --schema zod` した実際の出力だ。

## なぜ境界が問題になるのか

PureCrateを使うと、注文の状態遷移のような関数を、サーバーとクライアントで共有できる。典型的な使い道は楽観的更新だ。クライアントがサーバーから状態を受け取り、その場で `step(state, event)` を走らせて画面を更新し、イベントをサーバーに送る。

ここで、状態はサーバーからJSONで届く。振る舞いを共有しても、JSONから値を作る変換を手で書いていては、ロジックから取り除いた食い違いが境界に戻ってくる。しかも、serde_jsonが書くJSONは、PureCrateが生成するTSの値と形が違う。

| Rust | 生成するTSの値 | serde_jsonの既定 |
| --- | --- | --- |
| ユニットバリアント `Inc` | `{ kind: "Inc" }` | `"Inc"` |
| `Add(i32)` | `{ kind: "Add", value: 1 }` | `{"Add":1}` |
| `Move { dx }` | `{ kind: "Move", dx: 1 }` | `{"Move":{"dx":1}}` |
| `i64` | `bigint` | 数値 |
| `Option<T>` | `T \| null` | `null` か値 |
| `BTreeMap<u32, V>` | `ReadonlyMap<U32, V>` | `{"9":v,"10":w}` |

形の違いだけなら、変換を書けば済む。難しいのは、読み方の細部である。`JSON.parse` は2^53を超える整数を黙って丸める。`50.0` と `50` を区別しない。重複したキーは最後の値だけを残し、整数に見えるキーを先頭に並べ替える。どれも、serde_jsonとは違う振る舞いだ。

## 方針: 同じソースから境界のスキーマを生成する

選択肢はいくつかあった。

- **境界は対象外にする。** 手で書いた変換が、データが入ってくるまさにその場所で約束を崩すので、採らなかった
- **型宣言の生成で勝負する（ts-rsやspectaのように）。** DTOのクレートの多くは、ジェネリクス、外部の型、serdeの属性に依存している。それを追いかけると、検証された振る舞いという本題から離れるので、採らなかった
- **`#[serde(tag = "kind")]` を強制する。** serdeはタプルバリアントやプリミティブのnewtypeでこれを拒否するので、強制はしない
- **同じRustのソースから、検証付きの読み手を生成する。** これを採った。1つのソースから、型、振る舞い、読み手が出てきて、どれも差分テストで確かめられる

`--schema zod`（または `valibot`、`arktype`）を付けると、`Deserialize` を導出した公開型ごとにスキーマを、`Serialize` を導出した型ごとに書き手を生成する。

```rust
#[derive(Serialize, Deserialize)]
pub enum State {
    Draft { lines: u32 },
    Placed { total: u64, stock: BTreeMap<u32, u32> },
    Cancelled,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    AddLine,
    Place { total: u64 },
}
```

```typescript
export const State: z.ZodType<DomainState> = z.union([
  variant({ Draft: record({ lines: u32 }) }).transform((x): DomainState => ({
    kind: "Draft",
    lines: x.Draft.lines,
  })),
  variant({ Placed: record({ total: u64, stock: btreeMapOf(intKey(u32), u32) }) }).transform(
    (x): DomainState => ({ kind: "Placed", total: x.Placed.total, stock: x.Placed.stock }),
  ),
  unitVariant("Cancelled").transform((): DomainState => ({ kind: "Cancelled" })),
]);

export const Event: z.ZodType<DomainEvent> = internallyTagged(
  "type",
  { addLine: "AddLine" },
  {
    place: record({ total: u64 }).transform((x): DomainEvent => ({
      kind: "Place",
      total: x.total,
    })),
  },
);

export const fromJson = {
  State: (text: string): DomainState => State.parse(parseJson(text)),
  Event: (text: string): DomainEvent => Event.parse(parseJson(text)),
} as const;
```

`fromJson.T(text)` がJSONのテキストを読み、`toJson.T(x)` がserde_jsonと同じテキストを書く。スキーマライブラリは、生成したパッケージのpeer dependencyにする。コアのランタイムは、どのスキーマライブラリにも依存しない。

## serde_jsonを仕様書として読む

「serdeの既定の振る舞いに従う」と書くのは簡単だが、細部はドキュメントに書かれていない。そこで、疑問が出るたびに、実際のserde_json（1.0.145）で小さなプログラムを書いて確かめ、その結果を仕様にした。

### 整数

serde_jsonは、整数のフィールドに文字列の `"50"` を渡すと拒否する。`50.0` や `5e1` は浮動小数としてしか読まず、整数のフィールドには入れない。2^64近くの `u64` も、正確に読む。

一方、`JSON.parse` は2^53を超える整数を丸める。

```typescript
const big = '{"Placed":{"total":9007199254740993,"stock":{}}}';
JSON.parse(big).Placed.total;   // 9007199254740992（丸められる）
fromJson.State(big).total;      // 9007199254740993n
```

`fromJson` は、`JSON.parse` ではなくランタイムの `parseJson` でテキストを読む。`parseJson` は、`JSON.parse` のreviverに渡されるソーステキスト（Node 21以降）を使い、次のように読み分ける。

- 安全な範囲を超える整数リテラルは、正確な値の `bigint` にする
- 浮動小数の形で書かれた整数（`50.0`、`5e1`、`-0`）は `JsonFloat` という印を付ける。`f64` のスキーマはこれを読み、整数のスキーマはすべて拒否する

スキーマ自体は、安全な範囲の `number` と `bigint` だけを整数として受け付ける。`JSON.parse` で丸められた値は必ず安全な範囲の外にあるので、`parseJson` を通さなかった場合も、間違った値を黙って読むことはない（拒否になる）。

### マップのキー

キーの読み方は、serde_jsonの実測がいちばん効いたところだ。`BTreeMap<u8, u8>` などに、いろいろなキーのテキストを読ませた結果が次の表である。

| キーのテキスト | 整数のキー |
| --- | --- |
| `"1"`、`"-1"`（符号付き） | 読む |
| `"01"`、`"-01"` | 拒否 |
| `"+1"`、`" 1"`、`"1 "`、`""` | 拒否 |
| `"1e2"`、`"1.0"` | 拒否（浮動小数として読まれ、整数の型と合わない） |
| `"-0"` | 拒否。ただし `i128` だけは `0` として読む |
| `"256"`（`u8` に対して） | 範囲外として拒否 |

整数のキーは、文字列としてではなく、JSONの数値の文法で読まれている。`str::parse` なら通る `"+1"` や `"01"` が拒否されるのは、そのためである。`i128` の `"-0"` だけが例外になっているのも、実測するまで分からなかった。

`bool` のキーは `"true"` か `"false"` だけを読み、`"True"` は拒否する。`char` のキーはちょうど1文字だけを読む。`Uuid` のキーは大文字でも読み、正規の小文字の形にそろえる。

さらに細かいところもある。

- **エスケープしたキー。** `{"\u0031":1}`（`"1"` をエスケープしたもの）のように、整数や `bool` のキーを `\u` でエスケープして書くと、serde_jsonは拒否する。キーのバイト列をそのまま数値として読むからだ。一方、`char`、`String`、`Uuid` のキーでは、エスケープを解いてから読む
- **同じキーが2回。** 後のほうの値が残る。`i128` のマップで `"-0"` と `"0"` が両方あれば、テキストで後にあるほうの値が残る

### enumとstruct

serdeの既定の外部タグでは、バリアントを包むオブジェクトのキーはちょうど1つでなければならない。`{"Draft":{"lines":1},"Cancelled":null}` のように2つあれば拒否する。ユニットバリアントは、`"Cancelled"` と `{"Cancelled":null}` のどちらでも読む。

structは、JSONのオブジェクトのほかに、フィールドを順に並べた配列（`[3,null]`）からも読める。serde_jsonは書き出さないが、読むことはできる形である。長さが違えば拒否する。valibotとarktypeのオブジェクトのスキーマに配列を渡すと、すべてのフィールドが欠けているものとして読まれてしまうので、アダプタの側でこの形を読む。

### 属性

サーバーの型によく付く属性は、serde_deriveと同じ規則で読み書きする。`rename`、`rename_all`（serdeの8つの規則すべて）、`tag`、`content` である。`rename_all` の名前の変換は、serde_deriveの `case.rs` を、そのテストごと移植した。

`untagged`、`flatten`、`default`、`skip*` などは、場所を示して拒否する。たとえば `untagged` は、serdeが各バリアントを順に試して最初に読めたものを採る。その順番をスキーマが正確に写す必要があり、写し損ねると黙って違う値になる。サーバーでこれらが必要なら、別のワイヤ用の型を持ち、Rustの中で変換してもらう。

## JSON.parseが捨てる情報を取り戻す

`JSON.parse` は、読んだ時点でいくつかの情報を捨てる。serde_jsonと同じ判定をするには、それを取り戻す必要があった。`parseJson` は、オブジェクトごとに次のことを記録し、読む側のスキーマが判断できるようにしている。

- 同じキーが2回あったこと（`JSON.parse` は最後の値だけを残す）
- 対になっていないサロゲートを含むキー
- エスケープで書かれたキー
- テキストでのキーの順番。`Object.keys` は整数に見えるキーを先頭に並べ替えるので、テキストの順とずれる

拒否するかどうかは、読む側が決める。structは、自分が持つフィールドの重複を拒否し、知らないフィールドの重複は読み飛ばす。serdeが、読むフィールドでは重複を拒否し、無視するフィールドでは見逃すのと同じである。マップは、エスケープとキーの順番を使って、先の表と「後の値が残る」規則を実現している。

スキーマライブラリ自体の振る舞いにも、合わせるべき点があった。zodの `record` は `__proto__` というキーを落とし、valibotは `__proto__` と `constructor` を落とす。Rustの `BTreeMap<String, V>` ではどちらも普通のキーなので、アダプタはオブジェクトを直接読んで、すべてのキーを拾っている。

## 書く側もバイト単位で合わせる

`toJson.T(x)` は、同じRustの値に対してserde_jsonが書くテキストを、バイト単位で同じに書く。

```typescript
toJson.State(placed(9007199254740993n));
// {"Placed":{"total":9007199254740993,"stock":{"9":2,"10":1}}}
```

- **整数** は、`bigint` も丸めずに正確な10進で書く
- **マップ** は、Rustのキーの順で書く。整数のキーは値の順なので、`"9"` が `"10"` より前に来る
- **浮動小数** は、serde_jsonが使うryuと同じ表記にする（`1.0`、`-0.0`、`1e16`、`1.5e-7`）。`f32` は `f32` としての最短の桁で書く
- **非有限の浮動小数** は、serde_jsonと同じく `null` と書く。そして、serde_jsonと同じく `null` を浮動小数として読み戻さない。この非対称も、そのまま揃えている

## どうやって確かめているか

規則を実測で決めても、実装がそれに従っているかは別に確かめる必要がある。テストでは、vendorしたserde_jsonと生成したスキーマに同じテキストを渡し、受け付けるか拒否するかと、読んだ値を書き戻したテキストを比べている。

- **形と規則。** すべての型の形について、serde_jsonが書いたテキストをスキーマで読み、書き戻して、テキストが一致することを確かめる。マップのキーは、先の表のすべてのテキスト、エスケープしたキー、同じキーの2回を両方の順番で試す。3つのライブラリのすべてで回す
- **属性。** 2,953個のJSONテキスト（そのうちserdeが読むのは343個）について、`fromJson` してから `toJson` した結果が、serde_jsonの `from_str` してから `to_string` した結果と一致するか、両方とも拒否することを確かめる
- **浮動小数。** 8万個の擬似乱数のビット列と境界の値で、書いたテキストが一致することを確かめる
- **実際の使い方の再現。** examples/paymentでは、3イベント以内で到達できるすべての状態と、すべてのイベントの組を試す。そのすべてで、クライアントの `toJson(step(read(state), read(event)))` が、サーバーの `serde_json::to_string(&step(state, event))` と一致することを確かめる

## 3つのライブラリの違い

zod、valibot、arktypeのどれでも同じJSONを同じように読めるよう、ライブラリごとの差はアダプタに閉じ込めている。苦労したのはarktypeだった。

- arktypeは、morphを含むオブジェクトの和を拒否する。そこでenumは、バリアントを順に試す形で組み立てる
- 再帰する型や、後で宣言される型を参照できるように、各スキーマは初めて読むときに遅延して組み立てる。最初に試した `type.module` を使う設計では、import時に `ReferenceError` が出た
- 入れ子の読み取りが失敗したときは、エラーをmorphの走査に渡して、エラーの場所（パス）を保つ

ジェネリックな型（`Page<T>`）のスキーマは、型パラメータのスキーマを受け取る関数にしている（`Page(User)`）。書き手も、型パラメータの書き手を受け取る関数である。

## 残る差

- **同じキーが2回あり、前の値が不正な場合。** serde_jsonはすべての値を読むので、`{"1":256,"1":1}` を `BTreeMap<u8, u8>` として読むと、前の `256` が範囲外で拒否になる。`JSON.parse` は最後の値しか残さないので、スキーマは `{1: 1}` として読む。違う値になることはなく、受け付ける範囲が広いだけだ。serde_jsonは、同じキーを2回書くことはない
- **JSONの入れ子の深さ。** serde_jsonは128段を超える入れ子を拒否するが、スキーマには上限がない
- **Hermes。** React NativeのエンジンでJSON.parseのソーステキストが使えるかは、まだ確かめていない。使えなければ、`parseJson` に自前のパーサーが要る

## まとめ

- 振る舞いを共有しても、境界の変換を手で書けば食い違いが戻ってくる。だから、読み手と書き手も同じRustのソースから生成する
- 「serdeに従う」の中身は、実際のserde_jsonで確かめて決める。整数のキーが数値の文法で読まれることや、`i128` の `"-0"` は、実測しないと分からなかった
- `JSON.parse` が捨てる情報（大きな整数、`50.0` と `50` の区別、キーの重複・エスケープ・順番）は、`parseJson` で記録して取り戻す
- 読んで書き戻したテキストがserde_jsonと一致することを、3つのライブラリすべてで、テストで確かめる
