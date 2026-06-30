---
title: "インストール"
description: "dagayn のインストール方法と前提条件"
sidebar:
  order: 1
---

dagaynはPython 3.12以上で動作する。Rust拡張（`dagayn._core`）を含むwheelが配布されており、通常は追加のビルドツールなしでインストールできる。

## pip / uv によるインストール

```bash
# 推奨: uv tool で隔離環境にインストール
uv tool install dagayn

# pip でも可
pip install dagayn
```

一時的に実行だけしたい場合：

```bash
uvx --from dagayn dagayn --help
```

## Git からインストール

公開wheelがないプラットフォーム、または最新のmainを試す場合：

```bash
pip install git+https://github.com/manji-0/dagayn.git
```

```bash
uv tool install --from git+https://github.com/manji-0/dagayn.git dagayn
```

Git/sourceインストールはPyO3 Rust拡張をローカルでビルドする。Rust toolchain、Cコンパイラ、macOSではCommand Line Toolsが必要になる。

## インストール確認

```bash
dagayn --version
dagayn --help
```

## AI ツールへの MCP 登録

パッケージインストール後、MCP設定・hooks・skillsをAIツールへ書き込む：

```bash
dagayn install
```

よく使うオプション：

| フラグ | 用途 |
| --- | --- |
| `--platform all` | 検出された全プラットフォームへ登録 |
| `--platform cursor` / `codex` / `claude` 等 | 特定ツールのみ |
| `--mode fts-only` | 埋め込みなし（最も軽い） |
| `--mode local-embedding` | ローカル埋め込み（BGE-M3 sidecar） |
| `--dry-run` | 書き込み前に生成内容をプレビュー |
| `--no-skills` / `--no-hooks` / `--no-instructions` | 任意セットアップをスキップ |
| `-y` | 確認プロンプトを省略 |

```bash
# 全ツール、FTSのみ、確認なし
dagayn install --platform all --mode fts-only -y
```

`dagayn install` の詳細は [クイックスタート](/projects/dagayn/quickstart/) と [CLI リファレンス](/projects/dagayn/cli-reference/#dagayn-install) を参照。

## 前提条件

| 項目 | 要件 |
| --- | --- |
| Python | 3.12以上（CIは3.13想定） |
| ディスク | リポジトリ規模に応じて `.dagayn/` に数百MB〜数GB |
| ネットワーク | `fts-only` なら不要。埋め込みsidecar初回はモデル取得で必要 |
| Rust toolchain | Git/sourceインストール時のみ |

## 次のステップ

- [クイックスタート](/projects/dagayn/quickstart/) — グラフ構築からMCP利用まで
- [セマンティック検索](/projects/dagayn/semantic-search/) — 埋め込みモードの選び方
- [トラブルシューティング](/projects/dagayn/troubleshooting/) — `dagayn._core` 不足など
