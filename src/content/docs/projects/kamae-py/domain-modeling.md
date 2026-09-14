---
title: "ドメインモデリング"
sidebar:
  order: 10
---

ビジネス状態の型付け、集約境界、ポート定義、永続化の契約、既存コードへの段階的な入れ方を扱います。ライフサイクル上の変化は[状態遷移](/projects/kamae-py/state-transitions/)、外部データの取り込みは[境界防御](/projects/kamae-py/boundary-defense/)へ。

## ドメイン状態のPydantic v2バリアント

Python 3.12以降とPydantic v2を前提にします。`frozen=True`と`extra="forbid"`を既定とし、各ビジネス状態を個別の凍結モデルとして定義します。プロジェクト全体で判別子名は`kind`を1つ使います。

```python
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class DomainModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Waiting(DomainModel):
    kind: Literal["waiting"] = "waiting"
    request_id: UUID
    passenger_id: UUID
    created_at: datetime
    version: int = 1


class EnRoute(DomainModel):
    kind: Literal["en_route"] = "en_route"
    request_id: UUID
    passenger_id: UUID
    driver_id: UUID
    assigned_at: datetime
    version: int


type TaxiRequest = Annotated[
    Waiting | EnRoute,
    Field(discriminator="kind"),
]

TaxiRequestAdapter = TypeAdapter(TaxiRequest)
```

JSON向けサービスでは、判別子の値はlower snake caseを優先します。

## Optional blobモデルの回避

`status: str`と多数のOptionalフィールドでワークフローを表しません。あるフィールドが1状態にしか存在しないなら、その状態のモデルで必須にします。

## 凍結と更新経路

状態の変更は既存モデルを書き換えず、新しいターゲット状態を構築します。公開セッター、`model_copy(update=...)`による部分更新、ミューテータは避けます。更新は遷移またはコマンドとして命名し、不変条件全体を検証させます。

## ドメインとトランスポートDTOの分離

APIのJSON形状とドメイン状態を同一にする必要はありません。エンドポイント固有のフィールドや互換用OptionalはDTOに置き、検証済みDTOからドメインへマップします。コアstateに`version`や`tenant_id`を載せると`model_dump`やログ経路から漏れやすくなります。

## 意味のあるID

`UUID`、制約付き文字列、または小さな凍結ラッパーモデルで意味を分けます。`Annotated[UUID, ...]`や`NewType`は静的には効きますが、実行時に兄弟IDを止めません。取り違えがビジネス上の影響を持つ場合はIDごとの凍結ラッパーを優先します。

```python
class PassengerId(DomainModel):
    value: UUID


class DriverId(DomainModel):
    value: UUID
```

値の構築はドメインコンストラクタとPydanticアダプターを正規入口にします。テストでも、破損データ処理が明示的な目的でない限り生dictや`model_construct`で不変条件付き値を組み立てません。

## 集約境界

**集約**は1コマンドで一貫させたい不変条件の単位です。Kamae Pythonでは次を1セットにします。

- 1つの判別state共用体
- その共用体を変える純粋遷移
- 遷移が出すドメインイベント
- 1コマンドあたり1つの整合境界

集約ルートはstate共用体を指す識別子です（例：`request_id`）。独立ライフサイクルの`Passenger`や`Payment`は別集約とし、IDで参照します。2ルートを毎コマンド同時に変える必要が出るなら、境界は小さすぎます。結果整合を受け入れるべきです。

## リポジトリポート

ドメイン向けポートは`typing.Protocol`で狭く定義します。入門用の最小形状は次です。

```python
class RequestResolver(Protocol):
    async def find_waiting(self, request_id: UUID) -> Waiting | None: ...


class RequestStore(Protocol):
    async def save_en_route(
        self,
        state: EnRoute,
        events: tuple[DomainEvent, ...],
        *,
        expected_version: int,
        idempotency_key: str,
    ) -> None: ...
```

