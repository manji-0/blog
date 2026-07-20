---
title: "プロパティベーステスト"
sidebar:
  order: 10
---

例表だけのテストは「書いた通り動く」ことは示すが、入力空間全体の法則は示さない。`proptest` は不変条件・往復・遷移の拒否ルールを広い入力で叩くのに向く。

フィクスチャの組み立ては [テストデータ](/projects/kamae-rs/test-data/)、状態機械の形は [状態遷移](/projects/kamae-rs/state-transitions/)、型の前提は [ドメインモデリング](/projects/kamae-rs/domain-modeling/) と [クレートガイド（proptest）](/projects/kamae-rs/crate-guides/#proptest) を参照する。

<!-- constrained-by ./test-data.md -->
<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->

## プロパティテストがコストに見合う場合

不変条件が多入力にわたって成り立ち、例表は不完全または保守が面倒なときproperty-based testを使う。

向いている対象：

- 値オブジェクトコンストラクタと検証ルール
- parse/formatとDTO `TryFrom` の往復
- state machine遷移法則と拒否ルール
- 金額、単位、タイムスタンプ境界挙動
- 冪等handlerとprojectionリプレイ
- redactionと安全 `Display`/`Debug` 契約

挙動が小さな閉じたケース集合、propertyが構造上自明、失敗が有用な最小例にshrinkしない場合は通常の単体テストを優先。

## ドメイン crate では `proptest` を優先

shrinking、regressionファイル、 composable strategyが不変条件テストに合うため、サーバー側ドメインcrateのデフォルト推奨は `proptest`。プロジェクトがすでに標準化している場合のみ `quickcheck`。

`proptest` を `[dev-dependency]` に追加。generatorは `#[cfg(test)]` モジュールまたは `tests/support` に置き、本番ドメインコードには入れない。

```toml
[dev-dependencies]
proptest = "1"
```

## public コンストラクタ経由で生成する

generatorは本番パスが構築できる値を出す必要がある。strategyがraw structリテラルやprivateフィールド設定をすると、テストは通っても実呼び出しは失敗しうる。

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

無効入力が重要ならraw stringまたはDTOを生成し `TryFrom`/constructor拒否をassert — 無効データ周りにドメイン型を構築しない。

## property を明示的に符号化する

テスト内で法則に名前を付け、1 propertyに1焦点。

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

前提を満たさない入力については、空虚な成功をアサートせず、`prop_assume!` で棄却する。

## state machine を strategy としてモデル化する

ライフサイクルルールでは到達可能stateだけ出すstrategyを組み、遷移結果をassertする。

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

非法遷移ではinvalidなsource stateおよびactionを生成し、特定errorバリアントをassert — `is_err()` だけにしない。

## shrinking をドメイン安全に保つ

縮小処理がコンストラクタを迂回する値を生成しないようにする。空文字、ゼロ金額、あり得ない列挙バリアントへ縮小された場合は、ストラテジを修正するか `prop_assume!` を追加する。

自明でない入力のバグには `proptest-regressions` で再現可能失敗を保存：

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

実バグ修正を表すregressionファイルはコミットする。

## 非決定論/I/O 境界をデフォルトで property test しない

property testは純粋ドメイン関数と、注入clockまたは固定フィクスチャの決定論adapter向け。

デフォルトで避ける：

- `proptest!` 内のlive DBまたはnetwork
- シードclock strategyなしのwall-clock時刻
- テスト対象としてのloggingやmetrics副作用

生成payloadでDTO変換、redaction、errorマッピングをテスト。repositoryは制御不能I/Oではなくfakeまたはin-memory portで。

## 既存テスト層との統合

| 層 | プロパティテストの役割 |
| --- | --- |
| Value object | constructor 受理/拒否、往復 |
| Domain transition | 法則、非法遷移エラー |
| Use case | fake port での idempotency（実 infra ではない） |
| Boundary DTO | 不正/生成 payload が型付きエラーにマップ |
| Projection | リプレイ順序と checkpoint idempotency |

読みやすいシナリオはexampleベース、型安全性約束はcompile-fail（[テストデータ](/projects/kamae-rs/test-data/) 参照）。

## CI と実行予算

property testはケース数を増やす。ドメインcrateでは通常デフォルトで足りる。デバッグ時のみローカルでcasesを上げる。

- crateが小さく高速でない限りCIでは `ProptestConfig::with_cases` をデフォルト近くに保つ
- 特に遅いpropertyは文書化し別CI jobで走らせる場合のみ `#[ignore]`
- 再現性を犠牲にしない限りCIでshrinkingを無効化しない

## 検出ヒント

`Cargo.toml` に `proptest` または `quickcheck` があるとき、このガイドと不変条件のトピックガイド（modeling、state transitions、boundaries、persistence）を [テストデータ](/projects/kamae-rs/test-data/) と一緒に読み込む。

レビューでは、publicコンストラクタを迂回するgenerator、法則を述べない `is_ok()` のみのアサーション、破棄すべき入力の曖昧な扱い、非法遷移の `is_err()` のみ確認、ライブI/Oへのproperty testを指摘する。

## レビューで見るところ

`proptest` / `quickcheck` 戦略が `new` / `try_new` / `TryFrom` ではなく生リテラルで組み立てていないか。ライブDBや壁時計へ当たる `proptest!` になっていないかも見る。ドメイン外入力は `prop_assume!` で捨て、法則を述べず `is_ok()` だけのプロパティになっていないか。非法遷移は特定エラーまで見ているか（[状態遷移](/projects/kamae-rs/state-transitions/)）。微妙なバグなら `proptest-regressions` を残せるか。
