---
title: "PII 保護"
sidebar:
  order: 10
---

> **いつ読むか:** ドメインモデル、DTO、ログ、メトリクス、エラー、トレース、イベントに個人データ、資格情報、トークン、顧客識別フィールドが含まれるとき。
> **関連:** [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/)（ティアルールとチャネル方針）、[`logging-metrics.md`](/docs/kamae/python/references/logging-metrics/)、[`persistence-events.md`](/docs/kamae/python/references/persistence-events/)。

ティア付き許可リストとチャネルルールは [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) にある。この文書はマスキングラッパーと露出方針を扱う。

## デフォルトでマスキングする

個人データとシークレットは誤ってログに出しにくくすべきである。PII には氏名、メールアドレス、電話番号、住所、政府発行 ID、支払い識別子、健康データ、IP アドレス、デバイス識別子、精密な位置、人またはアカウントを識別できるテナント/顧客識別子が含まれる。

資格情報とシークレットにはパスワード、API キー、OAuth トークン、セッション Cookie、暗号素材、署名鍵、Webhook シークレットが含まれる。

機密フィールドには小さな値オブジェクトまたはプロジェクトローカルのマスキングラッパーを使う。

```python
from typing import Generic, TypeVar

from pydantic import SecretStr

T = TypeVar("T")


class Redacted(DomainModel, Generic[T]):
    value: T

    def __repr__(self) -> str:
        return "Redacted(value='***')"

    def __str__(self) -> str:
        return "***"


class CustomerContact(DomainModel):
    email: Redacted[str]
    phone: Redacted[str] | None = None


class PaymentGatewayCredentials(DomainModel):
    api_key: SecretStr
```

資格情報には `SecretStr` / `SecretBytes` を、平文がときどき必要な PII には型付きマスキングラッパーを優先する。

## 平文露出は狭く、名前付きに保つ

メール配信、決済プロセッサ、暗号化、監査エクスポート、ID プロバイダ呼び出しなど、本当に必要なアダプターでのみ機密値を露出する。目的に合わせて露出メソッドに名前を付ける。

```python
class EmailAddress(DomainModel):
    value: str

    def expose_for_delivery(self) -> str:
        return self.value
```

プロジェクトに明確なラッパー方針とレビュー文化がない限り、`raw()`、`value`、`as_str()` のような広いゲッターは避ける。

## 自動マスキング用のロギングフィルター

多層防御: 開発者が構造化フィールドを正しく使っても、フォーマット済みログレコードを横取りし、ハンドラーが出力する前に既知の PII パターンをマスキングする。

```python
import logging
import re
from typing import ClassVar


EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


class PiiRedactionFilter(logging.Filter):
    """Redact common PII patterns from log message text and string ``extra`` values."""

    _patterns: ClassVar[tuple[re.Pattern[str], ...]] = (EMAIL_RE, PHONE_RE)

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self._redact(record.msg)
        if isinstance(record.args, dict):
            record.args = {k: self._redact(v) for k, v in record.args.items()}
        elif isinstance(record.args, tuple):
            record.args = tuple(self._redact(a) for a in record.args)
        for key, value in record.__dict__.items():
            if key.startswith("_"):
                continue
            if isinstance(value, str):
                setattr(record, key, self._redact(value))
        return True

    def _redact(self, value: object) -> object:
        if not isinstance(value, str):
            return value
        redacted = value
        for pattern in self._patterns:
            redacted = pattern.sub("[REDACTED]", redacted)
        return redacted


def configure_logging() -> None:
    root = logging.getLogger()
    root.addFilter(PiiRedactionFilter())
```

注意:

- フィルターは型付き `Redacted` モデルと許可リスト化された `extra` キーを**補完**するが置き換えない。
- プロジェクト固有のパターン（政府 ID、内部アカウント形式）を明示的に追加する。
- 完全な `model_dump()` 出力をログに出さない。事後には構造化規律をフィルターで回復できない。
- [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) のティアルールは依然として適用される。構造化フィールドのシークレットに正規表現だけを頼らない。

## OpenTelemetry スパン属性

ベンダーへエクスポートするスパン名、イベント、属性から PII を除外する。

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import SpanProcessor, ReadableSpan


class PiiScrubbingProcessor(SpanProcessor):
    _blocked_keys = frozenset({"email", "phone", "password", "authorization", "cookie"})

    def on_end(self, span: ReadableSpan) -> None:
        for key in list(span.attributes or {}):
            if key.lower() in self._blocked_keys:
                # Prefer not setting these attributes at instrumentation sites.
                pass


