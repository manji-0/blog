---
title: "CLI リファレンス"
description: "rdra-ish CLI サブコマンド一覧（v0.2.0）"
sidebar:
  order: 5
---

このページはCLIサブコマンドとエディタ連携の一覧です。構文と図表の種類は [言語リファレンス](/projects/rdra-ish/language-reference/) へ。TLA+/TLCの手順は [形式検証](/projects/rdra-ish/formal-verification/) へ。

```
rdra-ish <SUBCOMMAND> <INPUTS...> [OPTIONS]
```

`<INPUTS...>` はファイルまたはディレクトリ。ディレクトリは再帰的に `.rdra` を探索します。複数入力は1つの意味モデルにマージされ、`import` は入力レイアウトからinclude pathが導出されます。

診断はstderrに `error:` / `warning:` 形式で出力します。`check` はerrorがあると非ゼロ終了します。

v0.2.0では生成系サブコマンド（`diagram` / `csv` / `list` / `export` / `states` / `verify`）は **fail-closed**（モデルにerrorがあるとき成果物を出さず失敗する）です。`fmt` はパース可能なら意味解析なしで動きます。

## check

パース、型チェック、モデル整合性検証。成果物は出力しません。

```bash
rdra-ish check src/
```

含まれるレビュー信号：

- actor permission coverage（`requires_permission`）
- API invocation / entity operationギャップ
- system boundary / cross-system coordination
- FK/APIトランザクション境界warning
- event-flowギャップ（未raise、未消費イベント等）
- state-pattern warning（到達不能、作成経路欠落、制約違反、マルチエンティティ規則など）

## lint

カバレッジとレビュー readinessの監査。`check`とは別コマンドです。

```bash
rdra-ish lint src/ [--format table|json|csv]
```

追加finding: orphan node（参照されない孤立ノード）、未トレースrequirement、empty BUC、未マップscreen field、命名規約warning等。

## fmt

ASTベースフォーマッタ。コメントと元の空行グルーピングは保持しません。

```bash
rdra-ish fmt src/ [--write | --check]
```

既存ファイルでは `--check` を先に実行してください。

## diagram

図生成。図の種類とオプションは [言語リファレンス](/projects/rdra-ish/language-reference/#図表生成) を参照してください。

```bash
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

## csv

レビュー表生成。

```bash
rdra-ish csv src/ --kind matrix
```

## states

状態パターン導出（BFS）。Enum / Bool / Nullable軸向け。Int / `now` の算術検査は [形式検証](/projects/rdra-ish/formal-verification/) を使います。

```bash
rdra-ish states src/ --entity Order [--format json]
```

出力に `[error]` が含まれると非ゼロ終了します（v0.2.0）。

## export

機械可読の成果物。kind例： `openapi` / `asyncapi` / `dbml` / `json-schema` / `typescript-states` / `mermaid-er` / `plantuml-er` / **`tla`**。

```bash
rdra-ish export src/ --kind openapi [--out out/]
rdra-ish export src/ --kind tla -o /tmp/rdra-tla
```

`--kind tla` は `.tla` と兄弟 `.cfg` を書きます。詳細は [形式検証](/projects/rdra-ish/formal-verification/)。

## verify

TLA+ をエクスポートしてTLCを実行します（v0.2.0）。`tlc` / `tlc2` がPATHに必要です。

```bash
rdra-ish verify src/ --backend tlc -o /tmp/rdra-tla
```

## list

要素一覧。

```bash
rdra-ish list src/ --kind usecase [--format table|csv|json]
```

kindの例：`actor` / `buc` / `usecase` / `entity` / `api` / `requirement` / `screen`

## 共通オプション

多くのサブコマンドで `--buc <BucId>` により特定BUCにスコープできます。段階的モデリング中のスライスレビューに使います。

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功（warning のみは 0 のことが多い） |
| 1 | parse/model error、または `check` / `fmt --check` / 生成系の fail-closed / TLC 失敗 |

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
| フォーマット | 保存時 `fmt`（設定次第） |

### セットアップ

1. [使い方](/projects/rdra-ish/usage/) で `rdra-ish` をインストールし `rdra-ish-lsp` がPATHにあることを確認
2. VS Codeに拡張をインストール（VSIXまたはmarketplace、リポジトリREADME参照）
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
