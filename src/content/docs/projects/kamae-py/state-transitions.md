---
title: "状態遷移"
sidebar:
  order: 10
---

ライフサイクルを許可された遷移ごとの純粋関数として表し、想定内の失敗を明示的な戻り値に載せる方法を扱います。状態のデータ構造は[ドメインモデリング](/projects/kamae-py/domain-modeling/)、境界パースは[境界防御](/projects/kamae-py/boundary-defense/)が前提です。

## 有効な遷移の関数表現

関数名はビジネスコマンド（`assign_driver`など）に合わせ、引数は遷移に必要なコンテキストだけに絞ります。戻り値は新しい状態と、必要ならドメインイベントのタプルです。

```python
from datetime import datetime
from uuid import UUID


def assign_driver(waiting: Waiting, driver_id: UUID, now: datetime) -> EnRoute:
    return EnRoute(
        request_id=waiting.request_id,
        passenger_id=waiting.passenger_id,
        driver_id=driver_id,
        assigned_at=now,
        version=waiting.version + 1,
    )
```

ソース状態だけが有効なときは共用体全体を受け入れません。`assign_driver(request: TaxiRequest, ...)`のように広い型を取ると、型チェックで防げた無効状態を実行時拒否に戻します。共用体はAPI・リポジトリ・シリアライズの境界に置き、直ちに狭い状態型へ委譲します。

## 部分共用体

複数状態から有効な遷移には名前付きの部分共用体を定義します。

```python
type CancellableRequest = Waiting | EnRoute | InTrip


def cancel(request: CancellableRequest, reason: str, now: datetime) -> Cancelled:
    return Cancelled(
        request_id=request.request_id,
        passenger_id=request.passenger_id,
        cancelled_at=now,
        reason=reason,
    )
```

## 時刻・ID・副作用の注入

遷移関数は`datetime.now()`、`uuid4()`、DBクライアント、ブローカー、ロギングを直接呼びません。テストで固定できるよう、ユースケースから引数として渡します。イベントは可変状態に隠さず、小さな結果値で返します。

```python
class TransitionOutcome[TState, TEvent](DomainModel):
    state: TState
    events: tuple[TEvent, ...]
```

PEP 695のジェネリックモデルにはPydantic 2.11以降が必要です。

## 期待される失敗の明示

想定内の拒否（見つからない、状態が違う、在庫不足）は戻り値のバリアントに載せます。ユースケースごとに失敗型を分け、catch-allの`AppError`は使いません。

```python
class RequestNotFound(DomainModel):
    kind: Literal["request_not_found"] = "request_not_found"
    request_id: UUID


type AssignDriverError = Annotated[
    RequestNotFound | InvalidState | DriverNotAvailable,
    Field(discriminator="kind"),
]
```

新規プロジェクトの既定はローカル`Ok`/`Err`です。既存で`returns`や`rustedpy`を使うなら名前を揃えます。ドメイン関数から広い`Exception`やHTTP例外は投げず、インフラ例外はアダプター境界でユースケースエラーにマップします。

## 薄いユースケース

ユースケースは読み込み、認可、純粋遷移、イベント構築、永続化の順でオーケストレーションします。ビジネスルールは単体テストしやすい名前付き関数に置きます。

```python
async def assign_driver_use_case(
    resolver: RequestResolver,
    store: RequestStore,
    request_id: UUID,
    driver_id: UUID,
    now: datetime,
) -> Result[EnRoute, AssignDriverError]:
    waiting = await resolver.find_waiting(request_id)
    if waiting is None:
        return Err(RequestNotFound(request_id=request_id))

    en_route = assign_driver(waiting, driver_id, now)
    event = driver_assigned_event(en_route, now)
    await store.save_en_route(
        en_route,
        (event,),
        expected_version=waiting.version,
        idempotency_key=...,
    )
    return Ok(en_route)
```

永続化エラーは早期リターンでユースケースエラーへ変換し、リトライ可能か補償かをここで決めます。遷移やユースケースは`ValidationError`を捕捉しません（信頼済みstate前提）。

## 遷移前の認可

状態を変える前にアクター・テナント・能力を確認します。権限がドメインルールの一部なら遷移は認可値を受け入れてもよいですが、先にライフサイクルを進めてから認可しないでください。リソースの`tenant_id`は`ctx.tenant_id`と比較し、横断プローブには404か汎用拒否を返します。

## 並行遷移の保護

競合しうるコマンドには楽観的`version`、条件付き更新、冪等キー、行ロック、シリアライザブルTX、単一ライターキューなどを選びます。リポジトリポートはその期待をシグネチャで明示します。

## ドメインイベント

イベントは凍結レコードとして集約の横に置き、`event_id`・`event_at`・`aggregate_id`を含めます。リポジトリがイベントを発明せず、ユースケースが新stateと一緒にストアへ渡します。

```python
class DriverAssigned(DomainModel):
    event_name: Literal["driver_assigned"] = "driver_assigned"
    event_id: UUID
    event_at: datetime
    aggregate_id: UUID
    driver_id: UUID
```

## 網羅性のチェック

判別共用体の`match`では`assert_never`を使います。型チェッカーが絞り込めない場合は`request.kind`で分岐し、フォールバックを維持します。

```python
from typing import assert_never


def describe(request: TaxiRequest) -> str:
    match request:
        case Waiting():
            return "waiting"
        case EnRoute():
            return "en route"
        case _:
            assert_never(request)
```

## 次に読む

| 目的 | ページ |
| --- | --- |
| 集約・ポート・永続化 | [ドメインモデリング](/projects/kamae-py/domain-modeling/) |
| DTOと認可 | [境界防御](/projects/kamae-py/boundary-defense/) |
| テストとCI | [品質ゲート](/projects/kamae-py/quality-gates/) |
