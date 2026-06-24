---
title: "PII と観測経路の保護"
sidebar:
  order: 10
---

> **いつ読むか:** ドメインモデル、DTO、ログ、メトリクス、エラー、トレース、イベントに個人データ、資格情報、トークン、識別子が含まれるときに読む。
> **関連:** [`logging-metrics.md`](/docs/kamae/python/logging-metrics/)、[`persistence-events.md`](/docs/kamae/python/persistence-events/)、[`test-data.md`](/docs/kamae/python/test-data/)。

デフォルト方針は**デフォルトでマスキング**である。まずログ可能な識別子かを判断し、次にマスキングと露出方針を適用する。

## 3 つの質問

順に問う:

1. **値は人、世帯、または口座名義人を直接、または容易な参照で識別するか?**
   はいなら、監査またはコンプライアンス経路が明示的に文書化されていない限り、機密として扱う。
2. **チャネルは有界でアクセス制御されているか?**
   信頼できるバックエンド内のログとトレースは、クライアント可視エラー、メトリクスラベル、サードパーティエクスポートとは異なる。
3. **チャネルは低カーディナリティを必要とするか?**
   メトリクス、アラート名、タスク名、キュー名にリクエストごとまたはユーザーごとの ID を載せてはならない。

いずれかの答えがチャネルをブロックするなら、識別子をマスキングまたはハッシュする。

## 識別子ティア

| ティア | 意味 | ログ / トレース | エラー（クライアント可視） | メトリクスラベル | メッセージ文字列 |
| --- | --- | --- | --- | --- | --- |
| **A — シークレット** | 資格情報とセッション素材 | 決して | 決して | 決して | 決して |
| **B — 直接 PII** | 氏名、メール、電話、住所、政府 ID、支払い PAN、健康データ、精密位置 | 決して | 決して | 決して | 決して |
| **C — 相関** | 1 ワークフローまたはアグリゲート用のシステム生成 ID | 構造化属性で可 | 通常不可。不透明エラーコードを使う | 決して | 決して |
| **D — アカウント / アクター** | ユーザー、顧客、ドライバー、テナント、デバイスにマップする ID | 運用に必要なら構造化属性で可 | 文書化された要求がない限り不可 | 決して | 決して |
| **E — 語彙** | 有界な列挙と状態 kind | 可 | 可 | 可 | 可 |

### ティア A — ログしない

- パスワード、API キー、OAuth トークン、セッション Cookie、リフレッシュトークン
- 署名鍵、Webhook シークレット、暗号鍵
- `get_secret_value()` からの `SecretStr` / `SecretBytes` 平文

`SecretStr`、`Redacted`、またはアダプター専用露出を使う。暗号化監査レコードで文書化された保持がある場合を除き、`extra`、スパン属性、エラー、イベントに置かない。

### ティア B — ログしない

- 氏名、メールアドレス、電話番号、郵便住所
- 政府 ID、支払いカード番号、銀行口座番号
- 健康データ、生体識別子
- 精密 GPS 座標、完全な住所
- ユーザー向けシステムの生 IP アドレス（デフォルトで機密扱い）

ワークフローが連絡先データを必要とするときは、メール/SMS/決済を送るアダプターに置き、一般アプリケーションログから外す。

### ティア C — 相関 ID（ログとトレースは可、メトリクスは不可）

ログバックエンドがアクセス制御されているとき、構造化ログ `extra` とトレーススパン属性では**通常安全**:

- `request_id`、`order_id`、`aggregate_id`、`event_id`、`idempotency_key`
- `correlation_id`、`trace_id`、`span_id`、`causation_id`
- 公開参照 API のない内部サロゲートキー（例: 配車リクエストの UUID 主キー）

ルール:

- **名前付き構造化フィールド**として記録し、ログメッセージへ補間しない。
- メトリクスラベル、スパン名、タスク名、キャッシュキーに使わない。
- 匿名と仮定しない。保持とアクセス制御を伴う運用データとして扱う。

### ティア D — アカウント / アクター ID（条件付き）

**アカウントまたは人にリンク**し、より厳しいルールが必要:

