---
title: "thiserror"
sidebar:
  order: 10
---

詳細パターンは [`../error-handling.md`](/docs/kamae/rust/references/error-handling/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

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

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `thiserror` + `serde` boundary | `TryFrom<Dto>` で `type Error = CommandError` | [`boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/) |
| `thiserror` + `sqlx` | adapter 境界で `RepositoryError` が `sqlx::Error` を包む | [`persistence-events.md`](/docs/kamae/rust/references/persistence-events/) |
| `thiserror` + transitions | `AssignDriverError` が domain / not-found / conflict を分離 | [`state-transitions.md`](/docs/kamae/rust/references/state-transitions/)、[`aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/) |
