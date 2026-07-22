---
title: "ドメインモデリング"
sidebar:
  order: 10
---

意味の異なる値を同じ `String` や `i64` のまま置くと、コンパイラは区別できず、境界をすり抜けた値がドメイン深部まで届く。Kamaeではnewtype・enum・明示的なコンストラクタで意図を型に刻む。

ライフサイクル上の変化は [状態遷移](/projects/kamae-rs/state-transitions/)、外部データの取り込みは [境界防御](/projects/kamae-rs/boundary-defense/)、保存単位は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) と揃える。

## ドメイン概念を明示的に表現する

プリミティブのままだと、単位の混同やIDの取り違えはコンパイル時に検出できない。newtypeのコストはボイラープレートより、誤った組み合わせを早く落とす効果の方が大きい。

次の例は、空文字を拒否する `RequestId` による典型的なnewtypeである。

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

値が意図的に透明で不変条件がない場合を除き、newtypeのフィールドはprivateとする。

時刻・金額・単位は明示的な概念としてモデル化する。単位・タイムゾーン・精度・丸めが暗黙の裸のプリミティブより、`OccurredAt`、`ServiceDate`、`Money`、`CurrencyCode`、`DistanceMeters`、`DurationSeconds` を優先する。金額には `f32` / `f64` を使わない。

## 状態のバリアントには enum を優先する

閉じた状態集合やドメイン上の代替にはRustのenumを使う。各状態が異なるデータを持つなら、構造体風のバリアントとする。

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

集約は、まとめて原子的に変わる必要のある不変条件を所有する。ルールを所有する状態または集約に遷移メソッドを置き、他集約はIDで参照する。判断用に安定したスナップショットをロードするユースケースは除く。

トランザクションスコープ・バージョニング・集約横断の調整は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) を参照する。

アクセス都合だけで無関係なエンティティを集めた「神」集約は避ける。2つの集約ルートをメモリ上で変更し、呼び出し側の両方のsaveに頼る遷移も避け、ユースケースと明示的なドメインイベントで集約をまたぐ変更する。

## 構築を正直に保つ

`new`、`try_new`、`TryFrom`、`FromStr` で構築時に不変条件を強制する。publicフィールドを公開すると、呼び出し元が検証を迂回して無効な組み合わせを作れてしまう。

不変条件のない単純データ、または `#[cfg(test)]` 内のbuilderだけがstructリテラルを許容する。本番経路と同じコンストラクタをテストでも使う方針は [テストデータ](/projects/kamae-rs/test-data/) を参照する。

## trait の derive は意図的に選ぶ

不変条件付きドメイン型に、本当のドメインdefaultがない限り `Default` deriveしない。空ID・ゼロ金額・最初のenumバリアントは、通常invalidまたはmisleadingなdefaultになる。

`Clone` は狭くderiveする。小さな不変value objectやDTOでは問題が少ないが、集約・エンティティへの広い `Clone` は所有関係の誤りや、古いコピーをそのまま永続化する経路を隠す。

private不変条件があるドメイン型に無制限の `Serialize` / `Deserialize` deriveしない。DTO・行構造体・リーフvalue objectのserde `try_from` でデシリアライズも検証を通す。

## ドメインモデルを分離する

API JSON・DB行・ドメインエンティティに同一structを使わない。外部形状はoptionalや非正規化フィールドを含み、ドメインに漏れうる。

フローは次のとおり。

```text
API/DB/env raw data -> DTO/row struct -> TryFrom -> domain type
```

[境界防御](/projects/kamae-rs/boundary-defense/) を参照する。

## 概念ごとに整理する

1ドメイン概念につき1ファイル（または小さなモジュール）とし、型・コンストラクタ・メソッド・テストを同じ場所に置く。`types.rs` と `models.rs` に型だけ、別モジュールに振る舞いだけ、という分離は、変更のたびにファイルを行き来させ、不変条件のレビューも難しくする。

## Phantom 型による typestate パターン

