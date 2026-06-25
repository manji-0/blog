---
title: "クレートガイド"
sidebar:
  order: 5
  label: "クレートガイド（参照）"
---

`thiserror`、`serde`、`nutype` などはKamaeのドメイン規約を**補助**するクレートである。トピック別リファレンス（エラーハンドリング、境界防御など）と矛盾する場合は、そちらを優先する。

ここでは「よくある組み合わせ」とデフォルトの置き場所をまとめる。個別の設計判断は [エラーハンドリング](/docs/kamae-rs/error-handling/)、[境界防御](/docs/kamae-rs/boundary-defense/)、[ドメインモデリング](/docs/kamae-rs/domain-modeling/)、[PII 保護](/docs/kamae-rs/pii-protection/) を参照する。

| 用途 | ガイド付きクレート | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エラー | `thiserror`、`anyhow`、`eyre` | `snafu` |
| シリアライズ | `serde` | `serde_json`、`toml`、`config` |
| 検証 / newtype | `validator`、`garde`、`nutype` | `derive_more` |
| PII / シークレット | `secrecy` | `zeroize` |
| ログ / トレース | `tracing`、`log`、`metrics` | `opentelemetry`、`prometheus` |
| テスト | `proptest` | `quickcheck`、`trybuild` |

## thiserror

ドメイン・ユースケースの `thiserror` 列挙型を導入・整備するときに参照する。詳細は [エラーハンドリング](/docs/kamae-rs/error-handling/) を優先する。

```rust
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("invalid request id")]
    InvalidRequestId,
}
```

バリアントは意味論的に保つ。アプリケーション境界でインフラ失敗を包む場合を除き、ドメインエラーに `Other(String)` のようなcatch-allは避ける。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `thiserror` + `serde` boundary | `TryFrom<Dto>` で `type Error = CommandError` | [境界防御](/docs/kamae-rs/boundary-defense/) |
| `thiserror` + `sqlx` | adapter 境界で `RepositoryError` が `sqlx::Error` を包む | [永続化、集約、イベント](/docs/kamae-rs/persistence-events/) |
| `thiserror` + transitions | `AssignDriverError` が domain / not-found / conflict を分離 | [状態遷移](/docs/kamae-rs/state-transitions/)、[永続化、集約、イベント](/docs/kamae-rs/persistence-events/) |

## anyhow / eyre

`anyhow` / `eyre` は**報告境界**向けである。`main`、HTTPハンドラ、移行スクリプト、接着コードでは、多様な失敗を1本のチェーンにまとめてよい。

ドメインのコンストラクタやユースケースの戻り値に `anyhow::Result` を使うと、呼び出し元が網羅的に分岐できなくなる。ドメイン層は具体的な `enum` と `Result` を返し、ハンドラでHTTPステータスやログ用メッセージに変換する。

## serde

外部形状には `serde` DTOを使い、ドメイン型に変換する。詳細は [境界防御](/docs/kamae-rs/boundary-defense/) を優先する。

デシリアライズが検証を迂回したり不可能な状態を許したりする場合、ドメインエンティティに直接 `Deserialize` を付けない。

出力が意図的でsecretを含まない読み取りモデルでは、ドメインへの `Serialize` も許容されうる。PIIについてはredactionを制御する明示的なresponse DTOをシリアライズする。

### 検証付き値オブジェクトに `try_from` を使う

小さな不変条件付き値オブジェクトでは、serdeパスが通常コードと同じ検証コンストラクタに委譲するなら `Deserialize` も許容される：

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

ID、メール、スラッグ、有界数量などのリーフ値オブジェクト向け。集約、エンティティ、state型、コマンド、複数フィールドをまとめて検証するものはDTO -> `TryFrom` を優先する。

