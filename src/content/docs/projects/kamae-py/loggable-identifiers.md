---
title: "ログ可能な識別子"
sidebar:
  order: 10
---

ログ・トレース・エラー・メトリクス・イベントに載せるIDは、型と許可リストで最初から絞る。個人データや資格情報を後からマスクする前提にしない。

PII全般の方針は [PII と観測経路の保護](/projects/kamae-py/pii-protection/)、実装パターンは [ロギングとメトリクス](/projects/kamae-py/logging-metrics/)、テストは [テストデータ](/projects/kamae-py/test-data/) を参照する。

デフォルトは**原則マスキング**である。識別子は下の3問とティア表を通過したときだけ、許可されたチャネルに載せる。

## 3つの質問

順に問う：

1. **値は人、世帯、または口座名義人を直接、または容易な参照で識別するか?**
   はいなら、監査またはコンプライアンス経路が明示的に文書化されていない限り機密として扱う。
2. **チャネルは有界でアクセス制御されているか?**
   信頼できるバックエンド内のログとトレースは、クライアント可視エラーやメトリクスラベルとは異なる。
3. **チャネルは低カーディナリティを必要とするか?**
   メトリクス、アラート名、タスク名、キュー名にリクエストごとまたはユーザーごとのIDを載せてはならない。

いずれかの答えがチャネルをブロックするなら、マスキングまたはハッシュする。

## 識別子ティア

| ティア | 意味 | ログ / トレース | エラー（クライアント可視） | メトリクスラベル | メッセージ文字列 |
| --- | --- | --- | --- | --- | --- |
| **A — シークレット** | 資格情報とセッション素材 | 決して | 決して | 決して | 決して |
| **B — 直接PII** | 氏名、メール、電話、住所、政府ID、支払いPAN、健康データ、精密位置 | 決して | 決して | 決して | 決して |
| **C — 相関** | 1ワークフローまたは集約用のシステム生成ID | 構造化属性で可 | 通常不可。不透明コード | 決して | 決して |
| **D — アカウント / アクター** | ユーザー、顧客、ドライバー、テナント、デバイスにマップするID | 運用に必要なら構造化属性で可 | 契約が明示しない限り不可 | 決して | 決して |
| **E — 語彙** | 有界な列挙と状態kind | 可 | 可 | 可 | 可 |

### ティアA — ログしない

- パスワード、APIキー、OAuthトークン、セッションCookie、リフレッシュトークン
- 署名鍵、Webhookシークレット、暗号鍵
- `get_secret_value()` からの `SecretStr` / `SecretBytes` 平文

`SecretStr`、`Redacted`、またはアダプター専用露出を使う。暗号化監査レコードで文書化された保持がある場合を除き、`extra`、スパン属性、エラー、イベントに置かない。

### ティアB — ログしない

- 氏名、メールアドレス、電話番号、郵便住所
- 政府ID、支払いカード番号、銀行口座番号
- 健康データ、生体識別子
- 精密GPS座標、完全な住所
- ユーザー向けシステムの生IPアドレス（デフォルトで機密扱い）

連絡先が必要なワークフローでは、メール/SMS/決済を送るアダプタに閉じ、一般アプリログへ出さない。

### ティアC — 相関ID（ログとトレースは可、メトリクスは不可）

アクセス制御されたログバックエンドなら、構造化 `extra` とスパン属性に**通常安全**：

- `request_id`、`order_id`、`aggregate_id`、`event_id`、`idempotency_key`
- `correlation_id`、`trace_id`、`span_id`、`causation_id`
- 公開lookup APIのない内部サロゲートキー（例：trip requestのUUID主キー）

ルール：

- **名前付き構造化フィールド**として記録し、ログメッセージへ補間しない
- メトリクスラベル、スパン名、タスク名、キャッシュキーに使わない
- 匿名とはみなさず、保持とアクセス制御付きの運用データとして扱う

### ティアD — アカウント / アクターID（条件付き）

**アカウントや人に結びつく**IDにはより厳しいルール：

- `passenger_id`、`driver_id`、`customer_id`、`user_id`、`account_id`
- `tenant_id`、`organization_id`、`device_id`、`session_id`
- 外部プロバイダID（`stripe_customer_id`、OAuth `sub`、ロイヤルティ番号）

デフォルト：

