---
title: "図表とエクスポート"
description: "rdra-ish の diagram / csv / states / export / verify（v0.2.0）"
sidebar:
  order: 4
---

rdra-ishは同じ `.rdra` モデルから、レビュー用の図表・表・機械可読の成果物を生成する。生成系はモデルにerrorがあると **fail-closed**（成果物を出さない）。

## diagram

```bash
rdra-ish diagram <INPUTS...> --kind <KIND> --format <FORMAT> [OPTIONS]
```

| オプション | 説明 |
|---|---|
| `--kind` | 図の種類（下表） |
| `--format` | `mermaid` / `plantuml` |
| `--buc` | 特定BUCにスコープ |
| `--show-description` | 説明メタデータを注釈として表示 |

### 図の種類

| kind | 用途 |
|---|---|
| `rdra` | RDRA レイヤ図（BUC・UC・エンティティの関係） |
| `er` | ER 図 |
| `sequence` | ユースケースシーケンス |
| `state` | 状態遷移 |
| `event-flow` | イベントフロー |
| `boundaryless` | 境界なし全体グラフ |
| `business-area` | ビジネス領域ビュー |
| `diff` | ベースとの差分図（`--diff-base` の意味エラーでも fail-closed） |

早期レビューでは **Mermaid**（`--format mermaid`）が推奨。テキストなのでdiffしやすい。

```bash
rdra-ish diagram src/ --kind sequence --format mermaid --buc BucOrder
rdra-ish diagram src/ --kind event-flow --format mermaid
```

PlantUMLでPNG/SVGが必要な場合はJava + plantuml.jarが必要（[VS Code / LSP](/projects/rdra-ish/vscode-lsp/) 参照）。

## csv

レビュー用表を生成する。

```bash
rdra-ish csv <INPUTS...> --kind <KIND> [--format table|json|csv]
```

| kind | 内容 |
|---|---|
| `matrix` | CRUD マトリクス |
| `api-list` | API 一覧 |
| `screen-constraints` | 画面制約 |
| `actor-permission-audit` | 権限とアクター割当の監査 |
| `requirement-trace` | 要件トレーサビリティ |

```bash
rdra-ish csv samples/clinic-ops --kind matrix
rdra-ish csv samples/clinic-ops --kind actor-permission-audit
```

## states

BUC横断で到達可能なエンティティ状態パターンを導出する（BFS）。

```bash
rdra-ish states <INPUTS...> [--entity <EntityId>] [--format table|json]
```

- 到達不能なenum variant
- 作成経路の欠落
- `forbidden` / `invariant` / `required` / `exclusive` 違反（マルチエンティティ含む）

ライフサイクルレビュー（Stage 5–6）では `states` と `diagram --kind event-flow` をセットで使う。Int / `now` の算術・時間性質は `states` では扱わない → [形式検証](/projects/rdra-ish/formal-verification/)。

## export

OpenAPI、AsyncAPI、DBML、JSON Schema、**TLA+** 等の機械可読の成果物。

```bash
rdra-ish export <INPUTS...> --kind <KIND> [--out <path>]
```

| kind（例） | 内容 |
|---|---|
| `openapi` / `asyncapi` | API・イベント契約のたたき台 |
| `dbml` / `json-schema` | 論理スキーマ |
| `typescript-states` | 状態ユニオン（TS） |
| `tla` | TLA+ Spec + TLC `.cfg`（v0.2.0） |

exportは **レビュー起点のたたき台** です。本番スキーマや実装コードの代替ではありません。モデルを更新した後に再生成し、差分をレビューする運用を前提とします。

## verify（v0.2.0）

```bash
rdra-ish verify <INPUTS...> --backend tlc [-o <OUT>]
```

TLA+ を書いてTLCを走らせる。手順と制約は [形式検証](/projects/rdra-ish/formal-verification/) を参照。

## list / lint / fmt

| コマンド | 用途 |
|---|---|
| `list --kind <kind>` | 要素一覧（requirement, usecase 等） |
| `lint` | カバレッジ監査、orphan、stage-readiness |
| `fmt --write` / `--check` | ASTベースフォーマット |

`lint` は `coverage-score`（0–100）と `stage-readiness`（どのrefinement stageが揃っているか）をinfo行で返す。

## レビューで見るところ

構造は `check` でerrorゼロを前提にし、カバレッジは `csv --kind matrix`、境界は `diagram --kind sequence`、アクセスは `csv --kind actor-permission-audit` で見る。ライフサイクルは `states` と `diagram --kind event-flow`、厳密な比較・時間性質は `export --kind tla` / `verify --backend tlc`。トレーサビリティは `list --kind requirement` と `lint`。段階ごとの足し方は [段階的モデリング](/projects/rdra-ish/incremental-modeling/) を参照。

## 関連ページ

- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [形式検証](/projects/rdra-ish/formal-verification/)
- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
