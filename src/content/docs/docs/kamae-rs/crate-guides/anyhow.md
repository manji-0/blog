---
title: "anyhow / eyre（アプリ境界）"
sidebar:
  order: 10
---

> **いつ読むか:** アプリケーション境界（`main`、handler、移行ツール）で `anyhow` / `eyre` を使うとき。
> **関連:** [`../error-handling.md`](/docs/kamae-rs/error-handling/)、[`thiserror.md`](/docs/kamae-rs/crate-guides/thiserror/)。

詳細パターンは [`../error-handling.md`](/docs/kamae-rs/error-handling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

アプリケーション境界で `anyhow` または `eyre` を使う。対象はコマンド handler、`main`、移行ツール、接着コードである。

ドメインエンティティ、値オブジェクトコンストラクタ、呼び出し側が網羅的に扱う必要があるユースケースの戻り型として `anyhow::Result<T>` を使わない。ドメイン固有エラーは報告境界でのみ `anyhow` に変換する。
