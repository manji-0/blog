---
title: "テストデータ"
sidebar:
  order: 10
---

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->

> **いつ読むか:** フィクスチャ、ファクトリ、property-based test、遷移テスト、境界テスト、persistence リトライテストを追加するとき。
> **関連:** [`state-transitions.md`](/docs/kamae-rs/state-transitions/)、[`logging-metrics.md`](/docs/kamae-rs/logging-metrics/)、[`property-based-tests.md`](/docs/kamae-rs/property-based-tests/)。

## public 経路でフィクスチャを構築する

フィクスチャは本番と同じ constructor、`TryFrom` adapter、command builder、遷移関数を通すべき。テストが破損入力、移行互換、デシリアライズ hardening を明示的に扱う場合を除き、private フィールドを設定する raw struct リテラルは避ける。

```rust
fn request_id(value: &str) -> RequestId {
    RequestId::new(value.to_owned()).expect("fixture request id is valid")
}
```

フィクスチャ helper が固定値を使うなら、helper または assertion メッセージで不変条件に名前を付ける。

helper は `tests/support/`、`#[cfg(test)] mod test_support`、crate ローカル `mod tests` で共有。fake port パターンは [`dev-environment.md`](/docs/kamae-rs/dev-environment/#fake-ports-and-test-fixtures) 参照。

## state machine のエッジをカバーする

重要ワークフローでは次をテスト:

- 成功遷移
- 拒否遷移または前提条件
- 遷移前の認可とテナント拒否
- handler またはユースケース境界での網羅的 error マッピング
- 期待 event version と aggregate ID を持つ domain event 発行

```rust
#[test]
fn assign_driver_rejects_non_waiting_state() {
    let en_route = en_route_fixture();
    let err = assign_driver(en_route, driver_id("d1"), Utc::now()).unwrap_err();
    assert!(matches!(err, AssignDriverError::InvalidState { .. }));
}
```

compile-time state 安全性が中核約束なら `trybuild` で compile-fail を追加（下記参照）。

## 境界と observability をテストする

境界テスト: 未知フィールド、不正 DTO、必須欠落、default フィールド、不正 discriminator、DB row 再水和、検証 error マッピング。

observability テスト: redacted log、安全 error メッセージ、安全 metrics label、敏感データがあるときの response DTO シリアライズ。

識別子ポリシーは [`logging-metrics.md`](/docs/kamae-rs/logging-metrics/) の tier ルールを assert:

- Tier A/B 値は log、trace、error、metrics label に現れない
- Tier C/D 値は structured field のみ。log メッセージ文字列内には入れない
- metrics export は Tier E label のみ

```rust
#[test]
fn api_error_does_not_echo_email() {
    let err = map_domain_error(DomainError::DuplicateEmail { email: email_fixture() });
    let body = err.into_response().into_body();
    let text = body_to_string(body);
    assert!(!text.contains("user@example.com"));
}
```

## persistence とリトライ挙動をテストする

persistence 変更時: DB 制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、idempotency key、outbox insert、event version 互換。

純粋ユースケースは fake repository、トランザクションと制約は adapter/integration。ドメインとユースケースは Docker 不要。container は infrastructure crate 用（[`dev-environment.md`](/docs/kamae-rs/dev-environment/#test-layers) 参照）。

## compile-time state 安全性をテストする

重要な state machine 保証には、プロジェクトがすでに `trybuild` を使う、または不変条件が central  enough なら compile-fail を追加。

```rust
// tests/compile_fail/assign_from_en_route.rs
fn main() {
    let _ = assign_driver(en_route_fixture(), driver_id("d1"), Utc::now());
}
```

```toml
# tests/compile_fail.rs
[package]
name = "domain-compile-fail"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
trybuild = "1"

[[test]]
name = "compile_fail"
harness = false
```

成功遷移、error マッピング、DTO 変換、PII redaction は通常の単体テスト。

## 安定不変条件に property-based test

多入力で成り立つ不変条件には `proptest`（またはプロジェクトの property-test ライブラリ）。遷移が純関数で不変条件が明示的な Kamae Rust に合う。

```toml
[dev-dependencies]
proptest = "1"
```

向く PBT 対象:

- 値オブジェクト constructor と検証ルール
- parser/formatter と DTO `TryFrom` 往復
- state machine 遷移法則（[`property-based-tests.md`](/docs/kamae-rs/property-based-tests/#model-state-machines-as-strategies) 参照）
- 金額算術、単位変換、タイムスタンプ境界
- redaction helper と安全 `Display`/`Debug`

生成値も public constructor または境界 adapter を通す。private フィールドを埋める generator は本番が構築できない state を誤ってテストする。

### 遷移法則

各遷移で、許可入力すべてに成り立つ property:

| Law | Example |
| --- | --- |
| Identity preserved | `result.request_id() == source.request_id()` |
| Discriminator changes correctly | `assign_driver(waiting, ...)` が `EnRouteRequest` を返す |
| Rejected paths stay unreachable | 非法ソース state が遷移関数に到達しない |
| Event count/shape | event 1 つ、aggregate ID が state と一致 |

state space が小さいワークフローでは chained 遷移で multi-step 法則。1 property 1 不変条件で shrink をきれいに。

### 往復と adapter property

```rust
proptest! {
    #[test]
    fn waiting_request_round_trip(state in waiting_request_strategy()) {
        let dto = WaitingRequestDto::from(&state);
        let parsed = WaitingRequest::try_from(dto)?;
        prop_assert_eq!(parsed, state);
    }
}
```

制約フィールドは public constructor から組んだ明示 strategy を優先。shrink、regression、CI 予算は [`property-based-tests.md`](/docs/kamae-rs/property-based-tests/) 参照。

## テスト層

不変条件を証明できる最下層でテスト:

| 層 | テスト対象 | I/O |
| --- | --- | --- |
| Domain unit | constructors, transitions, domain errors | None |
| Use case | orchestration with fake ports | None |
| Adapter unit | SQL mapping, DTO `TryFrom`, redaction | Fake or in-memory |
| API/integration | handler -> use case -> adapter | Test DB or container optional |
| Property | input-wide laws | None in the property body |

PR 前に [`quality-gates.md`](/docs/kamae-rs/quality-gates/) のテストコマンドを実行。

レビューでは、public フィールドや生リテラルによる無効状態の構築、非法遷移テストの欠如、ミューテータの不変条件テスト欠如、永続化 / リトライ境界の未テスト、境界変更の検証不足を指摘する。

## レビュー観点

### 19.1 テストはコンストラクタと変換を検証しているか — Medium

public フィールドや生リテラルで無効なドメイン状態を作るテストを指摘する。

目的がマイグレーション互換、デシリアライズ強化、破損行処理、プロパティ縮小、コンパイル失敗カバレッジである無効構築のテストには指摘しない。

### 19.2 主要な非法遷移はカバーされているか — Medium

拒否される遷移、DTO 変換失敗、エラーマッピングのテストがない状態機械コードを指摘する。

### 19.3 設計の中心がコンパイル時安全性ならそれをテストしているか — Low

コンパイル時状態安全性が中核の約束で、追加依存が正当化されるときだけ `trybuild` コンパイル失敗テストを提案する。

### 19.4 不変条件を保つミューテータはテストされているか — Medium

クロスフィールド不変条件、単位、タイムスタンプ、認可 / テナント拒否のテストなしに、新しいセッタ、パッチコマンド、更新メソッドを指摘する。

### 19.5 永続化とリトライの境界はテストされているか — Medium

DB 制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、リトライ挙動、アウトボックス / イベントバージョン互換のカバレッジなしに、リポジトリ / ユースケース変更を指摘する。

### 19.6 境界と可観測性の失敗はテストされているか — Medium

未知フィールド、既定値フィールド、不正 DTO、マスキングされたログ / エラー、リードモデルの安全なシリアライズのテストなしに、境界変更を指摘する。

### 19.7 入力全体の不変条件はプロパティテストでカバーされているか — Low

[`property-based-tests.md`](/docs/kamae-rs/property-based-tests/) も照合する。値オブジェクト検証、往復、遷移法則、冪等性に例表カバレッジがなく、ジェネレータが公開コンストラクタを使えるときはプロパティテストを提案する。

小さな閉じた列挙、自明なゲッタ、コンパイル時状態型で既に守られているコードにプロパティテストは不要。
