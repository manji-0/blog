---
title: "状態遷移"
sidebar:
  order: 10
---

> **いつ読むか:** 遷移、ユースケース、ドメインイベント、または網羅的な共用体分岐を実装するとき。
> **関連:** [`error-handling.md`](/docs/kamae/python/references/error-handling/)、[`aggregates.md`](/docs/kamae/python/references/aggregates/)、[`logging-metrics.md`](/docs/kamae/python/references/logging-metrics/)。

## 有効な遷移を関数として表現する

許可された遷移ごとに純粋関数を書く。入力型は許可されたソース状態、戻り値型はターゲット状態であるべきだ。

```python
from datetime import datetime
from uuid import UUID


def assign_driver(waiting: Waiting, driver_id: UUID, now: datetime) -> EnRoute:
    return EnRoute(
        request_id=waiting.request_id,
        passenger_id=waiting.passenger_id,
        driver_id=driver_id,
        assigned_at=now,
    )
```

1 つの状態だけが有効なとき、全体の共用体を受け入れない。`assign_driver(request: TaxiRequest, ...)` は型シグネチャで防げた無効状態の実行時拒否を強制する。

アグリゲート全体の共用体は API、リポジトリ、シリアライズ、またはディスパッチ境界に置く。それらの境界では、すぐに狭い状態型を受け入れるハンドラーに委譲する。

## 共有遷移には部分共用体を使う

複数の状態から有効な遷移には、名前付き部分共用体を定義する。

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

## 時刻、ID、乱数、副作用を注入する

遷移関数は `datetime.now()`、`uuid4()`、データベースクライアント、メッセージブローカー、ロギングを直接呼んではならない。テストで振る舞いを固定できるよう、ユースケースからこれらの値を渡す。

遷移がイベントを発行するときは、可変状態にイベントを隠すのではなく、小さな結果値を返すことを優先する。

```python
class TransitionOutcome[TState, TEvent](/docs/kamae/python/references/DomainModel/):
    state: TState
    events: tuple[TEvent, ...]
```

PEP 695 ジェネリックモデル構文には Pydantic 2.11+ が必要である。それより前の 2.x では、代わりに `typing.Generic` を継承する。

## ユースケースは薄く保つ

**正規**のハッピーパスユースケース例。ユースケースは読み込み、前提条件の確認、純粋遷移の呼び出し、イベント構築、状態とイベントの永続化をオーケストレーションする。ビジネスルールは単体テストしやすい名前付き関数に置く。

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
    await store.save_en_route(en_route, (event,))
    return Ok(en_route)
```

`Ok` / `Err` の名前はプロジェクトがすでに使っている結果ライブラリに合わせる。プロジェクトがアプリケーションサービスに例外を使うなら、期待されるドメイン失敗は具体的に保ち、コントローラー境界で変換する。

非同期 `Result` の合成とインフラエラーの境界については [`error-handling.md`](/docs/kamae/python/references/error-handling/) を読む。1 コマンドのトランザクション範囲については [`aggregates.md`](/docs/kamae/python/references/aggregates/) を読む。

## 遷移の前に認可する

ユースケースは状態遷移を適用する前に、アクター、テナント、アカウント、または能力の認可を証明すべきである。権限がドメインルールの一部なら遷移関数は認可値を受け入れてもよいが、ライフサイクル状態を先に変更してから認可を確認しない。

```python
async def assign_driver_use_case(
    resolver: RequestResolver,
    store: RequestStore,
    authorizer: RequestAuthorizer,
    actor: Actor,
    request_id: UUID,
    driver_id: UUID,
    now: datetime,
) -> Result[EnRoute, AssignDriverError]:
    allowed = await authorizer.can_assign_driver(actor, request_id)
    if not allowed:
        return Err(Forbidden(request_id=request_id))
    ...
```

## 並行遷移を保護する

2 つのコマンドが競合しうるとき、ライフサイクルと残高の遷移には並行性保護が必要である。システムのアーキテクチャに応じて、楽観的バージョンフィールド、条件付き更新、一意制約、冪等性キー、行ロック、シリアライザブルトランザクション、または単一ライターキューを使う。

リポジトリプロトコルは並行性の期待を可視にすべきである。[`persistence-events.md`](/docs/kamae/python/references/persistence-events/#keep-repository-protocols-small) の**正規** `RequestStore` シグネチャ（`expected_version`、`idempotency_key`、イベントタプル）を使う。

## ドメインイベントを不変レコードとしてモデル化する

イベントモデルは、発行するアグリゲートまたはユースケースの横に置く。アグリゲートのアイデンティティとタイムスタンプを含める。状態とイベントを 1 トランザクションで永続化する。

```python
class DriverAssigned(DomainModel):
    event_name: Literal["driver_assigned"] = "driver_assigned"
    event_id: UUID
    event_at: datetime
    aggregate_id: UUID
    driver_id: UUID
    passenger_id: UUID
```

リポジトリは内部でドメインイベントを発明してはならない。ユースケースがどのイベントが起きたかを決め、新しい状態とともにストアに渡す。

## 網羅性をチェックする

判別共用体を分岐するときは `typing.assert_never` を使う。Python 3.11+ では標準ライブラリにある。十分に strict なモードで pyright または mypy を実行する。

```python
from typing import assert_never


def describe(request: TaxiRequest) -> str:
    match request:
        case Waiting():
            return "waiting"
        case EnRoute():
            return "en route"
        case InTrip():
            return "in trip"
        case Completed():
            return "completed"
        case Cancelled():
            return "cancelled"
        case _:
            assert_never(request)
```

プロジェクトのバージョンで型チェッカーが Pydantic 共用体を絞り込めない場合は、`request.kind` で分岐し、`assert_never` フォールバックを維持する。
