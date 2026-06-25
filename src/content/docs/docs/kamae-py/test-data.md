---
title: "テストデータ"
sidebar:
  order: 10
---

テストが本番と違う経路（生dict、`model_construct`、ORM行の直組み立て）でドメイン状態を作ると、本番では起きない無効状態を「通る」と誤認する。フィクスチャは本番と同じコンストラクタ・アダプター・遷移を通す。

遷移とイベントの期待は [状態遷移](/docs/kamae-py/state-transitions/)、ログとIDのアサーションは [PII と観測経路の保護](/docs/kamae-py/pii-protection/) と [ロギングとメトリクス](/docs/kamae-py/logging-metrics/) に従う。

## 公開経路でフィクスチャを構築する

フィクスチャは本番と同じPydanticアダプター、コンストラクタ、コマンドビルダー、遷移関数を通過すべきだ。テスト対象が明示的に破損入力またはマイグレーション互換性である場合を除き、生dict、`model_construct`、部分リテラルは避ける。

```python
def waiting_request(now: datetime) -> Waiting:
    return Waiting(
        request_id=UUID("00000000-0000-0000-0000-000000000001"),
        passenger_id=UUID("00000000-0000-0000-0000-000000000002"),
        created_at=now,
    )
```

フィクスチャヘルパーがハードコード値を使うなら、ヘルパーまたはアサーションメッセージに不変条件名を付ける。

## 状態機械のエッジをカバーする

ハッピーパスだけのテストは、本番で最も多い障害（非法遷移、認可の取りこぼし、エラーの誤マッピング）を見逃しやすい。重要なワークフローでは、少なくとも次を意識的にテストする：

- 成功する遷移。
- 拒否される遷移または前提条件。
- 遷移前の認可とテナント拒否。
- コントローラー境界での網羅的エラーマッピング。
- 期待されるイベントバージョンとアグリゲートIDを持つドメインイベント。

## 境界と可観測性をテストする

境界テストでは、未知フィールド、不正なDTO、必須フィールドの欠落、デフォルト付きフィールド、不正な判別子値、DB行の再水和、検証エラーのマッピングをカバーする。

可観測性テストでは、マスキングされたログ、安全なエラーメッセージ、安全なメトリクスラベル、機密データがあるときのレスポンスDTOシリアライズを検証する。

識別子方針は [PII と観測経路の保護](/docs/kamae-py/pii-protection/) のティア別ルールを検証する：

- Tier A/Bの値がログ、トレース、エラー、メトリクスラベルに決して現れない。
- Tier C/Dの値は構造化フィールドにのみ現れ、ログメッセージ文字列内には現れない。
- メトリクスエクスポートはTier Eラベルのみを使う。

## 永続化とリトライ振る舞いをテストする

永続化の実装を変更するときは、正常系に加えて、次の失敗や競合のケースもテストでカバーする。対象には、DB制約違反、楽観的ロック競合、トランザクションロールバック、重複コマンド、冪等性キー、アウトボックス挿入、イベントバージョン互換性が含まれる。

ユースケースの純粋な分岐はフェイクリポジトリで十分なことが多い。一方、`SELECT FOR UPDATE` やDB制約でしか再現しない競合は、アダプター統合テストで確認する。フェイクだけに頼ると「テストは通るが本番でversion conflictが起きる」状態に陥りやすい。

## 安定不変条件にはプロパティベーステストを使う

