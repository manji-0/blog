---
title: "CLI リファレンス"
description: "rdra-ish CLI サブコマンド一覧（v1.2.0）"
sidebar:
  order: 5
---

このページはCLIサブコマンドとエディタ連携の一覧です。構文と図表の種類は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。TLA+/TLCの手順は [形式検証](/projects/rdra-ish/formal-verification/) へ。

```
rdra-ish <SUBCOMMAND> <INPUTS...> [OPTIONS]
```

`<INPUTS...>` はファイルまたはディレクトリ。ディレクトリは再帰的に `.rdra` を探索します。複数入力は1つの意味モデルにマージされ、`import` は入力レイアウトからinclude pathが導出されます。

診断はstderrに `error:` / `warning:` 形式で出力します。ライフサイクルの所見は `error[<Name>]:` のように安定した名前付きで出ます。`check` はerrorがあると非ゼロ終了します。

生成系サブコマンドは、parse/resolve errorがあると成果物を出しません。ライフサイクルのerrorで止まるかは、出力が何を読むかで決まります（[ライフサイクルのerror](#ライフサイクルのerror)）。`fmt` はパース可能なら意味解析なしで動きます。

## ライフサイクルのerror

到達性の結果を印字する出力は **fail-closed** です。`check` がライフサイクルのerrorを報告している間は成果物を出しません。印字しない出力は成果物を書き、error件数を示すnoteをstderrに1行出して終了コード0で終わります。kindごとの分類はupstreamの `crates/rdra-ish-cli/src/lifecycle_gate.rs` が1か所で決め、テストが全kindをupstreamの `docs/cli-reference.md` の表と突き合わせます。

| 出力 | 読むもの | ライフサイクルのerrorがあるとき |
|---|---|---|
| `list` の全kind | 宣言された事実 | noteを出して書く |
| `csv` の全kind | 宣言された事実とデータ層 | noteを出して書く |
| `diagram --kind state` | 状態モデルの初期状態と到達状態 | 止まる。errorがデッドロックだけなら、デッドロックを色分けして図を書く |
| `state` 以外の `diagram`（`sequence` を含む） | 宣言された事実 | noteを出して書く |
| `export --kind typescript-states` | 到達状態 | 止まる |
| `export --kind tla` | `--instance-count` / `--int-range-max` で組み立てた遷移系 | noteを出して書く。noteは、モデル全体の `.cfg` が規則だけを検査すること、デッドロックとwitnessは隣の `StateModel_*` specでTLCにかけられること、デッドロックを判定するのは `verify` であることを伝える。遷移系の構築時のerrorでは止まる |
| ほかの `export` | データ層 | noteを出して書く |
| `states` | 導出そのもの | `[error]` 行を含めて表を出し、終了コード1 |

`verify` は、検査する遷移系の構築時のerrorで止まり、それ以外の所見は自分で報告します。

v1.0.0では `list` と、`entity` 以外の `csv` も止まっていました。v1.1.0からは書き出して終了コード0で終わります。`csv` や `list` の失敗でライフサイクルのerrorを検出していたスクリプトは、`check` を使います。

## check

パース、型チェック、モデル整合性検証。成果物は出力しません。

```bash
rdra-ish check src/ [--strict] [--deny-deprecated] [--instance-count <N>] [--int-range-max <N>] [--buc <BucId>]... [--entity <EntityId>]...
```

errorがなければ最後に `OK: no errors within 1 instance per entity, Int 0..5` のように検査の範囲付きで表示します。`--buc` / `--entity` で範囲を絞ったときは `OK: no errors in the selected scope, within ...` です。`--instance-count 2` を渡すと `OK: no errors within 2 instances per entity, Int 0..5` のように、渡した境界が出ます。

含まれるレビュー信号：

- actor permission coverage（`requires_permission`）
- API invocation / entity operationギャップ
- system boundary / cross-system coordination
- FK/APIトランザクション境界warning
- event-flowギャップ（未raise、未消費イベント等）
- state-pattern所見（到達不能、作成経路欠落、制約違反、到達witnessのない状態、デッドロック、実行されないUCなど）

違反した制約や `after` アサーションは、最短の反例トレース付きで1回だけ出ます。

1インスタンスで見つけたデッドロックの抜け道が、あるUCの作るエンティティの行を必要とする場合、errorの末尾に「`--instance-count 2` なら解ける可能性がある」という行が付きます。`verify` は既定で2インスタンスを回します。errorの名前と重大度は変わりません。

v1.1.0で次の所見が加わりました。

- warning `GuardReadsLaterStep`：分割したUCに適用した `holds` 本体が、後のトランザクションでしか作られないエンティティを比べている。ガードは最初のトランザクションの前に読まれるため、多くの場合成り立たない
- warning `DrivenComparisonColumnWritten`：`drives` で駆動する比較が読む列をUCが `sets` で書き換えるのに、その比較を駆動していない
- info `DefaultOnVariationIgnored`：バリエーション型の列の `@default` は初期値を選ばない。作成するUCが列を `sets` しないと、行はバリエーションのどの値からでも始まる

v1.2.0では、`sets(..).when(Cond)`（[言語リファレンス](/projects/rdra-ish/language-reference/#条件に従う値)）に合わせて次の所見が加わりました。

- error `SetsWhenOnCopy`：値のコピー（`Entity.col == Source.col`）に `.when` を付けた。UC全体をガードするなら `applies_to(Cond, UC)` を書く
- 既存のerror `ConflictingEffects` は、ガード付きの `sets` と同じ列へのガードなしの `sets` やコピーが並ぶ場合にも出る
- 既存のwarning `ValueNeverChosen` は、UCが実行される状態でガードが一度も成り立たず、残されることのない `sets` の値にも出る

| オプション | 説明 |
|---|---|
| `--strict` | 権限・アクセス整合性のギャップをerror扱いにする |
| `--deny-deprecated` | 非推奨構文の `DeprecatedSyntax` warningをerror扱いにする（CI向け） |
| `--max-patterns` / `--max-states` | 状態探索の上限（既定 `256` / `65536`） |
| `--instance-count` | エンティティあたりのインスタンス数、`1..=255`（既定 `1`）。2行で初めて破れる規則（一意性や行をまたぐ量化）は `2` から見える。`verify` と同じ名前と検証で、既定だけが違う（`verify` は `2`） |
| `--int-range-max` | Intの値域を `0..=N` にする、`1..=255`（既定 `5`） |
| `--buc` / `--entity` | 部分実行。指定したBUCから届くUC、または指定エンティティを読む規則だけを検査する |

## lint

カバレッジとレビュー readinessの監査。`check`とは別コマンドです。

```bash
rdra-ish lint src/ [--format table|json|csv|markdown]
```

追加finding: orphan node（参照されない孤立ノード）、未トレースrequirement、empty BUC、未マップscreen field、命名規約warning等。`stage-readiness` 行は [`next`](#next) と同じ判定で各BUCのStageを示します。

v1.1.0で4つのルールが加わりました。どれもerrorではありません。

| ルール | 重大度 | 内容 |
|---|---|---|
| `comparison-unsatisfiable-in-range` | warning | Int / Money / Decimal列とリテラルの比較を、値域 `0..5` のどの値も満たさない（`qty > 5` など） |
| `comparison-trivial-in-range` | warning | 同じ比較を、値域 `0..5` のすべての値が満たす（`qty >= 0` など）。`@null` 列は対象外 |
| `triggered-usecase-unguarded` | info | イベントかタイマーだけが起動するUCが何かを書くのに、条件のガードも `transitions` の遷移元もない。`check` はイベントの前にも実行する |
| `condition-applied-without-body` | info | `holds` 本体も `combines` もない条件をUCかAPIに `applies_to` している。何もガードしない |

## next

各BUCが [段階的モデリング](/projects/rdra-ish/incremental-modeling/) のどのStageにいるかと、次のStageで足すべきものを表示します（v0.4.0で追加）。

```bash
rdra-ish next src/ [--buc <BucId>]... [--format text|json]
```

Stageごとにgateがあり、満たさない要素をギャップとして挙げます。次のStageについては、主な問い、ギャップ、レビュー注記、ユーザーに聞く質問、そのStageの検証コマンドを出します。必須はStage 0–6で、ルールのStage 7A–7Cは任意です。parse/model errorがあるモデルは受け付けません。どのStageでも終了コードは0です。

## files

入力が読み込む `.rdra` ファイルを、読み込み順に1行ずつ表示します。

```bash
rdra-ish files src/
```

`.rdra` が1つもなければ終了コード1です。

## fmt

ASTベースフォーマッタ。コメントは元の位置に残し、2回目の実行では何も変えません。

```bash
rdra-ish fmt src/ [--write | --check]
```

フラグなしでは整形結果をstdoutに出すだけで、ファイルは変わりません。既存ファイルでは `--check` を先に実行してください。削除された構文はparse errorになり、`fmt` はそのファイルを整形しません。

## diagram

Mermaid図生成。出力形式はMermaidのみです。図の種類とオプションは [言語リファレンス](/projects/rdra-ish/language-reference/#図表生成) を参照してください。

```bash
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

## csv

レビュー表生成。`-o <out>` で `<out>.<kind>.csv` を書きます（既定 `out`）。stdoutには行を出さず、`wrote <path>` を表示します。ライフサイクルのerrorがあっても、noteを出して書きます。

```bash
rdra-ish csv src/ --kind matrix [--format csv|markdown]
```

## states

状態パターン導出（BFS）。Enum / Bool / Nullable / Int列と `now` を、境界の範囲で探索します。時間性質（`always` / `eventually` / `leads_to`）は [形式検証](/projects/rdra-ish/formal-verification/) を使います。

```bash
rdra-ish states src/ --entity Order [--format table|csv|json|typescript] [--instance-count <N>] [--int-range-max <N>]
```

`--instance-count`（既定 `1`）と `--int-range-max`（既定 `5`）は `check` と同じです。値を大きくするとconeあたりの状態が増え、`--max-states` に早く届きます。

出力に `[error]` が含まれると非ゼロ終了します。

## export

機械可読の成果物。kind： `openapi` / `asyncapi` / `dbml` / `json-schema` / `typescript-states` / `mermaid-er` / **`tla`**。

```bash
rdra-ish export src/ --kind openapi [--out out/]
rdra-ish export src/ --kind tla -o /tmp/rdra-tla
```

`--kind tla` は `.tla` と兄弟 `.cfg` を書きます。v1.2.0からは、その隣に状態モデルを持つエンティティのconeごとに `StateModel_<E>.tla`、`StateModel_<E>.cfg`、`StateModel_<E>_witnesses.cfg` も書きます。これらでデッドロックとwitnessの欠如をTLC単体で検査できます。`--instance-count` と `--int-range-max` で探索範囲を変えられます。`check` がライフサイクルのerrorを見つけるモデルでも書き出して終了コード0で終わり、error件数と `StateModel_*` spec、`verify` を案内するnoteを出します。`export` は前回書いた `StateModel_` ファイルを消さないので、空のディレクトリに書き出してください。詳細は [形式検証](/projects/rdra-ish/formal-verification/#tlc単体で状態モデルを検査する)。

## verify

TLA+ をエクスポートしてTLCを実行します。`tlc` / `tlc2` がPATHに必要です。

```bash
rdra-ish verify src/ --backend tlc -o /tmp/rdra-tla
```

`--instance-count`（既定 `2`）、`--int-range-max`（既定 `5`）、`--temporal-budget`（既定 `300` 秒）、`--deny-undecided`、`--buc` / `--entity` を受け付けます。

v1.2.0から、`verify` は各coneを独立した部分ライフサイクルで簡約してから探索します（[形式検証](/projects/rdra-ish/formal-verification/#独立した部分ライフサイクルによる簡約)）。判定、error名、`// expect` の結果は変わりません。印字される状態数は小さくなります。状態数は互換性契約の対象外です。反例トレースは簡約前のconeの経路に戻してから印字するので、簡約後より長くなることがあり、部分ライフサイクル側のUCがステップに出ることもあります。`check` と `states` は簡約しません。

## list

要素一覧。

```bash
rdra-ish list src/ --kind usecase [--format table|csv|json|markdown]
```

kindの例：`actor` / `buc` / `usecase` / `entity` / `api` / `requirement` / `screen` / `rule` / `transition` / `buc-roles`

どのkindも宣言された事実だけを読むので、ライフサイクルのerrorがあってもnoteを出して書きます。

## 共通オプション

多くのサブコマンドで `--buc <BucId>` により特定BUCにスコープできます。段階的モデリング中のスライスレビューに使います。

## プロジェクトマニフェスト

モデルのルートに `rdra.toml` を置けます。`[model] name` が必須です。`[dependencies]` は読み込まれますが、v1.2.0でもまだ出力を変えません。不正なマニフェストは読み込み系コマンドを終了コード1で止めます（`files` と `fmt` はマニフェストを読みません）。

```toml
[model]
name = "shop"
```

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功（warning のみは 0 のことが多い） |
| 1 | parse/model error、または `check` / `fmt --check` / 生成系の fail-closed / TLC 失敗、必要なツールが動かない |
| 2 | 使い方の誤り（未知のサブコマンドやフラグ、kindが受け付けない `--format`） |

v1.0.0から、サブコマンドとフラグ、終了コード、JSON/CSVの出力列はupstreamの [compatibility.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.2.0/docs/compatibility.md) で互換性が約束されています。

## VS CodeとLSP

rdra-ishリポジトリの `editors/vscode` にVS Code拡張があります。`rdra-ish-lsp` バイナリと連携し、`.rdra` を通常のコードと同様に編集できます。

| 機能 | 説明 |
|---|---|
| 診断 | `check` 相当のエラー・warning |
| 補完 | 述語、kind、参照 |
| 定義/参照ジャンプ | シンボル間ナビゲーション |
| リネーム | 安全な一括リネーム |
| ホバー | 型・ラベル情報 |
| シンボル一覧 | ファイル/ワークスペース outline |
| セマンティックハイライト | kind 別色分け |
| インレイヒント | 関係の可視化 |
| コードアクション | 宣言kindの変更、曖昧な参照の `kind::Id` 修飾 |
| フォーマット | 保存時 `fmt`（設定次第） |

### セットアップ

1. `rdra-ish-lsp` はPyPIのパッケージにもGitHub Releaseのアーカイブにも含まれません。リポジトリで `cargo build --release -p rdra-ish-lsp` を実行してビルドし、PATHに置きます
2. VS Codeに拡張をインストール（`editors/vscode` からVSIXを作る。リポジトリ参照）
3. 必要なら `rdra-ish.languageServerPath` でLSPバイナリパスを明示

```json
{
  "rdra-ish.languageServerPath": "/path/to/rdra-ish-lsp"
}
```

保存時フォーマットを有効にし、Problemsパネルで `check` 診断を常時確認してください。大きな変更前後で `rdra-ish fmt src/ --check` をCIと揃えます。

## 次に読む

- [使い方](/projects/rdra-ish/usage/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
