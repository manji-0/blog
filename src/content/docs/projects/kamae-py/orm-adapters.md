---
title: "ORM アダプター"
sidebar:
  order: 10
---

ORMエンティティはインフラに置き、ユースケースと遷移が見るのはPydanticドメイン状態だけにする。アダプターが行とドメインの間を往復検証しないと、DBのNULLや型のゆらぎが不変条件を迂回する。

集約の保存契約（バージョン、アウトボックス、冪等キー）は [永続化、集約、イベント](/projects/kamae-py/persistence-events/)、受信DTOの形は [境界防御](/projects/kamae-py/boundary-defense/) と揃える。段階的導入は [マイグレーション戦略](/projects/kamae-py/migration-strategy/) を参照する。

## レイヤリング

```text
Use case  →  RequestStore (Protocol)  →  SqlAlchemyRequestStore (adapter)
                                              ↓
                                         ORM Entity / row DTO
                                              ↓
                                         mapper functions
                                              ↓
                                         Waiting | EnRoute | ...
```

SQLAlchemy `Mapped` クラスやDjango `Model` インスタンスをユースケースに渡してはならない。遅延ロード、セッション添付、nullableカラム、ドメイン不変条件を弱める余分なフィールドを運ぶためである。

## SQLAlchemy 2.0 パターン

ORMエンティティをドメイン状態から分離して定義する。明示的型の `mapped_column` を使い、テーブルモデルは永続化に集中させる。

```python
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RequestRow(Base):
    __tablename__ = "requests"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    passenger_id: Mapped[UUID] = mapped_column(nullable=False)
    driver_id: Mapped[UUID | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(nullable=False, default=1)
```

### 行 DTO + ドメインマッパー

アダプター境界では、狭い行DTOを経由してパースし、判別共用体へマップする。

```python
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class RequestRowDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    kind: str
    passenger_id: UUID
    driver_id: UUID | None
    created_at: datetime
    assigned_at: datetime | None


RequestRowDtoAdapter = TypeAdapter(RequestRowDto)


def row_dto_from_orm(row: RequestRow) -> RequestRowDto:
    return RequestRowDtoAdapter.validate_python(
        {
            "id": row.id,
            "kind": row.kind,
            "passenger_id": row.passenger_id,
            "driver_id": row.driver_id,
            "created_at": row.created_at,
            "assigned_at": row.assigned_at,
        }
    )


def domain_from_row_dto(dto: RequestRowDto) -> TaxiRequest:
    match dto.kind:
        case "waiting":
            return Waiting.model_construct(
                kind="waiting",
                request_id=dto.id,
                passenger_id=dto.passenger_id,
                created_at=dto.created_at,
            )
        case "en_route":
            if dto.driver_id is None or dto.assigned_at is None:
                raise CorruptRowError(dto.id, "en_route missing driver or assigned_at")
            return EnRoute.model_construct(
                kind="en_route",
                request_id=dto.id,
                passenger_id=dto.passenger_id,
                driver_id=dto.driver_id,
                assigned_at=dto.assigned_at,
            )
        case other:
            raise CorruptRowError(dto.id, f"unknown kind {other!r}")
```

`RequestRowDto` がすでに型を検証し、`match` が `kind` ごとのフィールド存在を強制するため、ここでの `model_construct` は許容される。すべての `kind` と破損行ケースのテストを追加する。

### ドメイン → ORM の永続化

```python
def orm_fields_from_en_route(state: EnRoute, *, version: int) -> dict[str, object]:
    return {
        "id": state.request_id,
        "kind": state.kind,
        "passenger_id": state.passenger_id,
        "driver_id": state.driver_id,
        "created_at": state.assigned_at,  # or carry created_at on all states
        "assigned_at": state.assigned_at,
        "version": version,
    }


class SqlAlchemyRequestStore:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save_en_route(
        self,
        state: EnRoute,
        events: tuple[DriverAssigned, ...],
        *,
        expected_version: int,
        idempotency_key: str,
    ) -> None:
        row = await self._session.get(RequestRow, state.request_id, with_for_update=True)
        if row is None or row.version != expected_version:
            raise VersionConflict(state.request_id)
        for key, value in orm_fields_from_en_route(state, version=expected_version + 1).items():
            setattr(row, key, value)
        for event in events:
            self._session.add(outbox_from_event(event, idempotency_key=idempotency_key))
```

