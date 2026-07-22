---
title: "ライブラリガイド"
sidebar:
  order: 5
  label: "ライブラリガイド（参照）"
---

FastAPI、Pydantic、SQLAlchemy、HypothesisはKamaeのドメイン規約を**補助**するライブラリである。トピック別リファレンスと矛盾する場合は、そちらを優先する。

ここでは「よくある組み合わせ」とデフォルトの置き場所をまとめる。個別の設計判断は [エラーハンドリング](/projects/kamae-py/error-handling/)、[境界防御](/projects/kamae-py/boundary-defense/)、[ドメインモデリング](/projects/kamae-py/domain-modeling/)、[PII と観測経路の保護](/projects/kamae-py/pii-protection/) を参照する。

| 用途 | ガイド付きライブラリ | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| HTTP API | `fastapi` | Starlette直書き、Django REST |
| 検証 / ドメインstate | `pydantic` v2 | dataclassesのみ、attrs |
| SQL / ORM | `sqlalchemy` 2.0 | Django ORM（同じport/mapper姿勢） |
| プロパティテスト | `hypothesis` | 例示テストのみ |

## fastapi

完全なパターンは [アプリケーション配線](/projects/kamae-py/application-wiring/)、[境界防御](/projects/kamae-py/boundary-defense/)、[エラーハンドリング](/projects/kamae-py/error-handling/) を優先する。本節はライブラリ固有のデフォルトのみ。

FastAPIは**インターフェース層**に留める。ルートはtransport DTOをパースし、ユースケースを呼び、`Result` / ドメインエラーをHTTPへマップする。ドメインパッケージは `fastapi` をimportしない。

### ルート → ユースケースの形

```python
from fastapi import APIRouter, Depends, Response, status


router = APIRouter()


@router.post("/requests/{request_id}/assign-driver", status_code=status.HTTP_204_NO_CONTENT)
async def assign_driver(
    request_id: UUID,
    body: AssignDriverBody,
    use_case: AssignDriverUseCase = Depends(get_assign_driver_use_case),
    actor: Actor = Depends(get_actor),
    clock: Clock = Depends(get_clock),
) -> Response:
    result = await use_case(
        actor=actor,
        request_id=request_id,
        driver_id=body.driver_id,
        now=clock.now(),
    )
    if result.is_err():
        raise http_error_for(result.error)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- `Depends` はコントローラ / コンポジションルートでのみport構築に使う — 純粋遷移の中ではない
- stateを返すときは明示response DTO。PIIを含みうるドメインモデルをそのままdumpしない

### 検証とエラー

- リクエストボディの形状失敗はFastAPIの `RequestValidationError` に任せる
- より深いアダプタのPydantic `ValidationError` は422へ。詳細はマスク — [境界防御](/projects/kamae-py/boundary-defense/)
- 期待されるドメイン失敗はユースケース別エラー共用体で安定ステータス（`404`、`409`、`403`）へ — [エラーハンドリング](/projects/kamae-py/error-handling/)

### lifespanとworker

プロセスプール、DBプール、OpenTelemetry exporterはFastAPI lifespan（または同等のアプリファクトリー）で配線する。ドメインモジュールのimport時にグローバルクライアントを作らない。外向きHTTPは [並行性と非同期](/projects/kamae-py/concurrency/)、[サービス境界](/projects/kamae-py/service-boundaries/) も併せて読む。

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| FastAPI + Pydantic v2 | Body DTO → command | 本ページ [pydantic](#pydantic) |
| FastAPI + SQLAlchemy | Sessionはアダプタのみ | 本ページ [sqlalchemy](#sqlalchemy) |
| FastAPI + OTel | ユースケース周りのspan | [ロギングとメトリクス](/projects/kamae-py/logging-metrics/) |

## hypothesis

完全なパターンは [テストデータ](/projects/kamae-py/test-data/) を優先する。本節はライブラリ固有のデフォルトのみ。

入力全体の法則を最も明確にカバーできるときに **dev** 依存としてHypothesisを足す：

```bash
uv add --dev hypothesis
```

### デフォルト

- **公開コンストラクタ**とPydanticアダプタ経由で値を生成する。privateフィールドや `model_construct` ではない
- 制約付きドメインモデルは無制限 `from_type` より明示 `st.builds(...)` を優先
- カスタムstrategyはフィクスチャ横に置き、例示テストとプロパティテストで構築ヘルパを共有
- 1プロパティ1不変条件。shrinkingを読みやすく保つ

```python
from hypothesis import given, strategies as st


