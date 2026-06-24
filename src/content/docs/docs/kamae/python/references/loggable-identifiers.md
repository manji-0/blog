---
title: "ログ可能な識別子の基準"
sidebar:
  order: 10
---

> **いつ読むか:** ログ、トレース、エラー、メトリクス、ドメインイベントにどの ID を載せられるかを決めるとき。
> **関連:** [`pii-protection.md`](/docs/kamae/python/references/pii-protection/)、[`logging-metrics.md`](/docs/kamae/python/references/logging-metrics/)、[`test-data.md`](/docs/kamae/python/references/test-data/)。

デフォルト方針は**デフォルトでマスキング**である。識別子は下記テストを通過し、許可されたチャネルに記録されるときだけログ可能である。

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

フィクスチャ指針は [`test-data.md`](/docs/kamae/python/references/test-data/) を参照。
