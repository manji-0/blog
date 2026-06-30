---
title: "インストール"
description: "rdra-ish のインストール方法"
sidebar:
  order: 1
---

rdra-ishはRust製CLIです。PyPI/uv経由のバイナリ配布が主なインストール方法です。

## uv tool（推奨）

```bash
uv tool install rdra-ish
rdra-ish --help
```

## 確認

```bash
rdra-ish check --help
rdra-ish diagram --help
```

## VS Code 拡張

`.rdra` ファイルの編集体験には [VS Code / LSP](/projects/rdra-ish/vscode-lsp/) の拡張を併用する。LSPバイナリは `rdra-ish-lsp` で、CLIと同梱される。

## PlantUML レンダリング（任意）

`diagram --format plantuml` でPNG/SVGを生成する場合、Javaと `plantuml.jar` が必要になる。Mermaid出力（`--format mermaid`）なら追加依存なし。

## 開発版（maintainers）

```bash
git clone https://github.com/manji-0/rdra-ish-dsl.git
cd rdra-ish-dsl
cargo build --release
# または maturin 経由の sdist 公開フロー
```

詳細は [開発環境](/projects/rdra-ish/development/) を参照。

## 次のステップ

- [クイックスタート](/projects/rdra-ish/quickstart/)
- [段階的モデリング](/projects/rdra-ish/incremental-modeling/)
