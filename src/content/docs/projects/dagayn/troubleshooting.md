---
title: "トラブルシューティング"
description: "dagayn のよくある問題と対処"
sidebar:
  order: 10
---

## `dagayn install` がエディタに反映されない

`--dry-run` で生成内容を確認し、対象 `--platform` が検出されているか見る。一部統合はリポジトリローカル設定のみで、該当ディレクトリが存在しないと書き込まれない。

```bash
dagayn install --dry-run --platform cursor
```

## グラフが空、または古い

```bash
dagayn build
dagayn status
```

リポジトリをディスク上で移動した場合はフル再構築が必要。

```bash
dagayn build --force-full-build
```

## MCP ツールがドキュメントセクションを見つけられない

リポジトリまたはインストールパッケージに `docs/LLM-OPTIMIZED-REFERENCE.md` があるか確認する。自前リポジトリではMarkdown directiveと見出しslugが正しいか [Markdown / Terraform 連携](/projects/dagayn/integrations/) を参照。

## `dagayn._core` が見つからない

wheelにRust拡張が含まれていない、またはsource checkoutで未ビルド。

```bash
pip install git+https://github.com/manji-0/dagayn.git
```

source checkout:

```bash
uvx maturin develop --release
```

旧Pythonパーサ実装は削除済み。`_core` なしでは動作しない。

## hook が重い / 保存が遅い

hookは既定で `dagayn update --skip-flows` を実行する。それでも重い場合：

- 対象リポジトリが非常に大きい
- 一度に大量ファイルを保存した

対処： 日常は `--skip-flows` のまま、週次や大変更後に `dagayn build` でフロー込み再計算。

## セマンティック検索が効かない

```bash
dagayn status
```

埋め込みが `empty` / `partial` なら生成する。

```bash
dagayn build --local-embedding
```

`fts-only` インストールの場合はFTSのみが正常動作。 [セマンティック検索](/projects/dagayn/semantic-search/) を参照。

## 型チェックがローカルだけ失敗する

CIと同じコマンドを使う。

```bash
ty check dagayn --python-version 3.13 --ignore unresolved-import
```

## Notebook のセル番号がずれる

notebook修正後に再ビルドする。パーサはspan overlapでセル帰属を安定化しているが、大幅なフォーマット変更後は `dagayn build --force-full-build` が確実。

## 関連ページ

- [インストール](/projects/dagayn/installation/)
- [クイックスタート](/projects/dagayn/quickstart/)
- [開発環境](/projects/dagayn/development/)
