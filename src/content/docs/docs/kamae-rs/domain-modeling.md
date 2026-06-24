---
title: "ドメインモデリング"
sidebar:
  order: 10
---

> **いつ読むか:** 識別子・値オブジェクト・状態型・集約境界・newtype を定義するとき。
> **関連:** [`state-transitions.md`](/docs/kamae-rs/state-transitions/)、[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/)、[`persistence-events.md`](/docs/kamae-rs/persistence-events/)、[`property-based-tests.md`](/docs/kamae-rs/property-based-tests/)。

## ドメイン概念を明示的に表現する

意味が異なる値には、プリミティブな文字列や数値のまま置かず、名前付き構造体・列挙型・newtype で表現する。

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

値が意図的に透明で不変条件がない場合を除き、newtype のフィールドは private とする。

時刻・金額・単位は明示的な概念としてモデル化する。単位・タイムゾーン・精度・丸めが暗黙の裸のプリミティブより、`OccurredAt`、`ServiceDate`、`Money`、`CurrencyCode`、`DistanceMeters`、`DurationSeconds` を優先する。金額には `f32` / `f64` を使わない。

## 状態のバリアントには enum を優先する

閉じた状態集合やドメイン上の代替には Rust の enum を使う。各状態が異なるデータを持つなら、構造体風のバリアントとする。

```rust
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
    InTrip(InTripRequest),
    Completed(CompletedRequest),
    Cancelled(CancelledRequest),
}
```

特定のソース状態だけが遷移を受け付けるときは、別の状態構造体とする。

## 集約境界を定義する

集約は、まとめて原子的に変わる必要のある不変条件を所有する。ルールを所有する状態または集約に遷移メソッドを置き、他集約は ID で参照する。判断用に安定したスナップショットをロードするユースケースは除く。

トランザクションスコープ・バージョニング・集約横断の調整は [`persistence-events.md`](/docs/kamae-rs/persistence-events/) を参照する。

アクセス都合だけで無関係なエンティティを集めた「神」集約は避ける。2 つの集約ルートをメモリ上で変更し、呼び出し側の両方の save に頼る遷移も避け、ユースケースと明示的なドメインイベントで集約横断を行う。

## 構築を正直に保つ

`new`、`try_new`、`TryFrom`、`FromStr` で構築時に不変条件を強制する。呼び出し元が迂回できる public フィールドを公開しない。

不変条件のない単純データ、またはテストモジュール内の builder だけが struct リテラルを許容する。

## trait の derive は意図的に選ぶ

不変条件付きドメイン型に、本当のドメイン default がない限り `Default` derive しない。空 ID・ゼロ金額・最初の enum バリアントは、通常 invalid または misleading な default になる。

`Clone` は狭く derive する。小さな不変 value object や DTO では問題が少ないが、集約・エンティティへの広い `Clone` は所有ミスや stale copy の persist を隠す。

private 不変条件があるドメイン型に無制限の `Serialize` / `Deserialize` derive しない。DTO・行構造体・リーフ value object の serde `try_from` でデシリアライズも検証を通す。

## ドメインモデルを分離する

API JSON・DB 行・ドメインエンティティに同一 struct を使わない。外部形状は optional や非正規化フィールドを含み、ドメインに漏れうる。

フローは次のとおりである。

```text
API/DB/env raw data -> DTO/row struct -> TryFrom -> domain type
```

[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/) を参照する。

## 概念ごとに整理する

1 ドメイン概念につき 1 ファイルまたは 1 モジュールとし、型・コンストラクタ・メソッド・テストをまとめる。型と振る舞いを分けた catch-all の `types.rs` / `models.rs` は避ける。

## Phantom 型による typestate パターン

非法な状態をコンパイル時に不可能にするとき、ライフサイクルフェーズをゼロサイズの phantom marker 型パラメータで符号化する。

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

typestate を使うときは次を満たす。

- フェーズごとに利用可能な操作が大きく変わる
- 1 つの struct にまとめると多数の `Option` やランタイムチェックが必要になる

各状態が異なるフィールドを持ち遷移が主 API なら、別の状態構造体を優先する（[`state-transitions.md`](/docs/kamae-rs/state-transitions/)）。typestate と状態構造体は併用できる。例: `ExpenseReport<Submitted>` が `SubmittedReport` を包む。

## ドメイン enum の `#[non_exhaustive]`

`#[non_exhaustive]` は、下流 crate が enum の `match` に wildcard arm を含める必要があることを示す。次の用途に向く。

- ドメイン enum を拡張点として公開する public library crate
- 他リポジトリの matcher に breaking を出さずバリアントを追加する integration 向け event / status enum

次の場合は避ける。

- enum が 1 サービス crate 内部にあり、`match` サイトが同一 workspace にある
- 網羅的 `match` が安全属性である（例: 課金で全 `TaxiRequest` バリアントが必須）

