---
title: "ORM アダプター"
sidebar:
  order: 10
---

> **いつ読むか:** リポジトリアダプターで SQLAlchemy 2.0 または Django ORM エンティティを Pydantic ドメインモデルにマップするときに読む。
> **関連:** [境界防御](/docs/kamae-py/boundary-defense/)、[永続化、集約、イベント](/docs/kamae-py/persistence-events/)、[マイグレーション戦略](/docs/kamae-py/migration-strategy/)。

Kamae Python は ORM エンティティクラスを**インフラ**に置く。ユースケースと遷移が見るのは Pydantic ドメイン状態のみである。アダプターが永続化行/エンティティとドメインモデル間の変換を所有する。

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

SQLAlchemy `Mapped` クラスや Django `Model` インスタンスをユースケースに渡してはならない。遅延ロード、セッション添付、nullable カラム、ドメイン不変条件を弱める余分なフィールドを運ぶためである。

## SQLAlchemy 2.0 パターン

ORM エンティティをドメイン状態から分離して定義する。明示的型の `mapped_column` を使い、テーブルモデルは永続化に集中させる。

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

アダプター境界で狭い行 DTO 経由でパースし、判別共用体にマップする。

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

楽観的ロックとアウトボックス挿入はアダプターに置く。ユースケースは `expected_version` と `idempotency_key` を明示的に渡す。[永続化、集約、イベント](/docs/kamae-py/persistence-events/) を読む。

## Django ORM パターン

Django モデルは `infrastructure` またはアプリエッジの `models.py` に置く。ドメインパッケージには置かない。

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

書き込みでは、`transaction.atomic()` 内で `model_dump(mode="python")` または明示的フィールドマップからフィールドを更新する:

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

ポートは ORM インスタンスではなくドメイン状態を返す。[永続化、集約、イベント](/docs/kamae-py/persistence-events/#keep-repository-protocols-small) の**正規**ポート定義を使う。狭いメソッド（`find_waiting`、`save_en_route`）は各永続化操作で有効なライフサイクル状態を文書化する。

## マイグレーション共存

Strangler マイグレーション中、レガシーサービスはまだ dict や ORM オブジェクトを読むかもしれない。ビジネスルールを書き換える**前に**マッパーを導入する:

1. `RequestRowDto` + `domain_from_row_dto` を追加。
2. レガシー `TaxiRequestService` メソッドをマッパー呼び出し、その後純粋遷移を呼ぶよう包む。
3. クエリを `SqlAlchemyRequestStore` / Django アダプターモジュールへ移す。
4. ユースケースがフローを所有したらレガシーラッパーを削除。

段階的ロールアウトは [マイグレーション戦略](/docs/kamae-py/migration-strategy/) を読む。

## テスト

- **マッパーテスト:** すべての `kind`、null の組み合わせ、破損行、タイムゾーン付き datetime。
- **アダプター統合テスト:** 実 DB トランザクション、`select_for_update`、バージョン競合、同一トランザクション内のアウトボックス行。
- **ユースケーステスト:** フェイクポート。ORM なし。

破損入力処理を対象とするテストでない限り、マッパーテストで生 dict からドメイン状態を構築しない。

## レビュー観点

### ORM エンティティはドメインモジュール外か — High

ドメイン状態、遷移、ユースケースモジュールが SQLAlchemy モデル、Django モデル、セッション束縛エンティティを import する箇所を指摘する。

### マッパーは入出力双方で検証するか — High

未検証属性アクセス、`model_construct`、`cast` で行→ドメイン変換する箇所を指摘する。Pydantic アダプターまたは明示コンストラクタを使うべき。

### 楽観的ロック列は一貫してマッピングされているか — High

保存時に無視される version/etag 列、または並行変更を黙って上書きしうる ORM 更新を指摘する。

[永続化、集約、イベント](/docs/kamae-py/persistence-events/) と照合する。

### セッションとトランザクションはアダプターが所有するか — Medium

リポジトリアダプターが永続化の関心を所有すべきなのに、ユースケースが ORM セッションを直接管理する箇所を指摘する。

### 遅延読み込みはドメイン/ユースケース経路に入らないか — Medium

遷移やユースケースロジック中にトリガーされる暗黙の遅延読み込み、デタッチインスタンス、N+1 クエリパターンを指摘する。