- `passenger_id`、`driver_id`、`customer_id`、`user_id`、`account_id`
- `tenant_id`、`organization_id`、`device_id`、`session_id`
- 外部プロバイダー ID（`stripe_customer_id`、OAuth `sub`、ロイヤルティ番号）

デフォルトルール:

- **ログ / トレース:** オペレーターがサポートチケット、不正レビュー、ライフサイクルデバッグで相関する必要があるとき、構造化属性で許可。
- **クライアントへ返すエラー:** 不透明エラーコードを使う。API 契約が明示的に露出しない限りこれらの ID をエコーしない。
- **メトリクス:** ラベルに決して使わない。
- **メッセージ文字列:** 補間しない。構造化フィールドのみ。
- **境界横断エクスポート:** ログが本番信頼ゾーンを離れるとき（ベンダー SIEM、サポートツール、長期コールドストレージなど）はハッシュまたはトークン化。

2 つの Tier D ID が同じ行で再識別を容易にするとき（例: 同じ行の `passenger_id` + `driver_id`）、タスクに必要な最小集合をログする。十分ならアグリゲート `request_id` を優先する。

### ティア E — 語彙（どこでも安全）

閉じた集合からの低カーディナリティ値:

- `kind`（現在のアグリゲート状態）、`source_kind`、`target_kind`
- `transition`、`event_name`、`error_kind`、`outcome`
- HTTP メソッド、ルートテンプレート、テナントプラン階層、リージョンコード（集合が小さく固定のとき）

これらがメトリクスラベルとアラートグルーピングの主要入力である。

## チャネルルール

| チャネル | 許可内容 | 避けるもの |
| --- | --- | --- |
| ログメッセージ本文 | 平易な言葉での安定したビジネス事実 | ID、PII、ペイロード、`model_dump_json()` |
| ログ `extra` / OTel ログ属性 | Tier C、Tier D（必要時）、Tier E | Tier A、Tier B、モデル全体ダンプ |
| トレーススパン属性 | ログ `extra` と同じ | Tier A、Tier B、スパン名としての高カーディナリティ ID |
| メトリクスラベル | Tier E のみ | リクエストごと・ユーザーごとの ID |
| ドメインエラー（プロセス内） | Tier C と Tier E。呼び出し側が必要なら Tier D | Tier A、Tier B |
| 公開 API / RPC エラー | Tier E コードとメッセージ | Tier B。契約が要求しない限り Tier D |
| ドメインイベント（永続化） | イベント契約に必要な Tier C–E | Tier A。専用監査イベントでのみ Tier B（保持文書付き） |

## 決定例（タクシードメイン）

| 識別子 | ティア | ログ `extra` | メトリクスラベル | 備考 |
| --- | --- | --- | --- | --- |
| `request_id` | C | はい | いいえ | ライフサイクル相関の優先キー |
| `event_id` | C | はい | いいえ | アウトボックスとリプレイデバッグに適する |
| `passenger_id` | D | 必要時 | いいえ | 十分なら `request_id` を優先 |
| `driver_id` | D | 必要時 | いいえ | `passenger_id` と同様 |
| `transition` | E | はい | はい | `"assign_driver"` |
| `source_kind` / `target_kind` | E | はい | はい | `"waiting"` → `"en_route"` |
| `error_kind` | E | はい | はい | `"request_not_found"` |
| 乗客メール | B | いいえ | いいえ | アダプターのみ |
| OAuth アクセストークン | A | いいえ | いいえ | `SecretStr` のみ |

## 推奨許可リストパターン

ロギングヘルパー、トレース属性セッター、エラーマッパーで使うプロジェクトローカル許可リストを 1 つ定義する。

```python
LOGGABLE_CORRELATION_FIELDS = frozenset(
    {
        "request_id",
        "aggregate_id",
        "event_id",
        "idempotency_key",
        "correlation_id",
        "trace_id",
    }
)

LOGGABLE_ACTOR_FIELDS = frozenset(
    {
        "passenger_id",
        "driver_id",
        "tenant_id",
    }
)

METRIC_LABEL_FIELDS = frozenset(
    {
        "transition",
        "source_kind",
        "target_kind",
        "event_name",
        "error_kind",
        "outcome",
    }
)


def log_context(**fields: object) -> dict[str, object]:
    allowed = LOGGABLE_CORRELATION_FIELDS | LOGGABLE_ACTOR_FIELDS | METRIC_LABEL_FIELDS
    return {key: value for key, value in fields.items() if key in allowed}
```

