---
title: "ロギングとメトリクス"
sidebar:
  order: 10
---

> **いつ読むか:** ドメインオブジェクト、状態遷移、ユースケース、ドメインイベント周りにログ、メトリクス、トレース、可観測性を追加するとき。
> **関連:** [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/)、[`pii-protection.md`](/docs/kamae/python/references/pii-protection/)、[`state-transitions.md`](/docs/kamae/python/references/state-transitions/)。

## テレメトリシグナルには OpenTelemetry を優先する

ログ、メトリクス、トレースのデフォルトインターフェースとして **OpenTelemetry** を使う。アプリケーションに単一のベンダー中立モデルを与え、オペレーターがドメインコードを変えずにコレクター、バックエンド、ローカルエクスポーターへテレメトリをルーティングできる。

計装時の推奨パッケージ:

- API 表面には `opentelemetry-api`。
- SDK と組み込みエクスポーターには `opentelemetry-sdk`。
- コレクターへの OTLP エクスポートには `opentelemetry-exporter-otlp-proto-grpc` または `opentelemetry-exporter-otlp-proto-http`。

```python
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

resource = Resource.create({"service.name": "taxi-service"})
reader = PeriodicExportingMetricReader(OTLPMetricExporter(endpoint="..."))
metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))
```

## プルインターフェースは任意にする

Prometheus 向け `/metrics`、ローカル pprof エンドポイント、その他のプル型エクスポーターは**任意**である。ローカル開発、単一プロセスデプロイ、コレクターを置けない環境では有用だが、デフォルト要件ではない。

本番では OpenTelemetry Collector で OTLP を Prometheus remote-write またはスクレイプ形式に変換する。プルエンドポイントが必要なら、ドメインコード内に HTTP サーバーを埋め込むのではなく、明示的なアダプターまたは起動オプションとして追加する。

```python
# Optional: Prometheus pull endpoint only when enabled
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from prometheus_client import start_http_server

reader = PrometheusMetricReader()
metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))
start_http_server(port=9099)
```

ドメインとユースケースコードは選んだエクスポート機構から独立したままに保つ。

## OpenTelemetry 経由で構造化ログを使う

ログが OTLP、stdout、ファイルのどれに終わっても、同じ方法でログ属性を付与する。Python では通常、標準 `logging.Logger` の `extra` 辞書、またはレコードを OTLP ログレコードとして転送する OpenTelemetry `LoggingHandler` を使う。

```python
logger.info(
    "driver assigned",
    extra={
        "request_id": str(en_route.request_id),
        "transition": "assign_driver",
        "source_kind": waiting.kind,
        "target_kind": en_route.kind,
    },
)
```

機密値をメッセージ文字列にフォーマットしない。メッセージは安定させ、可変で非機密のコンテキストは属性に置く。

## ユースケースとアダプター周りにスパンを記録する

