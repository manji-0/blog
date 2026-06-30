---
title: "CLI リファレンス"
description: "rdra-ish CLI サブコマンド一覧"
sidebar:
  order: 5
---

```
rdra-ish <SUBCOMMAND> <INPUTS...> [OPTIONS]
```

`<INPUTS...>` はファイルまたはディレクトリ。ディレクトリは再帰的に `.rdra` を探索する。複数入力は1つの意味モデルにマージされ、`import` は入力レイアウトからinclude pathが導出される。

診断はstderrに `error:` / `warning:` 形式で出力。`check` はerrorがあると非ゼロ終了。

## check

パース、型チェック、モデル整合性検証。成果物は出力しない。

```bash
rdra-ish check src/
```

含まれるレビュー信号：

- actor permission coverage（`requires_permission`）
- API invocation / entity operationギャップ
- system boundary / cross-system coordination
- FK/APIトランザクション境界warning
- event-flowギャップ（未raise、未消費イベント等）
- state-pattern warning（到達不能、作成経路欠落、制約違反）

## lint

カバレッジとレビュー readinessの監査。`check` の代替ではない。

```bash
rdra-ish lint src/ [--format table|json|csv]
```

追加finding: orphan node、未トレースrequirement、empty BUC、未マップscreen field、命名規約warning等。

## fmt

ASTベースフォーマッタ。コメントと元の空行グルーピングは保持しない。

```bash
rdra-ish fmt src/ [--write | --check]
```

既存ファイルでは `--check` を先に実行する。

## diagram

図生成。詳細は [図表とエクスポート](/projects/rdra-ish/diagram-and-export/) を参照。

```bash
rdra-ish diagram src/ --kind rdra --format mermaid --buc BucOrder
```

## csv

レビュー表生成。

```bash
rdra-ish csv src/ --kind matrix
```

## states

状態パターン導出。

```bash
rdra-ish states src/ --entity Order [--format json]
```

## export

機械可読の成果物（OpenAPI、AsyncAPI、DBML、JSON Schema等）。

```bash
rdra-ish export src/ --kind openapi [--out out/]
```

## list

要素一覧。

```bash
rdra-ish list src/ --kind usecase [--format table|csv|json]
```

kindの例：`actor` / `buc` / `usecase` / `entity` / `api` / `requirement` / `screen`

## 共通オプション

多くのサブコマンドで `--buc <BucId>` により特定BUCにスコープできる。段階的モデリング中のスライスレビューに使う。

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功（warning のみは 0 のことが多い） |
| 1 | parse/model error、または `check` / `fmt --check` 失敗 |

## 関連ページ

- [クイックスタート](/projects/rdra-ish/quickstart/)
- [図表とエクスポート](/projects/rdra-ish/diagram-and-export/)
- [言語リファレンス](/projects/rdra-ish/language-reference/)
