---
title: "ドメインモデリング"
sidebar:
  order: 10
---

Kamae Pythonの中心は、ビジネス状態をPydantic v2の凍結モデルと `kind` 判別子で表すことだ。素の `str` や可変モデルに頼ると無効な中間状態が表現でき、境界を一度すり抜けた値がドメイン深部まで届く。

ライフサイクル上の変化は [状態遷移](/docs/kamae-py/state-transitions/)、外部データの取り込みは [境界防御](/docs/kamae-py/boundary-defense/)、ホットパスでの検証コストは [Pydantic のパフォーマンス](/docs/kamae-py/pydantic-performance/) を参照する。

## ドメイン状態には Pydantic v2 のバリアントを使う

Python 3.12以降とPydantic v2を前提とする。`frozen=True` と `extra="forbid"` は、構築後の暗黙的な変更と未知フィールドの混入を防ぐための**既定**とする。各ビジネス状態を個別の凍結モデルとして定義し、プロジェクト全体で `kind` という名前の判別子を1つ使う。

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


class EnRoute(DomainModel):
    kind: Literal["en_route"] = "en_route"
    request_id: UUID
    passenger_id: UUID
    driver_id: UUID
    assigned_at: datetime


class InTrip(DomainModel):
    kind: Literal["in_trip"] = "in_trip"
    request_id: UUID
    passenger_id: UUID
    driver_id: UUID
    started_at: datetime


class Completed(DomainModel):
    kind: Literal["completed"] = "completed"
    request_id: UUID
    passenger_id: UUID
    driver_id: UUID
    started_at: datetime
    completed_at: datetime


class Cancelled(DomainModel):
    kind: Literal["cancelled"] = "cancelled"
    request_id: UUID
    passenger_id: UUID
    cancelled_at: datetime
    reason: str


type TaxiRequest = Annotated[
    Waiting | EnRoute | InTrip | Completed | Cancelled,
    Field(discriminator="kind"),
]

TaxiRequestAdapter = TypeAdapter(TaxiRequest)
```

JSON向けのPythonサービスでは、プロジェクトが別の規約を使っていない限り、判別子の値はlower snake caseを優先する。

## オプショナルな状態フィールドを持つ blob モデルを避ける

`status: str` と多数のオプショナルフィールドを持つ1つのモデルでワークフローを表現してはならない。オプショナルフィールドは無効な状態を表現可能にしてしまう。

```python
# Avoid this shape for domain state.
class TaxiRequest(BaseModel):
    status: str
    request_id: UUID
    passenger_id: UUID
    driver_id: UUID | None = None
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
```

あるフィールドが1つの状態にしか存在しないなら、その状態のモデルで必須とする。

## 状態モデルは frozen に保つ

ドメインのPydanticモデルには `ConfigDict(frozen=True, extra="forbid")` を設定する。状態の変更は既存モデルを変更するのではなく、新しいターゲット状態を構築する。強制変換がデータ品質の問題を隠す場合は、外部DTO境界で `strict=True` を検討する。

公開セッター、部分更新ヘルパー、またはフィールド間不変条件を破る可能性のある `model_copy(update=...)` パスは避ける。更新がビジネスアクションなら、遷移かコマンドとして命名し、不変条件全体を検証させる。

Pydantic mypyプラグインを有効にすると、frozenモデルは静的にもチェックされる。モデルフィールドへの代入は、実行時より前にmypyで失敗するはずだ。

## 必要に応じてドメインモデルとトランスポート DTO を分離する

APIのJSON形状とドメイン状態が同じである必要はない。エンドポイント固有のフィールドや互換性のためのoptionalはDTOに置き、検証済みDTOからドメインモデルまたはコマンドへマップする。コアのドメイン状態に `version` や `tenant_id` のような永続化・認可の関心事を載せると、レスポンス用の `model_dump` やログ経路から漏れやすくなる。

内部APIだけで、かつ形状が完全に一致し不変条件も同じなら共通化してもよい。迷ったときは分離を選ぶ。

## 意味のある ID には明示的な値型を使う

`UUID`、`EmailStr`、`HttpUrl`、制約付き文字列、またはドメイン上の意味を持つ小さなfrozen Pydanticモデルなど、組み込みの精密型を使う。区別が重要なときは、無関係なIDを素の `str` として渡さない。

```python
from pydantic import StringConstraints
from typing import Annotated

