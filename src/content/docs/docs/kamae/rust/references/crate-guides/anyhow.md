---
title: "anyhow / eyre"
sidebar:
  order: 10
---

詳細パターンは [`../error-handling.md`](/docs/kamae/rust/references/error-handling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

アプリケーション境界で `anyhow` または `eyre` を使う: コマンド handler、`main`、移行ツール、接着コード。

ドメインエンティティ、値オブジェクトコンストラクタ、呼び出し側が網羅的に扱う必要があるユースケースの戻り型として `anyhow::Result<T>` を使わない。ドメイン固有エラーは報告境界でのみ `anyhow` に変換する。