tracer = trace.get_tracer(__name__)


def record_assignment(request_id: UUID, reason: str) -> None:
    with tracer.start_as_current_span("assign_driver") as span:
        span.set_attribute("request_id", str(request_id))  # Tier C — OK
        span.set_attribute("reason", reason)  # bounded vocabulary — OK
        # span.set_attribute("passenger_email", ...)  # never
```

実践:

- スパン**名**は低カーディナリティ（`assign_driver`。`assign_driver:{user_id}` ではない）。
- 運用に必要なときだけ Tier C/D ID を属性に置く。コードレビューで Tier A/B キーをブロックする。
- 純粋遷移の内側ではなく、アダプターで `trace.use_span` コンテキストを使う。
- サードパーティへ OTLP エクスポートするときは、Tier D 属性を完全に除去する `SpanExporter` ラッパーを検討する。

## イベントペイロードにおける GDPR のデータ最小化

イベントスキーマは何年も存続する。設計時点で最小化を適用する:

| 原則 | 実践 |
| --- | --- |
| ハンドラーが必要なものだけ収集 | 名前より ID を優先。表示フィールドは消費時に読み取りモデルから取得 |
| 連絡先データのスナップショットを避ける | 下流ハンドラーに他の参照経路が本当にない場合を除き、`DriverAssigned` にメール/電話を埋め込まない |
| 法的根拠を文書化 | PII が意図的なとき（監査、請求エクスポート）はイベントクラスの docstring に記載 |
| 保持 | PII を含むイベントには保持 TTL またはコンパクションジョブを組み合わせる |
| 消去 | 消去要求が関連イベントストリームを対象にできるよう `aggregate_id` キーを設計 |

バージョン付きイベントにフィールドを追加する前に [`persistence-events.md`](/docs/kamae/python/references/persistence-events/#event-schema-evolution) を読む。

## ログ、メトリクス、エラー、イベントをマスキングする

機密値をドメインエラー、例外メッセージ、ログ、トレーススパン、メトリクスラベル、タスク名、キュー名、キャッシュキー、パニック風診断にフォーマットしてはならない。

Pydantic モデル全体をダンプするのではなく、許可リスト化されたログフィールドを使う。シークレット、直接 PII、相関 ID、アカウント ID、メトリクス安全な語彙を分離するティア基準は [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) を読む。

```python
logger.info(
    "driver assignment rejected",
    extra={"request_id": str(request_id), "reason": error.kind},
)
```

イベントまたは監査レコードに PII を含める必要があるなら、イベントモデルの docstring に保持、アクセス、マスキングの期待を文書化し、スキーマを明示的に保つ。

## シリアライズ方針

`model_dump` / `model_dump_json` を意図的に使う。任意のドメインオブジェクトをログやメトリクスにシリアライズしない。公開レスポンスには、露出を意図したフィールドだけを含むレスポンス DTO を作る。

Pydantic の `SecretStr` は表現をマスキングするが、`get_secret_value()` で平文を露出できる。そのメソッドはアダプター境界として扱い、呼び出しを監査しやすく保つ。

## マスキングのテスト

ラッパーとロギング境界でマスキングをアサートする。コードが動くだけでは不十分。

```python
def test_redacted_repr_masks_email() -> None:
    contact = CustomerContact(email=Redacted(value="user@example.com"))
    assert "user@example.com" not in repr(contact)
    assert "user@example.com" not in str(contact)


def test_secret_str_not_in_model_repr() -> None:
    creds = PaymentGatewayCredentials(api_key=SecretStr("sk_live_secret"))
    dumped = repr(creds)
    assert "sk_live_secret" not in dumped


def test_pii_filter_scrubs_message() -> None:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="contact user@example.com",
        args=(),
        exc_info=None,
    )
    assert PiiRedactionFilter().filter(record) is True
    assert "user@example.com" not in record.msg
    assert "[REDACTED]" in record.msg


def test_assign_driver_error_does_not_echo_pii(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        logger.info("failed", extra={"request_id": "...", "reason": "invalid_state"})
    for record in caplog.records:
        assert "@" not in record.getMessage()
```

本番の PII 漏洩を修正したときは回帰テストを追加する。`repr`、`str`、ログ `extra`、HTTP レスポンスボディで禁止部分文字列をチェックすることを優先する。
