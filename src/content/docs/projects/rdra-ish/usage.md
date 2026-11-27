---
title: "使い方"
description: "rdra-ish v3.0.0 のインストール、初回の一周、旧版からのアップグレード"
sidebar:
  order: 1
  label: "使い方"
---

このページは、バイナリの入れ方、サンプルでの一周、旧版からのアップグレード手順をまとめます。Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) へ。構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。

## インストール

rdra-ishはRust製のCLIです。次のどれかで入れます。

| 入手元 | コマンド | 入るもの |
| --- | --- | --- |
| PyPI | `uv tool install rdra-ish` | `rdra-ish` |
| Nix（flakes） | `nix profile install github:manji-0/rdra-ish-dsl` | `rdra-ish`、`rdra-ish-lsp`、`verify` が使う `tlc` と `z3` |
| Cargo | `cargo install --locked --git https://github.com/manji-0/rdra-ish-dsl rdra-ish-cli rdra-ish-lsp` | `rdra-ish`、`rdra-ish-lsp` |

[GitHub Release](https://github.com/manji-0/rdra-ish-dsl/releases) にも、Linux・macOS・Windows向けの `rdra-ish` バイナリがあります。

Nixで特定のリリースを入れるときは、URLに `/<tag>` を付けます（v2.3.0より後のリリースが対象）。インストールせずに試すなら `nix run` を使います。

```bash
nix profile install github:manji-0/rdra-ish-dsl/v3.0.0
nix run github:manji-0/rdra-ish-dsl -- --help
```

`PATH` にすでにある `tlc` や `z3` は、Nixが持ち込むものより優先されます。

入った版は `--version` で確かめます。このフラグはv2.2.0からあります。

```bash
rdra-ish --version
# rdra-ish 3.0.0
```

`verify` は追加の依存なしで動きます。TLCは `verify --with-tlc` のときだけ、z3は `verify --prove` のときだけ要ります。Nix以外での入れ方はupstreamの [Getting TLC](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#getting-tlc) と [Getting z3](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/docs/cli-reference.md#getting-z3) にあります。

`.rdra` の編集には `rdra-ish-lsp` とVS Code拡張を併用します（[CLI リファレンス](/projects/rdra-ish/cli-reference/)）。

## 初回の一周

サンプルを使って、主なサブコマンドを一通り動かします。

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
```

### 型検査と次のStage

```bash
rdra-ish check samples/ec-site
rdra-ish next samples/ec-site
```

`check` はモデルを型検査し、整合性を調べ、ライフサイクルを探索します。最後の行が判定です。errorがなければ `OK: no errors within 1 instance per entity, Int 0..5` のように、検査した範囲付きで出ます。errorがあれば `FAIL: 1 error, 0 warnings within ...` のような行で終わります。

`next` は各BUCがどのStageまで進んだかと、次のStageで足すものを示します。

### 図

```bash
rdra-ish diagram samples/ec-site --kind usecase --buc BucOrder
rdra-ish diagram samples/clinic-ops --all --out diagrams
```

図はMermaidテキストで出ます。1行目は `--buc` で1つのBUCに絞ったユースケース図です。`--all` はレビュー用の図一式を、図ごとに1ファイルでディレクトリへ書きます。画像が要るときは `mmdc` などで描画します。

### 状態とルール

```bash
rdra-ish states samples/clinic-ops --entity Appointment
rdra-ish list samples/clinic-ops --kind rule --format markdown
```

`states` はエンティティが到達できる状態のパターンを表で出します。`list --kind rule` はモデルのルールを一覧にします。`--format markdown` にすると、そのままPRDや設計書に貼れます。

### 検証

```bash
rdra-ish verify samples/formal-verification/order.rdra
rdra-ish verify samples/formal-verification/order.rdra --with-tlc --prove
```

`verify` は不変条件、`after` アサーション、時相プロパティをそれぞれのconeで調べます。判定は組み込みのチェッカーが下し、JVMは起動しません。最後の `result:` 行が全体の判定です。

2行目はTLCで同じ判定を突き合わせ、z3で状態ルールを任意の行数について証明します（`--prove` は実験的）。`tlc` と `z3` が `PATH` に必要です。詳細は [形式検証](/projects/rdra-ish/formal-verification/) へ。

### コード生成

```bash
rdra-ish codegen samples/ec-site --lang ts -o domain.ts
```

`codegen` はモデルのドメイン型と遷移関数を、KamaeスタイルのTypeScriptで書きます。`--lang rust` と `--lang go` もあります。`check` が通らないモデルからは生成しません。詳細は [コード生成](/projects/rdra-ish/codegen/) へ。

## 推奨ループ

1. 1段階だけモデルを足す（[段階的モデリング](/projects/rdra-ish/incremental-modeling/)）
2. `rdra-ish check src/` で型と整合性を確かめる
3. `--buc` 付きの図や表で、その段階の関心だけをレビューする
4. `rdra-ish next src/` で各BUCのStageと次に足すものを確かめる
5. ルールを書いたら `rdra-ish verify src/` を回す

`warning` はレビュー信号、`error` はブロッカーとして扱います。

## アップグレード

### v2.3.0からv3.0.0へ

v3.0.0はメジャーリリースです。`verify` が組み込みのチェッカーで判定するようになり、一部の判定がSQLの意味に合わせて変わりました。変更の全体はupstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/v3.0.0/CHANGELOG.md#upgrading-from-v230) にあります。

**`verify` を呼ぶスクリプト**

- `verify` に `tlc` は要りません。判定は `tlc_result:` ではなく `result:` 行（`ok`、`not decided`、`counterexample`、`tool_error`）で読みます。`tlc_result:` は `--with-tlc` のときだけ出ます
- `--backend tlc` は `--with-tlc` に置き換えるか、外します。`--backend tlc` は非推奨の警告を出して動きますが、次のメジャーリリースで削除されます
- サンプルの `// expect verify:` ヘッダは、`tlc=ok` を `ok` に、`tlc=counterexample fail <Names>` を `fail <Names>` に書き換えます。`tlc=` を書けるのは、フラグに `--with-tlc` を含む行だけです
- `-o` と `--with-tlc` のどちらもなければ、`verify` はTLA+ specを書きません。`--tlc-jar`、`RDRA_TLC_JAR`、`RDRA_TLC_HEAP` は `--with-tlc` のときだけ効きます
- 反例は組み込みチェッカーの最短トレースです。TLCのトレースは `--with-tlc` のときだけ出ます
- `--max-states` と `--max-patterns` の既定値が変わりました。結果を再現したいときは、範囲をフラグで明示します

**TypeScriptの型**

`export --kind typescript-states` と `states --format typescript` は削除されました。どちらも書き換え先を示す使い方エラー（終了コード2）になります。

| 以前 | 今 |
| --- | --- |
| `rdra-ish export <INPUTS> --kind typescript-states -o x` | `rdra-ish codegen <INPUTS> --lang ts -o x.ts` |
| `rdra-ish states <INPUTS> --format typescript` | `rdra-ish codegen <INPUTS> --lang ts`（標準出力） |

`codegen --lang ts` の型はKamaeの形です。状態は `kind` で判別し（`order.kind === "Paid"`）、変換は `Order.fromRow(row)` のように `Result` を返します。モジュールを生成し直し、使う側のコードを直します。対応表は [コード生成](/projects/rdra-ish/codegen/) とCHANGELOGにあります。RustとGoの出力（実験的）も生成し直します。

**`rdra.toml`**

未知のテーブルやキーはerror（終了コード1）になり、その行を示します。たとえば綴りを誤った `[verfiy]` です。綴りを直します。`[dependencies]` は従来どおり自由形式です。

**読み込めなくなるモデル**

| モデル | 今の結果 | 直し方 |
| --- | --- | --- |
| `Enum` 列の `@default` が値の一覧にない。`Bool` 列の `@default` が `true`・`false` 以外 | `InvalidEnumVariant`、`InvalidBoolValue` | 宣言した値を宣言どおりの綴りで書く |
| `Enum` 列や `Bool` 列の `@default(null)` | `InvalidEnumVariant`、`InvalidBoolValue` | 外す |
| ルールが読む列の整数 `@default` が `0..--int-range-max` の外 | `IntLiteralOutOfBounds_<E>_<value>` | `--int-range-max` を上げるか既定値を下げる |

どの1つのエンティティにも属さない列を読む `property` は、モデルのerror `UnresolvedPropertyColumn` になりました。以前の名前は `UnresolvedPropertyAtom` です。名前で照合するスクリプトは直します。

**判定が変わりうるモデル**

サンプルで判定が変わったものはありません。

| 変更 | 影響 | 移行 |
| --- | --- | --- |
| `@null` の `Enum`・`Bool` 列はnullを持つ | 既定値なしで作った行は最初の値ではなくnullで始まる | 以前の初期値を保つなら `@default(<value>)` を足す |
| nullの列どうしは等しくない | `col == other` は両方がpresentで等しいときだけ成り立つ | nullどうしを一致させたいなら `qty == lim or (qty == null and lim == null)` と書く |
| nullの列に対する `@derived` の `in` はnull | `qty` がnullの間、`@derived(qty in (1, 2))` は真でも偽でもない | `qty == present and qty in (1, 2)` などと書く |
| 削除は子を待つ | `.on_delete` が `restrict`・`no_action`・未指定のキーを子が持つ間、`deletes(UC, Parent)` は無効 | 先に子を削除するか、つなぎを外す |
| 一意な列の組を検査する | `@unique`、`@unique(a, b)`、N:Mの中間キーが `Unique_<Entity>_<columns>` になる | 組を空けておくガードを足す（例： `.none(Booking.slot == am)`） |
| 削除した行はキーを保つ | 分割したユースケースの後の段が、削除した行の元の親を読む | 不要 |
| 上限で止まった `can_reach` は `not decided` | 以前は通っていたが、`--deny-undecided` で失敗する | 上限か `--memory` を上げる |

`verify --prove`（実験的）は、z3の予算を秒ではなくリソース単位で数えます。メモリ上限で止まったconeも、z3がそのconeのルールをすべて証明すれば判定済みになります。どちらも対応は要りません。

### v1.xから来る場合

v1.2.0からv2.3.0までの変更の要点です。v3.0.0へは、続けて上の手順も適用します。

**v2.0.0**：モデルの構文は変わりません。壊れるのは2点です。1つめは、複数エンティティにまたがるルールの名前です。`CrossForbidden_<E>_<n>` と `CrossInv_<E>_<n>` が、`MultiForbidden_<E>_<n>` と `MultiInv_<E>_<n>` になりました。`// expect` ヘッダや手書きの `.cfg` の接頭辞を置き換えます。2つめは、イベントで起動するユースケースの実行順です。`raises(UC, Ev)` と `triggers(Ev, UC2)` があると、`UC2` はイベントが上がった後にしか走りません。イベントが来ないハンドラは新しい `Deadlock` か `Runs_` の検出になります。イベントなしでも始まるユースケースには、始まる場所で上げる2つめのイベントが要ります。

**v2.1.0**：実験的な `codegen` サブコマンドが加わりました。TypeScript、Rust、Goでデータ型、状態型、ユースケースごとの遷移関数、ルール検査を出します。変更なしで更新できます。

**v2.2.0**：`--version`、留まってよい状態を宣言する `@end(...)`、失敗時の `FAIL:` 行が加わりました。`UnjoinedWrite` の警告と `multi-rule-unscoped` のlintも加わりました。`check`・`states`・`verify` は `--actor`、`--without-buc`、`--without-usecase` で他のユースケースを外しても、デッドロックを判定します。変更なしで更新できます。

**v2.3.0**：PostgreSQLとSQLite向けの `export --kind sql` が加わりました。列型の引数（`String(255)` など）、`.references(...)`、`reads` のクエリ形（`.by(...)` など）と `query-index-missing` のlintも加わりました。`diagram` は `--actor`、`--entity`、`--all` で絞り込みと一括出力ができます。変更なしで更新できます。

### 0.4.xの旧構文

0.4.xで書いたモデルは、upstreamのスクリプトで1.0の構文に書き換えます。古い形は、書き換え後の行を示すerrorで止まります。

```bash
python3 scripts/migrate-syntax-v3.py <model dir>
```

それより前の版のモデルには、`scripts/` の `migrate-phase3.py` と `migrate-syntax-v2.py` を先に実行します。スクリプトが扱わない箇所は、errorメッセージに従って手で直します。

## 次に読む

| 目的 | ページ |
| --- | --- |
| 書き方を段階的に学ぶ | [段階的モデリング](/projects/rdra-ish/incremental-modeling/) |
| 要求からルールまで追う | [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) |
| フラグを引く | [CLI リファレンス](/projects/rdra-ish/cli-reference/) |
| 検証を深める | [形式検証](/projects/rdra-ish/formal-verification/) |
| 実装につなぐ | [コード生成](/projects/rdra-ish/codegen/) |