テストやpersistenceの都合だけで、不変条件付き型に無制限 `Serialize`/`Deserialize` をderiveしない。シリアライズ形式が公開契約でないならDTOまたはrow型に留める。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`、`TryFrom` が型付き error enum を返す | [境界防御](/docs/kamae-rs/boundary-defense/) |
| `serde` + `sqlx` | row struct のみ `FromRow`、ドメインへ `TryFrom` | [境界防御](/docs/kamae-rs/boundary-defense/#database-rows-sqlxfromrow)、[永続化、集約、イベント](/docs/kamae-rs/persistence-events/) |
| `serde` + events | ドメイン event enum に `#[serde(tag = "event_type")]` | [永続化、集約、イベント](/docs/kamae-rs/persistence-events/#event-serde-representation) |
| `serde` + `garde` | `TryFrom` 前に DTO を `garde` で検証 | [garde](#garde) |

## validator

プロジェクトがderiveベースのリクエスト検証をすでに使う場合、DTO向け `validator` を使う。

検証済みDTOもドメインnewtypeに変換する。validation deriveはDTO境界をチェックする。ドメインコンストラクタが他のすべての構築経路の不変条件を保つ。

```rust
#[derive(serde::Deserialize, validator::Validate)]
pub struct CreateUserDto {
    #[validate(email)]
    email: String,
}
```

## garde

プロジェクトがcomposableな検証ルール付きderiveベース検証を好む場合、DTO向け `garde` を使う。

ドメインコンストラクタを権威とする。DTO検証ルールだけをドメイン不変条件の唯一の根拠としない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `garde` + `serde` + axum | `Json<Dto>` -> `dto.validate()` -> `Command::try_from(dto)` | [境界防御](/docs/kamae-rs/boundary-defense/#http-extractors-axum--actix-web) |
| `garde` + `thiserror` | adapter で `garde` report を境界 error enum にマップ | [エラーハンドリング](/docs/kamae-rs/error-handling/) |
| `garde` + leaf newtypes | DTO フィールド検証 + ドメイン newtype 向け `TryFrom` | [ドメインモデリング](/docs/kamae-rs/domain-modeling/) |

`garde` はDTO形状を検証する。`TryFrom` はドメイン意味（フィールド横断ルール、テナントスコープ、ID意味論）の権威のままである。

## nutype

プロジェクトがすでに `nutype` を使う場合、または多数の検証付きnewtypeでボイラープレートが繰り返される場合はnewtype向けに使う。詳細は [ドメインモデリング](/docs/kamae-rs/domain-modeling/) を優先する。

フィールドはprivateと生成コンストラクタを優先する。型名は意味論的に保つ（`EmailAddress`、`OrderId`、`MoneyAmount`）。意味をぼかす汎用wrapperは避ける。

## secrecy

`Debug` 出力に現れてはならず、メモリ上に必要以上残してはならない資格情報などのsecret向けに `secrecy` を使う。詳細は [PII 保護](/docs/kamae-rs/pii-protection/) を優先する。

個人データ（PII）は `Redacted<T>` またはcustom `Debug` 付きドメインnewtypeを優先する。

secretは `SecretString` または `SecretBox` 周りのプロジェクト固有wrapperで保持する。`ExposeSecret` 経由の狭いadapter関数でのみ値を露出する。

露出したsecret値をerrorバリアントに含めない。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `secrecy` + adapter | payment/auth モジュールのみ `ExposeSecret` | [PII 保護](/docs/kamae-rs/pii-protection/) |
| `secrecy` + `tracing` | `SecretString` をログしない。資格情報 struct は `skip` | [PII 保護](/docs/kamae-rs/pii-protection/#tracing-and-span-fields) |
| PII vs secrets | 個人データは `Redacted<T>`、資格情報は `secrecy` | [PII 保護](/docs/kamae-rs/pii-protection/#secrecy-vs-redactedt--when-to-use-which) |

## proptest

crateがすでに依存している場合、またはproperty testが入力全体の法則を最も明確にカバーできる場合に、ドメイン不変条件テスト向け `proptest` を使う。generator設計、state machine property、CI予算、regressionファイルは [プロパティベーステスト](/docs/kamae-rs/property-based-tests/) を参照する。

`[dev-dependencies]` に置く。publicコンストラクタを呼ぶstrategyを優先し、無効なドメイン状態を直接構築しない。

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn round_trip(input in strategy()) {
        // assert law
    }
}
```
