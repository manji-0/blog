---
title: "Rust ドメインモデリング"
sidebar:
  order: 10
---

## ドメイン概念を明示的に表現する

意味論的に異なる値には、primitive string/number ではなく named struct、enum、newtype を使う。

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RequestId(String);

impl RequestId {
    pub fn new(value: String) -> Result<Self, RequestIdError> {
        if value.trim().is_empty() {
            return Err(RequestIdError::Empty);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

値が意図的に透明で不変条件がない場合を除き、newtype フィールドは private。

時刻、金額、単位を明示概念としてモデル化。単位、タイムゾーン、精度、丸めが暗黙の裸 primitive より `OccurredAt`、`ServiceDate`、`Money`、`CurrencyCode`、`DistanceMeters`、`DurationSeconds` を優先。money に `f32`/`f64` は避ける。

## variant と state には enum を優先

閉じた state 集合や domain 代替には Rust enum。各 state が異なるデータを持つなら struct-like variant。

```rust
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
    InTrip(InTripRequest),
    Completed(CompletedRequest),
    Cancelled(CancelledRequest),
}
```

特定 source state だけが遷移を受け付けるときは別 state struct。

## 集約境界を定義する

集約は原子的に変わる必要のある不変条件を所有する。ルールを所有する state または集約に遷移メソッドを置き、他集約は ID で参照。判断用に stable snapshot を load したユースケースは除く。

トランザクションスコープ、versioning、集約横断調整は [`aggregate-transactions.md`](/docs/kamae/rust/references/aggregate-transactions/) 参照。

アクセス都合だけで無関係 entity を集めた「神」集約を避ける。2 集約ルートをメモリ上で mutate し、呼び出し側の両方 save に頼る遷移も避け、ユースケース + 明示 domain event で集約横断を行う。

## 構築を正直に

`new`、`try_new`、`TryFrom`、`FromStr` で構築時に不変条件を強制。caller が迂回できる public field を公開しない。

不変条件のない単純データ、または test module 内 builder だけ struct リテラルを許容。

## trait derive は意図的に

不変条件付き domain 型に、本当の domain default がない限り `Default` derive しない。空 ID、ゼロ money、最初の enum variant は通常 invalid または misleading default。

`Clone` は狭く derive。小さな不変 value object や DTO では問題少ないが、集約・entity への広い `Clone` は所有ミスや stale copy の persist を隠す。

private 不変条件がある domain 型に無制限 `Serialize`/`Deserialize` derive しない。DTO、row struct、leaf value object の serde `try_from` でデシリアライズも検証を通す。

## ドメインモデルを分離

API JSON、DB row、domain entity に同一 struct を使わない。外部形状は optional や非正規化フィールドを含み、domain に漏れうる。

フロー:

```text
API/DB/env raw data -> DTO/row struct -> TryFrom -> domain type
```

[`boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/) 参照。

## 概念ごとに整理

1 domain 概念 1 ファイルまたは module: 型、constructor、メソッド、テストをまとめる。型と振る舞いを分けた catch-all `types.rs` / `models.rs` を避ける。

## Phantom 型による typestate

非法 state をコンパイル時に不可能にするとき、ライフサイクル phase をゼロサイズ phantom marker の型パラメータで符号化。

```rust
use std::marker::PhantomData;

pub struct Draft;
pub struct Submitted;
pub struct Approved;

pub struct ExpenseReport<State> {
    report_id: ReportId,
    amount: Money,
    _state: PhantomData<State>,
}

impl ExpenseReport<Draft> {
    pub fn submit(self) -> Result<ExpenseReport<Submitted>, SubmitError> {
        if self.amount.is_zero() {
            return Err(SubmitError::EmptyAmount);
        }
        Ok(ExpenseReport {
            report_id: self.report_id,
            amount: self.amount,
            _state: PhantomData,
        })
    }
}

impl ExpenseReport<Submitted> {
    pub fn approve(self, approver: ApproverId) -> ExpenseReport<Approved> {
        ExpenseReport {
            report_id: self.report_id,
            amount: self.amount,
            _state: PhantomData,
        }
    }
}
```

typestate を使うとき:

- フェーズで利用可能操作が大きく変わる
- 1 struct にまとめると多数 `Option` や runtime check が必要

各 state が異なるフィールドを持ち遷移が主 API なら別 state struct を優先（[`state-transitions.md`](/docs/kamae/rust/references/state-transitions/)）。typestate と state struct は併用可: `ExpenseReport<Submitted>` が `SubmittedReport` を包む。

## domain enum の `#[non_exhaustive]`

`#[non_exhaustive]` は下流 crate が enum match に wildcard arm を含める必要があることを示す。用途:

- domain enum を拡張点として公開する public library crate
- 他 repo の matcher に breaking を出さず variant を追加する integration 向け event/status enum

避けるとき:

- enum が 1 service crate 内部で、match site が同一 workspace
- 網羅 match が安全属性（例: billing で全 `TaxiRequest` variant 必須）

単一 domain crate 内では `non_exhaustive` なし網羅 `match` を優先し、variant 追加時にコンパイラ更新を強制。

## 金額と数量

money に `f32`/`f64` を使わない。`rust_decimal::Decimal` または minor unit 整数表現を newtype で包む。

```rust
use rust_decimal::Decimal;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Money {
    amount_minor: i64,
    currency: CurrencyCode,
}

impl Money {
    pub fn from_minor(amount_minor: i64, currency: CurrencyCode) -> Result<Self, MoneyError> {
        if amount_minor < 0 {
            return Err(MoneyError::Negative);
        }
        Ok(Self { amount_minor, currency })
    }

    pub fn add(self, other: Money) -> Result<Money, MoneyError> {
        if self.currency != other.currency {
            return Err(MoneyError::CurrencyMismatch);
        }
        Ok(Money {
            amount_minor: self
                .amount_minor
                .checked_add(other.amount_minor)
                .ok_or(MoneyError::Overflow)?,
            currency: self.currency,
        })
    }
}
```

非 money 数量（距離、重量）は単位付き newtype（`DistanceMeters`、`WeightGrams`）で、異単位加算をコンパイルエラーに。

## newtype 間の `From` と `TryFrom`

依存方向に沿って変換設計: wire/DB 型 -> domain 型。domain module で逆方向にしない。

| Conversion | Prefer |
| --- | --- |
| 同意味、検証済み target | `TryFrom<Source> for Target` |
| _lossless、常に valid | `From<Source> for Target` |
| response 向け domain -> wire | adapter または DTO 隣の `From<Domain> for ResponseDto` |
| DB row 向け domain -> row | persistence adapter の `From<&Domain> for Row` |

```rust
impl TryFrom<String> for PassengerId {
    type Error = PassengerIdError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        PassengerId::new(value)
    }
}

impl From<RequestId> for String {
    fn from(id: RequestId) -> Self {
        id.into_inner()
    }
}
```

transport 型依存を作る `TryFrom<Domain> for Dto` を domain crate に impl しない。outbound mapping は adapter 層。

## 手動 `Eq`、`Hash`、`Ord`

全フィールドが対応 trait を持ち意味が derive と一致するとき derive。

手動 impl する場合:

- `f64` を含むが丸め/離散 view で等価が必要
- 順序が domain 固有（`Priority` がフィールド辞書順でない）
- 等価から derived/cache field を無視

```rust
#[derive(Clone, Debug)]
pub struct FareEstimate {
    distance_m: DistanceMeters,
    duration_s: DurationSeconds,
    confidence: f64, // derived score, not part of identity
}

impl PartialEq for FareEstimate {
    fn eq(&self, other: &Self) -> bool {
        self.distance_m == other.distance_m && self.duration_s == other.duration_s
    }
}

impl Eq for FareEstimate {}

impl Hash for FareEstimate {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.distance_m.hash(state);
        self.duration_s.hash(state);
    }
}
```

secret や PII を含み log で map key に誤用しうる型に `Hash`/`Eq` derive しない。[`pii-protection.md`](/docs/kamae/rust/references/pii-protection/) 参照。

## テスト builder

本番 constructor は strict。`#[cfg(test)]` または `tests/support` で sensible default と fluent override の builder。

```rust
#[cfg(test)]
mod support {
    use super::*;

    #[derive(Default)]
    pub struct WaitingRequestBuilder {
        request_id: Option<RequestId>,
        passenger_id: Option<PassengerId>,
    }

    impl WaitingRequestBuilder {
        pub fn with_passenger(mut self, passenger_id: PassengerId) -> Self {
            self.passenger_id = Some(passenger_id);
            self
        }

        pub fn build(self) -> WaitingRequest {
            WaitingRequest::new(
                self.request_id
                    .unwrap_or_else(|| RequestId::new("req-test-1".into()).unwrap()),
                self.passenger_id
                    .unwrap_or_else(|| PassengerId::new("pax-test-1".into()).unwrap()),
            )
            .unwrap()
        }
    }
}

#[test]
fn assign_driver_moves_to_en_route() {
    let waiting = WaitingRequestBuilder::default()
        .with_passenger(PassengerId::new("pax-42".into()).unwrap())
        .build();
    let en_route = waiting.assign_driver(DriverId::new("drv-9".into()).unwrap());
    assert_eq!(en_route.driver_id().as_str(), "drv-9");
}
```

builder はテストとフィクスチャのみ。テスト簡略化のため domain entity に `Default` を公開しない。

## よくある crate 組み合わせ

| Stack | Modeling pattern |
| --- | --- |
| `nutype` + `thiserror` | 生成 guard 付き検証 newtype; [`crate-guides/nutype.md`](/docs/kamae/rust/references/crate-guides/nutype/) |
| `rust_decimal` + newtypes | checked 算術の `Money`、`TaxRate` |
| `serde(try_from)` + newtypes | JSON 境界の leaf value object; [`boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/) |
| `proptest` + builders | primitive に `Arbitrary` 後 `try_new`; [`property-based-tests.md`](/docs/kamae/rust/references/property-based-tests/) |

## レビューシグナル

次をフラグ:

- ビジネス意味を持つ `String` または `i64` に newtype なし
- ID、money、state enum の `Default` が invalid sentinel を生む
- money や billing に `f64`
- 文書化例外なしで domain struct が `Deserialize` または `FromRow` derive
- テストが public field リテラルで不変条件を迂回して domain オブジェクト構築
