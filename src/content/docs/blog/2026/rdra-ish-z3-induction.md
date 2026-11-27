---
title: RDRA-ishはz3の帰納的証明をどう安全に自動生成しているか
description: RDRA-ishの `verify --prove` が、要件モデルの状態規則を「行が何個あっても成り立つ」ことをz3で証明する仕組みを、符号化・補題の自動生成・Houdini・実行基盤・他エンジンとの相互検証の観点から、論理的な安全性に重点を置いて論文調で整理する
summary: "A paper-style reading of rdra-ish-dsl's unbounded prover: how it encodes a lifecycle model in SMT-LIB with uninterpreted row sorts, over-approximates the steps but never the rules, mines candidate lemmas from BFS without trusting them, keeps the largest inductive set with Houdini, runs z3 deterministically under resource limits, reuses a certificate only after re-checking it, and keeps itself honest against BFS at more instances and a wider Int range."
tags: [rdra-ish, z3, smt, formal-verification, induction]
---

以下はAIに書かせた論文調の解説であり、まともにレビューされていません。

---

## 要旨

要件定義DSL「RDRA-ish」の検証器は、状態規則（`forbidden`・`invariant` など）を、内蔵のBFSとTLA+/TLCで有界に検査する。有界の検査は「2インスタンスでは成り立つが3インスタンスで破れる」規則を見逃し得る。この穴を埋めるため、`verify --prove` はz3を使い、各規則が**行（インスタンス）が何個あっても、Int値がどれだけ大きくても**成り立つことを帰納法で証明する。

本稿は、rdra-ish-dslの `main`（`99f1c29`、2026-11-27）にある証明器 `crates/rdra-ish-core/src/lifecycle/prove/` を読み、帰納的証明を**自動で**組み立て、しかも**誤って「証明できた」と言わない**ための設計を整理する。要点は次の7つである。

1. エンティティの行を**未解釈ソート**に写し、行数の上限を論理から消す（第3章）。
2. 遷移関係は**上に近似してよいが、規則は近似しない**。表せない規則は「範囲外」と報告する（第4章）。
3. 補助補題はBFSの到達状態から**採掘するが、信用しない**。証明器が帰納性を確かめたものだけを残す（第5章）。
4. 規則と補題の集合から、**同時に帰納的な最大の部分集合**をHoudiniアルゴリズムで求める。z3の `unknown` は「破れた」と同じに扱う（第6章）。
5. z3への入力は型付きの項として組み立て、予算は時間でなく**資源単位（rlimit）**で与え、ソルバの台数に結果が依存しないようにする（第7章）。
6. 前回の証明結果（証明書）は**ヒントにすぎず**、毎回z3で再検査する（第7章）。
7. 証明された規則がBFSで反例を持たないことを、**インスタンス数と整数範囲を広げて**機械的に照合する。実際にこの照合が健全性の欠陥を1件見つけている（第8章）。

対象としたリポジトリは次のとおり。

https://github.com/manji-0/rdra-ish-dsl

## 1. はじめに

RDRA-ishの検査系はこれまで、遷移システムを有限の境界内で網羅する方式だった（前稿「[RDRA-ishの形式検証(TLA+/TLC)を論文調で読み解く](/blog/2026/rdra-ish-formal-verification/)」「[RDRA-ishの状態探索BFSを「安直なBFS」から速くする](/blog/2026/rdra-ish-bfs-speedups/)」を参照）。`verify` の既定の境界は1エンティティ2インスタンス、Int値は `0..5` である。BFSとTLCは、この境界の内側では完全だが、外側については何も言わない。

`--prove` は、この2つに続く**第三の意味論**として加わった。文書（`docs/formal-verification.md` の「Proofs for any number of rows」）は、役割を次のように限定している。

> `--prove` asks z3 whether each state rule holds for **any** number of rows and **any** non-negative Int value, with no top on `now`. It never finds a counterexample; the bounded engines do that.

つまり、証明器は「証明できた」か「証明できなかった」かだけを言う。反例を見つけるのは有界のエンジンの仕事である。この分業が、本稿で述べる安全性の設計の出発点になる。証明器に許される誤りは「真の規則を証明できない」方向だけであり、「偽の規則を証明する」方向の誤りは一切許されない。

実行例を示す。`samples/formal-verification/order.rdra` は、注文の状態遷移と、2つの状態規則を持つ小さなモデルである。

```rdra
entity Order "注文" {
  id: Int @pk
  status: Enum(pending, paid, shipped, delivered, cancelled) @default(pending)
  delivered_at: DateTime @null
}
...
transitions(CapturePay, Order.status, pending -> paid)
transitions(ShipOrder, Order.status, paid -> shipped)
transitions(DeliverOrder, Order.status, shipped -> delivered)
transitions(CancelOrder, Order.status, pending -> cancelled)
sets(usecase::DeliverOrder, Order.delivered_at == present)

forbidden(Order, status == cancelled, delivered_at == present)
invariant(Order).when(status == delivered).then(delivered_at == present)
```

```
$ rdra-ish verify samples/formal-verification/order.rdra --prove
...
proof (Z3 version 5.1.0 - 64 bit): 2 state rules, for any number of rows and any Int value
proved: Forbidden_Order_0
proved: Inv_Order_0
lemma: an absent Order row holds base values
lemma: no Order row is ever deleted
lemma: every present Order row is one of 5 reached patterns of (status, delivered_at)
lemma: a present Order row's (status, delivered_at) is one of {(pending, null), (paid, null), (shipped, null), (delivered, present), (cancelled, null)}
proof: 2 proved, 0 unproved, 0 out of scope
...
OK: no errors within 2 instances per entity, Int 0..5; 2 of 2 rules proved for any number of rows and any Int value
```

`lemma:` の行は、証明のために証明器が**自分で見つけて自分で確かめた**補助命題である。利用者は補題を1つも書いていない。以下では、この出力に至る過程を順に追う。

## 2. 問題設定

### 2.1 帰納的な不変条件