アダプター境界で許可リストを使う。ドメインとユースケースコードはモデルをダンプするのではなく、明示的なフィールド名を渡すべきである。

## ログが信頼ゾーンを離れるときのハッシュ

ログやトレースがベンダー、分析、長期保持ストアに複製されるとき、Tier D 値を安定ハッシュに置き換える:

```python
import hashlib


def hash_for_export(value: str, *, pepper: str) -> str:
    digest = hashlib.sha256(f"{pepper}:{value}".encode()).hexdigest()
    return digest[:16]
```

ペッパーローテーションと、サポートスタッフが内部参照ツールでマッピングを逆引きできるかを文書化する。

## テスト

可観測性テストでは次をアサートする:

- Tier A と B の値がログ出力、スパン属性、メトリクスラベルに決して現れない。
- Tier C と D の値は構造化フィールドにのみ現れ、メッセージ文字列内には現れない。
- メトリクスエクスポートには Tier E ラベルのみ含まれる。
- 公開エラーレスポンスが Tier B または予期しない Tier D を漏らさない。

フィクスチャ指針は [`test-data.md`](/docs/kamae/python/test-data/) を参照。

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
- 上記の識別子ティア のティアルールは依然として適用される。構造化フィールドのシークレットに正規表現だけを頼らない。

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

バージョン付きイベントにフィールドを追加する前に [`persistence-events.md`](/docs/kamae/python/persistence-events/#event-schema-evolution) を読む。

## ログ、メトリクス、エラー、イベントをマスキングする

機密値をドメインエラー、例外メッセージ、ログ、トレーススパン、メトリクスラベル、タスク名、キュー名、キャッシュキー、パニック風診断にフォーマットしてはならない。

Pydantic モデル全体をダンプするのではなく、許可リスト化されたログフィールドを使う。シークレット、直接 PII、相関 ID、アカウント ID、メトリクス安全な語彙を分離するティア基準は 上記の識別子ティア を読む。

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

## レビュー観点

関連: 上記の識別子ティア。

### 5.1 PII とシークレットはラップまたはマスクされているか — High

メール、電話、住所、氏名、政府 ID、決済データ、健康データ、IP アドレス、精密位置、トークン、パスワードを運ぶ素の `str`、`bytes`、プリミティブフィールドを指摘する。

`pydantic.SecretStr`、プロジェクトローカルのマスクラッパー、明示的なアダプター専用露出を提案する。

すべての PII 値に `SecretStr` は必須ではない。非シークレット識別子は、`repr`、ログ、シリアライズがマスクされるか意図的に露出されるならドメイン型でよい。

### 5.2 repr、str、ログ、エラーで機微データが露出しないか — High

生の機微値を含むデフォルト `repr`、f-string ログ、整形エラー、ログを指摘する。

メトリクス、スパン属性、監査イベント、バリデーションエラーにも生 PII やシークレットがないか確認する。

### 5.3 平文露出は狭く名前付きか — Medium

`email` のように生の機微値を返す広いプロパティやゲッターを指摘する。アダプター専用の露出メソッドやラッパーを提案する。

### 5.4 オブザーバビリティはデフォルトでマスクされているか — High

任意のドメインオブジェクトや DTO をマスク方針、許可フィールド、明示的安全表示ラッパーなしで受け取るログ/メトリクスヘルパーを指摘する。

### 5.5 人物に紐づく ID は自動安全とみなさないか — High

上記の識別子ティア と突き合わせる。不透明な代理キーである根拠なく `user_id`、`passenger_id`、`customer_id`、`patient_id`、`device_id`、パートナー参照をログする箇所を指摘する。

`request_id`、`order_id`、`correlation_id` のような内部集約 ID が明らかな代理キーで安全な整形なら指摘しない。
