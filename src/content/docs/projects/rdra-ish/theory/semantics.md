---
title: "意味論と記法"
description: "rdra-ishの検証の理論のうち、モデルを有限の遷移系として読む定義D1〜D25と、規則・性質・判定語の意味を解説します"
---

> 原文: [docs/theory/semantics.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/theory/semantics.md) · 対象：main `169cdf3`（v3.0.0以降の未リリース版。v3.0.0の挙動と一致しない箇所があります）

このページは、rdra-ishのモデルの意味を定める原文の解説です。原文はmain `91524792` 時点のコードを記述しています。解説が読んだ原文のコミットは `169cdf3` です。

原文はモデルを有限の遷移系 `T_β(M)` として定義し、規則と性質がその上で何を意味するかを定めます。ツールが出す判定語の意味もここで決まります。ほかの理論のページは、すべてこのページの記法で保証を述べます。[主張の一覧](/projects/rdra-ish/theory/claims/)は定義を番号（D1、D2 …）で参照します。

各定義には原文と同じアンカー `#d1`〜`#d25` を付けました。並びは原文の節構成どおりで、D24はD13の直後にあります。原文の **Implemented by** 注記（コードの位置）は大半を省きました。必要なときは原文の該当見出しを見てください。

## このページの位置づけ

定義は2つのまとまりに分かれます。

- **D1〜D13とD24** は、モデルの本文から `T_β(M)` を定めます。各項は、言語のどの構文に意味を与えるかを名指しします。そして、その構文が変数・初期状態・ステップのどれに寄与するかを述べます
- **D14〜D23** は、遷移系 `T` の上での規則・性質・判定の意味です。**D25** はデッドロックの所見の意味です。これらは `T_β(M)` にも、そこから導いた系（cone、縮約したcone、商）にも当てはまります

定義は [language-reference.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md)、[state-derivation.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md)、設計ノート [event-order.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/event-order.md) と [counted-events.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/counted-events.md) に従います。ノートが決めていない点は定義の側で選び、「選択」として記します。