遷移システムを、初期状態の述語 `Init(s)` と遷移関係 `T(s, s')` で表す。状態規則 `P` が到達可能なすべての状態で成り立つことを示す標準的な方法は、次の2条件を示すことである。

- **開始（initiation）**：`Init(s) ⇒ P(s)`
- **継続（consecution）**：`P(s) ∧ T(s, s') ⇒ P(s')`

この2条件を満たす `P` を**帰納的**という。帰納的な `P` は、到達可能な全状態で成り立つ（遷移の回数についての帰納法）。SMTソルバは各条件の否定の充足可能性を判定する。否定が `unsat` なら条件は成り立つ。

### 2.2 真だが帰納的でない規則

問題は、**真の規則の多くは単独では帰納的でない**ことである。継続の条件は、規則を満たす**任意の**状態から出発する。そこには、到達し得ない状態も含まれる。

`order.rdra` の `Forbidden_Order_0`（cancelledかつdelivered_atがpresentの行はない）を例にとる。「statusがpendingでdelivered_atがpresent」の行は、到達し得ない（delivered_atを書くのは `DeliverOrder` だけである）が、この規則を満たす。この行に `CancelOrder`（pending → cancelled）を適用すると、statusはcancelledになり、delivered_atはpresentのまま残る。規則は破れる。したがって、規則は真であるにもかかわらず、単独では継続の条件を満たさない。

到達し得ない状態を除くための追加の命題を**補題**（帰納的強化）と呼ぶ。規則 `P` と補題 `L1, …, Lk` の連言 `P ∧ L1 ∧ … ∧ Lk` が帰納的なら、`P` は到達可能な全状態で成り立つ。証明の難しさは、この補題をどう見つけるかにある。

### 2.3 Houdini

RDRA-ishは、補題探しを**Houdini**アルゴリズム（Flanagan & Leino, 2001）で行う。候補の命題を多めに用意し、そこから「同時に帰納的な最大の部分集合」を求める。手順は単純である。

1. 初期状態で成り立たない候補を集合から除く。
2. 集合のすべての候補が成り立つ状態から1ステップで、ある候補が破れるなら、その候補を除く。
3. 何も除かれなくなるまで2を繰り返す。

残った集合は帰納的である。集合に残った規則は証明されたことになる。

この手順の正しさは、次の性質に支えられている。候補の集合の部分集合 `S1`・`S2` がそれぞれ帰納的なら、和集合 `S1 ∪ S2` も帰納的である（`S1 ∪ S2` の全候補が成り立つ状態は、`S1` の全候補が成り立つ状態でもあるため、`S1` の各候補は次の状態でも成り立つ。`S2` も同様）。したがって、帰納的な部分集合のうち最大のものが一意に存在する。Houdiniは、その最大集合に含まれる候補を決して除かない。ゆえに、除く順序と無関係に、同じ集合が得られる。

この性質は、z3が常に `sat` か `unsat` を答える場合に成り立つ。z3が `unknown` を返し得る現実の設定での扱いは、第6.3節で述べる。

## 3. 符号化：行の個数を論理から消す

### 3.1 未解釈ソートと関数

有界の検査では、エンティティ `Order` は「スロット0とスロット1」のように固定個の行を持つ。証明器 `encode.rs` は、この固定個のスロットを、**未解釈ソート** `E<i>` に置き換える。

```rust
//! Each entity's slots become an uninterpreted sort `E<i>` with two named elements: `nil<i>`,
//! which stands for an unlinked optional key and is never a row, and `zero<i>`, the slot a
//! non-optional key holds at base (slot 0). Every var but `now` is a function from its
//! entity's sort to an `Int` (a domain index, as `Value` holds it) or, for a key, to the
//! parent's sort.
```

未解釈ソートの要素数は、z3にとって未定である。1個でも、1万個でも、無限個でもよい。したがって、このソートの上で示された命題は、**どの行数でも**成り立つ。エンティティの各列は、行から値への関数になる。`order.rdra` では、存在（`v0`：absent/present/deleted）・`status`（`v1`）・`delivered_at`（`v2`）の3つの関数が宣言される。

実際にz3へ送られるテキストの冒頭を示す（リポジトリの `examples/prove_transcript.rs` で書き出したもの。以下同じ）。

```smt2
(reset)
(set-option :smt.mbqi false)
(declare-sort E0 0)
(declare-const nil0 E0)
(declare-const zero0 E0)
(assert (distinct nil0 zero0))
(declare-fun v0 (E0) Int)
(assert (forall ((x E0)) (and (<= 0 (v0 x)) (< (v0 x) 3))))
(declare-fun v1 (E0) Int)
(assert (forall ((x E0)) (and (<= 0 (v1 x)) (< (v1 x) 5))))
(declare-fun v2 (E0) Int)
(assert (forall ((x E0)) (and (<= 0 (v2 x)) (< (v2 x) 2))))
(assert (= (v0 nil0) 0))
```

`v1` の定義域公理 `0 ≤ v1(x) < 5` は、列挙型 `status` の5つの値を表す。列挙型は有限なので、値の範囲は保たれる。一方、Int列と時計 `now` には**下限0だけを置き、上限を置かない**。有界の検査が `0..5` で打ち切る整数を、証明器は全自然数として扱う。`nil0` は「どの行も指さない外部キー」を表す特別な要素で、決して存在しない（`v0(nil0) = 0`）。

### 3.2 初期状態とステップ

初期状態は「全変数が既定値」という全称命題になる。

```smt2
(assert (forall ((x E0)) (= (v0 x) 0)))
(assert (forall ((x E0)) (= (v1 x) 0)))
(assert (forall ((x E0)) (= (v2 x) 0)))
```

1つのユースケースの1ステップは、引数の行を定数として宣言し、遷移後の各関数を `define-fun` で定義する。次は `DeliverOrder`（shipped → delivered、delivered_atをpresentにする）である。

