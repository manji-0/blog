---
title: "VS Code / LSP"
description: "rdra-ish のエディタ連携"
sidebar:
  order: 7
---

rdra-ishリポジトリの `editors/vscode` にVS Code拡張がある。`rdra-ish-lsp` バイナリと連携し、`.rdra` を通常のコードと同様に編集できる。

## 機能

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

## セットアップ

1. [rdra-ish をインストール](/projects/rdra-ish/installation/) し `rdra-ish-lsp` がPATHにあることを確認
2. VS Codeに拡張をインストール（VSIXまたはmarketplace、リポジトリREADME参照）
3. 必要なら `rdra-ish.languageServerPath` でLSPバイナリパスを明示

```json
{
  "rdra-ish.languageServerPath": "/path/to/rdra-ish-lsp"
}
```

## 推奨ワークフロー

- 保存時フォーマットを有効にし、手書きと `fmt` 出力の差分を減らす
- Problemsパネルで `check` 診断を常時確認
- 大きな変更前後で `rdra-ish fmt src/ --check` をCIと揃える

## PlantUML プレビュー

`diagram --format plantuml` をエディタから使う場合：

- Java Runtime
- `plantuml.jar`（`rdra-ish-render` crateがラップ）

Mermaid出力なら追加依存なし。早期レビューはMermaidを推奨（[図表とエクスポート](/projects/rdra-ish/diagram-and-export/)）。

## 関連ページ

- [インストール](/projects/rdra-ish/installation/)
- [開発環境](/projects/rdra-ish/development/)
