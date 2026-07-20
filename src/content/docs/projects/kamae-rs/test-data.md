---
title: "テストデータ"
sidebar:
  order: 10
---

テストがpublicフィールドリテラルや生ORM行で状態を組み立てると、本番では構築できない無効状態を「通る」と誤認する。フィクスチャは公開コンストラクタと本番と同じポート経路を通す。

遷移の期待は [状態遷移](/projects/kamae-rs/state-transitions/)、広い入力の法則は [プロパティベーステスト](/projects/kamae-rs/property-based-tests/)、観測のアサーションは [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) を参照する。

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->


## public 経路でフィクスチャを構築する

フィクスチャは本番と同じconstructor、`TryFrom` adapter、command builder、遷移関数を通すべき。テストが破損入力、移行互換、デシリアライズhardeningを明示的に扱う場合を除き、privateフィールドを設定するraw structリテラルは避ける。

```rust
fn request_id(value: &str) -> RequestId {
    RequestId::new(value.to_owned()).expect("fixture request id is valid")
}
```

フィクスチャhelperが固定値を使うなら、helperまたはassertionメッセージで不変条件に名前を付ける。

helperは `tests/support/`、`#[cfg(test)] mod test_support`、crateローカル `mod tests` で共有。fake portパターンは [開発環境](/projects/kamae-rs/dev-environment/#fake-ports-and-test-fixtures) 参照。

## state machine のエッジをカバーする

ハッピーパスだけでは、非法遷移や認可の取りこぼし、エラーの誤マッピングを本番まで持ち込みやすい。重要なワークフローでは、少なくとも次を意識的にテストする：

- 成功遷移
- 拒否遷移または前提条件
- 遷移前の認可とテナント拒否
- handlerまたはユースケース境界での網羅的errorマッピング
- 期待event versionとaggregate IDを持つdomain event発行

```rust
#[test]
fn assign_driver_rejects_non_waiting_state() {
    let en_route = en_route_fixture();
    let err = assign_driver(en_route, driver_id("d1"), Utc::now()).unwrap_err();
    assert!(matches!(err, AssignDriverError::InvalidState { .. }));
}
```

compile-time state安全性が中核約束なら `trybuild` でcompile-failを追加（下記参照）。

## 境界と observability をテストする

境界テストでは、未知フィールド、不正なDTO、必須フィールドの欠落、デフォルト付きフィールド、不正な判別子、DB行の再水和、検証エラーのマッピングをカバーする。

observabilityテスト： redacted log、安全errorメッセージ、安全metrics label、敏感データがあるときのresponse DTOシリアライズ。

識別子ポリシーは [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) のtierルールをassert:

- Tier A/B値はlog、trace、error、metrics labelに現れない
- Tier C/D値はstructured fieldのみ。logメッセージ文字列内には入れない
- metrics exportはTier E labelのみ

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

永続化の実装を変更するときは、正常系に加えて次の失敗や競合のケースもテストでカバーする。DB制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、idempotency key、outbox insert、event version互換が対象である。

純粋なユースケースはフェイクリポジトリで十分である。トランザクションと制約に依存する挙動は、アダプター統合テストで確認する。ドメインとユースケースのテストにDockerは不要である。コンテナはインフラストラクチャcrate向けである（[開発環境](/projects/kamae-rs/dev-environment/#test-layers) を参照）。

## compile-time state 安全性をテストする

重要な状態機械の保証については、プロジェクトがすでに `trybuild` を採用している場合、あるいは不変条件が設計の中心に位置するほど重要な場合に、コンパイル失敗テストを追加する。

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

成功遷移、errorマッピング、DTO変換、PII redactionは通常の単体テスト。

## 安定した不変条件にはプロパティベーステストを使う

多入力で成り立つ不変条件には `proptest`（またはプロジェクトのproperty-testライブラリ）。遷移が純関数で不変条件が明示的なKamae Rustに合う。

```toml
[dev-dependencies]
proptest = "1"
```

向くPBT対象：

- 値オブジェクトconstructorと検証ルール
- parser/formatterとDTO `TryFrom` 往復
- state machine遷移法則（[プロパティベーステスト](/projects/kamae-rs/property-based-tests/#model-state-machines-as-strategies) 参照）
- 金額算術、単位変換、タイムスタンプ境界
- redaction helperと安全 `Display`/`Debug`

生成値もpublic constructorまたは境界adapterを通す。privateフィールドを埋めるgeneratorは本番が構築できないstateを誤ってテストする。

### 遷移法則

各遷移で、許可入力すべてに成り立つproperty:

| Law | Example |
| --- | --- |
| Identity preserved | `result.request_id() == source.request_id()` |
| Discriminator changes correctly | `assign_driver(waiting, ...)` が `EnRouteRequest` を返す |
| Rejected paths stay unreachable | 非法ソース state が遷移関数に到達しない |
| Event count/shape | event 1 つ、aggregate ID が state と一致 |

状態空間が小さいワークフローでは、連鎖した遷移によって多段階の法則を検証する。1つのプロパティテストは1つの不変条件に集中し、失敗時の縮小を扱いやすくする。

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

制約フィールドはpublic constructorから組んだ明示strategyを優先。shrink、regression、CI予算は [プロパティベーステスト](/projects/kamae-rs/property-based-tests/) 参照。

## テスト層

不変条件を証明できる最下層でテスト：

| 層 | テスト対象 | I/O |
| --- | --- | --- |
| Domain unit | constructors, transitions, domain errors | None |
| Use case | orchestration with fake ports | None |
| Adapter unit | SQL mapping, DTO `TryFrom`, redaction | Fake or in-memory |
| API/integration | handler -> use case -> adapter | Test DB or container optional |
| Property | input-wide laws | None in the property body |

PR前に [品質ゲート](/projects/kamae-rs/quality-gates/) のテストコマンドを実行。

レビューでは、publicフィールドや生リテラルによる無効状態の構築、非法遷移テストの欠如、ミューテータの不変条件テスト欠如、永続化 / リトライ境界の未テスト、境界変更の検証不足を指摘する。

## レビューで見るところ

publicフィールドや生リテラルで無効状態を作るテストになっていないか（マイグレーション互換・破損行・`trybuild` などは除く）。クロスフィールド不変条件、非法遷移、DTO変換失敗、マスキングされたログ、楽観ロックや重複コマンドのカバレッジはあるか。例表がなく公開コンストラクタを使える値オブジェクトではプロパティテストを足せないか（[プロパティベーステスト](/projects/kamae-rs/property-based-tests/)）。コンパイル時状態安全性が中核なら `trybuild` も検討する。

