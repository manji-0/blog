---
title: RustのドメインロジックをTypeScriptへ「意味ごと」移す
description: Rustのドメインロジックを素のTypeScriptへ翻訳するPureCrateで、セマンティクスを保つために決めた等価性の定義、意味を保てない形を拒否する制約、TSの型検査と噛み合うナローイングの書き方をまとめる
---

[PureCrate](https://github.com/manji-0/purecrate-ts)（`purecrate-ts`）というツールを作っている。Rustで書いた純粋なドメインロジック（代数的データ型と状態遷移）を、WASMやシリアライズ境界を挟まずに、素のTypeScriptの値と関数へ翻訳するものだ。型だけでなく、振る舞いを共有する。サーバーのRustとフロントエンドのTSが、同じ注文の状態遷移や同じ料金計算を同じ結果で実行できるようにしたい。

典型的な形は次の遷移関数である。

```rust
pub fn step(state: State, event: Event) -> Result<State, Error>
```

今回はセマンティクス保存の話を書く。翻訳したTSが元のRustと同じ意味を持つと言えるために、何が必要か。PureCrateは次の3つを組み合わせている。

1. 等価性の定義を先に決める
2. 意味を保てない形を、生成する前に拒否する制約
3. 出力するTSを、TSの型検査（特にナローイング）と噛み合う形で書く

対象のバージョンは0.23.0である。TypeScriptのコード例は、記事用の小さなクレートを実際に `purecrate-ts build` した出力だ（import行は省いた）。

## セマンティクス保存とは何か

### 等価性の定義

「同じ結果」は表で定義している。受け付けた公開関数 `f` と生成した `f'` について、`f` の定義域にあるすべてのRustの値 `x`（TSでの表現を `x'` とする）で、次が成り立つことを要求する。

| 観点 | 要求 |
| --- | --- |
| 戻り値 | `f(x)` と `f'(x')` が値として等しい |
| 型 | TSの型がRustの型を正確に表し（`i64` は `bigint`、幅ごとのブランド）、`tsc --strict` を通る |
| 想定内の失敗 | `Err` のバリアントとペイロードが同じ |
| 想定外の失敗 | Rustがpanicするところで、TSはRustと同じメッセージで `Panic` を投げる |

基準はRustのdebugビルドにした。debugビルドでは整数の桁あふれやゼロ除算がpanicするので、TSでも例外を投げる。panicしうる演算をすべて拒否すると狭すぎ、`checked_*` だけを許すと書きにくすぎる。現実のドメインコードには、この基準が合っていた。

### 定義域は「Rustの値の像」

約束するのは、Rustの値をTSに写した範囲（像）だけである。TSでは作れてもRustでは作れない値については、何も約束しない。

- `5 as I32` や `"x" as Email` のように、型の主張だけで作った値。ブランドは型の上にしかないので、外から入る値は `Int.i32.of` やワイヤ形式のスキーマを通す
- 公開関数が返したのではない、閉じた型（非公開フィールドを持つ構造体）の値
- 対になっていないサロゲートを含む文字列。Rustの `String` ではありえないので、公開関数は入口でこれを検査してpanicする
- 長さの違う配列が `[T; N]` の位置に来た場合。これも入口で長さを検査する

定義域をこう決めておくと、「TSでは何でも渡せるから等価性は無理だ」という話を避けられる。同時に、境界での検査をどこに置けばよいかもはっきりする。

## 課題: RustとJavaScriptは同じ顔をして違う

Rustの式を同じ見た目のJSの式にすると、次のようなところで意味がずれる。

| 領域 | Rust | 素朴なJS |
| --- | --- | --- |
| 整数の除算 | `7 / 2` は `3` | `3.5` |
| 桁あふれ | `i32::MAX + 1` はpanic（debug） | `2147483648` |
| ゼロ除算 | panic | `Infinity` |
| 文字列の長さと添字 | UTF-8のバイト単位 | UTF-16のコード単位 |
| 文字列の順序 | コードポイント順 | UTF-16のコード単位順（BMP外とU+E000以降で逆転する） |
| `Option<Option<T>>` | `None` と `Some(None)` は別 | どちらも `null` |
| マップのキー | 等しい値で見つかる | `Map` はオブジェクトを同一性で比べる |
| `?` の位置 | 関数から抜ける | 即時関数の中に置くと、その関数からしか抜けない |
| `HashMap` の反復順 | 規定されない | 挿入順 |

やっかいなのは、ずれたときに何も起きないことだ。例外や型エラーは出ず、たまに違う値を返すだけである。そこで、PureCrateの方針は次のように決めた。

> 出力がRustと黙って食い違った瞬間に、このツールは手書きの二重実装より悪いものになる。誰も気づかないからだ。だから意味を保てないものは生成の前に拒否し、部分的に翻訳することはしない。

## 解決策としての制約

### 訳せないものは拒否する

PureCrateは、既存のRustをそのまま通すコンパイラではない。対象は「PureCrateの制約の中で新しく書くドメインコード」である。実際、既存のクレートをそのまま測ると、最初は公開関数956個のうち1個しか受け付けなかった。この数字を追いかけると、`std` のほとんどの意味を保守することになる。そこで、作者が記法のコストを少し払う代わりに、検証された振る舞いの共有を得る、という取引にした。

拒否は `path:line:col: [reason/code] message` の形で、どう書けばよいかを添えて返す。そのときは何も書き出さない。

### 制約の例と、その理由

制約にはどれも、「その形だとTSで同じ意味にできない」という具体的な理由がある。

- **整数の演算は型付きで出力する。** 型推論が式ごとに型を決め、`+` を `Int.i32.add(a, b)` のように出力する。除算は切り捨て、桁あふれとゼロ除算はRustのpanicメッセージで投げる。型の決まらない整数リテラル（rustcなら `i32` に既定する場面）は拒否し、接尾辞か注記を求める
- **releaseビルドでも桁あふれを検査させる。** 出力の主な使い道は、同じ型と関数を共有するサーバーである。サーバーは `--release` でビルドされ、既定では桁あふれが巻き戻る（TSは投げる）。そこで `[profile.release] overflow-checks = true` のないクレートは拒否する。`--allow-overflow-wrap` を付ければ、警告付きで通す
- **`Option<Option<T>>` は拒否する。** `None` と `Some(None)` が、TSではどちらも `null` になるからだ。同じ理由で、値が `Option` のマップと、`Option` の配列も拒否する
- **`HashMap` と `HashSet` は拒否し、`BTreeMap` と `BTreeSet` を使ってもらう。** Rust自身が反復順を決めていないので、順序に依存する関数には一致すべき唯一の結果がない。`BTreeMap` は読むたびにキーの型の順序で並べ直す。JSの `sort()` の既定の比較は文字列なので、`10` が `9` より前に来てしまい、使えない
- **マップのキーは、実行時にJSのプリミティブになる型だけにする。** 整数、`char`、`bool`、`Uuid`、`String` と、それらのnewtypeである。自前のenumや構造体はオブジェクトなので、`Map` が同一性で比べてしまい、等しい別の値で探すと見つからない
- **`&mut` は入れない。** 局所変数の `Vec` への `push` や `v[i] = x` までは許す。`&mut self` などは、TSのシグネチャと書き込みの経路がRustと変わり、新しい食い違いの温床になる
- **`format!` の引数の評価順を守る。** Rustは引数を書いた順に評価してから `fmt` を走らせる。テンプレートリテラルは、置いた順に評価する。計算を含む引数が自前の型の値の後ろにあると順番がずれうるので、拒否して「先に `let` で束ねる」よう案内する
- **`Display` の幅指定は拒否する。** 自前の型の値に `{:>8}` を付けても、`fmt` が `f.pad` を呼ばない限りRustは幅を無視する。これは合わせられない
- **むき出しの `T` に対する `clamp` は拒否する。** 境界が逆転したときのpanicメッセージが型によって違う。整数では `min > max. min = 9, max = 1`、文字列などでは `assertion failed: min <= max` である。トレイト境界の辞書からは、どちらになるかが分からない

### 制約のコスト

制約は、作者が払う記法のコストである。PureCrateでは、ドメインコードがよく取る形を集めたコーパスと、重み付きの表で「理想までの距離」を測っている。0.23.0では94%で、コーパスの138関数のうち134を受け付ける。残る4件は `HashMap`、`&mut self`、`usize` への `&`、浮動小数の `{:.2}` で、前の2つは意図して入れないものだ。

入れないと決めたものは、距離の残りではなく、制約の中で書くことの恒久的なコストとして数えている。

## TS側の記述による適切なナローイング

セマンティクス保存の話で見落とされがちなのが、出力したTSが型検査を通ることも等価性の一部だという点だ。PureCrateの出力は、`tsc --strict` と、型情報を使うlint（oxlintのtype-awareモード）を通らなければならない。そしてTSの型検査を通すうえで中心になるのが、制御フロー解析によるナローイング（絞り込み）である。

Rustの型検査器は、`match` の腕の中では、その値がそのバリアントであることを知っている。TSに同じことを知らせるには、TSが絞り込める形で書く必要がある。以下では、PureCrateが出力で使っている書き方を、実際の出力とともに紹介する。

### 1. ADTは `kind` を持つ判別共用体に、`match` は `switch` に

例として、注文の状態遷移を書く。

```rust
pub enum State { Draft { lines: u32 }, Placed { lines: u32, total: u64 }, Cancelled }
pub enum Event { AddLine, Place { total: u64 }, Cancel }
pub enum Error { Empty, Closed }

pub fn step(state: State, event: Event) -> Result<State, Error> {
    match (state, event) {
        (State::Draft { lines }, Event::AddLine) => Ok(State::Draft { lines: lines + 1 }),
        (State::Draft { lines }, Event::Place { total }) => {
            if lines == 0 {
                return Err(Error::Empty);
            }
            Ok(State::Placed { lines, total })
        }
        (State::Cancelled, _) => Err(Error::Closed),
        (_, Event::Cancel) => Ok(State::Cancelled),
        (s, _) => Ok(s),
    }
}
```

出力は次のとおりだ。

```typescript
export const step = (state: State, event: Event): Result<State, Error> => {
  switch (state.kind) {
    case "Draft": {
      const lines = state.lines;

      switch (event.kind) {
        case "AddLine":
          return Result.ok({ kind: "Draft", lines: Int.u32.add(lines, 1 as U32) });
        case "Place": {
          const total = event.total;
          if (lines === 0) return Result.err({ kind: "Empty" });
          return Result.ok({ kind: "Placed", lines, total });
        }
        case "Cancel":
          return Result.ok({ kind: "Cancelled" });
        default:
          return assertNever(event);
      }
    }
    case "Placed": {
      if (event.kind === "Cancel") return Result.ok({ kind: "Cancelled" });
      const s = state as State;
      return Result.ok(s);
    }
    case "Cancelled":
      return Result.err({ kind: "Closed" });
    default:
      return assertNever(state);
  }
};
```

ポイントは3つある。

- **`case` の中では、TSが `state` を絞り込む。** だから `state.lines` を安全に読める。Rustのパターンで束縛した名前は、絞り込んだ後に `const` で取り出す
- **網羅性は、`default: return assertNever(x)` でTSにも検査させる。** すべての `case` を尽くしていれば、`default` の `x` の型は `never` になる。バリアントを足して `case` を書き忘れると、TSの型エラーになる。Rustの網羅性検査を、TS側でも二重に効かせる形である
- **タプルの `match` は、Rustの決定木をそのまま `switch` の入れ子にする。** `(State::Cancelled, _)` と `(_, Event::Cancel)` の優先順位も、腕の順序どおりに保たれる。`Cancelled` の分岐では、`Event` を見ずに `Closed` を返している

### 2. `Option` は `T | null` に、`Result` は判別共用体に

`Option<T>` は `T | null` にする。`null` との比較で、TSがそのまま絞り込める。`Result<T, E>` は `{ kind: "Ok"; value: T } | { kind: "Err"; error: E }` にして、`kind` の比較で絞り込めるようにする。

ガード付きの `match` は、`&&` でつないだ条件になる。左側の `total !== null` で絞り込まれた `total` を、右側でそのまま数値として使える。

```rust
pub fn discount(total: Option<u64>, rate: u64) -> u64 {
    match total {
        Some(t) if t >= 10_000 => t / 100 * rate,
        Some(_) => 0,
        None => 0,
    }
}
```

```typescript
export const discount = (total: U64 | null, rate: U64): U64 =>
  total !== null && total >= 10000n
    ? Int.u64.mul(Int.u64.div(total, 100n as U64), rate)
    : (0n as U64);
```

### 3. `?` と `let`-`else` は、早期returnのガード節にする

`?` は、`Err` なら関数から抜けるという制御フローである。これをTSでは、`kind` を見て `return` するガード節として書く。ガード節を抜けた後は、TSが値を `Ok` 側に絞り込むので、`.value` をそのまま読める。

```rust
pub fn replay(events: Vec<Event>) -> Result<State, Error> {
    let mut s = State::Draft { lines: 0 };
    for e in events {
        s = step(s, e)?;
    }
    Ok(s)
}
```

```typescript
export const replay = (events: ReadonlyArray<Event>): Result<State, Error> => {
  let s: State = { kind: "Draft", lines: 0 as U32 };

  for (const e of events) {
    const stepResult = step(s, e);
    if (stepResult.kind === "Err") return stepResult;
    s = stepResult.value;
  }

  return Result.ok(s);
};
```

`let`-`else` も同じ形になる。条件に合わなければ抜け、抜けなかった後では値が絞り込まれている。

```rust
pub fn placed_total(s: &State) -> Option<u64> {
    let State::Placed { total, .. } = s else { return None };
    Some(*total)
}
```

```typescript
export const placedTotal = (s: State): U64 | null => {
  if (s.kind !== "Placed") return null;
  const total = s.total;
  return total;
};
```

### 4. 即時関数を避ける

式の中に制御フローがあるとき（式としての `match` や、式の途中の `?`）、いちばん手軽な翻訳は即時関数 `(() => { ... })()` で包むことだ。しかしこれは、意味と型の両方で問題を起こす。

まず、意味が変わる。即時関数の中の `return` は、その即時関数からしか抜けない。0.10.1で見つけたバグがまさにこれだった。`match o.ok_or(x.ok_or(e)?)` で、内側の `?` が即時関数の中に置かれていた。Rustでは `Err(e)` を返すところで、TSは `Err` の腕に進まず `Ok(..)` を返していた。いまは、`?` を含む部分式を `match` の前の文として持ち上げ、関数レベルの `return` として出力している。持ち上げる順番は、Rustが引数を先に評価するのと同じである。

次に、型推論とナローイングが切れる。即時関数の戻り値の型は、その関数の中身から推論される。ループの条件にある即時関数が、ループの中で代入される変数を参照すると、TSは型を決められず `TS7024`（戻り値の型が暗黙に `any`）で拒否する。0.18.0から残っていた生成テストの最後の失敗（statementsのシード119）がこれだった。`r.ok().unwrap_or(d)` を即時関数で出力していたのを、副作用のない既定値のときは三項演算子にした。

```typescript
// 0.23.0の出力: TSがrをkindで絞り込み、valueを読める
r.kind === "Ok" ? r.value : d
```

一般にPureCrateは、式の中の制御フローを、名前付きの一時変数と文に持ち上げて出力する。一時変数にはRustの型を注記する（`const mapped: Result<I32, I32> = ...`）。これで、TSの推論に頼らなくても型が確定する。

### 5. TSのフロー解析と同じ事実を、出力する側も持つ

TSは、分岐の両側や `return` の後、ループの先頭などで、各変数がどのケースでありうるかを追跡している。出力する側がこれを知らないと、次のような問題が起きる。

- TSが「ここでは `null` しかありえない」と知っている値に `??` を書くと、`TS2871` などで拒否される
- TSが「到達しない」と判断した分岐に文を書くと、到達不能コードとして拒否される（`TS7027`）
- 逆に、TSが絞り込めない書き方をすると、`.value` が読めない

0.10.1の時点では、生成テストの120シードのうち60シードがtscに拒否されていた。そのうち47の原因は、TSは絞り込むのに出力側が畳み込まなかったことだった。0.10.2で、出力側にTSと同じ形のフロー解析（`join/flow.rs`）を入れた。

- 各変数のありうるケースを前向きに流し、条件の両側と `match` の各腕で絞り込む（ガードのない前の腕が取ったケースは除く）
- 制御フローが合流する点で結び、ループの先頭では、本体を回して状態が落ち着くまで求める
- 書き込みがあれば、その変数についての事実を忘れる。クロージャの中には、何も書き込まない名前の事実だけを持ち込む

そのうえで、決まっている分岐は畳み込む。ただし、畳み込む分岐の条件にpanicしうる部分が残っている場合（`100 / a > 0 && c` の `100 / a`）は、その部分を実行してから決まった側に進む。`a == 0` のときに、Rustと同じくpanicするためである。

### 6. TSが実際に絞り込む形だけに頼る

TSのナローイングには条件がある。出力側が「TSも絞り込むはずだ」と思い込むと、ずれが生じる。実際に直したものから3つ挙げる。

- **別名を付けた条件。** TS 4.4以降は、`const isPlaced = s.kind === "Placed"; if (isPlaced) { ... }` でも `s` を絞り込む。ただし、絞り込まれる側が `const` か、書き込まれない引数の場合に限られる。出力側が `let` で宣言した変数まで絞り込んだつもりになり、tscに拒否される出力を作っていたのを、0.21.0で直した
- **即時関数として出力された `matches!`。** ガードの中に文が必要な `matches!` は、即時関数として出力される。TSはその呼び出しでは何も絞り込まないが、出力側は絞り込んだつもりで後続のコードを畳み込み、tscに拒否されていた。0.21.0で、各腕とガードが式として出力できる場合（`o !== null && ..` の形）にだけ、絞り込むとみなすようにした
- **値ではない式に対するガード。** `matches!(n.checked_rem(-10), ...)` のように、変数ではない式を調べるガードでは、TSは何も絞り込まない。出力側も、ガードからの絞り込みを、変数と定数の束縛と、その直接の否定に限っている

### 7. 型の上だけのブランドで、数値の幅と閉じた型を表す

絞り込みとは少し違うが、TSの型でRustの区別を保つ技法としてブランドも重要である。`u32` は幅のブランドを付けた `number`、`u64` はブランドを付けた `bigint` にする。非公開フィールドを持つ構造体（閉じた型）は、そのファイルだけが作れるブランドで区別する。ブランドは型の上にしかないので、実行時のコストはない。そのぶん、外から来る値は `Int.u32.of` やワイヤ形式のスキーマで検査してから入れる。

## どうやって「同じ」を確かめているか

制約とナローイングは、最終的には検証で裏付ける。

- **rustcを最終関門にする。** 入力のクレートはrustcでも検査する。PureCrate側の型検査が見落としたものも、Rustとして正しくなければ通らない
- **差分テスト。** 同じ入力をRustと生成したTSの両方で実行し、値全体を比べる。例や機能ごとのfixtureに加え、`purecrate-ts test` コマンドで、利用者のクレートにも同じことができる
- **シードから関数を生成するテスト。** 式、文、パターン、整数の幅、テキスト、浮動小数、コレクション、文字列の8種類の生成器が、シードからランダムに関数を作る。0.23.0では、8種類×シード1〜120の計960回すべてで値がRustと一致し、tscと型を見るlintも通った。人が書いたfixtureには現れない形のバグ（先の即時関数の `?` など）は、多くがこの生成器で見つかっている
- **型を見るlintも、すべてのテストで回す。** 0.22.0で、等価性テストのすべてで、`verify.sh` と同じtype-awareのoxlintを回すようにした。それまでテストはtscだけを回していて、lintが拒否する出力（不要な型アサーション、変数の影、空ループの書き方など）が見逃されていた

## それでも残る差

すべてを一致させられているわけではない。既知の差は、設計文書に表として残している。主なものは次のとおりである。

- **2^53以上の `usize`。** Rustは2^64まで扱えるが、TSの `number` は2^53−1を超えると投げる。長さや添字は、この範囲には届かない
- **再帰の深さ。** TSは1万段を通り、1.2万段で `RangeError` になる。Rustのdebugビルドはメインスレッドで5万段を通り、10万段で異常終了する（捕まえられるpanicではない）。「両方とも失敗する」すら成り立たない
- **一貫しない比較関数での `sort_by`。** Rustのsortはpanicしうるうえに順序も規定されないが、JSの `sort` はpanicしない。全順序でpanicしない比較関数なら一致する
- **JSONで同じキーが2回あり、前の値が不正な場合。** serde_jsonは拒否し、こちらは後の値で読む。違う値になることはなく、受け付ける範囲が広いだけである

差をなくしたふりをせず、どこで止まるかを定義の一部として書いておくことが大事だと考えている。

## まとめ

- セマンティクス保存は、等価性を表で定義し、定義域（Rustの値の像）を決めることから始まる
- RustとJSのずれは、多くが黙って違う値を返す形で現れる。だから、意味を保てない形は生成前に拒否し、部分的には翻訳しない。制約は、その拒否を作者にとって予測できる規則にしたものだ
- 出力がTSの型検査を通ることも、等価性の一部である。TSが絞り込める形（判別共用体と `switch`、`T | null`、ガード節、即時関数を使わない持ち上げ）で書き、出力側もTSと同じフローの事実を持つ。そうすることで、Rustの型が保証することをTSにも理解させる
- そして、そのすべてを差分テストと生成テストで裏付ける
