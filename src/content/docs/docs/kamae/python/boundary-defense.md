---
title: "境界防御"
sidebar:
  order: 10
---

> **いつ読むか:** API ペイロード、DB 行、環境変数、ファイル、キューメッセージ、外部 SDK レスポンスを受け入れるときに読む。
> **関連:** [`unsafe-boundaries.md`](/docs/kamae/python/unsafe-boundaries/)、[`pydantic-performance.md`](/docs/kamae/python/pydantic-performance/)、[`orm-adapters.md`](/docs/kamae/python/orm-adapters/)、[`error-handling.md`](/docs/kamae/python/error-handling/)。

## 未知のデータはエッジでパースする

API ボディ、DB 行、キューメッセージ、ファイル、環境変数、SDK レスポンスは、Pydantic が検証するまで未知として扱う。

```python
CreateRequestInputAdapter = TypeAdapter(CreateRequestInput)


def parse_create_request_input(raw: object) -> CreateRequestInput:
    return CreateRequestInputAdapter.validate_python(raw)
```

判別共用体の場合は、共用体アダプター経由でパースする。

```python
request = TaxiRequestAdapter.validate_python(raw_request)
```

生の JSON バイトまたは文字列には `validate_json` を使う。

```python
def parse_queue_message(body: bytes) -> TaxiRequestEvent:
    return TaxiRequestEventAdapter.validate_json(body)
```