不変条件が多くの入力で成り立つべきときは [Hypothesis](https://hypothesis.readthedocs.io/) またはプロジェクトのプロパティテストライブラリを使う。PBTは遷移が純粋関数で不変条件が明示的なため、Kamae Pythonと相性が良い。

```bash
uv add --dev hypothesis
```

PBTに適した対象：

- 値オブジェクトコンストラクタと検証ルール。
- `TypeAdapter` 経由のパーサー/フォーマッタ往復。
- 状態機械遷移法則（下記参照）。
- 金額演算、単位変換、タイムスタンプ境界ルール。
- マスキングヘルパーと安全シリアライズ。

生成値は依然として公開コンストラクタまたはPydanticアダプターを通過すべきだ。プライベート/生フィールドを埋めるジェネレーターは、本番コードが構築できない状態を誤ってテストしうる。

### 状態遷移法則

各遷移について、許可されたすべての入力で成り立つべき性質をテストする：

| 法則 | 例 |
| --- | --- |
| アイデンティティ保持 | `result.request_id == source.request_id` |
| 判別子の正しい変化 | `assign_driver(waiting, ...).kind == "en_route"` |
| 拒否経路は到達不能 | 無効ソース状態は遷移関数に到達しない |
| イベント数/形状 | `len(outcome.events) == 1` かつイベントアグリゲート ID が状態と一致 |

```python
from datetime import datetime, timezone
from uuid import UUID

from hypothesis import given, strategies as st


@given(
    request_id=st.uuids(),
    passenger_id=st.uuids(),
    driver_id=st.uuids(),
    created_at=st.datetimes(timezones=st.just(timezone.utc)),
    assigned_at=st.datetimes(timezones=st.just(timezone.utc)),
)
def test_assign_driver_preserves_identity(
    request_id: UUID,
    passenger_id: UUID,
    driver_id: UUID,
    created_at: datetime,
    assigned_at: datetime,
) -> None:
    waiting = Waiting(
        request_id=request_id,
        passenger_id=passenger_id,
        created_at=created_at,
    )
    en_route = assign_driver(waiting, driver_id, assigned_at)

    assert en_route.request_id == request_id
    assert en_route.passenger_id == passenger_id
    assert en_route.driver_id == driver_id
    assert en_route.kind == "en_route"
```

ワークフローに小さな状態空間があるとき、多段法則は `st.builds` または連鎖遷移で合成する。各プロパティは1不変条件に焦点を当て、失敗時のシュリンクを容易にする。

### 往復とアダプタープロパティ

```python
from hypothesis import given, strategies as st


@given(st.builds(Waiting, ...))
def test_taxi_request_round_trip(state: Waiting) -> None:
    payload = state.model_dump(mode="json")
    parsed = TaxiRequestAdapter.validate_python(payload)
    assert parsed == state
```

コンストラクタが本番と同じ経路のときだけ `hypothesis.strategies.from_type` を使う。制約フィールドを持つPydanticモデルには明示的 `st.builds` を優先する。

### シュリンクと再現性

Hypothesisは失敗例を自動でシュリンクする。CIでプロパティが失敗したら、`@reproduce_failure` ブロブをコピーするか、失敗出力の `hypothesis seed=...` で実行する。

例ベースとプロパティベーステストが同じ構築ヘルパーを共有するよう、フィクスチャ横にカスタム戦略を登録する。

## レビュー観点

### テストはコンストラクタと変換を通すか — Medium

`model_construct`、生dict、公開フィールドラテラルで無効ドメイン状態を作るテストを指摘する。

移行互換、デシリアライズ強化、破損行処理、プロパティ縮小、ネガティブパスカバレッジが目的の無効構築は指摘しない。

### 不変条件を保つミューテータはテストされているか — Medium

クロスフィールド不変条件、単位、タイムスタンプ、認可/テナント拒否のテストなしに新しいsetter、パッチコマンド、更新メソッドを指摘する。

### 主要な無効遷移はカバーされているか — Medium

拒否された遷移、DTO変換失敗、エラーマッピングのテストがない状態機械コードを指摘する。

### 境界とオブザーバビリティの失敗はテストされているか — Medium

未知フィールド、デフォルト付きフィールド、不正DTO、マスクされたログ/エラー、読み取りモデルの安全シリアライズのテストなしに境界変更を指摘する。

識別子階層のアサーションは [PII と観測経路の保護](/docs/kamae-py/pii-protection/) と照合する。

### 永続化とリトライのエッジはテストされているか — Medium

DB制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、リトライ挙動、アウトボックス/イベントバージョン互換のカバレッジなしにリポジトリ/ユースケース変更を指摘する。

### 入力全体の不変条件はプロパティテストでカバーされているか — Low

値オブジェクトバリデーション、ラウンドトリップ、遷移法則、冪等性に例表カバレッジがなく、公開コンストラクタでジェネレータが使えるときHypothesisプロパティテストを提案する。

小さな閉じた列挙、自明なゲッター、静的状態型で既に守られているコードにプロパティテストは要求しない。

### 型と網羅性保証は設計の中心ならテストされているか — Low

静的状態安全性が中核の約束で追加コストが正当化されるときだけ、mypy/pyright厳格カバレッジやランタイム `assert_never` テストを提案する。