楽観的ロックとアウトボックス挿入はアダプターに置く。ユースケースは `expected_version` と `idempotency_key` を明示的に渡す。[永続化、集約、イベント](/projects/kamae-py/persistence-events/) を読む。

## Django ORM パターン

Djangoモデルは `infrastructure` またはアプリエッジの `models.py` に置く。ドメインパッケージには置かない。

```python
# infrastructure/request_mapper.py
from myapp.models import Request as RequestModel


def row_dto_from_django(instance: RequestModel) -> RequestRowDto:
    return RequestRowDtoAdapter.validate_python(
        {
            "id": instance.id,
            "kind": instance.kind,
            "passenger_id": instance.passenger_id,
            "driver_id": instance.driver_id,
            "created_at": instance.created_at,
            "assigned_at": instance.assigned_at,
        }
    )


def domain_from_django(instance: RequestModel) -> TaxiRequest:
    return domain_from_row_dto(row_dto_from_django(instance))
```

書き込みでは、`transaction.atomic()` 内で `model_dump(mode="python")` または明示的フィールドマップからフィールドを更新する：

```python
from django.db import transaction


@transaction.atomic
def save_en_route_django(
    state: EnRoute,
    events: tuple[DriverAssigned, ...],
    *,
    expected_version: int,
) -> None:
    row = RequestModel.objects.select_for_update().get(pk=state.request_id)
    if row.version != expected_version:
        raise VersionConflict(state.request_id)
    row.kind = state.kind
    row.driver_id = state.driver_id
    row.assigned_at = state.assigned_at
    row.version = expected_version + 1
    row.save(update_fields=["kind", "driver_id", "assigned_at", "version"])
    insert_outbox_events(events)
```

## リポジトリポート形状

ポートはORMインスタンスや生の行オブジェクトではなく、検証済みのドメイン状態を返す。[永続化、集約、イベント](/projects/kamae-py/persistence-events/#リポジトリプロトコルは小さく保つ) の**正規**ポート定義に合わせる。

`save(request: TaxiRequest)` のような広いメソッドは、たとえば `Waiting` のまま保存する非法操作を型では防げない。`find_waiting` と `save_en_route` のように、操作ごとに有効なライフサイクル状態をメソッド名と引数型で表す。

## マイグレーション共存

Stranglerマイグレーション中、レガシーサービスはまだdictやORMオブジェクトを読むかもしれない。ビジネスルールを書き換える**前に**マッパーを導入する：

1. `RequestRowDto` + `domain_from_row_dto` を追加。
2. レガシー `TaxiRequestService` メソッドをマッパー呼び出し、その後純粋遷移を呼ぶよう包む。
3. クエリを `SqlAlchemyRequestStore` / Djangoアダプターモジュールへ移す。
4. ユースケースがフローを所有したらレガシーラッパーを削除。

段階的ロールアウトは [マイグレーション戦略](/projects/kamae-py/migration-strategy/) を読む。

## テスト

- **マッパーテスト:** すべての `kind`、nullの組み合わせ、破損行、タイムゾーン付きdatetime。
- **アダプター統合テスト:** 実DBトランザクション、`select_for_update`、バージョン競合、同一トランザクション内のアウトボックス行。
- **ユースケーステスト:** フェイクポート。ORMなし。

破損入力処理を対象とするテストでない限り、マッパーテストで生dictからドメイン状態を構築しない。

## レビューで見るところ

ドメインやユースケースがSQLAlchemy / Djangoモデルやセッション束縛エンティティをimportしていないか。行→ドメインが未検証属性や `model_construct` / `cast` ではなく検証付きコンストラクタか。version/etagが一貫してマッピングされているかも見る（[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）。セッション所有がアダプター側か、遅延読み込みやN+1が遷移経路に入っていないかも確認する。