- **ログ / トレース:** サポート、不正調査、ライフサイクルデバッグに必要なら構造化属性で可
- **クライアントへ返すエラー:** 不透明エラーコード。契約が明示しない限りIDをエコーしない
- **メトリクス:** ラベルに使わない
- **メッセージ文字列:** 補間しない。構造化フィールドのみ
- **信頼ゾーン外へのエクスポート:** ベンダーSIEMや長期保管へ出すときはハッシュまたはトークン化

`passenger_id` と `driver_id` を同一行へ載せると再識別しやすくなる。必要最小のフィールドだけ残し、足りるなら集約の `request_id` を優先する。

### ティアE — 語彙（どこでも安全）

閉じた集合からの低カーディナリティ値：

- `kind`（現在の集約state）、`source_kind`、`target_kind`
- `transition`、`event_name`、`error_kind`、`outcome`
- HTTPメソッド、ルートテンプレート、テナントプラン階層、小さく固定されたリージョンコード

メトリクスラベルとアラートグループ化の主入力である。

## チャネル別ルール

| チャネル | 許可内容 | 避ける |
| --- | --- | --- |
| ログメッセージ本文 | 安定した事実を平易な言葉で | ID、PII、payload、`model_dump_json()` |
| ログ `extra` / OTel属性 | ティアC、D（必要時）、E | ティアA、B、モデル丸ごと |
| トレーススパン属性 | ログ `extra` と同様 | ティアA、B、高カーディナリティIDをスパン名に |
| メトリクスラベル | ティアEのみ | リクエストごと・ユーザーごとのID |
| ドメインエラー（プロセス内） | ティアCとE。必要ならD | ティアA、B |
| 公開API / RPCエラー | ティアEのコードとメッセージ | ティアB。契約がない限りD |
| ドメインイベント（永続） | 契約に必要なティアC–E | ティアA。監査専用を除きティアB |

## 判断例（タクシードメイン）

| 識別子 | ティア | ログ `extra` | メトリクスラベル | 備考 |
| --- | --- | --- | --- | --- |
| `request_id` | C | Yes | No | ライフサイクル相関の優先キー |
| `event_id` | C | Yes | No | outboxとreplayデバッグ向け |
| `passenger_id` | D | 必要時 | No | 足りるなら `request_id` を優先 |
| `driver_id` | D | 必要時 | No | `passenger_id` と同様 |
| `transition` | E | Yes | Yes | `"assign_driver"` |
| `source_kind` / `target_kind` | E | Yes | Yes | `"waiting"` → `"en_route"` |
| `error_kind` | E | Yes | Yes | `"request_not_found"` |
| 乗客メール | B | No | No | アダプターのみ |
| OAuthアクセストークン | A | No | No | `SecretStr` のみ |

## 推奨許可リストパターン

ログヘルパー、トレース属性セッター、エラーマッパーで共有するプロジェクトローカル許可リストを1つ定義する。

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

許可リストはアダプタ境界で使う。ドメインとユースケースはモデルdumpではなく明示フィールド名を渡す。

## 信頼ゾーン外ではハッシュ

ログやトレースをベンダー、分析、長期保管へ複製するときはティアDを安定ハッシュに置き換える：

```python
import hashlib


def hash_for_export(value: str, *, pepper: str) -> str:
    digest = hashlib.sha256(f"{pepper}:{value}".encode()).hexdigest()
    return digest[:16]
```

pepperローテーションと、社内lookupで逆引きできるかを文書化する。

## テスト

観測テストで次を断言する：

- ティアAとBがログ出力、スパン属性、メトリクスラベルに現れない
- ティアCとDは構造化フィールドのみ。メッセージ文字列に現れない
- メトリクスエクスポートのラベルはティアEのみ
- 公開エラーレスポンスがティアBや想定外のティアDを漏らさない

フィクスチャ指針は [テストデータ](/projects/kamae-py/test-data/) を参照。

## レビューで見るところ

- メッセージ文字列やメトリクスラベルに `request_id` や `user_id` が補間されていないか。
- `model_dump()` やトークン平文が `extra` に入っていないか。
- ティアDを信頼ゾーン外へ出すときにハッシュやトークン化しているか。
- 許可リストをバイパスする生dictログはないか。
- 2つのティアDを同一行に載せる必要がある根拠はあるか。