```smt2
(declare-const p0 E0)
(assert (not (= p0 nil0)))
(assert (= (v0 p0) 1))                      ; p0 は存在する行
(define-fun v0_n ((x E0)) Int (v0 x))
(define-fun v1_n ((x E0)) Int (ite (and (= x p0) (= (v1 p0) 2)) 3 (v1 x)))
(define-fun v2_n ((x E0)) Int (ite (= x p0) 1 (v2 x)))
(assert (= (v1 p0) 2))                      ; ガード: status == shipped
```

`_n` の付いた関数が遷移後の状態である。更新は `ite` で書かれ、「`p0` の行だけが変わり、それ以外の行は元のまま」という**フレーム条件**が、関数の定義そのものに含まれる。行が何個あっても、変わるのは引数の行だけであることを、z3は量化子なしで理解できる。

### 3.3 違反の主張

規則が破れることは、「規則を破る行が存在する」という存在命題として主張する。存在量化は、新しい定数（スコーレム定数）の宣言で表せる。たとえば `Forbidden_Order_0`（cancelledかつdelivered_atがpresentの行はない）の遷移後の違反は次のとおりである。

```smt2
(push)
(declare-const b0 E0)
(assert (and (not (= b0 nil0)) (= (v0_n b0) 1)
             (not (not (and (= (v1_n b0) 4) (= (v2_n b0) 1))))))
(set-option :rlimit 20000000)
(check-sat)
(set-option :rlimit 0)
(pop)
```

これが `unsat` なら、このステップはこの規則を破れない。規則が2つの行に言及する場合（親子関係や一意性）は、束縛変数ごとに定数 `b0`, `b1` を宣言する。

### 3.4 個数の制約は正確に展開する

`.at_most(3, ...)` のような個数の制約は、SMTの量化子では直接書けない。`encode.rs` は「少なくとも `k` 行が条件を満たす」を、「互いに異なる `k` 個の証人が存在し、それぞれが条件を満たす」と展開する。

```rust
/// "At least `k` present rows of `entity` satisfy `body`": `k` distinct rows, each
/// present and satisfying it. ... That is the count, not an approximation of it, in either polarity.
/// Past `COUNT_WITNESSES` witnesses the formula is out of scope.
```

この展開は近似ではなく、意味的に等価である。そのため、否定の位置に現れても（「高々 `n` 行」は「少なくとも `n+1` 行」の否定）正しい。証人は8個まで展開し、それを超える個数は、近似せずに範囲外とする。

## 4. 健全性の原則：系は広げてよいが、規則は変えない

### 4.1 過大近似の向き

符号化が有界の探索器（BFS）と完全に同じ遷移関係を表せれば理想的だが、それは難しい。RDRA-ishは、ずれを許す向きを一方向に固定している。

```rust
//! The encoding over-approximates the explorer in two ways: a `New` param takes any absent
//! slot, not the lowest one, and numbers have no top. Every state and step the explorer
//! reaches, at any slot count and any Int range, is then a model of the encoding, so a
//! property proved here holds at every bound.
```

論理的な根拠は単純である。符号化の遷移関係 `T̂` が実際の遷移関係 `T` を含む（`T ⊆ T̂`）なら、`T̂` について帰納的な集合は `T` についても帰納的である。継続の条件 `I(s) ∧ T̂(s, s') ⇒ I(s')` は、前提の `T̂` を、より狭い `T` に置き換えても成り立つ。したがって、**ステップを増やす方向のずれは、証明の失敗を招くことはあっても、誤った証明を招くことはない**。

証明器が意図的に行う過大近似は次の4つである。

| 近似 | 有界の探索器 | 証明器 |
| --- | --- | --- |
| 行の生成 | 最も若い空きスロットを使う | 任意の空き行を使う |
| 整数と時計 | `0..int_max` で頭打ち | 上限なし（`Tick` は常に進める） |
| 表せないガード | 評価する | 落とす（ステップが増える） |
| 表せない書き込み | 正確に書く | 定義域内の任意の値（havoc） |

後の2つは、符号化の能力不足を補う逃げ道である。落としたガードとhavocした書き込みは `Step::loose` に記録され、`note:` として利用者に表示される。証明は健全なまま、規則が証明しにくくなる。その事実が利用者から隠れることはない。

### 4.2 規則は近似しない

一方、**規則の側は決して近似しない**。規則を弱めれば、偽の規則が証明され得るからである。`encode.rs` の `Unsupported` は、表せない構文要素に出会うと、その理由を持ってエラーになる。

```rust
/// A construct the encoding does not express. The prover reports a rule that needs one as
/// out of scope; it never approximates a rule.
pub(super) struct Unsupported(pub String);
```

規則の符号化で `Unsupported` が返ると、その規則の判定は `OutOfScope(理由)` となり、候補に入らない。同じ `Unsupported` が遷移の側で返ると、前節のとおりガードを落とすか書き込みをhavocする。同じ型のエラーが、規則側では「判定しない」、遷移側では「広げる」に振り分けられる。この非対称が、健全性の要である。

同じ考え方は比較演算にも現れる。外部キーと数値の比較、順序付きの行の比較など、意味が曖昧になる組み合わせは `unsupported(...)` を返す。暗黙の変換で何かの式を作ることはしない。

### 4.3 `unknown` は「破れた」と同じ

z3は量化子を含む問題に対して `unknown` を返し得る。資源の上限に達した場合も `unknown` になる。証明器は、`unknown` を一貫して「候補が破れた」と同じに扱う。

```rust
// - `unknown` counts as a fall: the kept set stays inductive, and a rule z3 gave up on is
//   never proved.
```

`unknown` の候補を残すと、残った集合の帰納性は保証されなくなる。落とせば、集合が小さくなるだけで、帰納性は保たれる。この選択によって、証明器の誤りは常に「証明できない」側に倒れる。

## 5. 補題の自動生成：推測は信用しない

Houdiniの出力の質は、候補の質で決まる。RDRA-ishは候補を3つの源から集める。

### 5.1 構造的な補題

`mod.rs` の `lemmas` は、どのモデルにも当てはまる3種類の補題を作る。

