---
title: "proptest"
sidebar:
  order: 10
---

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

generator 設計、state machine property、CI 予算、regression ファイルは [`../property-based-tests.md`](/docs/kamae/rust/references/property-based-tests/) を参照。