単一ドメイン crate 内では `non_exhaustive` なしの網羅 `match` を優先し、バリアント追加時にコンパイラ更新を強制する。

## 金額と数量

金額に `f32` / `f64` を使わない。`rust_decimal::Decimal` または minor unit の整数表現を newtype で包む。

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

非金額の数量（距離・重量）は単位付き newtype（`DistanceMeters`、`WeightGrams`）とし、異なる単位の加算をコンパイルエラーにする。

## newtype 間の `From` と `TryFrom`

依存方向に沿って変換を設計する。wire / DB 型からドメイン型へ向ける。ドメインモジュールで逆方向にしない。

| 変換 | 推奨 |
| --- | --- |
| 同意味で検証済みの target | `TryFrom<Source> for Target` |
| ロスレスで常に valid | `From<Source> for Target` |
| レスポンス向け domain → wire | adapter または DTO 隣の `From<Domain> for ResponseDto` |
| DB 行向け domain → row | persistence adapter の `From<&Domain> for Row` |

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

transport 型依存を作る `TryFrom<Domain> for Dto` をドメイン crate に impl しない。outbound マッピングは adapter 層に置く。

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

secret や PII を含み、ログで map key に誤用しうる型に `Hash` / `Eq` derive しない。[`pii-protection.md`](/docs/kamae-rs/pii-protection/) を参照する。

## テスト builder

本番コンストラクタは strict とする。`#[cfg(test)]` または `tests/support` で sensible default と fluent override の builder を置く。

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

builder はテストとフィクスチャ専用とする。テスト簡略化のためドメインエンティティに `Default` を公開しない。

## よくある crate 組み合わせ

| スタック | モデリングパターン |
| --- | --- |
| `nutype` + `thiserror` | 生成 guard 付き検証 newtype（[`crate-guides/nutype.md`](/docs/kamae-rs/crate-guides/nutype/)） |
| `rust_decimal` + newtypes | checked 算術の `Money`、`TaxRate` |
| `serde(try_from)` + newtypes | JSON 境界のリーフ value object（[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/)） |
| `proptest` + builders | primitive に `Arbitrary` のあと `try_new`（[`property-based-tests.md`](/docs/kamae-rs/property-based-tests/)） |

レビューでは、ビジネス意味を持つ素の `String` や `i64`、invalid sentinel を生む `Default`、金額・課金での `f64`、文書化された例外なしの `Deserialize` / `FromRow` derive、public フィールドリテラルによる不変条件の迂回を指摘する。

## レビュー観点

### 1.1 意味のあるプリミティブは newtype で表現されているか — High

ユーザー ID、注文 ID、メールアドレス、金額、数量、外部参照など、異なるドメイン概念にそのまま `String`、`&str`、整数、decimal、UUID 型を使っている箇所を指摘する。

プライベートフィールドの newtype と検証付きコンストラクタを提案する。

ローカル一時変数、非公開アダプタフィールド、テストリテラル、シリアライズ専用 DTO フィールド、Rust 型以上のドメイン不変条件を持たない値には指摘しない。

### 1.2 呼び出し元が不変条件を迂回できないか — High

不変条件を持つドメイン型で public フィールドまたは public タプルフィールドがある場合は指摘する。コンストラクタが正規の経路であること。

複数フィールドの不変条件の一部だけを更新するミューテータ、再検証のスキップ、無効な中間状態の流出を許すミューテータを指摘する。

正規コンストラクタ内の直接構築、非公開テストヘルパ、使用前に検証付きドメインコンストラクタへ変換される DTO / 行構造体には指摘しない。

### 1.3 状態は明示的にモデル化されているか — Medium

`status: String` / `enum` と多数のオプションフィールドを持つ単一構造体で、状態ごとの構造体や列挙バリアントの方が必須フィールドを明確にできる場合は指摘する。

### 1.4 DTO、DB 行、ドメインエンティティは分離されているか — Medium

`Deserialize`、`FromRow`、ORM derive により外部データが検証を迂回したり、ドメイン不変条件がストレージ形状に結合するドメインエンティティを指摘する。

意図的なリードモデル、プロジェクション、API レスポンス DTO、ドメイン状態へデシリアライズできない監査用エクスポート型の `Serialize` には指摘しない。

### 1.5 ドメインコードは概念ごとに整理されているか — Low

無関係な概念を集め、振る舞いとデータを分離する catch-all の `types.rs`、`models.rs`、`domain.rs` モジュールを指摘する。

狭い境界づけられたコンテキスト目的のまとまったモジュール、生成スキーマモジュール、意図的に薄く保たれた互換シムには指摘しない。

### 1.6 金額、時間、単位は明示的か — Medium

型や名前付きコンストラクタなしに単位、通貨、タイムゾーン、包含 / 排他範囲を混在させる金額、数量、期間、レート、タイムスタンプを指摘する。