1. **存在しない行は既定値を持つ**：どのステップも、生成前の行に書き込まないため。
2. **削除するユースケースのないエンティティの行は、削除状態にならない**。
3. **存在する子の行の外部キーは、まだ存在しない親の行を指さない**。

いずれも、有界の探索器では自明に成り立つが、未解釈ソートの上では明示しないと使えない事実である。継続の条件は「規則を満たす任意の状態」から出発するため、「存在しない行がおかしな値を持つ」状態も含まれる。これらの補題は、その種の状態を除く。

### 5.2 BFSからの採掘

`mine.rs` は、有界のBFSが到達した状態を観察し、そこで常に成り立っていた事実を候補にする。

```rust
//! Candidate lemmas mined from BFS (Houdini's guesses). Each entity cone and each rule's cone
//! is explored at the system's bounds, and again at one instance per entity, where a cone
//! the run's bounds cap often finishes; what every reached state shows becomes a candidate:
//! the patterns a row takes, the values and value pairs of its columns, the patterns a child
//! row takes together with its parent (whole, per parent column, and one column of each), and
//! the patterns of two children of one parent. A guess is never trusted: the prover keeps it only
//! when it is inductive with the others, so a capped or over-approximate exploration costs
//! proofs, not soundness.
```

採掘する事実の型は次のとおりである。

| 型 | 例（`order.rdra`） |
| --- | --- |
| 行の値の組のパターン | 存在する Order の (status, delivered_at) は5パターンのいずれか |
| 1列の値の集合 | 到達した値が定義域の一部だけのとき |
| 2列の値の組 | 同上 |
| 子と親の行の値の組 | 子の status と親の status の組合せ |
| 同じ親を持つ2つの子の組 | 「同じ親を指す子は2つない」など |

第1章の出力にある補題 `a present Order row's (status, delivered_at) is one of {...}` は、この採掘の産物である。この補題があれば、`Inv_Order_0` と `Forbidden_Order_0` はどちらも直ちに帰納的になる。補題は「delivered_atがpresentなのはdeliveredの行だけ」という事実を含み、第2.2節の到達し得ない行（pendingかつpresent）を除くからである。

採掘には上限がある。1回の探索は50,000状態で打ち切り、64パターンを超える候補は作らない。打ち切られた探索は、到達し得る状態の一部しか見ていない。そこから作った候補は偽かもしれない。しかし、**偽の候補はHoudiniの開始か継続の検査で落ちる**。上限は証明の数を減らし得るが、健全性を損なわない。採掘が「推測」にとどまり、z3の検査を経て初めて補題になる構成が、自動生成を安全にしている。

### 5.3 1インスタンスの双子

既定の2インスタンスでは、大きなモデルの円錐が50,000状態の上限に達することがある。`mining_twin` は、同じモデルを1インスタンスで構築し直し、そこでも採掘する。1インスタンスなら探索が完走しやすく、より完全なパターンが得られる。

双子を使う条件は厳しい。エンティティ・変数・規則のIDと名前、変数の種類と定義域がすべて一致する場合に限る。一致しなければ双子を使わない。双子で得た候補は、元の系のIDで書かれた命題として、元の系の符号化の上で検査される。oidc-authの規則のうち2つは、この双子の採掘を入れるまで1インスタンスでしか証明できなかった（#231）。

### 5.4 細粒度の補題は遅れて参加する

「子の1列と親の1列の組」という細粒度の補題は、列の多いモデルでは数が膨れる。証明器はこれを `fine` として別に管理し、最初は集合に入れない。規則が継続の段階で落ちたときに限り、細粒度の補題を加え、落ちた規則を戻してもう一度回す。

```rust
// - When they join, the rules that fell after initiation come back: the set that broke
//   them lacked the fine lemmas, so its counterexamples may no longer stand.
```

規則を戻すのは、規則を破った反例が、細粒度の補題を欠いた集合のもとでの反例にすぎないからである。開始の段階で落ちた規則は戻さない。初期状態での違反は、補題をいくら足しても消えない。

### 5.5 利用者の補題

採掘で足りない場合、利用者は規則に `.lemma()` を付けて補題を書ける。

```rdra
forbidden(Claim, ClaimCase, Claim.completed_on == present, ClaimCase.status in (received, responded, investigating), ClaimCase.coverage in (bodily_liability, property_liability)).along(Claim, ClaimCase).label("賠償責任の事故は示談交渉の前に請求を完了しない").lemma()
```

insurance-claim-opsは、この補題で「賠償の請求は示談書がそろってから完了する」を証明している。利用者の補題も、証明器にとっては1つの候補にすぎない。`check` が通常の規則として有界に検査し、証明器は帰納的な集合に残った場合だけ採用する。誤った補題は `check` で反例付きで落ち、帰納的でない補題は `unproved: lemma <name>` と表示される。利用者が誤った補題を書いても、証明が誤ることはない。

## 6. Houdiniの実装

### 6.1 全体の流れ

`prove_offered` の処理は、次の段階からなる。

1. **候補の作成**：規則・構造補題・採掘補題を符号化する。符号化できない規則は範囲外とする。
2. **開始**：全候補を初期状態で一度だけ検査する。
3. **継続**：ステップごとに、集合を仮定して各候補の違反を検査する。何も落ちなくなるまで繰り返す。
4. **細粒度補題の参加**：継続で規則が落ちていれば、細粒度補題を加えて3に戻る（1回だけ）。
5. **反例の抽出**：落ちた規則ごとに、新しいソルバで反例を求める。

### 6.2 フレーム条件による検査の削減

ステップが候補の読む変数を1つも書かないなら、そのステップは候補を破れない。

```rust
// A step that writes nothing a candidate reads cannot break it.
let breaks = |a: usize, c: &Candidate| c.reads.iter().any(|v| writes[a].contains(v));
```

候補の読む変数には、本体の変数に加えて、束縛した各エンティティの存在変数も含まれる。行の生成や削除は存在変数を書くので、「存在する行すべてについて」という形の候補は、生成と削除のステップでも必ず検査される。この絞り込みは、第3.2節のフレーム条件（書かれない関数は `define-fun` で元の関数と等しい）と同じ事実に基づく。ステップの書き込み集合 `action_writes` が実際の効果を漏れなく含むことが前提になる。