@given(
    request_id=st.uuids(),
    passenger_id=st.uuids(),
    driver_id=st.uuids(),
    created_at=st.datetimes(timezones=st.just(timezone.utc)),
    assigned_at=st.datetimes(timezones=st.just(timezone.utc)),
)
def test_assign_driver_preserves_identity(...): ...
```

### 向いている対象

- 値オブジェクトのコンストラクタと検証ルール
- `TypeAdapter` の往復
- 状態遷移の法則（同一性、判別子、イベント形状）
- 金額 / 単位 / タイムスタンプ境界
- マスキングヘルパ

ケース集合が小さく閉じているなら通常のpytest表で十分。

### CIメモ

`@reproduce_failure` blobまたはCI失敗出力からseedをコピーする。strategyはフィクスチャ横に登録し、本番ドメインパッケージへgeneratorを置かない。

状態遷移の法則と往復例は [テストデータ](/projects/kamae-py/test-data/) のプロパティテスト節を参照。

## pydantic

完全なパターンは [ドメインモデリング](/projects/kamae-py/domain-modeling/)、[境界防御](/projects/kamae-py/boundary-defense/)、[状態遷移](/projects/kamae-py/state-transitions/) を優先する。本節はライブラリ固有のデフォルトのみ。

**Pydantic v2**（`pydantic>=2,<3`）を要求する。`TransitionOutcome[TState, TEvent]` などPEP 695ジェネリクスを使うなら **2.11+** を推奨。

### ドメインstateのデフォルト

```python
from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated, Literal


class Waiting(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["waiting"] = "waiting"
    request_id: UUID
    passenger_id: UUID
    created_at: datetime


TaxiRequest = Annotated[
    Waiting | EnRoute | Completed,
    Field(discriminator="kind"),
]
TaxiRequestAdapter = TypeAdapter(TaxiRequest)
```

- ドメインstate: `extra="forbid"`、`frozen=True`
- 外部DTO: 多くの場合 `strict=True` — [境界防御](/projects/kamae-py/boundary-defense/)
- 未知データは境界でのみ `TypeAdapter.validate_python` / `validate_json`

### 避ける

| アンチパターン | 優先 |
| --- | --- |
| 信頼できない入力への `model_construct` | `TypeAdapter` / `model_validate` |
| 1モデル上のoptional status blob | 判別 `kind` variant |
| Pydantic v1 `class Config` / `.parse_obj` | v2 `model_config` / `model_validate` |
| FastAPI型をimportするドメインモデル | transport DTOを分離 |

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| `pydantic` + ports | 凍結state、薄いユースケース | [状態遷移](/projects/kamae-py/state-transitions/) |
| `pydantic` + SQLAlchemy | 行 ↔ ドメインマッパー | [ORM アダプター](/projects/kamae-py/orm-adapters/)、[sqlalchemy](#sqlalchemy) |
| `pydantic` + FastAPI | Request DTO → command | [fastapi](#fastapi) |
| ホットパス / `msgspec` | 境界で速く、内側はドメイン | [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) |

## sqlalchemy

完全なパターンは [ORM アダプター](/projects/kamae-py/orm-adapters/)、[永続化、集約、イベント](/projects/kamae-py/persistence-events/)、[境界防御](/projects/kamae-py/boundary-defense/) を優先する。本節はライブラリ固有のデフォルトのみ。

プロジェクトがすでにSQLAlchemyに依存するなら **2.0** スタイル（`select()`、`mapped_column`、`AsyncSession`）を使う。ORMエンティティはinfrastructureに留め、アダプタ境界で凍結Pydanticドメインstateへマップする。

### レイヤリング

```text
ORM entity / Row  --mapper-->  Pydantic domain state
Session / transaction         --implements-->  RequestStore Protocol
```

ドメインとアプリケーションは `typing.Protocol` portのみに依存する。`sqlalchemy` をimportせず、`Session` / `AsyncSession` を保持しない。

### マッパーのデフォルト

- 明示 `to_domain(row) -> TaxiRequest` と `to_row(state) -> Entity` ヘルパを優先
- 判別子と不変条件を走らせるため `TypeAdapter`（またはコンストラクタ）で再水和
- 信頼済みDB値への `model_construct` はマッパー内のみ。理由を文書化 — [unsafe 境界](/projects/kamae-py/unsafe-boundaries/)

### トランザクション

begin/commitはユースケースが所有するアダプタメソッド（またはunit-of-work port）内。ドメイン遷移内ではない。集約stateとoutbox行は同一トランザクション — [永続化、集約、イベント](/projects/kamae-py/persistence-events/)

```python
async def save(
    self,
    state: TaxiRequest,
    events: list[DomainEvent],
    *,
    expected_version: int,
) -> None:
    async with self._session.begin():
        await self._update_state(state, expected_version=expected_version)
        await self._insert_outbox(events)
```

| スタック | パターン | トピックガイド |
| --- | --- | --- |
| SQLAlchemy + Pydantic | 行 ↔ 判別state | [ORM アダプター](/projects/kamae-py/orm-adapters/) |
| SQLAlchemy + 楽観ロック | `version` 列 + 競合エラー | [永続化、集約、イベント](/projects/kamae-py/persistence-events/) |
| Django ORMの代わり | 同じport/mapper姿勢 | [ORM アダプター](/projects/kamae-py/orm-adapters/) |

## レビューで見るところ

- `domain` がFastAPIやSQLAlchemyをimportしていないか。
- ルートがドメインモデルをそのまま返していないか。
- Hypothesisが `model_construct` やprivate属性で無効状態を作っていないか。
- SQLAlchemyの `Session` がユースケース引数に漏れていないか。
- Pydanticのホットパス議論は [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) と矛盾していないか。

