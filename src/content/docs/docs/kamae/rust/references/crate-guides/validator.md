---
title: "validator"
sidebar:
  order: 10
---

詳細パターンは [`../boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

プロジェクトが derive ベースのリクエスト検証をすでに使う場合、DTO 向け `validator` を使う。

検証済み DTO もドメイン newtype に変換する。validation derive は DTO 境界をチェックする。ドメインコンストラクタが他のすべての構築経路の不変条件を保つ。

```rust
#[derive(serde::Deserialize, validator::Validate)]
pub struct CreateUserDto {
    #[validate(email)]
    email: String,
}
```