### 6.3 順序に依存しない落とし方

素朴なHoudiniは、候補が1つ落ちるたびに集合を更新する。この方式では、同じラウンドの残りの検査は、どの候補がすでに落ちたかに依存する。検査を複数のz3に分けると、結果が分け方に依存しかねない。

RDRA-ishは、1つのステップの間は集合を固定する。

```rust
// - The set is asserted once per step, and every candidate the step may break is checked
//   under it; one that falls still stands for that step's other checks, so the answers
//   do not depend on the order of the checks or on how many solvers share them.
```

落ちた候補を同じステップの他の検査で仮定し続けるのは、一見危うい。しかし、ループは「何も落ちなかったラウンド」で終わる。最後のラウンドでは、すべての検査が**最終的な集合そのもの**を仮定して `unsat` を返している。したがって、最終的な集合は帰納的である。途中のラウンドで余分に仮定した候補は、最終的な判定に影響しない。

第2.3節の一意性は、z3が常に決着をつける場合の性質であった。`unknown` があると、z3の内部状態（それまでに何を解いたか）によって、同じ問いに `unsat` と `unknown` のどちらが返るかが変わり得る。この場合、Houdiniの結果は「帰納的な集合の1つ」になり、最大である保証はない。ただし、第4.3節のとおり `unknown` は落とす側に倒れるので、得られた集合が帰納的であることは変わらない。健全性は保たれ、完全性（証明できる規則の数）だけが影響を受け得る。この影響を抑えるため、検査はそれぞれ `push`/`pop` のスコープで行われる。テスト `a_proof_is_the_same_on_any_number_of_solvers` は、1台と3台のソルバで、判定・反例・採用された補題がすべて一致することを確かめている。

### 6.4 起動リテラル

すべてのステップで全候補を仮定し直すと、z3へ送るテキストが膨れる。#421は、各候補を**起動リテラル**の背後に一度だけ置く方式に変えた。

```smt2
(declare-const act0 Bool)
(assert (=> act0 (forall ((b0 E0)) (=> (= (v0 b0) 1) (not (and (= (v1 b0) 4) (= (v2 b0) 1)))))))
...
; ステップごと
(assert act0)
(assert act1)
...
```

集合に残っている候補のリテラルだけを `assert` すれば、候補そのものを仮定するのと論理的に同値である。落ちた候補のリテラルは仮定されず、その含意 `act_k ⇒ ...` は空虚に真になる。コミットの報告では、送るテキストは約8分の1に減り、ドメインのサンプルで証明の実時間が27〜36%減った。全サンプルで `Proof` と `verify --prove` の出力はバイト単位で一致した。

### 6.5 MBQIを切る

z3の**モデルベース量化子具体化（MBQI）**は、量化子を含む問題で `sat` の答えを見つけるための機構である。Houdiniのラウンドでは、これを切っている。

```rust
// The Houdini rounds run without model-based quantifier instantiation (MBQI). Without
// it z3 proves an `unsat` check as before, far faster, but answers `unknown` where it
// would find a model: the candidate falls either way.
```

この最適化が安全な理由は、第4.3節の規約にある。MBQIを切ると `sat` だった検査が `unknown` になるが、どちらも候補を落とす。`unsat` の検査はMBQIなしでも `unsat` のままである。MBQIの有無で変わり得るのは、MBQIありなら `unsat` を示せた検査が、なしでは `unknown` になる場合である。これは完全性の問題であり、健全性の問題ではない。コミット `96ce705` は、全サンプルで証明の結果が変わらないことを確かめたうえで、1台のソルバでの全サンプルの証明を150秒から68秒に縮めたと報告している。

反例の抽出（第6.7節）では、MBQIを有効にして新しいソルバで問い直す。反例を示すにはモデル（`sat` の証拠）が必要だからである。

### 6.6 BFSが反証した規則は候補にしない

`verify --prove` は、安全性のBFSが違反を見つけた規則を `refuted` として扱い、候補に入れない。

```rust
/// A rule in `refuted` has a reachable violation, found by a bounded engine: no inductive set
/// that holds in the initial states holds it, so it is no candidate and its verdict is
/// `Refuted`. Leaving it out proves the same rules, since the set Houdini keeps never had it,
```

この省略が他の判定を変えない理由は、次のとおりである。BFSが到達した状態は、過大近似（第4.1節）により符号化の上でも到達可能である。帰納的な集合は到達可能な全状態で成り立つので、到達可能な違反を持つ規則を含む帰納的な集合は存在しない。したがって、最大の帰納的集合はもともとその規則を含まず、候補から外しても同じ集合が得られる。テスト `a_refuted_rule_left_out_changes_no_other_verdict` は、外した場合と入れた場合で、他の規則の判定の種類が変わらないことを確かめている。

### 6.7 帰納法の反例（CTI）

証明できなかった規則には、**帰納法の反例**（counterexample to induction、CTI）を添える。CTIは、「規則と採用された全補題が成り立つ状態から、あるステップで規則が破れる」ことを示す1ステップである。

```
$ rdra-ish verify samples/formal-verification/one_to_one_shared.rdra --prove --instance-count 1
...
unproved: Unique_Shipment_Order: not inductive; Ship(Order#1, Shipment#1) breaks it from a state where it and every proved rule hold (not necessarily reachable)
  Order#1 (present) status=placed -> status=shipped
  Shipment#1 (absent -> present) Order=Order#2 -> Order=Order#1
  Shipment#2 (present) Order=Order#1
```

出力が `not necessarily reachable` と明記している点が重要である。CTIの出発状態は、到達可能とは限らない。CTIは「この規則は証明できなかった」ことの説明であり、「この規則は偽である」ことの証拠ではない。この例では、2インスタンスのBFSが実際に同じ違反に到達するので、CTIは本物の反例と一致する。しかし、一般には利用者がCTIを手がかりに補題を足す（第5.5節）か、有界のエンジンの判定を見る必要がある。