OpenTelemetry トレースでコマンドのライフサイクルを追う: ユースケース呼び出し、認可、遷移、イベント作成、永続化。ログとメトリクスと同じ安全な許可リスト集合からスパン属性を追加する。[`state-transitions.md`](/docs/kamae/python/references/state-transitions/#keep-use-cases-thin) の**正規**ユースケースを包む:

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("assign_driver_use_case") as span:
    span.set_attribute("request_id", str(request_id))
    waiting = await resolver.find_waiting(request_id)
    ...
```

スパン名は安定かつ低カーディナリティに保つ。リクエスト固有の識別子はスパン名ではなく属性に使う。

## ログ、メトリクス、ドメインイベントを区別する

- **ドメインイベント**はビジネス事実を記述し、アグリゲート履歴の一部として永続化される。
- **ログ**はオペレーター向け: 何が起きたか、どのオブジェクトに対してか、どの遷移かを説明する。
- **メトリクス**はダッシュボードとアラート向け: 安定名、低カーディナリティラベル、カウントまたは期間。

ビジネス監査要件をログに詰め込まず、ログ行をパースしてメトリクスを組み立てない。

## 意味のあるログメッセージを書く

ログメッセージは平易な言葉でビジネス事実を述べるべきだ。コードの実行方法ではなく、起きたことを過去形で優先する。

```python
logger.info("driver assigned", extra={"request_id": ...})
logger.info("trip completed", extra={"request_id": ...})
```

関数名をエコーするだけ、または内部ブランチ名をエンコードするメッセージは避ける:

```python
# Avoid
logger.info("process_request called")
logger.info("in assign_driver_use_case")
```

## ターゲットドメインオブジェクトの状態をログする

オペレーターがイベントを相関・診断するのに必要なフィールドを含める: 通常は `request_id` のような Tier C 相関 ID、アグリゲート `kind`、少数の Tier E 語彙フィールド。文字列補間ではなく構造化 `extra` フィールドを使う。

`request_id` だけでは調査に足りないときだけ、`passenger_id` や `driver_id` のような Tier D アカウント ID を追加する。Tier D ID をメトリクスラベルやメッセージテキストに使わない。

```python
logger.info(
    "driver assigned",
    extra={
        "request_id": str(en_route.request_id),
        "kind": en_route.kind,
    },
)
```

サポートや不正ワークフローでアクター連携が必要なときは、最小の Tier D 集合を追加する:

```python
logger.info(
    "driver assigned",
    extra={
        "request_id": str(en_route.request_id),
        "driver_id": str(en_route.driver_id),
        "kind": en_route.kind,
    },
)
```

Pydantic モデル全体をダンプしない。モデルダンプには PII、大きなネスト構造、内部フィールドの不安定なシリアライズが含まれうる。

```python
# Avoid
logger.info(f"driver assigned: {en_route.model_dump_json()}")
```

## 遷移処理には遷移情報を含める

ログ行が状態変化に伴うとき、遷移名、ソース状態 kind、ターゲット状態 kind を含める。純粋遷移の後にユースケースからログを出す（[`state-transitions.md`](/docs/kamae/python/references/state-transitions/#keep-use-cases-thin)）:

```python
logger.info(
    "driver assigned",
    extra={
        "request_id": str(en_route.request_id),
        "transition": "assign_driver",
        "source_kind": waiting.kind,
        "target_kind": en_route.kind,
    },
)
```

## 純粋遷移関数からロギングを除く

遷移関数は純粋のままであるべきだ。ロガーを呼び、時計を読み、ID を生成し、I/O を行ってはならない。結果を呼び出し側に返し、ユースケースまたはアダプターがログを出す。

## デフォルトで PII とシークレットをマスキングする

エラーとイベントと同じマスキングルールを適用する。[`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) のティアルールに従う:

- Tier A シークレットと Tier B 直接 PII: ログしない。
- Tier C 相関 ID: 構造化ログとトレース属性のみ。
- Tier D アカウント/アクター ID: 必要なとき構造化属性のみ。メッセージ文字列やメトリクスラベルには入れない。
- Tier E 語彙: メトリクスラベルとメッセージに安全。

名前、連絡先、資格情報、トークン、位置データのマスキングは [`pii-protection.md`](/docs/kamae/python/references/pii-protection/) を読む。

## 安定名と低カーディナリティラベルでメトリクスを設計する

メトリクス名はデプロイをまたいで安定であるべきだ。ラベルはユーザー生成やアグリゲートごとの値ではなく、有界なドメイン語彙から来るべきだ。

メーターは一度取得し（例: モジュールスコープ）、そこから計器を作る:

```python
from opentelemetry import metrics

meter = metrics.get_meter(__name__)
transition_counter = meter.create_counter(
    "taxi_request_transitions_total",
    description="Domain state transitions",
)
```

タクシードメイン向けの良いラベル:

```python
transition_counter.add(
    1,
    {
        "transition": "assign_driver",
        "source_kind": "waiting",
        "target_kind": "en_route",
        "outcome": "success",
    },
)
```

`request_id`、ユーザー ID、タイムスタンプ、自由形式の理由など高カーディナリティラベルは避ける。

## 可能ならドメインイベントからメトリクスを導出する

ドメインイベントはビジネス遷移の権威ある記録であるため、ユースケース全体にメトリクス呼び出しを散らすより、イベントストリームからカウンターとヒストグラムを導出することを優先する。即時メトリクスが必要なら、イベント作成の横で出し、両者を同期させる。

```python
event = driver_assigned_event(en_route, now)
domain_event_counter = meter.create_counter("taxi_request_domain_events_total")
domain_event_counter.add(1, {"event_name": event.event_name})
```

## 明示的なエラーコンテキストで失敗をログする

期待されるドメイン失敗では、スタックトレースや生の外部ペイロードではなく、エラー kind とドメインコンテキストをログする。

```python
match result:
    case Err(RequestNotFound(request_id=request_id)):
        logger.warning(
            "request not found",
            extra={"request_id": str(request_id), "error_kind": "request_not_found"},
        )
    case Err(InvalidState(current_kind=current_kind, expected_kind=expected_kind)):
        logger.warning(
            "invalid state for transition",
            extra={
                "current_kind": current_kind,
                "expected_kind": expected_kind,
                "error_kind": "invalid_state",
            },
        )
```

予期しないインフラ失敗は例外情報付きでログしてもよいが、ドメイン失敗は具体的に保つ。
