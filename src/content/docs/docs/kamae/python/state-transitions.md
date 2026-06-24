---
title: "状態遷移"
sidebar:
  order: 10
---

> **いつ読むか:** 状態遷移、ユースケース、ドメインイベント、または判別共用体の網羅的な分岐を実装するときに読む。
> **関連:** [`error-handling.md`](/docs/kamae/python/error-handling/)、[`persistence-events.md`](/docs/kamae/python/persistence-events/)、[`logging-metrics.md`](/docs/kamae/python/logging-metrics/)。

## 有効な遷移を関数として表現する

許可された遷移ごとに純粋関数を定義する。入力型は許可されたソース状態を、戻り値型はターゲット状態を表すべきである。

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

1 つの状態だけが有効なときは、全体の共用体を受け入れない。`assign_driver(request: TaxiRequest, ...)` のように広い型を受け取ると、型チェックでは防げた無効状態を実行時に拒否する必要が生じる。

アグリゲート全体の共用体は API、リポジトリ、シリアライズ、またはディスパッチの境界に置く。これらの境界では、直ちに狭い状態型を受け入れるハンドラーへ委譲する。

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

PEP 695 のジェネリックモデル構文には Pydantic 2.11 以降が必要である。それより前の 2.x 系では、代わりに `typing.Generic` を継承する。

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

非同期 `Result` の合成とインフラエラーの境界については [`error-handling.md`](/docs/kamae/python/error-handling/) を読む。1 コマンドのトランザクション範囲については [`persistence-events.md`](/docs/kamae/python/persistence-events/) を読む。

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

リポジトリプロトコルは並行性の期待を可視にすべきである。[`persistence-events.md`](/docs/kamae/python/persistence-events/#keep-repository-protocols-small) の**正規** `RequestStore` シグネチャ（`expected_version`、`idempotency_key`、イベントタプル）を使う。

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

## レビュー観点

### 2.1 遷移関数はソース状態を型で制約しているか — Medium

特定の凍結状態型を受け取れるにもかかわらず、広い共用体や `dict` を受け取りランタイムで状態を検査している関数を指摘する。

API、リポジトリ、シリアライズ、ハンドラ境界での共用体ディスパッチから直ちに型付き状態ハンドラへ委譲している場合は指摘しない。

### 2.2 ドメイン分岐は網羅的で将来に強いか — Medium

ドメイン共用体や列挙の `match` で、将来のバリアントを隠すための裸の `_` や `else` を使っている箇所を指摘する。

到達不能分岐には `typing.assert_never` の使用を提案する。

### 2.3 遷移は副作用が明示的でない限り純粋か — Medium

遷移関数内で永続化、ログ、メッセージ発行を行っている箇所を指摘する。状態とイベントを返し、ユースケースが副作用を調整する形を提案する。

### 2.4 時刻、乱数、ID 生成は注入されているか — High

遷移関数内の `datetime.now`、`uuid4`、`random.*`、`time.*` の使用を指摘する。`now`、ID、乱数値は引数として受け取るべきである。

### 2.5 ミューテータは不変条件を保つか — High

クロスフィールドルール、ライフサイクル制限、合計、タイムスタンプ、所有権、テナントスコープを破りうる setter、`model_copy(update=...)`、部分更新コマンドを指摘する。

### 2.6 認可とテナントチェックは遷移前に強制されているか — High

アクター、テナント、アカウント、権限が許可されていることを証明する前に状態を遷移させているユースケースを指摘する。

### 2.7 並行遷移は保護されているか — High

楽観的ロック、バージョンチェック、一意制約、冪等キー、シリアライザブルトランザクションなしに競合しうるライフサイクル変更や残高変更を指摘する。

バージョン付き保存とトランザクション境界の期待は [`persistence-events.md`](/docs/kamae/python/persistence-events/) と突き合わせる。