CTIは、z3のモデルから値を読み出して作る（`read_cti`）。z3が返すモデルは、それまでにソルバが解いた問題に依存する。そこでCTIの段階では、ソルバを `reset` し、MBQIを有効にして、決まった順序で問い直す。これにより、CTIの表示は並列化の仕方に依存しない。

## 7. 実行基盤の安全性

論理的に正しい設計も、z3との入出力で誤れば意味がない。RDRA-ishは、z3とのやりとりの各段階に防御を置いている。

### 7.1 型付きのSMT-LIB項

#426以前、証明器はSMT-LIBのテキストを `format!` で組み立てていた。現在の `smt.rs` は、項を**ソート付きのデータ**として表し、印字を一か所にまとめている。

```rust
//! An `Expr` carries its sort, and each constructor checks the sorts of what it takes; a
//! command checks its own when it is printed. A mismatch is a bug in the encoder, so it panics
//! in a debug build. A release build prints the term as asked, z3 rejects it, and the proof
//! fails with a `SolverError`; it never reads as a verdict. Parentheses balance by
//! construction: only the printer writes them, and a symbol may not hold one.
```

文字列の組み立てで起こりやすい誤りは2種類ある。括弧の対応の崩れと、ソートの取り違えである。前者は、印字器だけが括弧を書くことで構造的に排除される。後者はデバッグビルドでは構築時のアサーションで検出され、リリースビルドではz3に拒否される。いずれの場合も、結果は**判定ではなくエラー**になる。この移行の際には、全サンプルと全コーパスについて、z3の受け取るテキストを移行前と比べ、バイト単位の一致を確かめている（約1.5億バイトの記録）。

### 7.2 z3との対話

`solver.rs` は、`z3 -in` を子プロセスとして起動し、証明の間ずっと使い続ける。コマンドの束を送るたびに、`(echo "@@rdra-ish-done@@")` を後ろに付け、その印が返るまでを応答とする。応答に `(error ...)` の行があれば `SolverError` になる。`check-sat` の答えが `sat`・`unsat`・`unknown`・`timeout` のいずれでもなければ、やはりエラーになる。z3が途中で終了した場合もエラーである。

この設計の要点は、**z3の異常を判定に変換する経路が存在しない**ことである。応答の読み違いや、プロセスの異常終了が「証明できた」と解釈されることはない。

### 7.3 時間ではなく資源単位で打ち切る

各 `check-sat` には、時間の上限ではなく、z3の**資源単位（rlimit）**の上限を与える。規則には2,000万単位、補題には200万単位である。

```rust
/// z3 resource units (`rlimit`) a check of a rule may spend before it counts as unknown.
/// A unit counts solver work, not time, so the answer does not depend on the machine or
/// its load; it does depend on the z3 version.
```

時間で打ち切ると、混んだマシンでは `unknown` が増え、同じモデルの証明結果が実行ごとに変わり得る。資源単位なら、同じz3の版では同じ問いに同じ答えが返る。健全性の観点では、どちらで打ち切っても `unknown` は落とすので誤りは生じない。資源単位を使う利点は、**再現性**にある。

ただし、資源単位の数え方はz3の版によって変わり得る。証明器は、上限を計測したz3の版（現在は5.1.0、`flake.nix` で固定）を `VERIFIED_Z3` に持ち、それ以外の版では次の注意を表示する。

```
note: z3 5.4.1 is not a version the proof's resource limits were measured on (5.1.0); a check may give up, or settle, where it would not on those
```

（この記事のための実行では、pipで入れたz3 5.4.1を使ったため、この注意が表示された。証明の結果は第1章のとおりである）

上限には大きな余裕がある。テスト `proof_equivalence` は全検査の消費量を記録し、候補を残した検査が上限の10分の1を超えるか、いずれかの検査が上限の10分の9に達すると失敗する。文書の記録では、候補を残した検査の最大消費は規則で161,000単位（上限の124分の1）、補題で114,000単位（17分の1）である。z3があきらめる検査は、上限よりはるかに手前で止まっている。資源が尽きるのではなく、決定できない量化子で止まっているのである。

### 7.4 並列化しても答えが変わらない

検査はステップごとに複数のz3プロセスへ配られる（`violated_each`）。各プロセスは、ステップのスコープを自分で開き、割り当てられた候補を検査し、スコープを閉じる。他のプロセスが読む状態を残さないため、答えは1台で解いた場合と同じになる。第6.3節の「ステップの間は集合を固定する」規約と合わせて、ソルバの台数は証明の結果に影響しない。

### 7.5 証明書：再利用の前に必ず再検査する

前回の証明で残った集合は、**証明書**として利用者のキャッシュディレクトリに保存される。次回の実行は、まず証明書を提示し、それが通れば、Houdiniの反復を省く。ここにも、安全性のための仕掛けが重ねられている。

```rust
/// The set a proof kept, for the next proof to offer first (`prove_offered`): which
/// candidates, by index, and the digest of the encoding they are indices into. It is a hint,
/// never a verdict: the next proof re-checks it.
```

1. **ダイジェストの一致**：証明書は、z3へ送る宣言・初期状態・全ステップ・全候補・オプション・rdra-ishの版のハッシュを持つ。今回の符号化と一致しなければ使わない。ハッシュにはタグ `"rdra-ish proof certificate 1"` を含め、Houdiniの手順の変更でテキストに現れないものがあれば、タグを上げて古い証明書を無効にする。
2. **全規則を含むこと**：証明書の集合が、候補であるすべての規則を含む場合に限り使う。
3. **1ラウンドの再検査**：集合の全候補について、開始と継続をz3で検査する。1つでも `unsat` でなければ使わない。
4. **ファイルの完全性**：ファイル本体のハッシュを末尾に持ち、z3の版も記録する。壊れたファイルや別の版のファイルは読まない。書き込みは一時ファイルからの `rename` で原子的に行う。

