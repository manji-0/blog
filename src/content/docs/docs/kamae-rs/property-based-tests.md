---
title: "プロパティベーステスト"
sidebar:
  order: 10
---

> **いつ読むか:** `proptest` で不変条件・往復・遷移法則を広い入力空間で検証するとき。
> **関連:** [`test-data.md`](/docs/kamae-rs/test-data/)、[`domain-modeling.md`](/docs/kamae-rs/domain-modeling/)、[`state-transitions.md`](/docs/kamae-rs/state-transitions/)、[`crate-guides/proptest.md`](/docs/kamae-rs/crate-guides/proptest/)。

<!-- constrained-by ./test-data.md -->
<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->

## property test がコストに見合うタイミング

不変条件が多入力にわたって成り立ち、例表が不完全または保守が面倒なとき property-based test を使う。

向いている対象:

- 値オブジェクトコンストラクタと検証ルール
- parse/format と DTO `TryFrom` の往復
- state machine 遷移法則と拒否ルール
- 金額、単位、タイムスタンプ境界挙動
- 冪等 handler と projection リプレイ
- redaction と安全 `Display`/`Debug` 契約

挙動が小さな閉じたケース集合、property が構造上自明、失敗が有用な最小例に shrink しない場合は通常の単体テストを優先。

## ドメイン crate では `proptest` を優先

shrinking、regression ファイル、 composable strategy が不変条件テストに合うため、サーバー側ドメイン crate のデフォルト推奨は `proptest`。プロジェクトがすでに標準化している場合のみ `quickcheck`。

`proptest` を `[dev-dependency]` に追加。generator は `#[cfg(test)]` モジュールまたは `tests/support` に置き、本番ドメインコードには入れない。

```toml
[dev-dependencies]
proptest = "1"
```

## public コンストラクタ経由で生成する

generator は本番パスが構築できる値を出す必要がある。strategy が raw struct リテラルや private フィールド設定をすると、テストは通っても実呼び出しは失敗しうる。

```rust
use proptest::prelude::*;

fn valid_request_id() -> impl Strategy<Value = RequestId> {
    "[1-9][0-9]{0,15}".prop_map(|s| RequestId::new(s).expect("strategy produces valid ids"))
}

proptest! {
    #[test]
    fn request_id_rejects_empty(input in "\\PC*") {
        prop_assume!(input.trim().is_empty());
        prop_assert!(RequestId::new(input).is_err());
    }

    #[test]
    fn request_id_accepts_non_empty(input in "[1-9][0-9]{0,15}") {
        prop_assert!(RequestId::new(input).is_ok());
    }
}
```

無効入力が重要なら raw string または DTO を生成し `TryFrom`/constructor 拒否を assert — 無効データ周りにドメイン型を構築しない。

## property を明示的に符号化する

テスト内で法則に名前を付け、1 property に 1 焦点。

| Property kind | Example law |
| --- | --- |
| Round trip | `TryFrom::<Dto>::try_from(x.clone())?` 後 serialize が元形状と等しい |
| Idempotence | 同一コマンド 2 回適用で追加効果なし |
| Invariant preservation | 有効 `Money` + 有効 `Money` が負結果を出さない |
| Rejection | 非法遷移が常に同じ error バリアント |
| Projection replay | 順序通り event を畳むと snapshot + tail ロードと等しい |

```rust
proptest! {
    #[test]
    fn money_addition_is_commutative(a in money_strategy(), b in money_strategy()) {
        prop_assume!(a.currency() == b.currency());
        prop_assert_eq!(a.clone() + b.clone(), b + a);
    }
}
```

前提外入力は vacuous success を assert せず `prop_assume!` で捨てる。

## state machine を strategy としてモデル化する

ライフサイクルルールでは到達可能 state だけ出す strategy を組み、遷移結果を assert する。

```rust
fn waiting_request() -> impl Strategy<Value = WaitingRequest> {
    (valid_request_id(), valid_passenger_id())
        .prop_map(|(id, passenger)| WaitingRequest::new(id, passenger))
}

proptest! {
    #[test]
    fn assign_driver_advances_state(
        waiting in waiting_request(),
        driver in valid_driver_id(),
    ) {
        let outcome = waiting.assign_driver(driver)?;
        prop_assert!(matches!(outcome.state, EnRouteRequest { .. }));
    }
}
```