RequestCode = Annotated[str, StringConstraints(pattern=r"^req-[0-9]{8}$")]
```

`Annotated` エイリアスと `typing.NewType` は、実行時にはベース型と**構造的に等価**である。Mypy/pyrightは一部のミスを検出するが、両方が `UUID` のとき、`passenger_id` を `driver_id` が期待される場所に渡すのを止めるものはない。IDの取り違えがビジネス上の影響を持つ場合は、より強いパターンを優先する。

### 名目的 ID には frozen ラッパーモデルを優先する

各意味的IDを独自のfrozen Pydanticモデル（またはプロセス内専用IDには `@dataclass(frozen=True, slots=True)`）で包む。構築時に形式を検証し、ラッパー型は兄弟型と交換できない。

```python
from uuid import UUID

from pydantic import field_validator


class PassengerId(DomainModel):
    value: UUID


class DriverId(DomainModel):
    value: UUID


class RequestId(DomainModel):
    value: UUID

    @field_validator("value")
    @classmethod
    def not_nil(cls, value: UUID) -> UUID:
        if value.int == 0:
            raise ValueError("request id must not be nil")
        return value
```

遷移では異なるパラメータ名と型を使う：

```python
def assign_driver(waiting: Waiting, driver_id: DriverId, now: datetime) -> EnRoute:
  ...
