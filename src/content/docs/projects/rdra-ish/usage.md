---
title: "使い方"
description: "rdra-ish（main `169cdf3`）のインストール、初回の一周、旧版からのアップグレード"
sidebar:
  order: 1
  label: "使い方"
---

> 対象：main `169cdf3`（v3.0.0以降の未リリース版）

このページは、バイナリの入れ方、サンプルでの一周、旧版からのアップグレード手順をまとめます。Stageの進め方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) へ。構文の詳細は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。

## インストール

rdra-ishはRust製のCLIです。次のどれかで入れます。

| 入手元 | コマンド | 入るもの |
| --- | --- | --- |
| PyPI | `uv tool install rdra-ish` | `rdra-ish`（言語サーバーは `rdra-ish lsp` で起動） |
| Nix（flakes） | `nix profile install github:manji-0/rdra-ish-dsl` | `rdra-ish`、`rdra-ish-lsp`、`verify` が使う `tlc` と `z3` |
| Cargo | `cargo install --locked --git https://github.com/manji-0/rdra-ish-dsl rdra-ish-cli rdra-ish-lsp` | `rdra-ish`、`rdra-ish-lsp` |

[GitHub Release](https://github.com/manji-0/rdra-ish-dsl/releases) にも、Linux・macOS・Windows向けの `rdra-ish` バイナリがあります。

mainはまだリリースされていません。PyPIとGitHub Releaseで入るのはv3.0.0です。v3.0.0には `rdra-ish lsp` がなく、`verify` は既定で証明を走らせません。このページのとおりに動かすには、タグなしのNixかcargoでmainを入れます。

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

`verify` は追加の依存なしで判定します。z3が見つかれば、状態ルールの証明も既定で走ります。見つからなければ `note: z3 not found on PATH: the proof was skipped ...` を出して証明を飛ばし、出力と終了コードはそれ以外変わりません。TLCは `verify --with-tlc` のときだけ要ります。Nix以外での入れ方はupstreamの [Getting TLC](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#getting-tlc) と [Getting z3](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/cli-reference.md#getting-z3) にあります。

## エディタとClaude Codeプラグイン

言語サーバーは `rdra-ish-lsp` です。`rdra-ish lsp` はCLIに組み込んだ同じサーバーで、標準入出力で話します。PyPIで入れた場合はこちらを使います。

VS Code拡張は、`PATH` 上の `rdra-ish-lsp` か、設定 `rdra-ish.languageServerPath` で指定したものを起動します。

言語サーバーは、モデルが読み込めるたびにバックグラウンドで `check` のライフサイクル探索を回します。範囲は1エンティティ1インスタンスで、時間とメモリの予算内に収めます。破られたルール、`Vacuous_` の警告、走らないユースケース、デッドロックは、宣言の位置に診断として出ます。診断のsourceは `rdra-ish check (1 instance)` です。各ルールにはコードレンズで `ok`、`violated`、`not decided` が付きます。`verify` は2インスタンスで探索するので、判定は変わりえます。

設定は初期化オプションか `rdra-ish` 設定の `lifecycleCheck` で変えます。

| キー | 既定値 | 意味 |
| --- | --- | --- |
| `enabled` | `true` | 検査を回すか |
| `timeBudgetMs` | `2000` | 1回の検査の時間予算 |
| `memory` | `"512MiB"` | メモリ上限 |
| `quietMs` | `200` | 解析のあと検査を始めるまでの待ち時間 |

VS Code拡張では `rdra-ish.lifecycleCheck.*` です。

### Claude Codeプラグイン

リポジトリはClaude Codeのプラグインマーケットプレイスでもあります。`rdra-ish` プラグインは、8つのエージェントスキルと `.rdra` 用の言語サーバーを入れます。

```text
/plugin marketplace add manji-0/rdra-ish-dsl
/plugin install rdra-ish@rdra-ish
```

Claude Code 2.1.275以降なら、`/plugin install rdra-ish --marketplace manji-0/rdra-ish-dsl` の1回でも入ります。

プラグインはバイナリを入れません。言語サーバーは `rdra-ish lsp` を、スキルは `rdra-ish` を実行します。先にPyPIかNixで `rdra-ish` を `PATH` に置きます。

マーケットプレイスの追加はリポジトリ全体（約27 MB）をcloneします。必要な部分（約1.3 MB）だけにするなら、sparse checkoutで追加します。

```text
/plugin marketplace add manji-0/rdra-ish-dsl --sparse .claude-plugin plugins
```

インストールがプラグインのキャッシュへ写すのは `plugins/rdra-ish/`（スキル、`.lsp.json`、マニフェスト）だけです。

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
rdra-ish verify samples/formal-verification/order.rdra --with-tlc
```

`verify` は不変条件、`after` アサーション、時相プロパティをそれぞれのconeで調べます。判定は組み込みのチェッカーが下し、JVMは起動しません。最後の `result:` 行が全体の判定です。

`z3` が `PATH` にあれば、`verify` は状態ルールを任意の行数についても証明します。`proved:` 行が並び、最後の `OK:` 行に `; 2 of 2 rules proved for any number of rows, in the whole model` のような節が付きます。証明を外すときは `--no-prove` を付けます。証明が何を保証するかは [z3による証明](/projects/rdra-ish/theory/z3/) にあります。

2行目はTLCで同じ判定を突き合わせます。`tlc` が `PATH` に必要です。詳細は [形式検証](/projects/rdra-ish/formal-verification/) へ。

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

### v3.0.0からmainへ

mainの変更の全体は、upstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/CHANGELOG.md#unreleased) の `Unreleased` 節にあります。スクリプトやCIに効くものを挙げます。

**`verify` が既定で証明する**

- 以前の `--prove` と同じ証明が、フラグなしで走ります。`proof (...)`、`proved:`、`lemma:` 行が出て、`OK:` 行に `; N of M rules proved ...` が付きます
- 証明できなかったルールは、そのconeで、インスタンス数を1つと2つ増やしてもう一度BFSにかけます。そこで反例が出ると、run全体が失敗します（終了コード1）。v3.0.0で通っていたモデルも落ちえます
- z3がなければ、証明を飛ばして `note:` を出すだけです。見つかったz3が失敗したときはerrorです
- `--prove` は受け付けます。変わるのは、z3がないとerror（終了コード1）になる点だけです。`--deny-unproved` もz3がないとerrorにします。`--deny-unproved` と `--z3` に `--prove` は要らなくなりました
- `--no-prove` は以前の動きです。証明せず、z3も探しません。`--no-prove` と `--prove`・`--deny-unproved`・`--z3` を一緒に渡すと使い方エラー（終了コード2）です
- 証明は証明書をユーザーのキャッシュディレクトリ（`$XDG_CACHE_HOME/rdra-ish/proofs` など）に置き、プロジェクトには書きません。`RDRA_ISH_NO_PROOF_CACHE=1` で止めます
- 時間は延びます。`Unreleased` の `Changed` 節によると、`scripts/verify-samples.sh` の43回の実行（`RDRA_JOBS=1`）は約40秒から約85秒になりました。キャッシュが温まっていれば59秒です
- `check` とエディタのライフサイクル検査は証明を走らせません

**panicは終了コード101**

リリースビルドは整数のオーバーフロー検査付きでコンパイルされます。オーバーフローは誤った判定に回り込まず、panicで止まります。panicすると、stderrの最初の行に `tool error: rdra-ish <version> panicked at ...` が出ます。これはツールのバグで、モデルについての指摘ではありません。終了コードは `101` です。CIでは `1`（モデルのerror）と分けて扱い、upstreamに報告します。`Unreleased` の `Changed` 節によると、`verify` はサンプルで約10%遅くなり、メモリ使用量は変わりません。

panicせずにツールが捉えた障害は、従来どおり `tool_error` の結果で、終了コードは1です。反例のトレースは印字の前に再生され、再生できないトレースは `LiftFault_<check>` や新しい `TraceFault_<finding>` の `tool_error` になります。

**判定や終了コードが変わりうるモデル**

| 変更 | 影響 |
| --- | --- |
| 256を超える値を持つ列はerror `DomainTooLarge` | nullableな `Int` 列があると `--int-range-max` は254までです。以前は値が折り返し、破られたルールが `ok` になることがありました |
| `DeleteLeavesChildren` はinfoではなくwarning | `.on_delete(cascade)` の親だけを消すユースケースで警告が増えます。終了コードは変わりません |
| 新しい警告 `DeleteLeavesChildKeys` | `.on_delete(set_null)`・`set_default` の親を消すと、検証はその参照動作を実行しないので警告します |
| 新しいlint `negated-order-admits-null` | `@null` 列に対する `not (qty < 1)` は、列がnullの間も成り立つので警告します |

**`codegen` と `check --code`（実験的）**

生成コードの各 `<UseCase>Error` に `NotFound` と `StoreFailed` が増えました。GoではConformancePortの `Seed` と `Snapshot` が `error` を返します。適合性トレースの形式も変わったので、`codegen --code` で生成し直します。`run` を差し替えた `[code.<lang>]` テーブルは、`RDRA_ISH_TRACES` を渡さないと `CodeMutantSurvived` で失敗します。詳細は [コード生成](/projects/rdra-ish/codegen/) とCHANGELOGへ。

### v2.3.0からv3.0.0へ

v3.0.0はメジャーリリースです。`verify` が組み込みのチェッカーで判定するようになり、一部の判定がSQLの意味に合わせて変わりました。変更の全体はupstreamの [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/CHANGELOG.md#upgrading-from-v230) にあります。

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

v1.2.0からv2.3.0までの変更の要点です。続けて、上の「v2.3.0からv3.0.0へ」と「v3.0.0からmainへ」の手順も適用します。

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