非法遷移では invalid と分かる source state と action を生成し、特定 error バリアントを assert — `is_err()` だけにしない。

## shrinking をドメイン安全に保つ

shrinking がコンストラクタを迂回する値を出さない。空文字、ゼロ金額、不可能 enum variant に shrink したら strategy を直すか `prop_assume!` を追加。

自明でない入力のバグには `proptest-regressions` で再現可能失敗を保存:

```toml
[dev-dependencies]
proptest = "1"
proptest-regressions = "0.2"
```

```rust
proptest_regressions::proptest_regressions! {
    regressions = "path/to/regressions.txt"
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]
    #[test]
    fn regression_example(input in strategy()) {
        // ...
    }
}
```

実バグ修正を表す regression ファイルはコミットする。

## 非決定論/I/O 境界をデフォルトで property test しない

property test は純粋ドメイン関数と、注入 clock または固定フィクスチャの決定論 adapter 向け。

デフォルトで避ける:

- `proptest!` 内の live DB または network
- シード clock strategy なしの wall-clock 時刻
- テスト対象としての logging や metrics 副作用

生成 payload で DTO 変換、redaction、error マッピングをテスト。repository は制御不能 I/O ではなく fake または in-memory port で。

## 既存テスト層との統合

| 層 | プロパティテストの役割 |
| --- | --- |
| Value object | constructor 受理/拒否、往復 |
| Domain transition | 法則、非法遷移エラー |
| Use case | fake port での idempotency（実 infra ではない） |
| Boundary DTO | 不正/生成 payload が型付きエラーにマップ |
| Projection | リプレイ順序と checkpoint idempotency |

読みやすいシナリオは example ベース、型安全性約束は compile-fail（[`test-data.md`](/docs/kamae-rs/test-data/) 参照）。

## CI と実行予算

property test はケース数を増やす。ドメイン crate では通常デフォルトで足りる。デバッグ時のみローカルで cases を上げる。

- crate が小さく高速でない限り CI では `ProptestConfig::with_cases` をデフォルト近くに保つ
- 特に遅い property は文書化し別 CI job で走らせる場合のみ `#[ignore]`
- 再現性を犠牲にしない限り CI で shrinking を無効化しない

## 検出ヒント

`Cargo.toml` に `proptest` または `quickcheck` があるとき、このガイドと不変条件のトピックガイド（modeling、state transitions、boundaries、persistence）を [`test-data.md`](/docs/kamae-rs/test-data/) と一緒に読み込む。

レビューでは、public コンストラクタを迂回する generator、法則を述べない `is_ok()` のみのアサーション、破棄すべき入力の曖昧な扱い、非法遷移の `is_err()` のみ確認、ライブ I/O への property test を指摘する。

## レビュー観点

### 16.1 ジェネレータは公開コンストラクタを使っているか — High

`new`、`try_new`、`TryFrom` ではなく、生リテラルやプライベートフィールドでドメイン構造体を組み立てる `proptest` / `quickcheck` 戦略を指摘する。

### 16.2 各プロパティは名前付き不変条件か — Medium

法則（往復、冪等性、拒否ルールなど）を述べず、`is_ok()` だけをアサートする、または非構造化出力を比較するだけのプロパティテストを指摘する。

### 16.3 前提条件は `prop_assume!` で強制されているか — Medium

ドメイン外入力を成功と失敗のどちらとも曖昧に扱うのではなく、明示的に破棄すべきプロパティを指摘する。

### 16.4 非法遷移は特定エラーまでテストされているか — Medium

[`state-transitions.md`](/docs/kamae-rs/state-transitions/) も照合する。呼び出し元がエラーバリアントに依存するのに、非法遷移で `is_err()` だけを確認するプロパティテストを指摘する。

### 16.5 プロパティ内で非決定的 I/O は避けているか — High

注入フェイクや固定クロックなしに、ライブ DB、ネットワーク、壁時計に当たる `proptest!` ブロックを指摘する。

### 16.6 縮小済みケースの回帰ファイルはコミットされているか — Low

プロパティが微妙なバグを見つけ、最小反例を黙って消えさせたくないときは `proptest-regressions` を提案する。