```

### インスタンス化不可ベースの `__init_subclass__` ガード

複数のID型が検証ロジックを共有するときは、直接のインスタンス化を拒否する抽象ベースを使う。サブクラスは別々の名目的型のままである。

```python
class SemanticId(DomainModel):
    value: UUID

    def __init_subclass__(cls, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        if cls is SemanticId:
            raise TypeError("SemanticId cannot be instantiated directly")


class TenantId(SemanticId):
    pass


class AccountId(SemanticId):
    pass
```

ルールが異なる場合のみサブクラスごとのバリデータを追加する。コードベースがすでにそのパターンを標準化していない限り、単一の汎用 `Id[T]` ラッパーは使わない。

### 頼ってはいけないもの

| アプローチ | 静的チェック | 実行時の分離 |
| --- | --- | --- |
| `UUID` パラメータ名のみ | 弱い | なし |
| `Annotated[UUID, ...]` / `NewType` | 良い | なし |
| ID ごとの frozen ラッパーモデル | 良い | 良い（別型） |
| 正規表現制約付き `str` | 形状のみ | ID 種別の分離なし |

実行時の取り違えが無害なら `NewType` は軽量なドキュメントとして許容される。金額、テナント境界、認証に敏感なIDにはラッパーモデルを使う。

値の構築は、ドメインコンストラクタとPydanticアダプターを正規の入口とする。テスト、リポジトリ、ネイティブアダプター、マイグレーションは、破損データ処理が明示的な目的でない限り、生のdictや `model_construct` で不変条件を持つ値を構築してはならない。信頼できるマッパーで `model_construct` が適切な場合は [Pydantic のパフォーマンス](/docs/kamae-py/pydantic-performance/) を読む。

## プロトコルでリポジトリポートを定義する

ドメイン向けポートには `typing.Protocol` を使う。メソッドシグネチャは狭く保ち、ドメイン状態または明示的な結果型を返す。

これはプロトコル導入のための**最小**ポート形状である。楽観的ロック、冪等性キー、イベントタプルを持つ本番ストアには、[永続化、集約、イベント](/docs/kamae-py/persistence-events/#keep-repository-protocols-small) の**正規**定義を使う。

```python
from typing import Protocol


class RequestResolver(Protocol):
    async def find_waiting(self, request_id: UUID) -> Waiting | None: ...


class RequestStore(Protocol):
    async def save_en_route(
        self,
        state: EnRoute,
        events: tuple[DomainEvent, ...],
    ) -> None: ...
```

プロトコルクラスはポートを記述する。ドメインエンティティではない。

外部表現が不変条件を迂回したり、余分なフィールドを含んだり、プライバシー/シリアライズ要件が異なる場合は、API DTO、DB行モデル、読み取りモデル、ドメインモデルを分離する。

## 1 モジュール 1 概念

`request_id.py`、`taxi_request.py`、`request_repository.py` のように、1つのドメイン概念ごとにファイルを分ける。`models.py` や `types.py` に無関係な型が集まり始めると、importの循環が起きやすく、レビューでも「この変更がどこに波及するか」が見えにくくなる。分割の目安は、ファイル名を説明せずに中身が想像できることだ。

## uv でプロジェクトを管理する

新規リポジトリでは、Python 3.12+ とPydantic v2を持つuv管理プロジェクトを作成する。

```bash
uv init --package
uv python pin 3.13
uv add "pydantic>=2,<3"
uv lock
```

インポート可能なPythonパッケージではないスキル、またはドキュメントリポジトリでは、`[tool.uv]` の下に `package = false` を設定する。

## Pydantic プラグイン付きで Mypy を設定する

Pydanticドメインモデルに依存するプロジェクトではPydantic v2 mypyプラグインを使う。モデル `__init__`、`model_construct`、frozenモデル、フィールドデフォルト、型なしフィールド、動的エイリアスに対する静的チェックが改善される。

```toml
[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]

[tool.pydantic-mypy]
init_forbid_extra = true
init_typed = true
warn_required_dynamic_aliases = true
```

`init_typed = true` を維持し、コンストラクタ呼び出しがPydanticのデフォルト強制変換の `Any` を受け入れず、フィールド型に対してチェックされるようにする。`init_forbid_extra = true` も維持し、予期しないコンストラクタキーワードが `**kwargs: Any` の背後へ隠れないようにする。コンストラクタチェックを弱めるため、ドメインモデルに必須の動的エイリアスは避ける。

## Pydantic、dataclass、attrs の選択

Pydantic v2は、Kamae Pythonのドメイン状態、境界DTO、プロセス境界を越えるエラーバリアントのデフォルトである。検証とJSONスキーマが不要な場合は、より軽いツールでもよい。

| ニーズ | 優先 |
| --- | --- |
| 判別共用体状態、境界パース、JSON/API 契約 | **Pydantic v2** frozen モデル |
| HTTP、キュー、永続化を越えるエラー/イベント | `kind` 判別子付き **Pydantic v2** |
| 外部シリアライズのない小さなプロセス内値オブジェクト | **`@dataclass(frozen=True, slots=True)`** または **attrs frozen** |
| 1 モジュール内のみで使う内部コマンド/結果タプル | **dataclass** または **NamedTuple** |
| 豊富なバリデータ、コンバーター、attrs エコシステムプラグイン | `frozen=True` の **attrs** |

```python
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: str
```

ログ、API、リポジトリ、イベントに現れる金額、ID、ライフサイクル状態はPydanticに置く。ドメインモジュールを離れないホットパスヘルパーにはdataclass/attrsを使う。

明示的なマッパーなしに、同じ概念をPydanticとdataclassの両方で表現しない。

## デコレータと明示的スタイル

Kamae Pythonは隠れた振る舞いより明示的なフィールド、コンストラクタ、関数引数を好む。効果が局所的でドメイン不変条件に置き換わらないとき、デコレータは共存できる。

| デコレータ | ドメイン/遷移コード | 境界/アダプターコード |
| --- | --- | --- |
| `@property` | アグリゲート状態では避ける。プレーンなフィールドを優先 | 薄いアダプタービューでは許容 |
| `@cached_property` | 避ける。「値」の中に時間依存や高コスト処理を隠す | 稀。事前計算値の注入を優先 |
| `@validate_call` | 純粋遷移では避ける。型はすでに狭いはず | 小さな parse/convert ヘルパーに有用 |
| `@functools.wraps` | インフラ境界のロギング/トレースラッパーで可 | 可 |

```python
# Prefer explicit fields on domain states.
class Waiting(DomainModel):
    kind: Literal["waiting"] = "waiting"
    request_id: UUID
    ...


# Avoid computed lifecycle state that performs I/O or caching.
class Waiting(DomainModel):
    @cached_property
    def display_label(self) -> str: ...  # hides work; hard to test in isolation
```

純粋遷移関数はすべての入力をパラメータとして受け取るべきである。デコレータが可観測な振る舞い（検証、キャッシュ、I/O）を変えるなら、遷移の外、アダプターまたはユースケースに置き、依存関係がシグネチャで見えるようにする。

既存フィールドからの純粋な導出でありI/Oを行わない場合、小さな不変値オブジェクトの `@property` は許容される：

```python
@dataclass(frozen=True, slots=True)
class DateRange:
    start: date
    end: date

    @property
    def days(self) -> int:
        return (self.end - self.start).days
```

Pydanticのフィールドバリデータや `model_validator` がデコレータ多用クラスに置き換わるときは、構築を単一の検証エントリポイントに保つため、frozenモデル上のバリデータを優先する。

## レビュー観点

### 呼び出し元が不変条件を迂回できないか — High

可変ドメインモデル、バリデーションのない公開フィールド、不変条件を持つ型でバリデータを飛ばす `model_construct` や生dict組み立てを指摘する。

複数フィールドの不変条件の一部だけを変えるミューテータや部分更新、再バリデーションの省略、無効な中間状態の流出を指摘する。

正規のコンストラクタ/アダプター経路での構築、非公開テストヘルパー、使用前に検証ドメインコンストラクタへ変換されるDTO/行モデルは指摘しない。

### 意味的プリミティブは明示的な型で表現されているか — High

ユーザー ID、注文ID、メールアドレス、金額、数量、外部参照など、区別されるドメイン概念に素の `str`、`int`、`float`、`UUID`、`dict` を直接使っている箇所を指摘する。

小さな凍結Pydanticモデル、`NewType`、`field_validator` / `model_validator` 付きの検証コンストラクタを提案する。

ローカル一時変数、非公開アダプターフィールド、テストリテラル、シリアライズ専用DTOフィールド、Python型以上のドメイン不変条件がない値は指摘しない。

### DTO、ORM 行、ドメイン状態は分離されているか — Medium

フレームワーク専用の関心、ORMミックスイン、外部データがバリデーションを迂回したり不変条件がストレージ形状に結びついたりする受信デシリアライズ設定を持つドメイン状態を指摘する。

意図的な読み取りモデル、APIレスポンスDTO、ドメイン状態へデシリアライズできない監査用エクスポート型は指摘しない。

### ドメイン状態は凍結かつ extra-forbid か — Medium

可変 `BaseModel` ドメイン状態、`frozen=True` の欠落、ライフサイクルモデルでの `extra="allow"`（プロジェクトが意図的例外を文書化していない場合）を指摘する。

### 状態は判別共用体で明示的にモデル化されているか — Medium

`status: str` と多数のオプションフィールドを持つ単一Pydanticモデルで、`kind: Literal[...]` の別凍結状態バリアントの方が必須フィールドを明確にできる場合を指摘する。

`domain-modeling.md` の `Annotated[A | B, Field(discriminator="kind")]` パターンと照合する。

### 金額、時刻、単位は明示的か — Medium

型や名前付きコンストラクタなしに単位、通貨、タイムゾーン、包含/排他範囲を混在させる金額、数量、期間、レート、タイムスタンプを指摘する。

### ドメインコードは概念ごとに整理されているか — Low

無関係な概念を集めたcatch-allの `models.py`、`types.py`、`schemas.py` や、振る舞いとデータを分離したモジュールを指摘する。

狭い境界づけられたコンテキスト目的のまとまったモジュール、生成スキーマモジュール、意図的に薄く保った互換シムは指摘しない。