コンパイル時点で非法な状態を不可能にするとき、ライフサイクルフェーズをゼロサイズのphantom marker型パラメータで符号化する。

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

typestateを使うときは次を満たす。

- フェーズごとに利用可能な操作が大きく変わる
- 1つのstructにまとめると多数の `Option` やランタイムチェックが必要になる

各状態が異なるフィールドを持ち遷移が主APIなら、別の状態構造体を優先する（[状態遷移](/projects/kamae-rs/state-transitions/)）。typestateと状態構造体は併用できる。例： `ExpenseReport<Submitted>` が `SubmittedReport` を包む。

## ドメイン enum の `#[non_exhaustive]`

`#[non_exhaustive]` は、下流crateがenumの `match` にwildcard armを含める必要があることを示す。次の用途に向く。

- ドメインenumを拡張点として公開するpublic library crate
- 他リポジトリのmatcherにbreakingを出さずバリアントを追加するintegration向けevent / status enum

次の場合は避ける。

- enumが1サービスcrate内部にあり、`match` サイトが同一workspaceにある
- 網羅的 `match` が安全属性である（例： 課金で全 `TaxiRequest` バリアントが必須）

単一ドメインcrate内では `non_exhaustive` なしの網羅 `match` を優先し、バリアント追加時にコンパイラ更新を強制する。

## 金額と数量

金額に `f32` / `f64` を使わない。`rust_decimal::Decimal` またはminor unitの整数表現をnewtypeで包む。

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

非金額の数量（距離・重量）は単位付きnewtype（`DistanceMeters`、`WeightGrams`）とし、異なる単位の加算をコンパイルエラーにする。

## newtype 間の `From` と `TryFrom`

依存方向に沿って変換を設計する。wire / DB型からドメイン型へ向ける。ドメインモジュールで逆方向にしない。

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

transport型依存を作る `TryFrom<Domain> for Dto` をドメインcrateにimplしない。outboundマッピングはadapter層に置く。

## 手動 `Eq`、`Hash`、`Ord`

全フィールドが対応traitを持ち意味がderiveと一致するときderive。

手動implする場合：

- `f64` を含むが丸め/離散viewで等価が必要
- 順序がdomain固有（`Priority` がフィールド辞書順でない）
- 等価からderived/cache fieldを無視

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

secretやPIIを含み、ログでmap keyとして誤用しうる型には `Hash` / `Eq` deriveしない。[PII 保護](/projects/kamae-rs/pii-protection/) を参照する。

## テスト builder

本番コンストラクタはstrictとする。`#[cfg(test)]` または `tests/support` でsensible defaultとfluent overrideのbuilderを置く。

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

builderはテストとフィクスチャ専用とする。テスト簡略化のためドメインエンティティに `Default` を公開しない。

## よくある crate 組み合わせ

| スタック | モデリングパターン |
| --- | --- |
| `nutype` + `thiserror` | 生成 guard 付き検証 newtype（[クレートガイド（nutype）](/projects/kamae-rs/crate-guides/#nutype)） |
| `rust_decimal` + newtypes | checked 算術の `Money`、`TaxRate` |
| `serde(try_from)` + newtypes | JSON 境界のリーフ value object（[境界防御](/projects/kamae-rs/boundary-defense/)） |
| `proptest` + builders | primitive に `Arbitrary` のあと `try_new`（[プロパティベーステスト](/projects/kamae-rs/property-based-tests/)） |

## レビューで見るところ

- 不変条件のある型にpublicフィールドや部分更新だけのミューテータがないか。
- ID・金額・メールなど意味の違う値が素のプリミティブのまま混ざっていないか。
- `Deserialize` / `FromRow` でドメイン不変条件がストレージ形状に張り付いていないかも見る。
- `status` + Optionalの巨大structより状態ごとの型の方が明確でないか。
- 単位・通貨・タイムゾーンが型や名前付きコンストラクタで分かれているか。
- `types.rs` / `models.rs` に無関係な概念が溜まっていないかも確認する。