本番では`expected_version`と`idempotency_key`を明示し、状態とイベントを同一トランザクションで保存します。アウトボックス行も同じ`begin`内に載せ、リレーは別プロセスに任せます。ORMエンティティをドメインAPIにしないで、行DTO経由で`TypeAdapter`再水和します。

## 1モジュール1概念

`request_id.py`、`taxi_request.py`、`request_repository.py`のように概念ごとにファイルを分けます。`models.py`に無関係な型が集まると循環importとレビュー負荷が増えます。

## Pydantic・dataclass・attrsの選択

| ニーズ | 優先 |
| --- | --- |
| 判別共用体state・境界パース・JSON契約 | Pydantic v2凍結モデル |
| プロセスを越えるエラー・イベント | `kind`判別子付きPydantic v2 |
| 外部シリアライズのない小さな値オブジェクト | `@dataclass(frozen=True, slots=True)` |
| attrsエコシステムのバリデータ | `frozen=True`のattrs |

ログ・API・リポジトリ・イベントに現れる金額・ID・ライフサイクルstateはPydanticに置きます。同一概念をPydanticとdataclassの両方で表しません。

## アプリケーション層と配線

依存の向きはDomain → Application（`Protocol`のみ）→ Infrastructure → Interfaceです。ユースケースはプレーンな関数引数でポートを受け取り、Readerモナドやサービスロケーターは既存規約がない限り採用しません。

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
    ...
```

依存の配線はFastAPIの`Depends`、lifespan、ワーカーファクトリー、CLI`main`などコンポジションルートだけで行います。設定は起動時に`pydantic-settings`で一度検証し、ユースケース内で`os.environ`を読みません。

## ORMアダプター

```text
ORM entity / Row  --mapper-->  Pydantic domain state
Session / transaction         --implements-->  RequestStore Protocol
```

`to_domain(row)`と`to_row(state)`を明示し、判別子と不変条件は`TypeAdapter`で走らせます。信頼済みDB値への`model_construct`はマッパー内だけに閉じ、理由を短くコメントします。`begin`/`commit`はアダプタかunit-of-workポート内で行い、純粋遷移の中では行いません。

## 段階的な移行

触れたワークフローごとに、次の順で締めます。

| フェーズ | 目標 |
| --- | --- |
| 0 ベースライン | uv・Ruff・pyrefly・pytest |
| 1 境界パース | API/DB/キューでPydantic検証 |
| 2 状態形状 | `status + Optional`を判別共用体へ |
| 3 純粋遷移 | サービスメソッドから名前付き関数へ |
| 4 ポート分離 | ORM/SDKを`Protocol`の背後へ |
| 5 原子性 | 状態＋イベント＋アウトボックスを同一TX |

別ワークフローは並行して進められますが、1ワークフロー内ではフェーズ順を守ります。

## 投影とストリーム

読み取りモデル（投影）はコマンド経路から分けます。権威ある状態変更はユースケースだけが行い、コンシューマはイベントを冪等に適用します。未知の`event_name`や版はスキップかDLQへ送り、パニックや黙殺は避けます。CPUバウンドな投影はコンポジションルートでオフロードします。

## デコレータと明示的スタイル

純粋遷移はすべての入力を引数で受け取ります。`@cached_property`でI/Oや時間依存を隠しません。Pydanticの`field_validator`/`model_validator`で構築を単一入口に保ちます。

## 次に読む

| 目的 | ページ |
| --- | --- |
| 遷移とエラー | [状態遷移](/projects/kamae-py/state-transitions/) |
| 境界パースとPII | [境界防御](/projects/kamae-py/boundary-defense/) |
| 環境構築 | [使い方](/projects/kamae-py/usage/) |
| FastAPI・SQLAlchemy例 | [ライブラリガイド](/projects/kamae-py/library-guides/) |

タクシー配車のコード例はリポジトリの[`taxi-request.py`](https://github.com/manji-0/kamae-py/blob/main/skills/kamae-py/references/taxi-request.py)を参照してください。