3の再検査が通れば、その集合は今回のz3によって帰納的であることが示されている。つまり、証明の根拠は前回の実行ではなく、**今回の検査**である。証明書が古い、壊れている、改ざんされているといった場合の損失は、再検査の1ラウンドの時間だけであり、その後は証明書なしで最初から証明する。テストは、証明書を再利用した場合・拒否した場合・提示しない場合で、証明の結果が一致することを確かめている。

## 8. 他のエンジンとの相互検証

ここまでの議論は、符号化が実際の遷移システムを過大近似している、という前提に立つ。しかし、この前提そのものが実装の誤りで崩れ得る。RDRA-ishは、証明器の主張を有界のエンジンと機械的に照合することで、この前提を検査している。

### 8.1 証明された規則は、境界を広げても破れない

テスト `proof_equivalence` の冒頭は、目的を次のように述べている。

```rust
//! The prover and BFS agree on every sample: no rule `verify --prove` proves for any number
//! of rows and any Int value has a reachable violation at one, two, or three instances per
//! entity, or at two with a wider Int range than `verify`'s default. A proof
//! claims more than the bounded engines check, so this keeps the third semantics honest
//! against the explorer.
```

証明器が証明した規則は、どの境界でも成り立つはずである。そこで、全サンプルとエンジン・コーパスの全ケースについて、証明された規則のそれぞれを、1・2・3インスタンスと、整数範囲を広げた2インスタンスのBFSで検査する。反例が1つでも見つかれば、証明器は誤っており、テストは失敗する。

エンジン・コーパス（`crates/rdra-ish-cli/tests/engine_corpus/`）には、証明器を誤らせるために作られたモデルが並ぶ。各ケースの先頭には、エンジンごとの期待される判定を書く。

```rdra
// trap: an invariant true at 2 instances and false at 3.
// Top moves an order from c to d only while one other order is at a and another at b, so
// `d` needs three orders. BFS finds no violation at 1 or 2 instances and one at 3; z3 must
// not prove the rule, since it claims any number of rows.
// expect Forbidden_Order_0: native=ok tlc=ok z3=unproved bfs=ok,ok,counterexample
```

### 8.2 事例：境界の事実が証明器に漏れた（#425）

この照合は、実際に健全性の欠陥を1件見つけている。次のモデルを考える。

```rdra
entity Item "Item" {
  id: Int @pk
  n: Int @null
}
usecase AddItem "add"
usecase BumpItem "bump"
creates(AddItem, Item)
updates(BumpItem, Item)
sets(BumpItem, Item.n == present)
forbidden(Item, n not in (null, 0, 1, 2, 3, 4, 5))
```

既定の整数範囲 `0..5` では、`n` が取り得る値はnullと0〜5だけである。したがって `n not in (null, 0, 1, 2, 3, 4, 5)` は常に偽であり、BFSとTLCはこの規則をどのインスタンス数でも通す。ところが、`BumpItem` は `n` に任意の値を書けるので、上限のない整数では6も書ける。規則は偽であり、証明器はこれを証明してはならない。

欠陥は、証明器ではなく、BFSと共有する**遷移システムの構築**にあった。構築器は「定義域の全値を列挙した `in`」を、境界の範囲で正しい最適化として `false` に畳み込んでいた。この最適化は有界のエンジンにとっては正しい。しかし、上限を持たない証明器は、畳み込まれた `false` を受け取り、規則を証明してしまった。整数範囲を `0..7` に広げたBFSは、`n = 6` でこの規則を破る。

修正（`d7c798e`）は、畳み込みを有限の定義域（存在・列挙・真偽・null-or-present）に限り、整数や外部キーのように境界が大きさを決める定義域では行わないようにした。あわせて、`proof_equivalence` に「整数範囲を広げたBFS」の照合が加わり、この種の欠陥を将来も検出できるようになった。現在の版では、この規則は証明されず、CTIが表示される。

```
unproved: Forbidden_Item_0: not inductive; BumpItem(Item#1) breaks it from a state where it and every proved rule hold (not necessarily reachable)
  Item#1 (present) n=0 -> n=6
```

この事例から読み取れる教訓は、**証明器の信頼基盤は証明器のコードだけではない**ということである。符号化の入力となる遷移システムは、有界のエンジンと共有されている。共有部分に「境界の内側でだけ正しい」変換が入ると、証明器の過大近似の前提が崩れる。独立したエンジンとの照合は、この種の、設計図からは見えにくい欠陥を拾う。

### 8.3 証明できなかった規則のエスカレーション

逆に、証明できなかった規則はどう扱うか。`unproved` は「偽」を意味しない。そこで `verify --prove` は、証明できず、かつ既定の境界でBFSを通った規則について、その規則の円錐を1インスタンス増やし、さらにもう1インスタンス増やしてBFSで検査し直す。

```
$ rdra-ish verify .../engine_corpus/z3_two_ok_three_fails.rdra --prove
...
unproved: Forbidden_Order_0: not inductive; Top(Order#1) breaks it from a state where it and every proved rule hold (not necessarily reachable)
...
error[Forbidden_Order_0]: invariant Forbidden_Order_0 is violated: forbidden state is reachable: status=d witnessed by status=d
  counterexample (7 steps, at 3 instances):
...
escalated: Forbidden_Order_0: counterexample at 3 instances (BFS on its cone; ok at 2)
```

ここで見つかった反例は到達可能なので、`--deny-unproved` を指定しなくてもエラーになる。証明器が「証明できない」と判定した規則を、有界のエンジンが境界を広げて追いかける。両者を組み合わせることで、`--prove` の出力は「証明された」「境界を広げても反例なし」「反例あり」のいずれかに分かれる。

## 9. 考察

### 9.1 安全性の構造

証明器の安全性の設計は、次の1つの原則に集約できる。**あらゆる不確かさを「証明できない」側に倒す**。

