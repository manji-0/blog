---
title: "テストデータ"
sidebar:
  order: 10
---

> **いつ読むか:** フィクスチャ、ファクトリー、プロパティベーステスト、遷移テスト、境界テスト、永続化リトライテストを追加するとき。
> **関連:** [`state-transitions.md`](/docs/kamae/python/references/state-transitions/)、[`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/)、[`logging-metrics.md`](/docs/kamae/python/references/logging-metrics/)。

## 公開経路でフィクスチャを構築する

フィクスチャは本番と同じ Pydantic アダプター、コンストラクタ、コマンドビルダー、遷移関数を通過すべきである。テストが明示的に破損入力またはマイグレーション互換性についてである場合を除き、生 dict、`model_construct`、部分リテラルは避ける。

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

重要なワークフローでは次をテストする:

- 成功する遷移。
- 拒否される遷移または前提条件。
- 遷移前の認可とテナント拒否。
- コントローラー境界での網羅的エラーマッピング。
- 期待されるイベントバージョンとアグリゲート ID を持つドメインイベント。

## 境界と可観測性をテストする

境界テストには未知フィールド、不正 DTO、必須フィールド欠落、デフォルト付きフィールド、不正判別子値、DB 行再水和、検証エラーマッピングを含める。

可観測性テストでは、マスキングされたログ、安全なエラーメッセージ、安全なメトリクスラベル、機密データがあるときのレスポンス DTO シリアライズを検証する。

識別子方針については、[`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) のティアルールをアサートする:

- Tier A/B の値がログ、トレース、エラー、メトリクスラベルに決して現れない。
- Tier C/D の値は構造化フィールドにのみ現れ、ログメッセージ文字列内には現れない。
- メトリクスエクスポートは Tier E ラベルのみを使う。

## 永続化とリトライ振る舞いをテストする

永続化を変更するとき、DB 制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、冪等性キー、アウトボックス挿入、イベントバージョン互換性をカバーする。

純粋ユースケーステストにはフェイクリポジトリを使う。トランザクションと制約の振る舞いにはアダプター/統合テストを使う。

## 安定不変条件にはプロパティベーステストを使う

不変条件が多くの入力で成り立つべきときは [Hypothesis](https://hypothesis.readthedocs.io/) またはプロジェクトのプロパティテストライブラリを使う。PBT は遷移が純粋関数で不変条件が明示的なため、Kamae Python と相性が良い。

```bash
uv add --dev hypothesis
```

PBT に適した対象:

- 値オブジェクトコンストラクタと検証ルール。
- `TypeAdapter` 経由のパーサー/フォーマッタ往復。
- 状態機械遷移法則（下記参照）。
- 金額演算、単位変換、タイムスタンプ境界ルール。
- マスキングヘルパーと安全シリアライズ。

生成値は依然として公開コンストラクタまたは Pydantic アダプターを通過すべきである。プライベート/生フィールドを埋めるジェネレーターは、本番コードが構築できない状態を誤ってテストしうる。

### 状態遷移法則

各遷移について、許可されたすべての入力で成り立つべき性質をテストする:

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

ワークフローに小さな状態空間があるとき、多段法則は `st.builds` または連鎖遷移で合成する。各プロパティは 1 不変条件に焦点を当て、失敗時のシュリンクを容易にする。

### 往復とアダプタープロパティ

```python
from hypothesis import given, strategies as st


@given(st.builds(Waiting, ...))
def test_taxi_request_round_trip(state: Waiting) -> None:
    payload = state.model_dump(mode="json")
    parsed = TaxiRequestAdapter.validate_python(payload)
    assert parsed == state
```

コンストラクタが本番と同じ経路のときだけ `hypothesis.strategies.from_type` を使う。制約フィールドを持つ Pydantic モデルには明示的 `st.builds` を優先する。

### シュリンクと再現性

Hypothesis は失敗例を自動でシュリンクする。CI でプロパティが失敗したら、`@reproduce_failure` ブロブをコピーするか、失敗出力の `hypothesis seed=...` で実行する。

例ベースとプロパティベーステストが同じ構築ヘルパーを共有するよう、フィクスチャ横にカスタム戦略を登録する。
