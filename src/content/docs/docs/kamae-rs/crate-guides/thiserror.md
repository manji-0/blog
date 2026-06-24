---
title: "thiserror（エラー型）"
sidebar:
  order: 10
---

> **いつ読むか:** ドメイン・ユースケースの `thiserror` 列挙型を導入・整備するとき。
> **関連:** [`../error-handling.md`](/docs/kamae-rs/error-handling/)、[`serde.md`](/docs/kamae-rs/crate-guides/serde/)。

詳細パターンは [`../error-handling.md`](/docs/kamae-rs/error-handling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

crate がすでに依存している場合、または小さく慣習的な error derive を導入してよい場合に、ドメイン固有 error enum 向け `thiserror` を使う。

```rust
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("invalid request id")]
    InvalidRequestId,
}
```

バリアントは意味論的に保つ。アプリケーション境界でインフラ失敗を包む場合を除き、ドメインエラーに `Other(String)` のような catch-all は避ける。

## よくある組み合わせ

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `thiserror` + `serde` boundary | `TryFrom<Dto>` で `type Error = CommandError` | [`boundary-defense.md`](/docs/kamae-rs/boundary-defense/) |
| `thiserror` + `sqlx` | adapter 境界で `RepositoryError` が `sqlx::Error` を包む | [`persistence-events.md`](/docs/kamae-rs/persistence-events/) |
| `thiserror` + transitions | `AssignDriverError` が domain / not-found / conflict を分離 | [`state-transitions.md`](/docs/kamae-rs/state-transitions/)、[`persistence-events.md`](/docs/kamae-rs/persistence-events/) |
