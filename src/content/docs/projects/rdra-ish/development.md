---
title: "開発環境"
description: "rdra-ish リポジトリの開発・コントリビュート"
sidebar:
  order: 8
---

rdra-ish-dslリポジトリの開発向け情報。利用者向け [インストール](/projects/rdra-ish/installation/) とは別。

## リポジトリ構成

```text
crates/
  rdra-ish-syntax/   # 字句解析・構文解析・AST
  rdra-ish-core/     # 意味モデル、型チェック、状態導出
  rdra-ish-emit/     # PlantUML / Mermaid / CSV / export 生成
  rdra-ish-render/   # plantuml.jar ラッパ
  rdra-ish-cli/      # rdra-ish コマンド
  rdra-ish-lsp/      # Language Server
samples/
  ec-site/
  clinic-ops/
  incremental-order/
  personal-info/
editors/vscode/      # VS Code 拡張
docs/                # upstream 詳細ドキュメント
```

`syntax` → `core` → `emit` の一方向依存。CLIとLSPは同じ意味論を共有する。

## ビルド

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
cargo build --release
```

バイナリ：

- `target/release/rdra-ish`
- `target/release/rdra-ish-lsp`

## テスト

```bash
cargo test
```

サンプルモデルでCLIスモーク：

```bash
cargo run --bin rdra-ish -- check samples/ec-site
cargo run --bin rdra-ish -- diagram samples/ec-site --kind rdra --format mermaid
```

## 公開（maintainers）

```bash
uv tool install maturin
uvx maturin build --sdist
uvx maturin publish
```

## upstream ドキュメント

リポジトリ `docs/` に詳細がある。

| ファイル | 内容 |
|---|---|
| `language-reference.md` | DSL完全仕様 |
| `cli-reference.md` | CLI全オプション |
| `incremental-modeling.md` | Stage 0–6 詳細 |
| `state-derivation.md` | 状態導出アルゴリズム |
| `diagram-sample-review.md` | 図表レビューガイド |
| `rdra-ish-interpretation.md` | RDRA-ish 用語解釈 |

## ライセンス

MIT（リポジトリ `LICENSE` 参照）。

## 関連ページ

- [VS Code / LSP](/projects/rdra-ish/vscode-lsp/)
- [CLI リファレンス](/projects/rdra-ish/cli-reference/)
