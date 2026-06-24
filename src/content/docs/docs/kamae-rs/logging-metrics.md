---
title: "ロギングとメトリクス"
sidebar:
  order: 10
---

`tracing` とメトリクスは障害調査の主経路である。関数名だけのログや、生 ID をラベルにしたメトリクスは、原因特定を遅らせるうえ漏洩経路にもなる。

遷移の記録はユースケース境界で行う（[状態遷移](/docs/kamae-rs/state-transitions/)）。マスキングと ID 分類は [PII 保護](/docs/kamae-rs/pii-protection/)、エラーの一度きりの記録は [エラーハンドリング](/docs/kamae-rs/error-handling/) と整合させる。

<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->

## ドメインコンテキストで log する

各ログエントリは次の 3 点に答える。何が起きたか、どのドメインオブジェクトに関する事象か、なぜ重要か。ログはドメイン不変条件の内部ではなく、ユースケース、アプリケーションサービス、アダプターから出力する。

1. **意味のあるメッセージ**: 関数名ではなく domain 用語でイベントや判断を述べる。「`assign_driver called`」より「driver assigned to waiting request」。
2. **Domain オブジェクト state**: 判断理解に必要な identifier、現 state variant、値。補間文字列より structured field。
3. **遷移情報**: 操作目的が state 遷移なら、source state、target state、トリガー command または event。

```rust
#[derive(Clone, Debug)]
pub struct AssignDriverLog {
    request_id: RequestId,
    passenger_id: PassengerId,
    driver_id: DriverId,
    from: TaxiRequestState,
    to: TaxiRequestState,
    triggered_by: CommandId,
}

tracing::info!(
    request_id = %log.request_id,
    passenger_id = %log.passenger_id, // safe only for opaque surrogate IDs
    driver_id = %log.driver_id,
    from = ?log.from,
    to = ?log.to,
    triggered_by = %log.triggered_by,
    "driver assigned to waiting request"
);
```

## 構造化ログを優先する

人間可読文から意味を parse せず key-value field を使う。集約が message でグループ化し field で filter できるよう log テンプレートを安定させる。

```rust
// Good: stable template, structured fields.
tracing::info!(
    request_id = %request_id,
    state = ?state,
    "request state persisted"
);

// Avoid: values baked into the message text.
tracing::info!("request {} persisted in state {:?}", request_id, state);
```

log レベルを意図的に選ぶ:

- `ERROR`: domain 不変条件失敗、ユースケース完了不能、インフラ依存 unhealthy。secret を漏らさず再現に足る context。
- `WARN`: リトライ可能 timeout など回復可能異常、予期外だが処理済み edge case。
- `INFO`: 重要ビジネスイベントまたはライフサイクル step。
- `DEBUG`: 特定問題診断向け詳細 state。高コスト値は matching level のときだけ評価される `tracing::debug!` で guard。

## log から PII 漏洩を防ぐ

log は長寿命で広くアクセス可能: 公開境界として扱う。[PII 保護](/docs/kamae-rs/pii-protection/) のルールに従う。

- raw 氏名、メール、電話、住所、位置、token、資格情報を log しない。
- newtype と redacting wrapper で `Debug` derive や値補間の accidental 露出を防ぐ。
- identifier が sensitive なら hash または opaque reference を log。

