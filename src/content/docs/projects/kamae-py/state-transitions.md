---
title: "状態遷移"
sidebar:
  order: 10
---

ライフサイクルは `status: str` とオプションフィールドの組み合わせではなく、許可された遷移ごとの純粋関数として表す。入力型をソース状態、戻り値型をターゲット状態に対応させると、コンパイラと型チェッカーが非法遷移を早期に落とせる。

状態のデータ構造は [ドメインモデリング](/projects/kamae-py/domain-modeling/) で決める。永続化とイベント発行は遷移の外側（[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）に置き、失敗の型は [エラーハンドリング](/projects/kamae-py/error-handling/) と揃える。

## 有効な遷移を関数として表現する

関数名はビジネスコマンド（`assign_driver` など）に合わせ、引数は遷移に必要なコンテキスト（アクター、時刻、外部ID）だけに絞る。戻り値は新しい状態と、必要ならドメインイベントをタプルで返す。

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

1つの状態だけが有効なときは、全体の共用体を受け入れない。`assign_driver(request: TaxiRequest, ...)` のように広い型を受け取ると、型チェックでは防げた無効状態を実行時に拒否する必要が生じる。

アグリゲート全体の共用体はAPI、リポジトリ、シリアライズ、またはディスパッチの境界に置く。これらの境界では、直ちに狭い状態型を受け入れるハンドラーへ委譲する。

## 共有遷移には部分共用体を使う

複数の状態から有効な遷移には、名前付きの部分共用体を定義する。

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

遷移関数は `datetime.now()`、`uuid4()`、データベースクライアント、メッセージブローカー、ロギングを直接呼んではならない。テストで振る舞いを固定できるよう、これらの値はユースケースから引数として渡す。

遷移がイベントを発行するときは、可変状態にイベントを隠すのではなく、小さな結果値を返すことを優先する。

```python
class TransitionOutcome[TState, TEvent](DomainModel):
    state: TState
    events: tuple[TEvent, ...]
```

PEP 695のジェネリックモデル構文にはPydantic 2.11以降が必要である。それより前の2.x系では、代わりに `typing.Generic` を継承する。

## ユースケースは薄く保つ

以下は**正規**のハッピーパス・ユースケース例である。ユースケースは読み込み、前提条件の確認、純粋遷移の呼び出し、イベント構築、状態とイベントの永続化をオーケストレーションする。ビジネスルールは単体テストしやすい名前付き関数に置く。

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

非同期 `Result` の合成とインフラエラーの境界については [エラーハンドリング](/projects/kamae-py/error-handling/) を読む。1コマンドのトランザクション範囲については [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を読む。

## 遷移の前に認可する

ユースケースは状態遷移を適用する前に、アクター、テナント、アカウント、または能力の認可を確認すべきだ。権限がドメインルールの一部なら遷移関数は認可値を受け入れてもよいが、ライフサイクル状態を先に変更してから認可を確認しない。

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

2つのコマンドが競合しうるとき、ライフサイクルと残高の遷移には並行性保護が必要である。システムのアーキテクチャに応じて、楽観的バージョンフィールド、条件付き更新、一意制約、冪等性キー、行ロック、シリアライザブルトランザクション、または単一ライターキューを使う。

リポジトリプロトコルは並行性の期待を明示すべきだ。[永続化、集約、イベント](/projects/kamae-py/persistence-events/#リポジトリプロトコルは小さく保つ) の**正規** `RequestStore` シグネチャ（`expected_version`、`idempotency_key`、イベントタプル）を使う。

## ドメインイベントを不変レコードとしてモデル化する

イベントモデルは、発行するアグリゲートまたはユースケースの横に置く。アグリゲートのアイデンティティとタイムスタンプを含める。状態とイベントを1トランザクションで永続化する。

```python
class DriverAssigned(DomainModel):
    event_name: Literal["driver_assigned"] = "driver_assigned"
    event_id: UUID
    event_at: datetime
    aggregate_id: UUID
    driver_id: UUID
    passenger_id: UUID
```

リポジトリは内部でドメインイベントを発明してはならない。起きたイベントはユースケースが決め、新しい状態とともにストアに渡す。

## 網羅性をチェックする

判別共用体を分岐するときは `typing.assert_never` を使う。Python 3.11+ では標準ライブラリにある。十分にstrictなモードでpyrightまたはmypyを実行する。

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

プロジェクトのバージョンで型チェッカーがPydantic共用体を絞り込めない場合は、`request.kind` で分岐し、`assert_never` フォールバックを維持する。

## レビューで見るところ

セッター、`model_copy(update=...)`、部分更新でクロスフィールド不変条件・ライフサイクルを壊していないか。楽観ロックや冪等キーなしの競合しやすい遷移がないか（[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）。遷移内の `datetime.now` / `uuid4` / `random` を引数注入に寄せているか。認可・テナント確認の前に状態を変えていないか。ドメイン共用体の `match` で裸の `_` / `else` が将来バリアントを隠していないか（到達不能は `assert_never`）。遷移が永続化やログまで抱え込んでいないか。特定の凍結状態型で受け取れるのに広い共用体や `dict` でランタイム検査していないか。