| 不確かさの源 | 倒す先 |
| --- | --- |
| 符号化できない遷移 | ステップを増やす（ガードを落とす、書き込みをhavoc） |
| 符号化できない規則 | 範囲外（候補にしない） |
| z3の `unknown`・資源切れ | 候補を落とす |
| MBQIを切ったことによる `unknown` | 候補を落とす |
| 採掘の打ち切り・偽の推測 | Houdiniが落とす |
| 利用者の誤った補題 | `check` とHoudiniが落とす |
| z3の異常応答・プロセス終了 | エラー（判定にしない） |
| 古い・壊れた証明書 | 再検査で拒否し、最初から証明 |

このうち、「証明できた」という判定を出せる経路は1つしかない。最後のHoudiniのラウンド（または証明書の再検査のラウンド）で、z3が全検査に `unsat` を返した場合である。誤った証明が生じ得るのは、この経路の前提、すなわち符号化が実際の遷移を含むこと、規則を正確に表すこと、z3が正しいこと、のいずれかが崩れた場合に限られる。

### 9.2 信頼基盤

裏を返せば、証明の正しさは次のものを信頼している。

1. **z3**：証明器は、z3の `unsat` を検証可能な証明オブジェクトとして受け取っていない。z3の誤りは、そのまま誤った証明になる。
2. **符号化（`encode.rs`）**：過大近似の向きを守っていること、規則を正確に表していること。
3. **遷移システムの構築**：有界のエンジンと共有され、#425のように境界に依存する変換が混入し得る。
4. **フレームの絞り込み**：ステップの書き込み集合が実際の効果を漏れなく含むこと（第6.2節）。

2〜4は、第8章の相互検証が継続的に検査している。BFS・TLC・証明器という3つの意味論が同じモデルについて矛盾しないことを、全サンプルとコーパスで確かめる構成は、個々の実装の正しさを信じる代わりに、実装間の一致を証拠とする前稿以来の方針の延長にある。1については、より強い保証が必要なら、z3の証明出力を独立のチェッカで検証するか、別のソルバ（cvc5など）でも同じ `unsat` を得る、といった拡張が考えられる。現時点の実装には、そのような機構はない。

### 9.3 限界

文書とコードから読み取れる限界を挙げる。

- **対象は状態規則だけ**：`after` の表明や時相性質（`leads_to`、`eventually`）は証明しない。
- **個数は8まで**：`.at_most(7, ...)` を超える個数の制約は範囲外になる。
- **CTIは到達可能とは限らない**：利用者はCTIを補題の手がかりとして読む必要がある。
- **完全性は保証されない**：Houdiniが見つけるのは候補の中の帰納的な集合だけである。真の規則でも、必要な補題が候補にない場合や、z3があきらめた場合は証明されない。
- **z3の版への依存**：資源単位の上限は計測した版でしか保証されず、他の版では注意が表示される。
- **メモリ**：z3プロセスは1つ当たり0.3〜0.5 GiBを使い、`--memory` の計上の外にある。

### 9.4 性能

安全性の設計は、性能の工夫と衝突していない。むしろ、「`unknown` は落とす」という規約があるからこそ、MBQIを切る最適化を安全に導入できた。各工夫の効果を、コミットの報告からまとめる。

| 工夫 | 効果 |
| --- | --- |
| Houdiniのラウンドで MBQI を切る（`96ce705`） | 全サンプルの証明が1ソルバで150秒→68秒。`RDRA_JOBS=4` で clinic-ops 30.2秒→12.4秒、food-permit-ops 18.0秒→9.2秒。出力はバイト単位で同一 |
| 起動リテラル（`cde3740`） | 送るテキストが約8分の1、ドメインのサンプルで実時間27〜36%減 |
| BFSが反証した規則を除く（`f58d247`） | その規則の検査と、それが引き起こす細粒度補題のラウンドを省く |
| 証明書の再利用（`0efd027`） | 同じ符号化なら、Houdiniの反復を1ラウンドの再検査に置き換える |
| フレームの絞り込みと細粒度補題の遅延 | 書き込まない変数に関する検査と、多くのモデルで不要な補題の検査を省く |

いずれの工夫も、「結果を変えない」ことをサンプル全体の比較で示してから導入されている。

## 10. まとめ

RDRA-ishの `verify --prove` は、要件モデルの状態規則を、行の個数と整数の大きさによらず成り立つことをz3で証明する。その仕組みは、未解釈ソートによる無界の符号化、BFSから採掘した候補補題、Houdiniによる最大の帰納的集合の計算からなり、利用者は補題を書かずに多くの規則の証明を得られる。

自動化と安全性を両立させているのは、不確かさを一貫して「証明できない」側に倒す設計である。系は広げても規則は変えず、推測は検査を通るまで信用せず、z3の `unknown` も前回の証明書も、すべて落とすか再検査する。さらに、証明器の主張を、インスタンス数と整数範囲を広げた有界のエンジンと照合し続けることで、設計の前提そのものの崩れを検出している。#425の事例は、この照合が机上の安全策ではなく、実際に機能していることを示している。

## 出典

本文の記述は、rdra-ish-dslリポジトリの `main`（`99f1c29`）の次のファイルに基づく。

- `crates/rdra-ish-core/src/lifecycle/prove/`（`mod.rs`・`encode.rs`・`mine.rs`・`smt.rs`・`solver.rs`）
- `crates/rdra-ish-cli/src/prove.rs`
- `crates/rdra-ish-cli/tests/proof_equivalence.rs`
- `crates/rdra-ish-cli/tests/engine_corpus/`
- `docs/formal-verification.md`

数値は、これらのファイルのコメントと文書、およびコミット `96ce705`・`cde3740`・`f58d247`・`0efd027`・`04585eb`・`d7c798e`・`f779e6f` のメッセージによる。第3章のSMT-LIBの断片と、第1・6・8章の実行例の一部は、本稿のために `examples/prove_transcript.rs` と `rdra-ish verify --prove` をz3 5.4.1で実行して得た（第1章の出力は文書のz3 5.1.0のもの）。Houdiniアルゴリズムの原典はC. Flanagan and K. R. M. Leino, "Houdini, an Annotation Assistant for ESC/Java", FME 2001である。
