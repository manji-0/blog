---
title: "境界防御"
sidebar:
  order: 10
---

外部から入るデータのパース、認可、観測経路のPII、検証迂回の封じ込めを扱います。状態の型付けは[ドメインモデリング](/projects/kamae-py/domain-modeling/)、遷移と失敗の返し方は[状態遷移](/projects/kamae-py/state-transitions/)とセットで読みます。

## エッジでのパース

APIボディ、DB行、キューメッセージ、環境変数、SDKレスポンスは、Pydanticが検証するまで未知として扱います。

```python
CreateRequestInputAdapter = TypeAdapter(CreateRequestInput)


def parse_create_request_input(raw: object) -> CreateRequestInput:
    return CreateRequestInputAdapter.validate_python(raw)
```

判別共用体は共用体アダプター経由でパースします。生JSONには`validate_json`を優先し、`json.loads`のあと`validate_python`より`TypeAdapter.validate_json`を選びます。

## フレームワーク境界のDTO

FastAPIのリクエストモデルはDTOにできます。検証後にドメインコマンドへ変換し、フレームワーク専用の関心事をドメインへ漏らしません。Pydanticは形状と宣言バリデータを証明しますが、テナント所有権やライフサイクル前提は遷移かユースケースで守ります。

## 外部DTOの設定

| モデルの役割 | `extra` | `strict` |
| --- | --- | --- |
| ドメインstate / イベント | `forbid` | default |
| インバウンドHTTP/コマンドDTO | `forbid` | `True` |
| Webhook（前方互換） | `allow` | `True`（既知部分だけドメインへ） |
| 設定スナップショット | `ignore` | default |

ワイヤ向けDTOで`strict=True`を使い、`"123"`→`123`の黙殺変換を防ぎます。省略時に意味が変わるデフォルト（例：通貨がUSD固定）は避け、明示的な必須フィールドを優先します。

## 環境とCLI

`pydantic-settings`で起動時に一度だけ検証します。資格情報は`SecretStr`とし、`model_dump()`で設定をログに出しません。リクエストごとのテナントIDやアクターIDは`RequestContext`に属します。

## 認可とテナント

パス・クエリ・ボディ・メッセージのテナントIDを、認証済みコンテキストと照合せず信頼しません。ゲートウェイがヘッダーを注入しても、サービスはスコープと所有権を再確認します。キューコンシューマはメタデータから`RequestContext`を再構築します。

## ドメインstateの`extra="forbid"`

未知キーを黙って受け入れると`model_dump`経由でログや永続化に余分なPIIが載る経路を作ります。

## 未検証キャストの回避

`typing.cast`、`# type: ignore`、未検証`dict[str, Any]`、`model_construct`で境界データを信頼済みドメインにしてはいけません。許容される狭い例外は、テスト済みマッパー内でDB値が既に検証済みの`model_construct`だけです。

## 永続化と再水和

読み取りは行を`TaxiRequestAdapter.validate_python`でドメインへ。書き込みは`model_dump(mode="python")`か`mode="json"`をドライバーに合わせて選びます。ORMモデルをドメインモデルのデフォルトにしません。

## 検証エラーのレイヤー

| レイヤー | `ValidationError`を捕捉 |
| --- | --- |
| HTTP / gRPC / キュー / CLI | はい（422・`INVALID_ARGUMENT`・DLQ） |
| DTO→ドメインマッパー | はい、または上位へ再送出 |
| 純粋遷移・信頼済みユースケース | いいえ |

クライアントへ返す詳細から入力値とシークレットを除去します。恒久的な形状違反はDLQへ、一時障害はバックオフ付きリトライです。

## PIIと観測経路

ログ・トレース・エラー・メトリクス・イベントは長寿命で複製されます。個人データを後からマスクする前提にせず、型と許可リストで最初から載せない設計にします。既定は**原則マスキング**です。

| ティア | 例 | ログ/トレース | メトリクスラベル |
| --- | --- | --- | --- |
| A シークレット | トークン・鍵 | 載せない | 載せない |
| B 直接PII | 氏名・メール・精密位置 | 載せない | 載せない |
| C 相関 | `request_id`・`trace_id` | 構造化属性で可 | 載せない |
| D アクター | `user_id`・`tenant_id` | 運用必要時のみ構造化 | 載せない |
| E 語彙 | state `kind`・列挙 | 可 | 可 |

相関IDはメッセージ文字列へ補間せず、名前付きフィールドに記録します。クライアント可視エラーは不透明コードを使い、契約が明示しないIDをエコーしません。テレメトリの既定インターフェースはOpenTelemetryです。Prometheusの`/metrics`などプル型は任意で、ドメインコードにHTTPサーバーを埋め込みません。記録はユースケース境界で行い、純粋遷移の中では行いません。

## unsafe境界の封じ込め

`ctypes`、C拡張、pickle、`eval`、広い生成クライアントはアダプターに閉じ、小さな安全APIの内側で前提を検証してからドメイン値を返します。サービス間の契約では`kind`とフィールド名の規約を揃え、未知版は進化方針（スキップ・DLQ・互換マッパー）を文書化します。副作用は冪等キーと同じストアへ載せ、コンシューマの重複適用を防ぎます。

## 次に読む

| 目的 | ページ |
| --- | --- |
| ポートと永続化 | [ドメインモデリング](/projects/kamae-py/domain-modeling/) |
| 遷移とエラー | [状態遷移](/projects/kamae-py/state-transitions/) |
| ログとテストのゲート | [品質ゲート](/projects/kamae-py/quality-gates/) |
| FastAPIの具体例 | [ライブラリガイド](/projects/kamae-py/library-guides/) |
