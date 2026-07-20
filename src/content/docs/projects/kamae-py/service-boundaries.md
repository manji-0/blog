---
title: "サービス境界"
sidebar:
  order: 10
---

他サービスのHTTPやgRPC、キュー、Protobuf/JSON契約は、プロセス内の境界よりスキーマ進化と冪等性の問題が前面に出る。未知バージョンで例外を投げるコンシューマは本番で連鎖障害になりうる。

境界パースの基本は [境界防御](/projects/kamae-py/boundary-defense/)、イベントの保存と重複排除は [永続化、集約、イベント](/projects/kamae-py/persistence-events/)、ストリーム側の処理は [ストリームと継続クエリ](/projects/kamae-py/stream-continuous-queries/) を参照する。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./infrastructure-resilience.md -->

## リモートサービスも外部境界として扱う

マイクロサービス境界はDTO境界である。モノリス内のHTTP handlerやqueue consumerと同様、ワイヤメッセージをPydanticで検証し、ドメインコマンドまたはintegration eventに変換する。

```text
Protobuf / JSON message -> integration DTO (TypeAdapter) -> domain command or event
```

他サービスの生成protobuf stub、OpenAPIクライアントモデル、SDKレスポンス型をドメインパッケージにimportしない。生成クライアントはinfrastructureまたは専用 `*-api` パッケージに置き、アダプタ境界でドメイン型にマップする。

```python
from pydantic import BaseModel, ConfigDict, TypeAdapter


class AssignDriverMessageDto(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    request_id: str
    driver_id: str
    idempotency_key: str
    schema_version: int = 1


AssignDriverMessageAdapter = TypeAdapter(AssignDriverMessageDto)


def to_command(dto: AssignDriverMessageDto) -> AssignDriverCommand:
    return AssignDriverCommand(
        request_id=RequestId.parse(dto.request_id),
        driver_id=DriverId.parse(dto.driver_id),
        idempotency_key=IdempotencyKey.parse(dto.idempotency_key),
    )
```

## JSON と Protobuf スキーマ進化

producerとconsumerは独立デプロイを前提とする。永続化またはキューされるメッセージには明示的互換ポリシーが必要。

| 変更 | 互換性 | 推奨アプローチ |
| --- | --- | --- |
| optionalフィールド追加 | 後方互換 | default付き新フィールド。consumerはintegration DTOで未知フィールドを無視 |
| union / discriminator variant追加 | 注意付き前方互換 | `schema_version` またはイベント版を上げる。旧consumerは未知variantをスキップまたはdead-letter |
| フィールドrename | ワイヤ上breaking | 新フィールド追加と旧deprecate。移行中はdual-read |
| フィールド型変更 | breaking | 新メッセージ型またはenvelopeの新 `schema_version` |
| フィールド削除 | deprecate後breaking | dual-read後、全producerが書き込みを止めてから削除 |

サービス境界を越えるeventにはversion付きenvelopeでpayloadを包む：

```python
class IntegrationEventEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    event_type: str
    schema_version: int
    correlation_id: str | None = None
    payload: dict[str, object]
```

consumerは：

1. `event_type` と `schema_version` でルーティング
2. version固有DTOに `TypeAdapter` でデシリアライズ
3. DTO → ドメインintegration eventを検証付きコンストラクタで変換
4. 未知versionは未処理例外ではなくdead-letterまたはmetricでカウント

1サービス内のドメインイベント版管理は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を優先する。

## メッセージキューと非同期統合

queue consumerはat-least-once配送を継承する。handlerは冪等でなければならず、broker契約が保証しない限りパーティション間の順序を仮定しない。

```python
async def handle_delivery(
    body: bytes,
    *,
    processed: ProcessedCommandStore,
    use_case: AssignDriverUseCase,
) -> None:
    dto = AssignDriverMessageAdapter.validate_json(body)
    command = to_command(dto)
    if await processed.exists(command.idempotency_key):
        return
    result = await use_case.execute(command)
    if result.is_err():
        raise HandlerError.from_domain(result.error)
    await processed.record(command.idempotency_key)
```

可能ならidempotency keyを副作用と同じstoreに永続化する。outbox公開とconsumer dedupeは [永続化、集約、イベント](/projects/kamae-py/persistence-events/) に合わせる。

恒久的な `ValidationError`（poison shape）はdead-letter queueへ。一時的なインフラ障害はバックオフ付きリトライ — [境界防御](/projects/kamae-py/boundary-defense/) のキュー/workerマッピングを参照。

## レジリエンスはアダプタ層

サーキットブレーカー、タイムアウト、リトライ、レート制限はインフラアダプタに属する — ドメイン遷移やユースケースのビジネスルールではない。

| Control | Where | Domain impact |
| --- | --- | --- |
| Timeout | `httpx` / gRPC client builder | 型付き `BillingError.timeout` にマップ |
| Retry with backoff | 外部APIを呼ぶアダプタ | 冪等readまたは明示keyed writeのみリトライ |
| Circuit breaker | client middleware | ユースケースへ `BillingError.unavailable` |
| Rate limit | gatewayまたはoutbound client | `BillingError.rate_limited` にマップ。ドメインでspinしない |

```python
async def charge(self, request: ChargeRequest) -> Result[ChargeReceipt, AssignDriverError]:
    try:
        response = await self._client.post("/charges", json=request.to_dto())
    except httpx.TimeoutException:
        return Err(AssignDriverError.billing_timeout)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            return Err(AssignDriverError.billing_rate_limited)
        if exc.response.status_code >= 500:
            return Err(AssignDriverError.billing_unavailable)
        return Err(AssignDriverError.billing_rejected)

    receipt = ChargeReceiptAdapter.validate_python(response.json())
    return Ok(receipt)
```

ユースケースが失敗をリトライ可能とするか補償とするか決める。アダプタがポリシーを実行する — [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) と併せて読む。

## サービス横断の相関

outbound呼び出しとqueueメッセージに `correlation_id`、OpenTelemetry `trace_id` / span context、テナントコンテキストを伝播する。ingressアダプタのspanに設定し、headerまたはmessage属性に注入する。

分散traceをドメイン監査ログと混同しない。耐久性が必要ならoutbox経由でビジネスeventを永続化 — [ロギングとメトリクス](/projects/kamae-py/logging-metrics/) と [ログ可能な識別子](/projects/kamae-py/loggable-identifiers/) を参照。

## 契約テスト

2サービスがprotobufまたはJSONスキーマを共有するとき：

- OpenAPI / protobufクライアントをCIで再生成するか、check-in stubに更新jobを置く
- リリース前にconsumer-driven契約テストまたはbreaking変更検出を実行
- 各サポート `schema_version` のfixtureメッセージをテストに保持

## 検出ヒント

`pyproject.toml` に `grpcio`、`protobuf`、`httpx`、`aiohttp`、`celery`、`kombu`、`aiokafka`、`redis` などがあるとき、このガイドを [境界防御](/projects/kamae-py/boundary-defense/) とconsumer/projection向け [ストリームと継続クエリ](/projects/kamae-py/stream-continuous-queries/) と一緒に読み込む。

## レビューで見るところ

破壊的なフィールド改名や `schema_version` 欠落はないか。未知イベント版で未処理例外を投げていないか。冪等キーなしに副作用を適用するコンシューマはないか（[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）。protobuf / JSON / キューペイロードを `TypeAdapter` なしにドメインへ渡していないか。リトライやブレーカがドメイン内になく、生成クライアント型がドメインパッケージに漏れていないか。入口の `correlation_id` やトレースは外向き呼び出しへ伝播しているか。