分類ルールは [どの ID を log に載せるか](#どの-id-を-log-に載せるか) 参照。

```rust
// Good: only non-sensitive identifiers and states appear in logs.
// `passenger_id` is safe here only because it is an opaque surrogate, not email/phone.
tracing::info!(
    request_id = %request_id,
    passenger_id = %passenger_id,
    state = ?state,
    "request transitioned to en-route"
);

// Avoid: a raw email would leak into log storage.
tracing::info!("notification sent to {}", email);
```

## どの ID を log に載せるか

log、span、metrics、error に到達する前に identifier を分類。フィールド名は safe を決めない。identifier の意味、 derivation、再識別リスクが決める。

### デフォルト: log してよい

運用相関に役立ち secret や直接個人 identity を露出しないとき:

| 種別 | 例 | 通常安全な理由 |
| --- | --- | --- |
| Correlation / tracing | `correlation_id`, `trace_id`, `span_id`, `request_id` (HTTP) | 一時的または運用向け。identity ではない |
| Internal aggregate IDs | `order_id`, `request_id`, `shipment_id`, `command_id`, `event_id` | サービス内 opaque surrogate key |
| Process / job IDs | `job_id`, `outbox_id`, `batch_id`, `transaction_id` (internal) | インフラ相関 |
| Tenant / org context | `tenant_id`, `organization_id`, `fleet_id` | アクセス制御下 multi-tenant ops に必要 |
| Bounded domain enums | `state`, `command_name`, `event_type`, `error_code` | 低 cardinality。個人データではない |

「log してよい」の要件:

1. **Opaque surrogate**: システム内ランダムまたは sequential。email、phone、氏名、政府 ID、カードデータ由来でない。
2. **Secret ではない**: session token、API key、password、signed URL capability ではない。
3. **単体再識別リスク低**: 値単体がアプリ制御 datastore 外で自然人を特定しない。
4. **Safe `Display` / `Debug`**: newtype の formatting 経路が log 向けに review 済みで nested PII を露出しない。

```rust
// Safe: opaque surrogate IDs with explicit logging newtypes.
tracing::info!(
    request_id = %request_id,
    command_id = %command_id,
    correlation_id = %correlation_id,
    state = ?state,
    "request transitioned to en-route"
);
```

### デフォルト: log しない

一般 application log、span、metrics label、error 文字列に載せない:

| 種別 | 例 | 理由 |
| --- | --- | --- |
| Secrets / auth material | API keys, passwords, session tokens, refresh tokens, HMAC secrets, signed download URLs | 資格情報漏洩 |
| Government / regulated IDs | SSN, My Number, passport, driver's license, national health ID | 直接個人 identity |
| Payment identifiers | PAN, CVV, full bank account, raw payment-method tokens from PSPs | PCI / 金融 exposure |
| Contact identity | email, phone, messenger handle when used as account identity | 直接 PII |
| Person descriptors | legal name, birth date, address, free-text notes about a person | 直接 PII |
| Health / special-category data | diagnosis, prescription, patient notes | 規制 sensitive data |
| Precise location | lat/long, full street address, room-level indoor position | 位置プライバシー |
| Network identity | client IP, device fingerprint, advertising ID | 多法域で tracking / PII |
| External IDs that embed PII | `user@example.com` as key, hashed email in reversible scheme, provider subject that is an email | PII が「ID」として混入 |

インシデントでこれらが必要なら、明示認可付き restricted audit export または support ツールへ。一般 log retention を広げて載せない。

### 条件付き: domain model で分類

よくあり log されうるが、プロジェクト明示判断後のみ。型と `Display`/`Debug` 契約に符号化。

| 種別 | ログしてよいとき | ログしないとき |
| --- | --- | --- |
| `user_id`, `passenger_id`, `customer_id`, `patient_id` | 自システム発行 opaque surrogate UUID/ULID | 値が email/phone、政府 ID、provider subject、PII 可逆 hash |
| `account_id`, `profile_id` | login identifier と無関係な内部 account key | login 名や人に紐づく public profile slug と同一 |
| `driver_id`, `staff_id`, `provider_id` | 運用向け内部 workforce/resource key | log で直接個人 identity または legal name と 1:1 |
| `device_id`, `installation_id` | tracking リスク方針が低い opaque app 生成 surrogate | vendor advertising ID または hardware serial |
| `external_id`, `partner_ref` | 契約上 ops log 可な opaque partner reference | partner 供給値に email、phone、national ID |
| Hashed identifier | セキュリティ review 済み pepper/HMAC pseudonym | システム横 fast hash of email/phone |

条件付き ID を log 可能にするとき `PassengerId` や `CorrelationId` 等 named newtype。log 不可は `Redacted<T>`、`SecretString`、approved adapter 外で `Display` 意図的 unavailable。

### metric と span の ID ルール

log safe な ID が metric label で自動 safe ではない。

- **Log する**: backend が許容する request あたり cardinality なら log field と trace attribute に aggregate ID
- **metric label にしない**: raw user/customer/passenger ID、timestamp、email、phone、IP、無界 string。`state`、`command`、`error_code`、`tenant_id` など有界 domain label（cardinality 既知）

```rust
// Good metric labels: bounded domain vocabulary.
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);

// Avoid: per-user metric labels explode cardinality and leak identity into TSDB.
metrics::counter!("notification.sent", "user_id" => user_id.as_str()).increment(1);
```

### クイック判断チェックリスト

log 行に ID を足す前:

1. secret または auth token か。Yes なら log しない。
2. 直接 PII または規制 identifier か。Yes なら log しない。
3. 埋め込み PII なし自システム opaque surrogate か。Yes なら通常 log 可。
4. この field（`Display`/span/metric label）で意図以上を露出しないか。Yes なら redact、approved scheme で hash、restricted audit のみ。
5. 型の formatting が safe logging 向け review 済みか。No なら log 前に型を直す。

## state 遷移を明示的に log

state 遷移は domain 振る舞いの中心。before/after state を log し trace、audit、インシデント調査でライフサイクル再構築可能に。

遷移が event を出すとき、payload 全体ではなく event 名または type（payload が safe で ops に有用な場合を除く）。

```rust
let outcome = waiting_request.assign_driver(driver)?;

tracing::info!(
    request_id = %outcome.state.request_id,
    from = "waiting",
    to = "en-route",
    events = ?outcome.events.iter().map(|e| e.name()).collect::<Vec<_>>(),
    "driver assignment completed"
);
```

domain レベル log はトランザクションを所有するユースケース近く。getter や validation helper 各所に散らさない。

## error を actionable に

domain error に失敗経路と影響 object を追跡できる context。周囲ユースケースの structured identifier を再利用。ad-hoc ラベルを作らない。

```rust
match repository.find_by_id(&request_id).await {
    Ok(Some(request)) => request,
    Ok(None) => {
        tracing::warn!(request_id = %request_id, "request not found");
        return Err(AssignDriverError::RequestNotFound { request_id });
    }
    Err(e) => {
        tracing::error!(request_id = %request_id, error = %e, "repository lookup failed");
        return Err(AssignDriverError::Repository(e));
    }
}
```

各層で同一失敗を log しない。ユースケースまたは application service が権威 log 行を所有し typed error を上へ。

## 構造化ログと error chain 統合

`thiserror` source chain と `tracing` field を連携し、1 log 行で domain context と根因を見せる。

```rust
if let Err(error) = self.execute(request_id, driver).await {
    tracing::error!(
        request_id = %request_id,
        driver_id = %driver.id,
        error = %error,           // full Display chain via thiserror
        error.debug = ?error,     // optional: Debug for support tooling
        "assign driver use case failed"
    );
    return Err(error);
}
```

ガイドライン:

- `thiserror` enum では `%error` で `#[source]` 原因を順序表示
- domain field（`request_id`、`command`、`error_code`）を error の `Display` 内ではなく横に
- ユースケース abort 時 active span に error 記録:

```rust
tracing::Span::current().record("error", tracing::field::display(&error));
```

- raw client error が endpoint、SQL、secret を漏らす前に意味論 variant にマップ
- enum variant 由来 `error_code` 等 bounded label で metric increment。full error text ではない

error enum 設計は [エラーハンドリング](/docs/kamae-rs/error-handling/) と照合。ユースケースが richer domain context で同一失敗を log 済みなら repository adapter で重複 log しない。

## 有用なときだけ `tracing`

`tracing` はガイドラインの便利実装だが必須依存ではない。structured log、span、相関が必要なプロジェクトでは `tracing` を使う。そうでなければ、同じ原則をプロジェクトの logging facade または custom writer に適用する。

`tracing` 使用時:

- span はユースケース/application service 境界。internal helper 各所ではない。span は操作名と aggregate identifier を運ぶ
- 広い auto-derived field より明示 field list の `#[instrument]`。raw DTO や sensitive payload を受ける関数は exclude しない限り instrument しない
- redaction 方針に合う field 値 syntax。`%field` は `Display`、`?field` は `Debug`。PII を含む domain object では両方 safe 表現

```rust
#[tracing::instrument(
    name = "use_case.assign_driver",
    skip(driver), // skip fields that need manual redaction
    fields(request_id = %request_id, driver_id = %driver.id)
)]
pub async fn assign_driver(
    &self,
    request_id: RequestId,
    driver: DriverAssignment,
) -> Result<Transition<EnRouteRequest, TaxiRequestEvent>, AssignDriverError> {
    // ...
}
```

`tracing` span を domain event や audit 記録と混同しない。observability 補助。耐久性は domain event 型または outbox。

## domain outcome を計測

metrics は runtime 機構だけでなくビジネス outcome を反映。この skill がモデル化する domain 概念に整合。

- **Counters**: 遷移、command 受理/拒否、published event 等
- **Histograms**: 各 aggregate state 滞在時間、ユースケース実行 latency 等意味 dimension 付き duration/size
- **Gauges**: 現在 waiting request 数等 point-in-state

```rust
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);
metrics::histogram!("taxi_request.state_duration_seconds", "from" => "waiting", "to" => "en-route")
    .record(duration.as_secs_f64());
```

domain 型由来の一貫 label。TSDB 向け cardinality 低く。raw ID や timestamp より有界 state/command 名セット。

## OpenTelemetry で telemetry export

log、metrics、trace の observability backend export には OpenTelemetry を application レベル default。domain/use-case は facade API（`tracing`、`metrics`）に留め、exporter は application startup のみ。

facade は自動 OTel 接続しない。startup で bridge crate:

- `tracing` span/trace: `tracing-opentelemetry` 等
- `metrics`: `metrics-exporter-otel`、`metrics-opentelemetry` 等 OTel `Meter` 転送 recorder

Prometheus scrape 向け `/metrics` は optional。デプロイが OTLP を支持すれば OTLP export 優先。scraping 必須時のみ Prometheus text exporter。legacy `opentelemetry-prometheus` は deprecated。text exposition は `opentelemetry-prometheus-text-exporter` または collector 経由 OTLP metrics。

domain/application 層を特定 exporter 向けに設計しない。

```rust
// Application startup, not domain code.
use opentelemetry::global;
use opentelemetry::metrics::MeterProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_prometheus_text_exporter::PrometheusExporter;

// Bridge `metrics` facade recordings into OpenTelemetry.
use metrics_exporter_otel::OpenTelemetryRecorder;

let exporter = PrometheusExporter::builder().build();
let provider = SdkMeterProvider::builder()
    .with_reader(exporter)
    .build();

let meter = provider.meter(env!("CARGO_PKG_NAME"));
let recorder = OpenTelemetryRecorder::new(meter);
metrics::set_global_recorder(recorder).expect("install metrics recorder");

global::set_meter_provider(provider.clone());

// For `tracing`, install a `tracing-opentelemetry` layer separately.
```

## log と metrics を相関

request、command、transaction 全体で correlation identifier を運ぶ。structured log に含め、実用的なら metric label または trace attribute で log/metrics/trace 間 pivot。

```rust
let correlation_id = CorrelationId::generate();
tracing::Span::current().record("correlation_id", correlation_id.as_str());
```

span は internal call 各所ではなくユースケース境界。操作名と aggregate identifier。実行 thread 詳細ではない。

レビューでは、意味のないログメッセージ、ドメイン文脈の欠如、遷移ログの不足、非構造化ログ、ドメイン次元のないメトリクス、高カーディナリティラベル、PII 漏洩、誤分類 ID、重複エラーログを指摘する。

## レビュー観点

マスキングルールは [PII 保護](/docs/kamae-rs/pii-protection/) も参照。

### PII とシークレットはログ、スパン、メトリクスから除外されているか — High

[PII 保護](/docs/kamae-rs/pii-protection/) も照合する。生の機密値を載せるログフィールド、スパン属性、メトリクスラベル、エラー表示文字列を指摘する。

ドメインオブジェクトが可観測性ヘルパに到達する前に、`Debug` 実装、マスキングラッパ、許可リストが一貫して適用されているかも確認する。

### ログに載せる ID は正しく分類されているか — High

本文の「ログに載せる ID」節も参照。文書化された安全性ではなくフィールド名の仮定で ID をログする箇所を指摘する。

次を含む場合はエスカレートする:

- シークレット、セッショントークン、API キー
- 政府、決済、健康、連絡先の本人情報
- 不透明サロゲートでない人物紐づき ID（メールをキーにした ID、プロバイダ subject、PII の可逆ハッシュ）
- メトリクスラベル上の生の user / customer / passenger ID

型の整形がレビュー済みで PII 由来でない場合、不透明サロゲート集約 ID（`request_id`、`order_id`、`correlation_id`、内部 `transaction_id`）には指摘しない。

### エラーチェーンはドメイン文脈付きで一度だけログされているか — Medium

`logging-metrics.md` のエラーチェーン統合節も照合する。同一失敗を各アダプタ層で重複 `tracing::error!` する、または `%error` / ソースチェーン整形なしにエラーを文字列化するログを指摘する。

### メトリクスのカーディナリティは制御されているか — Medium

生 ID、タイムスタンプ、メールアドレス、無制限文字列をラベルに使う箇所を指摘する。高カーディナリティラベルは時系列ストレージを圧迫し、識別子をメトリクスバックエンドへ漏らす。

### ログメッセージは意味があるか — Medium

関数名だけ、またはドメイン文脈のないログメッセージを指摘する。

良いログメッセージはビジネス用語で何が起きたかを述べる: `"assign_driver called"` ではなく `"driver assigned to waiting request"`。

### 各ログに影響を受けたドメインオブジェクトの状態が含まれるか — Medium

識別子、現在の状態バリアント、判断に必要な値を欠くログを指摘する。構造化フィールドには集約またはエンティティ ID と、イベント再構成に必要な状態を載せる。

文の補間より `request_id = %request_id, state = ?state` を優先する。

### 状態遷移は明示的にログされているか — Medium

ソースとターゲットの両方の状態、または遷移を起こしたコマンド / イベントを記録しないライフサイクル変更を指摘する。

`from` / `to` フィールドの欠落、イベント名の欠落、インフラ内だけのログで、トランザクションを所有するユースケース境界にログがない場合を探す。

### エラーメトリクスは境界のあるラベルを使っているか — Low

生エラーテキスト、SQL 断片、無制限文字列をラベルにするカウンタやヒストグラムを指摘する。列挙バリアント名や安定した `error_code` を使う。

### メトリクスはドメイン結果に結びついているか — Low

HTTP ステータスコード、スレッド数、汎用ランタイム値だけを数え、ドメイン次元のないメトリクスを指摘する。状態名やコマンド名など境界のあるドメイン値でラベル付けし、ビジネスイベントと状態継続時間を反映するカウンタとヒストグラムを優先する。

### ログは構造化され、レベルは適切か — Low

補間値の `tracing::info!` や `println!` を指摘する。ヘルパやループで冗長な `INFO` は `DEBUG` にすべき。

`ERROR` ログが本当の失敗経路を示し、シークレットを漏らさず診断に足りる文脈を含むか確認する。

