---
title: "proptest（プロパティテスト）"
sidebar:
  order: 10
---

> **いつ読むか:** ドメイン不変条件の property test に `proptest` を導入するとき。
> **関連:** [`../property-based-tests.md`](/docs/kamae-rs/property-based-tests/)、[`../test-data.md`](/docs/kamae-rs/test-data/)。

crate がすでに依存している場合、または property test が入力全体の法則を最も明確にカバーできる場合に、ドメイン不変条件テスト向け `proptest` を使う。

`[dev-dependencies]` に置く。public コンストラクタを呼ぶ strategy を優先し、無効なドメイン状態を直接構築しない。

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn round_trip(input in strategy()) {
        // assert law
    }
}
```

generator 設計、state machine property、CI 予算、regression ファイルは [`../property-based-tests.md`](/docs/kamae-rs/property-based-tests/) を参照。
