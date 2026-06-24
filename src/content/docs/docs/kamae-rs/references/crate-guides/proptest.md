---
title: "proptest"
sidebar:
  order: 10
---

Use `proptest` for domain invariant tests when the crate already depends on it
or when property tests are the clearest way to cover input-wide laws.

Keep it in `[dev-dependencies]`. Prefer strategies that call public constructors
rather than building invalid domain states directly.

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn round_trip(input in strategy()) {
        // assert law
    }
}
```

See [`../property-based-tests.md`](/docs/kamae-rs/../property-based-tests/) for generator
design, state-machine properties, CI budget, and regression files.
