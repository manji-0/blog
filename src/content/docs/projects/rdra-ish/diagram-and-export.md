---
title: "図表とエクスポート"
description: "rdra-ish の diagram / csv / states / export"
sidebar:
  order: 4
---

rdra-ishは同じ `.rdra` モデルから、レビュー用の図表・表・機械可読の成果物を生成する。

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

BUC横断で到達可能なエンティティ状態パターンを導出する。

```bash
rdra-ish states <INPUTS...> [--entity <EntityId>] [--format table|json]
```

- 到達不能なenum variant
- 作成経路の欠落
- `forbidden` / `invariant` / `required` / `exclusive` 違反

ライフサイクルレビュー（Stage 5–6）では `states` と `diagram --kind event-flow` をセットで使う。

## export

OpenAPI、AsyncAPI、DBML、JSON Schema等の機械可読の成果物。

```bash
rdra-ish export <INPUTS...> --kind <KIND> [--out <path>]
```

exportは **レビュー起点のたたき台** である。本番スキーマや実装コードの代替ではない。モデル更新後に再生成して差分レビューする運用が前提。

## list / lint / fmt

| コマンド | 用途 |
|---|---|
| `list --kind <kind>` | 要素一覧（requirement, usecase 等） |
| `lint` | カバレッジ監査、orphan、stage-readiness |
| `fmt --write` / `--check` | ASTベースフォーマット |

`lint` は `coverage-score`（0–100）と `stage-readiness`（どのrefinement stageが揃っているか）をinfo行で返す。

## レビュー観点

- **構造整合性**: `check` でerrorゼロ
- **カバレッジ**: `csv --kind matrix` でUC–entity CRUD
- **境界設計**: `diagram --kind sequence` でAPI/UC境界
- **アクセス**: `csv --kind actor-permission-audit`
- **ライフサイクル**: `states` + `diagram --kind event-flow`
- **トレーサビリティ**: `list --kind requirement`, `lint`

## 関連ページ

- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