どの定義も「コードのある関数が何を計算するか」という形では書かれていません。コードが `T_β(M)` を計算しているかは定義ではなく、証拠を伴う主張です。主張I1は「`TransitionSystem::build` は `T_β(M, σ)` を返す」と述べます（原文 [claims.md#0-the-build](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/theory/claims.md#0-the-build)）。

定義の対象は、範囲 `β` で構築が通り、重大度errorの診断が出ないモデル `M` だけです。errorの例は `IntLiteralOutOfBounds`、`DomainTooLarge`、`ConflictingEffects`、`UnboundCopySource`、`AmbiguousOwnerLink` です（一覧は [state-derivation.md, "Diagnostics"](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md#diagnostics)）。どのモデルが正しい形かという静的意味論を、原文は再述しません。そこはコードの一覧（`lifecycle::diag::StateDiag`）に頼ります。errorのある組 `(M, β)` では `T_β(M)` は定義されず、ツールは判定を出しません。

原文の「theme (a)」〜「(d)」は次のページです。

- theme (a): [coneと縮約](/projects/rdra-ish/theory/cones/)
- theme (b): [z3による証明](/projects/rdra-ish/theory/z3/)
- theme (c): [ネイティブ検査器](/projects/rdra-ish/theory/native/)
- theme (d): [TLCとの照合](/projects/rdra-ish/theory/tlc-agreement/)

## 記法

- `Ent` は、ライフサイクルが保持するエンティティの有限集合です。`exposes(System, E).append()` や `.upsert()` で公開するエンティティは入りません
- `X⊥` は `X ∪ {⊥}` です。`⊥` は値 `null` を表します
- `[k] = {0, …, k-1}` です。エンティティ `E` のスロット `i` は `E#(i+1)` と表示します
- 束縛変数（binder）`x₁ … x_k` をもつ述語 `φ` は、束縛（binding）`b ∈ [n_{E₁}] × … × [n_{E_k}]` のもとで評価します。`φ_b(s)` は状態 `s` での値です
- `s →_a s'` はアクション `a` の1ステップ、`s → s'` は何らかのアクションの1ステップです。`Reach(T)` は `T` の初期状態から到達できる状態の集合です
- `UC` はユースケースです。その **書き込み**（writes）は、`UC` を書き手として名指しする行です。`creates`、`updates`、`deletes`、`sets`、`drives`、`links`、`relinks`、`unlinks`、`transitions`、`chooses` と、`invokes(UC, Api)` で呼ぶAPIのCRUD行が該当します
- 2つのエンティティ間の **結合キー**（join key）は、両者の間の1つの `relate` です。複数あるときは、その行の `.role(r)` が名指しするものです。複数あって `.role` がなければerror `AmbiguousOwnerLink` です

アクションが読む変数 `Rd(a)` と書く変数 `Wr(a)` は、このページでは定義しません。[coneと縮約](/projects/rdra-ish/theory/cones/)のページが記法を追加して定義します。

直観的には、状態は「エンティティごとに `n_E` 個の行の枠（スロット）があり、各スロットが存在フラグと列の値をもつ表」です。アクションは、ユースケースがその表を書き換える1回のトランザクションに当たります。

## 範囲

<a id="d1"></a>

### D1 範囲（Bounds）

範囲は `β = (n, m)` です。`n : Ent → {1, …, 255}` はエンティティごとのスロット数です。`m ∈ {1, …, 255}` は整数の範囲 `[m+1] = {0, …, m}` の上端です。

`--instance-count` は `n` を一律に決め、`--instances E=k` は1つのエンティティを上書きします。`rdra.toml` のコマンドの節にある `instances` 表もエンティティごとの数を与え、`--instances` がそれを上書きします。`--int-range-max` が `m` を決めます。結果の `bounds:` 行は必ず `β` を書きます。既定値は、`states` と `check` で `n ≡ 1`、`m = 5` です。`verify` と `export --kind tla` で `n ≡ 2`、`m = 5` です。

D2のある変数が256個を超える値をもつ組も正しくない形です（`DomainTooLarge`）。`m = 255` でのnullableなInt系の列、256値のnullableなEnum、257値のEnumが該当します。

CLIは `--instance-count 0`、`--int-range-max 0`、255を超える値を拒否します。ただし `Bounds::int_max` は公開の `u8` フィールドです。そのためライブラリの呼び出し側は `m = 0` で構築できます。その範囲はD1の外にあり、意味をもちません。

`verify --prove` のz3エンコードは `n` を読みません。多くのInt項では `m` も読みません（theme (b)）。

## 状態変数

<a id="d2"></a>

### D2 変数と値域

`T_β(M)` は下の表の1行につき1つの変数をもち、エンティティのスロットごとに保持します。エンティティ `E` の変数 `v` は、`n_E` 個の状態成分 `v[0] … v[n_E - 1]` です。`V` は、ある系が保持する変数の集合です。

Int系の列（Int、Money、Decimal、Date、DateTime）は、次のどれかのとき **数として読まれる** とします。

- `sets` が整数を書き込む
- 規則、`@check`、`applies_to` か `.when` が使う条件の本体、`after` アサーション、`property` のどれかで、整数リテラルや `now` と比較される。または順序比較（`<`、`<=`、`>`、`>=`）に使われる
- `sets` のコピー、規則、条件のどれかで、別のInt系の列と `==`、`!=` で比較される。またはその列との間でコピーされる

上のどれか、または `chooses` が言及する列を **名指しされる** 列とします。

| モデルの宣言 | 変数 | 値域 | `V` に入る条件 |
|---|---|---|---|
| エンティティ `E ∈ Ent` | `Exists(E)` | `{absent, present, deleted}` | 常に |
| Enum型の列 | その列 | 宣言した値。`@null` なら先頭に `⊥` | 常に |
| Bool型の列 | その列 | `{false, true}`。`@null` なら `{⊥, false, true}` | 常に |
| Int系の列 | その列 | `[m+1]`。`@null` なら `[m+1]⊥` | 数として読まれる |
| `@null` のInt系の列で、数として読まれない | その列 | `{⊥, present}` | 常に |
| `@null` のその他の型の列（String、Uuidなど） | その列 | `{⊥, present}` | 常に |
| `variation` で型付けした列 | その列 | variationの値 | 名指しされる |
| 比較 `c op r` についての `drives(UC, E.c op r, b)` | その命題 | `{false, true}` | ある `drives` が名指しする |
| 形がN:1、1:N、1:1の `relate(Child, Parent, …)` | `Child` のowner | `[n_Parent]`。`.optional()` なら `⊥` も | 常に |
| `k ≥ 2` 個のトランザクショングループに分かれるユースケース（D10） | 実行の印 `E._run_UC` | `{none, 1, …, k-1}` | 最後より前のステップが `E` を書く |
| 追跡されるイベント `Ev`（D11） | ラッチ `E._raised_Ev` | `{false, true}` | `E` が `Ev` の印のエンティティ |
| `triggers(Ev, UC).counted(k)`（D11） | カウンタ `E._pending_Ev_UC` | `{0, …, k, over}` | `E` が `Ev` の印のエンティティ |
| ある述語が `now` を読む | `now`（大域の成分1つ） | `[m+1]` | 常に |

**状態** は、すべての成分に値域の値を1つずつ割り当てたもの `s` です。

変数をもたない列もあります。`@null` のないString列、数として読まれない非nullのInt系の列、`@derived` 列、外部キー列（ownerが代わりを務めます）、公開エンティティのすべての列です。Boolの `@derived` 列を読む述語は、その定義式を読みます。

**選択。** 次の2点はノートが決めていないので、コード（`build/naming.rs::Named`）に従います。どの列が数として読まれるか、という点と、数として読まれない `@null` のInt系の列が `{⊥, present}` になる点です。帰結として、時間性質の中の2列の `==` は列を名指ししますが、数としては読みません。参照インタプリタ（`core/tests/reference/`）もこの読み方をビルドと共有しています。そのため、この点について主張I1には独立した証拠がありません。

状態のバイト配置は意味論の一部ではありません。

<a id="d3"></a>

### D3 基底値（Base value）

各変数は基底値 `base(v)` をもちます。

- 列では `@default` です。なければ `@null` のとき `⊥`、それもなければEnumの最初の宣言値、`false`、`0` のいずれかです。`{⊥, present}` の列では、非nullの `@default` か既定の関数（`now()`、`uuid()`）が `present` を与えます。数の列で整数でない `@default`（`9.99` や日付）はスキーマ上の文字列で、未設定の値を与えます
- `Exists` は `absent` です。実行の印・ラッチ・カウンタは `none`、`false`、`0` です。`drives` の命題は `false`、`now` は `0` です
- ownerは、`.optional()` なら `⊥`、そうでなければ親のスロット0です。既存の子ではD4が、子を作るときはD8がこれを上書きします

`absent` か `deleted` のスロットは、すべての列で基底値をもちます。variation列の基底値は `@default`、なければ最初の値です。ただしその基底値が見えるのはabsentかdeletedのスロットだけです。既存の行は任意の値から始まり（D4）、作った行はユースケースが設定しない値を任意に取ります（D8）。つまり `@default` が生きた行の値を固定することはありません（`DefaultOnVariationIgnored`）。

## 初期状態

<a id="d4"></a>

### D4 初期状態

あるユースケースが `creates(UC, E)` をもつエンティティは **作られる** エンティティです。`invokes(UC, Api)` で呼ぶAPI経由でも同じです。そうでないエンティティは **既存**（pre-existing）です。

`I_β(M)` は、すべての成分が基底値にある状態の集合です。例外は次のとおりです。

1. 既存のエンティティのスロットはすべて `present` です
2. 既存のスロットのvariation列は、その値のどれでも取ります。値はスロットごとに独立です（理由は [vision.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/vision.md#decisions)）
3. 既存の子のownerは、`relate` の形で始まりが決まります
   - **Any。** N:1の子のownerは任意の親スロットを取ります。値はスロットごとに独立で、`.optional()` なら `⊥` もありえます
   - **Identity。** 1:1の子と `1..*:1` キーの子では、スロット `i` を親スロット `i` が所有します
   - **Base。** 作られるエンティティのownerと、親が作られる `.optional()` のownerは基底値（D3）から始まります。`.optional()` なら `⊥`（未リンク）です。必須キーなら親スロット0で、これを持つのはabsentの行だけです

親が作られるエンティティでも、既存の子の必須のownerはAnyかIdentityで始まります。このとき指す親スロットは `absent` です。info `PreExistingChildOfCreatedParent` がこれを報告します。

`I_β(M)` はこれらの独立な選択の直積です。探索の前に、規則が `I` で成り立つとは仮定せず、検査もしません。初期状態も到達可能な状態の1つです。したがって初期状態が破る規則は、0ステップのトレースで違反として報告されます。

## 述語

<a id="d5"></a>

### D5 述語の評価

述語は、言語の比較式か、関連する行についての量化子（`.has`、`.none`、`.at_least`、`.at_most`、`.exactly`）です。これらを `not`、`and`、`or` で組み合わせます。評価は2値論理です。どの述語もどの状態でも真か偽で、`not`、`and`、`or` はブール演算です。

- **量化子。** エンティティ `E` についての量化子は、`E` の `present` なスロットを動きます。個数の比較は `|{i ∈ [n_E] : Exists(E)[i] = present ∧ φ(i)}|` を使います
- **数とnull。** どちらかの辺が数（数として読まれる列、整数リテラル、`now`）なら、両辺を整数として読み、`⊥` は「数がない」と読みます。`⊥` は `⊥` にだけ `==` で、どの数とも `!=` で、順序は付きません。`x = ⊥` のとき、`x < 3`、`x >= 1`、`x == 3` は偽で、`x != 3` は真です。数でないときは、両辺を1つの値域の値として比べます
- **2つの列。** nullableな2列の間の `==` と `!=` は、SQLと同じく両方が非nullのときだけ成り立ちます。`⊥` 同士の2列は等しくありません。一方 `col == null` は `⊥` で成り立ちます
- **owner。** ownerと行の比較は「その行にリンクしている」という意味です。未リンクのowner（`⊥`）はどの行にもリンクしていません
- **集合。** `t in (v₁, …)` は `t == vᵢ` の選言で、`not in` はその否定です

覚えておくべき帰結があります。`x = ⊥` のとき `not (x < 3)` は真です。つまり `not` は比較のSQL的な読み方と交換しません。全表は言語リファレンスの [Null](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md#null) にあります。lintの警告 `negated-order-admits-null` は、nullableなオペランドの順序比較にかけた `not` を指摘します。対象は `not` を取れる唯一の形である `@check` と `property` です（主張I2）。

論理型の `@derived` 列はこの定義の述語ではありません。その列は比較をSQLと同じに読み、オペランドが `⊥` の間は `⊥` です。`not` の下でも同じです。

## アクション

<a id="d6"></a>

### D6 アクション

書き込みのないユースケースはアクションをもちません。書き込みのあるユースケースは、書き込みの **トランザクショングループ** ごとに1つのアクションをもちます。グループの順は次のとおりです。

1. 呼び出す各APIの書き込み（`invokes` の順）
2. 直接の書き込み。`relate` キーでつながるグループに分けます
3. 残った孤立した書き込みのそれぞれ

公開エンティティへの書き込みは、そのユースケースの内部グループ1つに加わります。

アクション `a` は、パラメータ `p₁ … p_r`（書くエンティティごとに1つと、読む行の分。D7）をもちます。ガード `G_a` はパラメータについての述語の連言です。効果 `F_a`（D8）は事前状態に同時に適用します。

**ガードとしての条件。** `holds` 本体をもつ `applies_to(Cond, UC)` は `UC` のアクションを守ります。分割されたユースケースでは最初のステップを守ります。`applies_to(Cond, Api)` は、そのAPIを呼ぶすべてのユースケースで、そのAPI経由で書くステップを守ります。本体のアトムは行を次のように読みます。

- ステップが書くエンティティのアトムは、そのパラメータを読みます。更新する行は事前状態で、作る行は事後状態で読みます
- ステップが読むだけの親のアトムは、結合キーをたどります
- それ以外のエンティティのアトムは、エンティティごとに既存の行を1つ読みます。直接の `relate` があればそれでステップの行にリンクし、なければ独立です。リンクの連鎖で届かない行は警告 `UnjoinedGuardRead` です

`.along(A, B, …)` では、ステップが束縛しない経路上の各エンティティがこの種の行になり、各段の結合キーでリンクします。`.has` と `.none` は、事前状態にpresentな関連行を量化します。`applies_to(Cond, System)` はガードを加えません。

<a id="d7"></a>

### D7 パラメータと束縛

状態 `s` での `a` の束縛は、各パラメータをスロットに対応させます。役割は、そのパラメータを導入する行で決まります。

| モデルの行 | 役割 | 許されるスロット |
|---|---|---|
| `creates(UC, E)` | `New` | `Exists` が `absent` である最小のスロット。なければなし |
| 作らない `E` への `updates`、`deletes`、`sets`、`transitions`、`chooses`、`drives`、`links`/`relinks`/`unlinks` | `Existing` | 任意の `present` なスロット |
| 作る子からの必須の `relate`、対象の親であるコピー元、親についての条件アトム | `Parent{key}` | 任意の `present` な親スロット。子の `key` のownerがそれを指す、または作る子がその下に作られる、というガードが付く |
| 分割されたユースケースで前のステップが書いた行（D10） | `Earlier{i}` | 実行の印が `i` のスロット。presentかどうかは問わない |
| 印のエンティティの行をもたないハンドラの最初のステップ（D11） | `Triggered` | ラッチかカウンタがハンドラを許す、印のエンティティの `present` なスロット |

同じエンティティ対の間にキーが2つあると、親パラメータは独立に2つ取ります。アクションが書きもする親は、結合キーの上だけで子の親になります。

**選択。** `New` に最小のabsentスロットを取るのは正準形の選択です。スロットは添字順に作られ、deletedのスロットは再利用されません（`Exists` は `deleted` から抜けません）。z3エンコードは任意のabsent行での作成を許しますが、それはステップを増やすだけです。

<a id="d8"></a>

### D8 効果

各構文は、パラメータ `p` についてのガードと効果を事前状態 `s` に与えます。原文は構文ごとに1行の表です。ここでは種類ごとにまとめます。細部は原文 [D8](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/theory/semantics.md#d8) の表を見てください。

- **作成と削除。** `creates` は `Exists[p] := present` にし、列は書かれない限り基底値のままです。作る行のvariation列で書かれないものは、値ごとに分岐します。`deletes` はD9のガードのもとで `Exists[p] := deleted` にし、列を基底値に戻します。`p` を指すownerは指したままです
- **値。** `sets(UC, E.c == v)` は `c[p] := v` です。nullableな列に書いた数 `k` は `k` で、`⊥` ではありません。`E.c == present` は、`{⊥, present}` の列なら `present` を書きます。nullableなEnum、Bool、数の列なら非nullの値ごとに分岐します（数の列では `[m+1]` の値ごと）。非nullの列なら何もしません
- **条件付きの値。** `sets(UC, E.c == vᵢ).when(Cᵢ)` は、本体 `Cᵢ` が成り立つ `sets` ごとに `c[p] := vᵢ` へ分岐します。本体は、`p` が作る行ならステップ後に、更新する行ならステップ前に読みます
- **コピー。** `sets(UC, E.c == F.d)` は `c[p] := d[q]` です。コピー元 `q` は、ステップのパラメータ、`Earlier` の行、結合キー上の `p` の親のどれかである必要があります。`d[q]` は、`q` が更新する行か前のステップの行ならステップ前に、ステップが作る行ならステップ後に読みます
- **リンク。** 束縛した親の下に作った子は `owner[p] := q` になります。作る親の下で更新する既存の子も同じで、`.optional()` ならガード `owner[p] = ⊥` が付きます。`links` はガード `owner[p] = ⊥` を、`relinks` はガード `owner[p] ≠ ⊥` を求めます（必須キーでは求めません）。`unlinks` は `owner[p] := ⊥` です。そのガードは、同じステップか同じ実行の前のステップが書いた親の行があれば `owner[p] = q`、なければ `owner[p] ≠ ⊥` です
- **遷移と選択。** `transitions` は `c[p]` を遷移元とする腕ごとに分岐し、腕の `.when` は本体が成り立つ分岐だけを残します。`chooses` は値ごとに分岐します。`drives` は命題を `b` にします。どの行も書かない変数は変わりません

**組み合わせ方。** 選択以外の効果は、まとめて事前状態に適用します。次に各選択が事後状態を分岐させ、選択が2つあれば数は掛け算になります。腕・値・コピーのガードが、分岐した後続状態を絞り込みます。`Post_a(s, p)` は `(a, p)` のもとでの `s` の後続状態の集合です。事前状態のガードが成り立たないか、すべてが絞り込まれると空になります。

ユースケースは1つの列に1つの値を残します。ガードのない2つの値、値と並ぶコピー、同じ列への `chooses` と `sets` はerrorです（`ConflictingEffects`、`ChoosesAndSets`）。1つのステップが同じ `(変数, パラメータ)` を2回書くこともerrorです。

**選択。** ノートは、腕の `.when` ガードと同じ列への2回目の書き込みの組み合わせを述べていません。そのようなステップはerrorなので、問題は生じません。

<a id="d9"></a>

### D9 削除のガード

`.on_delete` が未設定、`restrict`、`no_action` のどれかである `relate(Child, E, …)` ごとに、`deletes(UC, E)` にガードが付きます。そのスロットを指すpresentな子がないことです。同じステップが削除・unlink・relinkする子は除きます。

ライフサイクルは `cascade`、`set_null`、`set_default` を実行しません。そのキーの子はpresentのまま、deletedの親を指し続けます。そのキーには `DanglingKey_*` も付きません。

ここで成果物との食い違いが生じます。SQLのエクスポートは `ON DELETE CASCADE`、`SET NULL`、`SET DEFAULT` を書きます。そこから作ったデータベースは子を消すかキーを空にしますが、`T_β(M)` では子が残ります。生成するGo、Rust、TypeScriptのコードもアクションを実行せず、検査されない `OnDelete_*` の義務を列挙するだけです。

警告 `DeleteLeavesChildren`（`cascade`）と `DeleteLeavesChildKeys`（`set_null`、`set_default`）が、この差を知らせます。名指しされるのは、そのような親を削除し、子を削除しないユースケースです。後者2つでは、キーも動かさないものが対象です（主張I3）。`@soft_delete` 列をもつ `E` には、ガードもどちらの警告も付きません。

<a id="d10"></a>

### D10 分割されたユースケースと実行

書き込みが `k ≥ 2` 個のトランザクショングループ（D6）になるユースケースは、アクション `UC_1 … UC_k` です。最後より前のステップが書く各エンティティに、実行の印 `E._run_UC` が付きます。印は、その行で進行中の実行が最後に終えたステップを記録します。

- `UC_1` は印が `none` の行だけを束縛し、印を `1` にします
- `UC_i`（`i > 1`）はその行を `Earlier{i-1}` として束縛し、印を `i` にします。`i = k` なら `none` に戻します
- 各ステップは独立したトランザクションなので、2つのステップの間に任意のアクションが入れます

実行は中断しません。ガードが成り立たないステップは永遠に待ちます。それはデッドロックか、実行されないユースケースとして現れます。削除は印を戻さないので、前のステップが削除した行でも実行は最後まで進みます。ユースケースに適用した条件はステップ1だけを守り、APIに適用した条件はそのAPIのステップを守ります。

<a id="d11"></a>

### D11 トリガー

`raises(UC, Ev)` と `triggers(Ev, UC2)` は2つのユースケースに順序を付けます。

- イベントは、すべての `raises` がアクションをもつユースケースを名指しするとき **追跡される** イベントです。そうでなければ **自由** です。`raises` がない、外部システムかタイマーが発生させる、発生させる側が何も書かない、のどれかです
- 追跡されるイベントの **候補** は、すべての発生側の最後のステップが束縛するエンティティです。候補のうち、どれかのハンドラが読むものを **印のエンティティ** と呼びます

規則は次のとおりです。

- **ラッチ。** 各発生側の最後のステップは、印のエンティティ `E` 上の各パラメータで `E._raised_Ev := true` にします。ハンドラを待ちません
- **ガード。** ハンドラの最初のステップは、発生側のものになりうる `E` の行をちょうど1つもつとき、その行のラッチで守られます。そうでなければ `Triggered` パラメータ（D7）を束縛し、直接のキーが1つあればそれで自分の行にリンクします
- **変種。** 複数の追跡されるイベントでトリガーされるユースケースは、イベントごとに最初のステップの複製 `UC2_by_Ev` をもちます
- **自由なイベント。** 印をもたず、順序を付けません

**ラッチは設計上、決して戻りません。** ハンドラも、削除も、2回目のraiseもラッチを `false` に戻しません。最初のraiseの後、ハンドラはその行で追加のraiseなしに何回でも（0回も含めて）実行できます。ラッチが課す順序は「その行での最初のraiseより前ではない」だけです。これは [event-order.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/design/event-order.md#decisions-in-one-place) の質問1と規則9の決定で、理由は回答1にあります。

raise 1回につきハンドラ1回が必要なら、書き手が `triggers(Ev, UC2).counted(k)` を選びます（[Counting raises](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/language-reference.md#counting-raises-counted)）。

- **カウンタ。** その辺ではカウンタ `E._pending_Ev_UC2` がラッチに代わります。raiseは `i` を `i+1` に、`k` を `over` に進めます。ハンドラは `0` 以外を必要とし、`i` を `i-1` に戻します。`over` は `over` のままで、そのときハンドラはラッチのもとと同じに動きます
- **あふれ。** 状態規則 `EventOverflow_<E>_<Ev>_<UC2>` は、`over` にあるpresentな行がないことを述べます

<a id="d12"></a>

### D12 時計

ある述語が `now` を読むとき、系はアクション `Tick` をもちます。ガードは `now < m`、効果は `now := now + 1` です。DateやDateTimeの列はこの時計の上の点で、`sets(UC, E.due == 3)` は時刻3に置きます。

## 遷移系

<a id="d13"></a>

### D13 遷移系

`T_β(M) = (S, I, →)` です。`S` はD2の割り当ての集合、`I = I_β(M)`（D4）です。`s → s'` は、D6、D10、D11、D12のあるアクション `a` と、`s` で許される束縛 `p`（D7）があり、`s' ∈ Post_a(s, p)`（D8、D9）となるときに成り立ちます。

どの `β` でも `S` は有限です。**ステップ** は3つ組 `(s, (a, p), s')` です。値を同じ値で書き直すアクションでは、`s' = s` のステップもありえます。活性の検査はすべてそれを停滞として扱います（D20）。

信頼の構造として大事な点があります。BFS（`check`、`states`、`verify`）、TLA+の出力（`export --kind tla`、`verify --with-tlc`）、z3エンコード（`verify --prove`）は、すべて `TransitionSystem::build` が返す1つの値を読みます。どれもモデルを2度は読みません。その値が `T_β(M)` からずれていれば、全エンジンが同じずれを共有します。エンジン間の一致では、そのずれは示せません。その値が `T_β(M, σ)` であることは主張I1です。

<a id="d24"></a>

### D24 スコープ

**スコープ** `σ` は、実行が残すユースケースの集合です。`--buc` は名指しのBUCから到達できるユースケースを残します。`--without-usecase`、`--without-buc`、`--actor` はユースケースを外します。`T_β(M, σ)` は、外したユースケースのアクションを除いた `T_β(M)` で、`T_β(M) = T_β(M, ALL)` です。`--entity` はアクションを除かず、どの検査を走らせるかを選ぶだけです。

スコープ付きの実行の判定は、すべて `T_β(M, σ)` の判定です。`OK:` 行は `in the selected scope` と書きます。以下の定義は `T_β(M)` について述べ、そのまま `T_β(M, σ)` に当てはまります。theme (b) は、スコープ下の証明が何を覆うかについてD24を引きます（主張B2）。

<a id="d14"></a>

### D14 振る舞い

- **有限トレース** は `s₀ → s₁ → … → s_k`（`s₀ ∈ I`）です
- **振る舞い** は無限列 `σ = s₀ s₁ …`（`s₀ ∈ I`）で、各 `i` で `s_i → s_{i+1}` か `s_{i+1} = s_i`（停滞ステップ）です。TLA+と同じです
- ある時点から `s` で永遠に停滞する振る舞いは、`s` で **止まる** といいます
- 自分以外に後続状態のない状態は **終端** です。以下のどの公平性の仮定のもとでも、振る舞いは終端で止まってよいとします

<a id="d15"></a>

### D15 cone

`W ⊆ V` を、`W` を書くアクションの読みについて閉じた変数の集合とします。`T|W` は `W` に制限した系です。`W` に何も書かないアクションは落とし、残りは `W` への効果を保ち、状態は `W` に射影します。

閉包の定義はtheme (a) にあります。そのページは、`Reach(T|W) = π_W(Reach(T))` が成り立つ場合と、`⊇` だけが成り立つ場合を述べます。このページに必要なのは定義だけです。以下の判定はすべて `T_β(M)` そのものの上で定義するからです。

直観的には、coneは「ある検査に影響しうる変数とアクションだけを残した小さな系」です。

## 状態規則

<a id="d16"></a>

### D16 状態規則

状態規則は束縛変数 `E₁ … E_k` と本体 `φ` をもちます。状態 `s` で規則が成り立つのは、presentなスロットのすべての束縛 `b` で `φ_b(s)` が成り立つときです。`T` が規則を満たすのは、すべての `s ∈ Reach(T)` で成り立つときです。presentなスロットのないエンティティについての規則は成り立ちます。

規則の形はどれも状態規則を1つ表します。`forbidden`、`invariant`、`required`、`exclusive`（単一と複数エンティティ）、量化子の規則、`@check` が該当します。`@unique` とN:Mの `.via`（`Unique_*`）、1:1キー（`Unique_<Child>_<role>`）、多重度の範囲（`MinCard_*`、`MaxCard_*`）も同じです。削除された親を指す制限キー（`DanglingKey_*`）と、数えるトリガー（`EventOverflow_*`）も含みます（[state-derivation.md, "Checks"](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md#checks)）。

書く形の本体は次のとおりです。条件 `c₁ … c_r` はD5で読み、束縛変数はpresentなスロットを動きます。

| 形 | 本体 `φ` | 名前 |
|---|---|---|
| `forbidden(E…, c₁, …, c_r)` | `¬(c₁ ∧ … ∧ c_r)` | `Forbidden_<E>_<n>`、`MultiForbidden_<E>_<n>` |
| `invariant(E…).when(g₁…).then(r₁…)` | `(g₁ ∧ …) ⇒ (r₁ ∧ …)` | `Inv_<E>_<n>`、`MultiInv_<E>_<n>` |
| `required(E, c₁, …, c_r)` | `c₁ ∧ … ∧ c_r` | `Required_<E>_<n>` |
| `exclusive(E, c₁, …, c_r)` | `∧_{i<j} ¬(c_i ∧ c_j)` | `Exclusive_<E>_<n>` |
| `invariant(E).when(g…).has(R.c…)` | `g ⇒ ∃r. link(e, r) ∧ c` | `Quantifier_<E>_<n>` |
| `invariant(E).when(g…).none(…)` | `g ⇒ ¬∃r. …` | `Quantifier_<E>_<n>` |
| `invariant(E).when(g…).at_least(k, …)` | `g ⇒ Count ≥ k` | `Quantifier_<E>_<n>` |

`.along(A, B, …)` は経路のownerの等式をガード側に加えます。そのため規則はリンクした行についてだけ述べます。`.when(Cond)` は `Cond` の `holds` 本体の比較を加えます。

<a id="d17"></a>

### D17 `after` アサーション

`after(UC).assert(ψ)` は、すべての `s ∈ Reach(T)` と、`s' ≠ s` であるすべてのステップ `s →_a s'` で、`s'` で `ψ` が成り立つことです。`a` は `UC` の **最後の** ステップです（変種 `UC_by_Ev` があればそのすべて）。`s'` では、アクションのパラメータはそのスロットに束縛されます。アクションが束縛しないスコープ内のエンティティは、`s'` のpresentなスロット全体で全称量化します。

実行の2つのステップの間の状態は検査しません。何も変えない最後のステップも検査しません。ネイティブの実行は、自己ループでこの検査を飛ばします。TLCが検査する `PROPERTY` `[][(\A p : UC(p) => post')]_vars` も、停滞ステップならすべて満たされます。これはTLA+と同じく意図した読み方です。言語リファレンスがそう述べ、最後のステップが停滞しかしないassertはD18が空虚として報告します。

<a id="d18"></a>

### D18 空虚さ（Vacuity）

到達可能などの状態も規則の前提のどれかを満たさないとき、規則は **空虚に成り立つ** といいます（[state-derivation.md, "Rules that hold vacuously"](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/state-derivation.md#rules-that-hold-vacuously)）。空虚さは成り立つ規則についての警告で、判定を変えません。

`after` アサーションの前提は、最後のステップで `s' ≠ s` となるもの、つまりD17が検査するステップです。最後のステップが `s' = s` でしか実行されない場合（`UnmetPremise::OnlyStutters`）と、一度も実行されない場合が報告されます。

## 時間性質

`property` は、束縛変数 `E₁ … E_k`、リンク述語 `ℓ`（`.along` のownerの等式、なければ `true`）、論理式、公平なユースケースの集合をもちます。束縛 `b` の **トリガー** を次のように定めます。

```
trig_b(s)  ≝  (∀j. s(Exists(E_j))[b_j] = present)  ∧  ℓ_b(s)
```

`pres_b(s)` は最初の連言肢だけです。オペランドは、存在に関係なくそのスロット上でD5により評価します。absentやdeletedのスロットでは基底値を読みます。性質が成り立つのは、すべての束縛で成り立つときです。

直観的には、`trig_b` は「この組の行がそろって存在し、リンクしている」という条件です。性質の要求はこれが真の時点から始まります。

<a id="d19"></a>

### D19 安全性の形

| 形 | 成り立つ条件 |
|---|---|
| `always(x)` | `∀s ∈ Reach(T). trig_b(s) ⇒ x_b(s)` |
| `stable(p)` | `s ∈ Reach(T)` からの各ステップ `s → s'` で `trig_b(s) ∧ p_b(s) ∧ pres_b(s') ⇒ p_b(s')` |
| `unchanged(c₁…c_r).when(p)` | `s ∈ Reach(T)` からの各ステップ `s → s'` で `trig_b(s) ∧ p_b(s) ∧ pres_b(s') ⇒ ∀j. c_j(s') = c_j(s)` |
| `precedes(p, q)` | 各有限トレース `s₀ … s_k` で `trig_b(s_k) ∧ q_b(s_k) ⇒ ∃j ≤ k. trig_b(s_j) ∧ p_b(s_j)` |

`stable` と `unchanged` はステップの前のリンクだけを読みます。`s' = s` のステップはどちらも破りません。`precedes` は束縛ごとの安全性「`q` は `p` より前に起きない」です。TLA+では束縛ごとのラッチ `P_seen` で表します。

<a id="d20"></a>

### D20 公平性

`.fair(UC₁, …)` をもつ性質 `P` の **公平なインスタンス** は組 `(a, κ)` です。`a` はある `UC_i` のアクション（分割されたユースケースならすべてのステップ）です。`κ` は、その `New` でないパラメータが束縛するスロットです。

- `(a, κ)` が `s` で **有効** なのは、`κ` を拡張する `a` の束縛のどれかが後続状態 `s' ≠ s` をもつときです
- `s' ≠ s` のステップ `s → s'` が `(a, κ)` を **取る** のは、`κ` を拡張する `a` の束縛のどれかが `s` を `s'` に動かすときです

ステップは状態の対なので、そのような動きをもつ公平なインスタンスをすべて同時に取ります。どの変数も変えない動きは、インスタンスを有効にせず、取ったことにもしません。TLA+の `⟨A⟩_vars` と同じ読み方です。したがって、公平なインスタンスの自己ループだけで1つの状態にとどまり続ける振る舞いは、そのインスタンスを取っていません。

振る舞い `σ` についての公平性の条件は2つです。

- `Fair_P`: ある時点からずっと有効な公平なインスタンスは、無限回取られる。インスタンスごとの弱公平性で、TLA+の出力では `∧_{(a,κ)} WF_vars(∃ new slots : a(κ, …))` です
- `WF_vars(Next)`: ある時点から別の状態へのステップがどの状態でも有効なら、状態を変えるステップが無限回起きる

強公平性はありません。`SF` の形は、言語にも、TLA+の出力にも、`lasso.rs::Fairness` にもありません。`lasso.rs::Fairness` の値は `Plain`（`Fair_P` だけ）と `WfNext`（`Fair_P ∧ WF_vars(Next)`）の2つです。`.fair` のない性質では `Fair_P = true` です。

<a id="d21"></a>

### D21 活性の形

`eventually(x)` では `goal = x`、`cause = true` と置きます。`leads_to(x, y)` では `goal = y`、`cause = x` と置きます。

公平性の条件 `F` のもとで性質が `T` で成り立つのは、次のときです。`F` を満たす `T` のすべての振る舞い `σ`、すべての束縛 `b`、`trig_b(σ_i) ∧ cause_b(σ_i)` となるすべての `i` について、ある `j ≥ i` で `goal_b(σ_j)` が成り立つことです。

- `eventually(x)` は束縛ごとの `□(trig ⇒ ◇x)` で、`◇x` ではありません
- `goal` は `j = i` でも読みます
- `goal_b(σ_j)` は `pres_b(σ_j)` を求めません。`i` と `j` の間に削除したスロットでは、D8が残す基底値を読みます。したがって削除は、その基底値が満たすgoalを満たし、ほかのgoalは満たしません

これは定義された意味論です。言語リファレンスの "Temporal path properties" がそう述べ、TLA+の式 `[](present => <>x)` と `(present /\ x) ~> y` も同じに読みます。

**`.present()`。** これを付けると、goalはpresentな束縛を求めます。

| 形 | `cause` | `goal` |
|---|---|---|
| `eventually(x).present()` | `true` | `pres_b ∧ x` |
| `leads_to(x, y).present()` | `x` | `pres_b ∧ y` |

定義はこの `goal` でそのまま当てはまります。`trig_b` は同じなので、リンク `ℓ` はトリガーにだけ残ります。deletedのスロットは再利用されません（D7）。そのため、goalに届く前のある `k ≥ i` で束縛したスロットが削除されると、以後 `pres_b` は成り立ちません。その振る舞いが `F` を満たすなら、性質は破れます。TLA+の形は `[](present /\ link => <>(present /\ x))` と `(present /\ link /\ x) ~> (present /\ y)` です。ほかの形に付けた `.present()` はerror `PresentOnNonGoalProperty` です。

実装は `pres_b` をgoalの述語に加えるので、全エンジンが1つの述語を読みます。`pres_b` が読む `Exists` 変数はどの性質のconeにもすでにあります。そのため `.present()` はconeと縮約を変えません。

**どちらの公平性で判定するか。** 性質が本来もつべき判定は `WfNext` のもとでのものです。エクスポートする `Spec` は、モデルに `eventually` か `leads_to` があれば `WF_vars(Next)` を連言で加えます。`P` は `Fair_P ⇒ (…)` と出力されます。`Plain` はより強い要求です（対象の振る舞いが多いからです）。そこで次の2つの含意が成り立ちます。

- `Plain` のもとでの `ok` は、`WfNext` のもとでの `ok` を含意する
- `WfNext` のもとでの反例は、`Plain` のもとでの反例でもある

upstreamの `formal-verification.md` の "Temporal properties on a cone" は、この2つの含意で3つの実行の順序を決めています（このサイトでは[形式検証](/projects/rdra-ish/formal-verification/)）。ネイティブ検査器が各実行をどう判定するかはtheme (c) が述べます。

<a id="d22"></a>

### D22 回復可能性

`can_reach(g)` が成り立つのは次のときです。

```
∀s ∈ Reach(T). trig_b(s) ⇒ ∃ s = t₀ → t₁ → … → t_r.  (∀j. pres_b(t_j)) ∧ g_b(t_r)
```

束縛ごとのCTL式 `AG (trig ⇒ E[pres U (pres ∧ g)])` です。言葉にすると「到達可能な状態でトリガーが真なら、束縛した行が存在したまま `g` に届く道が1本はある」です。探索したグラフの上で、束縛ごとに1回の後ろ向きの走査で判定します。その走査は、どのビルドでもグラフが完全であることを表明します。リンクを読むのはトリガーだけです。公平性は適用されず、インスタンスが永遠にループしてもかまいません。

## 判定

判定は、`T_β(M, σ)` と1つの性質か規則についての言明です。`proved` だけは、証明のスコープに入るすべての `T_{β'}(M, σ)` についての言明です。ツールが検査について出す語は、すべて下の表のどれかです。

判定が表のとおりの意味をもつのは、ビルドが `T_β(M, σ)` を返す限りにおいてです（主張I1）。ツール自身の出力は、この主張について何も言いません。

<a id="d23"></a>

### D23 判定語

表は原文の行をすべて残し、長い説明は表の下に回しました。

| 出力 | 場所 | 意味 |
|---|---|---|
| `ok` | `verify` のconeか性質の行 | その行の検査が `T_β(M)` で成り立つ（D16、D17、D19、D20の公平性のもとでのD21、D22）。coneの行では判定はconeから導いたもので、coneからモデルへの一歩はtheme (a) が受け持つ |
| `ok (checked in Cone_X)` | 覆われた安全性のcone | `ok`。このconeの変数・アクション・ガード・パラメータをすべて含むcone `Cone_X` の実行で判定した |
| `counterexample` | 行、または `result:` | 探索した系の有限トレース（安全性）かラッソ（活性）で、検査を破るもの |
| `violated` | `property P (BFS on its cone): violated`、`can_reach (BFS on N cones): k checked, m violated` | `counterexample` と同じ。BFSだけが判定する形（`stable`、`unchanged`、`precedes`、`can_reach`）の行で使う |
| `not decided` | 行 | 反例を見つける前に実行が止まった。どちらの向きにも主張しない。止まった理由は行の注記にある |
| `tool_error` | 行、または `result:` | ツールの故障で、モデルについての事実ではない |
| `result: ok` | 最後の行 | すべての検査が `ok` で、ツールエラーも未判定もない。`--deny-unproved` では未証明もない。再生に失敗したトレースはツールエラーと数える |
| `result: not decided` | 最後の行 | 失敗もツールエラーもないが、上限か時間予算が残した所見がある。または `--deny-unproved` で未証明の規則がある。`--deny-undecided`（か `--deny-unproved`）がなければ終了ステータスは0。`OK:` 行は判定できたものについてだけ成り立つ |
| `MemoryCapReached_*`、`StateCapReached_*`、`PatternCapReached_*` | `check`、`states` | error。coneが止まったので、その規則は検査されていない。`check` はこれを合格と報告しない |
| `proved: R` | `verify --prove` | z3エンコードについて帰納的な論理式の集合に `R` が属する |
| `unproved: R: not inductive; …`、`unproved: R: z3 gave up on A`、`unproved: R: an initial state violates it` | `verify --prove` | 証明されていない。どれも有界の判定については何も言わない |
| `out of scope: R: why` | `verify --prove` | エンコードが `R` を表せない。主張はない |
| `refuted: R (BFS counterexample at k instances)` | `verify --prove` | 同じ実行の安全性のconeが `R` を破る状態に到達したので、証明器は試していない。違反はBFSのエラーで、未証明の規則ではない |
| `escalated: R: ok at k instances`、`counterexample at k instances`、`not decided at k instances` | `verify --prove` | BFSが通して証明器が未証明に残した規則を、coneで1つと2つ多いインスタンス数のBFSにかけた結果。そこでの `counterexample` は実行を失敗させる |
| `decided` | 文章、設計ノート | 判定語として出力はされない。判定が `ok` か `counterexample` のとき、検査は「判定された」という |

`stopped at the memory limit` と `stopped at the state cap` は `not decided` になった理由で、独立した判定語ではありません。

**`counterexample`。** 原則として `T_β(M)` の振る舞いです。例外はtheme (a) が述べる場合です。スロットを解放するconeや、raiseの印を外したconeの反例は、すぐには数えません。状態規則か `after` では、洗練したconeか厳密なconeがそのトレースを裏付けたときに数えます（主張A2）。性質では、モデル全体が判定したときに数えます（主張A6）。出力するトレースはすべて、出力前に対象の系のステップ関係で再生します。再生できないものは `tool_error` です（主張N16）。

**`not decided` の注記。** 状態の上限、メモリ上限、時間予算のどれで止まったかを書きます（`stopped at the time budget of S s` など）。coneでは判定できない性質には `needs the whole model's WF_vars(Next)` か `its counterexample may create instances past the bound` が付きます。

**`tool_error` の内訳。** 第1は、自分を証明しない反例かトレースです。性質では `LassoFault`、状態規則か `after` では `LiftFault` です。デッドロック、`can_reach` の失敗、witnessでは `TraceFault` です。第2はネイティブ検査器とTLCの不一致、第3は違反を伴わないTLCの失敗です。

**`proved: R`。** エンコードはD13を広げています。`New` は任意のabsent行を取り、Int項と `now` はすべての非負整数を動きます。z3が健全で、theme (b) のTheorem 1の仮定が成り立つとします。そのとき、証明のスコープ `Sc(M, β)` のすべての `β'` で `T_{β'}(M, σ) ⊨ R` です（原文 [z3.md, Definition 3](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/theory/z3.md#the-soundness-theorem)）。

- 実行が構築できれば、スコープは `β` を含みます。スコープは、モデルが構築できるすべての範囲です。その条件はtheme (b) が受け持ちます（主張B2）
- 証明を主張する行は、`proved:` 行も含めてスコープを出力します。形は `for any number of rows and every --int-range-max from L to M` です。`L` と `M` は、ビルドがerrorを出さない最小と最大の `m'` です
- スコープ `σ`（D24）のもとでは、エンコードする系もスコープを適用した系です。主張は `in the selected scope: <flags>` で終わり、そうでなければ `in the whole model` で終わります

**`unproved` の3つの理由。**

- `NotInductive`: 帰納法の反例があります。それは `R` と残したすべての候補が成り立つ状態からのもので、到達可能とは限りません。出力行もそう述べます（"it, every proved rule, and every kept lemma hold"）
- `Unknown`: z3がアクション `A` のステップで `unknown` と答えたか、リソース上限を使い切りました
- `Initial`: エンコードの初期状態が `R` を破ります。その状態は `β` より多くの行か大きなInt値をもつかもしれません

**`refuted`。** `R` を反駁するのは、coneが裏付けた違反か、再実行で再び見つかった違反だけです（`recheck_cones`、主張A2の洗練のループ）。エンティティごとの数が異なれば、`Order=1 Payment=2 instances` のように各数を出します。

**`escalated`。** ここでの `counterexample` は、上の `counterexample` の条件のもとで、より大きな `β'` での `T_{β'}(M)` の違反です。coneが裏付けられない反例（イベントなしにユースケースを実行する、coneが数えるより多く作る）は再度判定し、実際のインスタンス数を出力します（主張A25）。

## デッドロック

<a id="d25"></a>

### D25 デッドロックの所見

エンティティ `E`、そのライフサイクル列 `v`、スロット `k` を考えます。探索した系の到達可能な状態 `s` で行 `k` がpresentだとします。`s` からのどの道も、`k` で `v` を変える辺も行 `k` を削除する辺も通らないとき、`s` は **`v` で詰まっている** といいます。

`v` の値 `x` が **開いている** のは、`@end` が `x` を名指しせず、ある `transitions` の腕が `x` から別の値へ導くときです。それ以外の値はすべて終わりの値（end state）です。`@end` が名指しする値、どの腕も抜け出さない値、腕がすべて自分に戻る値、抜け道が行を削除するユースケースだけの値が該当します。終わりの値には、ある状態が抜け道なしにその値を保っていても、デッドロックの所見は付きません。

`Deadlock_<E>_<v>_<x>` は、BFSの順で最初の到達可能な状態を報告します。その状態は `v` で詰まっていて、行 `k` が開いた値 `x` をもちます。削除が `x` から抜けることに数えられるのは、`x` が開いているときだけです。削除は詰まりの判定で読む辺の1つで、`x` を開いた値にする理由にはなりません。

**定義は単一のステップではなく道を読みます。** ある状態から出る道が、すべて `v` と行 `k` に触れないステップで永遠に回るとします（静かなサイクル）。その状態は、ステップがまったく残らない状態と同じく詰まっています。これは意図した設計です。この読み方は、coneの縮約が保つものだからです。発散を区別しない停滞双模倣は、道が `T_v` を変える辺に届くかを保ちます（原文 [cones.md, A8, consequence 3](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/theory/cones.md#the-reduction-by-an-independent-sub-lifecycle)）。一方で、後続状態の有無は保ちません。

TLCのデッドロックはもう一方の読み方で、後続状態がまったくない状態です。2つの読み方は静かなサイクルで食い違います。エンジンコーパスがその事例を記録しています（`cone_reduced_loop_unreached`）。

## 定義と食い違う文章

モデルの書き手向けの文章やコードのコメントが、D1〜D25と違う箇所です。どの場合も定義はコードに従います。コードが定義からずれることは別の問題で、主張I1が扱います。原文は、どの行もそれ自体では健全性の問題ではないとしています。

- **S1。** `crates/rdra-ish-core/src/model/constraints.rs::TemporalFormula::Eventually` と `::LeadsTo` のドキュメントコメントは `<>expr`、`p ~> q` と書きます。定義はD21の束縛ごとの `□(present ∧ link ⇒ ◇x)` です。言語リファレンスの "Temporal path properties" と `formal-verification.md` の "Mapping" はコードの形を述べています。`eventually(expr)` は `[](present => <>expr)`、`leads_to(p, q)` は `(present /\ p) ~> q` です
- **S2。** `state-derivation.md` の "Variables" は、Int列が `0..5` を動くと書きます。定義はD2の `[m+1]` で、`m` は `--int-range-max` から来ます。5は既定値にすぎません。言語リファレンスと同ノートの "Bounds" は `--int-range-max` に触れています。ほかのページの書き手が5ではなく `m` を引くように挙げています

## 定義についての注記

- **存在しない行のオペランド。** D21は存在に関係なくgoalを読みます。D22は違い、goalの状態を含む道の上で行がpresentなままであることを求めます。D8は削除したスロットの列を基底値に戻します。したがって `draft` が基底値なら、`eventually(Order.status == draft)` は注文の削除で満たされます。TLCもTLA+の式を同じに読むので、エンジンは一致します。言語リファレンスがこれを述べ、削除では満たされないgoalの書き方も示します。`.present()`（D21）は、そのgoalを性質ごとに述べる手段です
- **初期状態は何も満たすと仮定しない。** D4の直積には、まだabsentの親の下にいる既存の子も含みます（`PreExistingChildOfCreatedParent`）
- **最小スロットでの作成は対称性のための選択。** D7と同じくTLA+のモジュールも添字順に作ります（`FirstAbsent`）。z3エンコードの任意のabsent行での作成は、ステップを増やすだけです
- **キューではなくラッチ。** D11のラッチでは、1回のraiseの後にハンドラが何回でも実行でき、発生側は待ちません。安全性については、これは消費型のどんな配送も過大近似します。隠しうるのは「raise 1回につき1回の実行」を要する活性か到達可能性の所見だけで、それは `.counted(k)` で述べられます
- **定義は `β` についてパラメトリック。** `n` が入るのはD2（キーの値域）、D4（Identityの始まり）、D7（スロット）です。`m` が入るのはD2（Intの値域）、D8（数の列への `present`）、D12（`Tick`）です。`β` に依存するものはほかになく、theme (b) のLemma Uがこれを使います
