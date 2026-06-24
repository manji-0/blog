---
title: "serde（シリアライズ）"
sidebar:
  order: 10
---

> **いつ読むか:** DTO の `serde` 設定、リーフ value object の `try_from` を整えるとき。
> **関連:** [`../boundary-defense.md`](/docs/kamae/rust/boundary-defense/)、[`../pii-protection.md`](/docs/kamae/rust/pii-protection/)。

詳細パターンは [`../boundary-defense.md`](/docs/kamae/rust/boundary-defense/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

外部形状には `serde` DTO を使い、ドメイン型に変換する。

デシリアライズが検証を迂回したり不可能な状態を許したりする場合、ドメインエンティティに直接 `Deserialize` を付けない。

出力が意図的で secret を含まない読み取りモデルでは、ドメインへの `Serialize` も許容されうる。PII については redaction を制御する明示的な response DTO をシリアライズする。

## 検証付き値オブジェクトに `try_from` を使う

小さな不変条件付き値オブジェクトでは、serde パスが通常コードと同じ検証コンストラクタに委譲するなら `Deserialize` も許容される:

```rust
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(try_from = "String")]
pub struct EmailAddress(String);

impl TryFrom<String> for EmailAddress {
    type Error = EmailAddressError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        EmailAddress::new(value)
    }
}
```

ID、メール、スラッグ、有界数量などのリーフ値オブジェクト向け。集約、エンティティ、state 型、コマンド、複数フィールドをまとめて検証するものは DTO -> `TryFrom` を優先する。

テストや persistence の都合だけで、不変条件付き型に無制限 `Serialize`/`Deserialize` を derive しない。シリアライズ形式が公開契約でないなら DTO または row 型に留める。

## よくある組み合わせ

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`、`TryFrom` が型付き error enum を返す | [`boundary-defense.md`](/docs/kamae/rust/boundary-defense/) |
| `serde` + `sqlx` | row struct のみ `FromRow`、ドメインへ `TryFrom` | [`boundary-defense.md`](/docs/kamae/rust/boundary-defense/#database-rows-sqlxfromrow)、[`persistence-events.md`](/docs/kamae/rust/persistence-events/) |
| `serde` + events | ドメイン event enum に `#[serde(tag = "event_type")]` | [`persistence-events.md`](/docs/kamae/rust/persistence-events/#event-serde-representation) |
| `serde` + `garde` | `TryFrom` 前に DTO を `garde` で検証 | [`crate-guides/garde.md`](/docs/kamae/rust/crate-guides/garde/) |