ホットパスでは `json.loads` の後に `validate_python` するより、`model_validate_json` / `TypeAdapter.validate_json` を優先する。JSON パースとスキーマ検証は Pydantic の Rust コアで作業を共有できる。差が重要になる場合は [`pydantic-performance.md`](/docs/kamae/python/pydantic-performance/#validate-python-vs-validate-json) を読む。

## フレームワーク境界では DTO を優先する

フレームワークのリクエストモデルは DTO にできる。検証後にドメインコマンド値またはドメイン状態に変換する。フレームワーク専用の関心事をドメインモデルに漏らさない。

```python
class AssignDriverBody(BaseModel):
    driver_id: UUID


async def assign_driver_endpoint(body: AssignDriverBody) -> JSONResponse:
    result = await assign_driver_use_case(..., driver_id=body.driver_id, ...)
    return assign_driver_response(result)
```

Pydantic は形状と宣言されたバリデータを証明するが、すべてのドメイン意味は証明しない。HTTP の外でも適用されるビジネス不変条件については、ドメインコンストラクタ、コマンドビルダー、または遷移前提条件関数を権威の場所として保つ。

## 外部 DTO の設定

<!-- constrained-by ./domain-modeling.md -->

ドメイン状態は `extra="forbid"` と `frozen=True` を使う。外部境界の**インバウンド DTO**には別の設定プロファイルが必要だ。

### 外部 DTO の `strict=True`

ワイヤ向け DTO で strict パースを有効にし、強制変換がデータ品質の問題を隠さないようにする（`"123"` → `123`、`"true"` → `True`）。

```python
from pydantic import BaseModel, ConfigDict, Field


class CreateRequestInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    passenger_id: UUID
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
```

次のときに `strict=True` を使う:

- ペイロードが HTTP、キュー、Webhook、サードパーティ SDK から来る。
- 黙って強制変換するとビジネス意味が変わる（金額、真偽値、列挙）。
- 検証失敗を早く表面化し、上流のデータバグを見つけたい。

両側が Python コードで型がすでに一致する内部ハンドオフには `strict=True` を適用しない。安全性の利得なくコストが増える。[`pydantic-performance.md`](/docs/kamae/python/pydantic-performance/#reduce-work-without-bypassing-invariants) を読む。

`ConfigDict(strict=True)` はすべてのフィールドに `Strict*` 型（`StrictInt`、`StrictStr` など）を付けるのと等価である。DTO ではモデルレベルフラグを優先し、1 フィールドだけ強制変換が必要なときだけフィールド単位の strict 型を使う。

### `extra="allow"` vs `extra="forbid"` 決定表

| モデルの役割 | `extra` | `strict` | 根拠 |
| --- | --- | --- | --- |
| ドメイン状態 / イベント | `forbid` | default | 無効フィールドは永続化やログに入ってはならない |
| インバウンド HTTP/コマンド DTO | `forbid` | `True` | ドメイン変換前に未知または typo キーを拒否 |
| アウトバウンドレスポンス DTO | `forbid` | default | 意図しないフィールド漏洩を防ぐ |
| Webhook / パートナーフィード（バージョン寛容な取り込み） | `allow` | `True` | ベンダーの前方互換フィールドを受け入れ。既知部分のみドメインにマップ |
| ORM 行 / DB 投影 DTO | `forbid` | default | カラム集合は固定。余分なキーはマッパーバグの兆候 |
| 設定 / フィーチャーフラグスナップショット | `ignore` | default | 古いデプロイの未知キーは安全に捨てられる |
| 監査 / デバッグキャプチャ（非ドメイン） | `allow` | default | 生エンベロープは別保存。遷移には通さない |

**チェックリスト対応（4.3、4.4）:** ドメイン状態の `extra="allow"` をフラグする。欠落フィールドが黙って振る舞いを変えるとき、インバウンド DTO の広いデフォルトをフラグする。互換性の理由を文書化しない限り、明示的な必須フィールドと `extra="forbid"` を優先する。

`extra="allow"` が必要なときは、DTO をアダプターレイヤーに置き、宣言されたフィールドだけをドメインコンストラクタにマップする。許容的な DTO をドメインモデルにサブクラス化または継承しない。

### DTO デフォルトと未知フィールド

クライアントがフィールドを省略したときにビジネス意味が変わるデフォルトは避ける:

```python
# Risky: omitted "currency" silently becomes USD.
class ChargeInput(BaseModel):
    amount_cents: int
    currency: str = "USD"


# Prefer: require explicit values at the boundary.
class ChargeInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    amount_cents: int = Field(gt=0)
    currency: Literal["USD", "EUR", "JPY"]
```

オプショナルフィールドには、「未提供」が別の、文書化された意味であるときだけ `None` を使う。隠れたデフォルトを意味するときには使わない。

## 環境と CLI の境界

環境変数と CLI 由来の設定には [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) を使う。設定モデルは DTO として扱い、プロセス起動時に一度だけ検証し、ドメイン状態と混ぜない。

```bash
uv add pydantic-settings
```

```python
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="forbid",
        strict=True,
    )

    host: str
    port: int = 5432
    name: str
    user: str
    password: SecretStr


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="forbid")

    database: DatabaseSettings
    tenant_header: str = "X-Tenant-Id"
```

守るべき境界:

- **起動時にパース**する（コンポジションルート — `application-wiring.md`）。ユースケースや遷移内で `os.environ` を読まない。
- **`extra="forbid"`** はフィールドにマップされる環境変数名の typo を検出する。
- 資格情報には **`SecretStr`**。`model_dump()` で設定をログに出さない。
- **CLI フラグ**は `CliSettingsSource` または Pydantic モデルを構築する薄い argparse レイヤー経由で設定モデルに入れられる。env ベース設定と同じ検証ルール。
- **リクエストごとの値**（テナント ID、アクター ID）は設定ではない。リクエストコンテキストに属する。`BaseSettings` ではない。[`application-wiring.md`](/docs/kamae/python/application-wiring/) を参照。

## 認可とテナント境界

<!-- constrained-by ./error-handling.md -->

**チェックリスト対応（4.6）:** 認証済みコンテキストと比較せずに、パス、クエリ、ボディ、メッセージペイロードのテナントまたはアクター ID を信頼しない。

### API ゲートウェイ注入パターン

よくある構成:

```text
Client → API gateway (authn) → service (authz + domain)
         injects: tenant_id, subject, scopes
```

ゲートウェイはセッションまたはトークンを検証し、信頼できるヘッダーを転送する。サービスはそのテナントに対して操作が許可されているかを依然として検証する。

```python
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class RequestContext:
    tenant_id: UUID
    actor_id: UUID
    scopes: frozenset[str]


class AssignDriverBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    driver_id: UUID
    # Do NOT accept tenant_id from body when gateway already established tenant.


async def assign_driver_endpoint(
    body: AssignDriverBody,
    ctx: RequestContext,  # from middleware / dependency
    request_id: UUID,  # from path
) -> JSONResponse:
    result = await assign_driver_use_case(
        ctx=ctx,
        request_id=request_id,
        driver_id=body.driver_id,
    )
    return assign_driver_response(result)
```

### ドメインレイヤーでの検証

認可は**ユースケース**に属する。読み込みの後、遷移の前:

```python
async def assign_driver_use_case(
    ctx: RequestContext,
    request_id: UUID,
    driver_id: UUID,
    *,
    store: RequestStore,
    resolver: RequestResolver,
) -> Result[EnRoute, AssignDriverError]:
    waiting = await resolver.find_waiting(request_id)
    if waiting is None:
        return Err(RequestNotFound(request_id=request_id))

    # Tenant ownership is a domain/application invariant, not a DTO concern.
    if waiting.tenant_id != ctx.tenant_id:
        return Err(RequestNotFound(request_id=request_id))  # or TenantMismatch

    if "driver:assign" not in ctx.scopes:
        return Err(Forbidden())

    en_route, events = assign_driver(waiting, driver_id, now=utc_now())
    await store.save_en_route(en_route, events, expected_version=waiting.version, ...)
    return Ok(en_route)
```

ルール:

- すべての変更コマンドでリソースの `tenant_id` を `ctx.tenant_id` と比較する。
- テナント横断の ID プロービングには `404` または汎用拒否を優先する。方針を文書化する。
- 永続化で FK 制約を強制できるよう、アグリゲート状態または行 DTO に `tenant_id` を置く。
- キューコンシューマーは未認証ペイロードフィールドではなく、署名付きメッセージメタデータから `RequestContext` を再構築する。

## ドメイン状態では余分なフィールドを禁止する

ドメイン状態とイベントモデルに `extra="forbid"` を使い、存在すべきでないフィールドを黙って受け入れない。ログと永続化では、意図しないレイヤーを通過する余分なフィールドが機密データを運ぶ可能性がある。

## 未検証キャストを避ける

`typing.cast`、`# type: ignore`、未検証の `dict[str, Any]`、`model_construct` で境界データを信頼済みドメインオブジェクトにしてはならない。これらは検証を迂回する。

許容される狭い例外:

- データベースドライバーまたは先行する Pydantic パースですでに検証された値を受け取る、テスト済みマッパー内の `model_construct`。[`unsafe-boundaries.md`](/docs/kamae/python/unsafe-boundaries/#model_construct-in-orm-mappers) を読む。
- 近くに実行時検証と短いコメントがあるフレームワーク制限まわりの `cast`。

生成クライアント、ネイティブアダプター、ORM はしばしば広すぎる、または信頼しすぎる型の値を返す。まず DTO/行モデル経由で変換し、その後ドメインモデルへ。

## スキーマ経由で永続化と再水和

データベースから読むときは、ユースケースに渡す前に行をドメインモデルにパースする。データベースに書くときは、ドライバーに応じて `model_dump(mode="python")` または `model_dump(mode="json")` で意図的にダンプする。

```python
def request_from_row(row: Mapping[str, object]) -> TaxiRequest:
    return TaxiRequestAdapter.validate_python(row)


def request_to_row(request: TaxiRequest) -> dict[str, object]:
    return request.model_dump(mode="python")
```

ORM モデルをデフォルトでドメインモデルにしてはならない。永続化の関心事、遅延ロード、nullable カラム、ドメイン不変条件を弱める余分なフィールドを運ぶ。

## ドメイン外で検証エラーを処理する

Pydantic は `ValidationError` を投げる。コントローラー、メッセージコンシューマー、CLI ハンドラー、またはマッパーレイヤーで捕捉し、ローカルのエラー/レスポンス形状に変換する。すでに信頼すべきデータの検証エラーを純粋遷移関数が捕捉してはならない。

### HTTP マッピング

```python
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError


def validation_error_response(exc: ValidationError | RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "details": [
                {
                    "loc": list(err["loc"]),
                    "type": err["type"],
                    "msg": err["msg"],
                }
                for err in exc.errors()
            ],
        },
    )


@app.exception_handler(ValidationError)
async def pydantic_validation_handler(_: Request, exc: ValidationError) -> JSONResponse:
    return validation_error_response(exc)
```

シークレットを含む可能性があるフィールドについてレビューせず、生の Pydantic エラー dict をクライアントに返さない。公開レスポンスから入力値を除去する。

### gRPC マッピング

```python
import grpc
from pydantic import ValidationError


def validation_error_status(exc: ValidationError) -> grpc.aio.ServicerContext:
    # Return INVALID_ARGUMENT; attach sanitized details in trailing metadata if needed.
    details = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
    return grpc.StatusCode.INVALID_ARGUMENT, details
```

形状違反は `INTERNAL` ではなく `INVALID_ARGUMENT` にマップする。

### キュー / ワーカーマッピング

```python
async def handle_message(body: bytes) -> None:
    try:
        event = TaxiRequestEventAdapter.validate_json(body)
    except ValidationError as exc:
        logger.warning("dropping invalid message", extra={"error_count": exc.error_count()})
        await dead_letter.publish(body, reason="validation_error")
        return  # do not retry forever on poison shape

    await process_event(event)
```

恒久的な検証失敗の poison メッセージはデッドレターキューへ。一時的失敗はバックオフ付きリトライ。[`persistence-events.md`](/docs/kamae/python/persistence-events/#outbox-relay-at-least-once-delivery) を読む。

### レイヤーの責務

| レイヤー | `ValidationError` を捕捉? | 返すもの |
| --- | --- | --- |
| HTTP コントローラー / gRPC サーバー | はい | 422 / `INVALID_ARGUMENT` |
| キューコンシューマー | はい | DLQ またはメトリクス + 破棄 |
| CLI | はい | 終了コード 2 + stderr |
| DTO → ドメインマッパー | はい（またはコントローラーへバブル） | ドメインエラーまたは再送出 |
| 純粋遷移 | いいえ | N/A |
| ユースケース（信頼済み状態） | いいえ | N/A |

## レビュー観点

### 4.1 外部境界はすべて DTO → ドメインで変換されているか — High

HTTP ハンドラ、キューコンシューマ、DB 行マッパー、ファイル/設定/環境変数リーダー、CLI パーサーが検証済み変換なしに生データをドメインロジックへ渡している箇所を指摘する。

値がアダプター層に留まる生 DTO/読み取りモデル構築、検証アダプターまたはコンストラクター経路内の直接ドメイン構築は指摘しない。

### 4.2 Pydantic を唯一の境界バリデータとみなしていないか — High

非空文字列、有効 ID、正の金額、範囲、クロスフィールドルールなど、ドメイン不変条件を `model_validate` だけに頼り、ドメインコンストラクタや遷移前提がまだ必要な箇所を指摘する。

### 4.3 ドメイン状態は外部形式向けに過剰設定されていないか — Medium

別 DTO/行で不変条件やマスクを守れるのに、受信 `extra="allow"`、緩いエイリアス設定、ドメイン状態への ORM/セッション結合を指摘する。

意図的な読み取りモデル、投影、レスポンス専用 DTO は指摘しない。

### 4.4 DTO のデフォルトと未知フィールドは意図的か — Medium

欠落や誤綴り入力がビジネス意味を変えうるのに、広いデフォルト、オプションフィールド、緩い未知フィールド処理を使う受信 DTO を指摘する。互換性が不要なら明示デフォルトと `extra="forbid"` を優先する。

### 4.5 境界で未検証キャストと `Any` を避けているか — High

信頼ドメインオブジェクト作成に `typing.cast`、`# type: ignore`、未検証 `dict[str, Any]`、`model_construct`、未知ペイロードの添字アクセスを使っている箇所を指摘する。

### 4.6 認可とテナント境界はチェックされているか — High

ドメイン操作前に、パス/ボディのテナント ID、アクター ID、所有権主張を認証コンテキストと比較せず信頼しているハンドラやユースケースを指摘する。
