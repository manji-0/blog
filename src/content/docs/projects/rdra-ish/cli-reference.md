---
title: "CLI リファレンス"
description: "rdra-ish CLI サブコマンド一覧（v1.0.0）"
sidebar:
  order: 5
---

このページはCLIサブコマンドとエディタ連携の一覧です。構文と図表の種類は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。TLA+/TLCの手順は [形式検証](/projects/rdra-ish/formal-verification/) へ。

```
rdra-ish <SUBCOMMAND> <INPUTS...> [OPTIONS]
```

`<INPUTS...>` はファイルまたはディレクトリ。ディレクトリは再帰的に `.rdra` を探索します。複数入力は1つの意味モデルにマージされ、`import` は入力レイアウトからinclude pathが導出されます。

診断はstderrに `error:` / `warning:` 形式で出力します。ライフサイクルの所見は `error[<Name>]:` のように安定した名前付きで出ます。`check` はerrorがあると非ゼロ終了します。

生成系サブコマンドは、parse/resolve errorがあると成果物を出しません。状態診断のerrorで止まるかは出力の種類で決まります。ライフサイクルを印字する出力（`states` / `list` / `diagram --kind state` / `entity` 以外の `csv` / `export --kind typescript-states`）は **fail-closed** です。データ層や宣言だけを読む出力（`state` 以外の `diagram`、`csv --kind entity`、`export` の `dbml` / `json-schema` / `openapi` / `asyncapi` / `mermaid-er`）は成果物を書き、error件数を示すnoteをstderrに1行出します。`export --kind tla` と `verify` は、印字する遷移系のerrorでも止まります。`fmt` はパース可能なら意味解析なしで動きます。

## check

パース、型チェック、モデル整合性検証。成果物は出力しません。

```bash
rdra-ish check src/ [--strict] [--deny-deprecated] [--buc <BucId>]... [--entity <EntityId>]...
```

errorがなければ最後に `OK: no errors within 1 instance per entity, Int 0..5` のように検査の範囲付きで表示します。`--buc` / `--entity` で範囲を絞ったときは `OK: no errors in the selected scope, within ...` です。

含まれるレビュー信号：

- actor permission coverage（`requires_permission`）
- API invocation / entity operationギャップ
- system boundary / cross-system coordination
- FK/APIトランザクション境界warning
- event-flowギャップ（未raise、未消費イベント等）
- state-pattern所見（到達不能、作成経路欠落、制約違反、到達witnessのない状態、デッドロック、実行されないUCなど）

違反した制約や `after` アサーションは、最短の反例トレース付きで1回だけ出ます。

| オプション | 説明 |
|---|---|
| `--strict` | 権限・アクセス整合性のギャップをerror扱いにする |
| `--deny-deprecated` | 非推奨構文の `DeprecatedSyntax` warningをerror扱いにする（CI向け） |
| `--max-patterns` / `--max-states` | 状態探索の上限（既定 `256` / `65536`） |
| `--buc` / `--entity` | 部分実行。指定したBUCから届くUC、または指定エンティティを読む規則だけを検査する |

## lint

カバレッジとレビュー readinessの監査。`check`とは別コマンドです。

```bash
rdra-ish lint src/ [--format table|json|csv|markdown]
```

追加finding: orphan node（参照されない孤立ノード）、未トレースrequirement、empty BUC、未マップscreen field、命名規約warning等。`stage-readiness` 行は [`next`](#next) と同じ判定で各BUCのStageを示します。

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

既存ファイルでは `--check` を先に実行してください。削除された構文はparse errorになり、`fmt` はそのファイルを整形しません。

## diagram

Mermaid図生成。出力形式はMermaidのみです。図の種類とオプションは [言語リファレンス](/projects/rdra-ish/language-reference/#図表生成) を参照してください。

```bash
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

## csv

レビュー表生成。`-o <out>` で `<out>.<kind>.csv` を書きます（既定 `out`）。

```bash
rdra-ish csv src/ --kind matrix [--format csv|markdown]
```

## states

状態パターン導出（BFS）。Enum / Bool / Nullable軸向け。Int / `now` の算術検査は [形式検証](/projects/rdra-ish/formal-verification/) を使います。

```bash
rdra-ish states src/ --entity Order [--format table|csv|json|typescript]
```

出力に `[error]` が含まれると非ゼロ終了します。

## export

機械可読の成果物。kind： `openapi` / `asyncapi` / `dbml` / `json-schema` / `typescript-states` / `mermaid-er` / **`tla`**。

```bash
rdra-ish export src/ --kind openapi [--out out/]
rdra-ish export src/ --kind tla -o /tmp/rdra-tla
```

`--kind tla` は `.tla` と兄弟 `.cfg` を書きます。`--instance-count` と `--int-range-max` で探索範囲を変えられます。詳細は [形式検証](/projects/rdra-ish/formal-verification/)。

## verify

TLA+ をエクスポートしてTLCを実行します。`tlc` / `tlc2` がPATHに必要です。

```bash
rdra-ish verify src/ --backend tlc -o /tmp/rdra-tla
```

`--instance-count`（既定 `2`）、`--int-range-max`（既定 `5`）、`--temporal-budget`（既定 `300` 秒）、`--deny-undecided`、`--buc` / `--entity` を受け付けます。

## list

要素一覧。

```bash
rdra-ish list src/ --kind usecase [--format table|csv|json|markdown]
```

kindの例：`actor` / `buc` / `usecase` / `entity` / `api` / `requirement` / `screen` / `rule` / `transition` / `buc-roles`

## 共通オプション

多くのサブコマンドで `--buc <BucId>` により特定BUCにスコープできます。段階的モデリング中のスライスレビューに使います。

## プロジェクトマニフェスト

モデルのルートに `rdra.toml` を置けます。`[model] name` が必須です。`[dependencies]` は読み込まれますが、v1.0.0ではまだ出力を変えません。不正なマニフェストは読み込み系コマンドを終了コード1で止めます（`files` と `fmt` はマニフェストを読みません）。

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

v1.0.0から、サブコマンドとフラグ、終了コード、JSON/CSVの出力列はupstreamの [compatibility.md](https://github.com/manji-0/rdra-ish-dsl/blob/v1.0.0/docs/compatibility.md) で互換性が約束されています。

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
