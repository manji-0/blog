---
title: "ロギングとメトリクス"
sidebar:
  order: 10
---

`tracing` とメトリクスは障害調査の主経路である。関数名だけのログや、生IDをラベルにしたメトリクスは、原因特定を遅らせるうえ漏洩経路にもなる。

遷移の記録はユースケース境界で行う（[状態遷移](/projects/kamae-rs/state-transitions/)）。マスキングとID分類は [PII 保護](/projects/kamae-rs/pii-protection/)、エラーの一度きりの記録は [エラーハンドリング](/projects/kamae-rs/error-handling/) と整合させる。

<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->

## ドメインコンテキストで log する

各ログエントリは次の3点に答える。何が起きたか、どのドメインオブジェクトに関する事象か、なぜ重要か。ログはドメイン不変条件の内部ではなく、ユースケース、アプリケーションサービス、アダプターから出力する。

1. **意味のあるメッセージ**: 関数名ではなくdomain用語でイベントや判断を述べる。「`assign_driver called`」より「driver assigned to waiting request」。
2. **Domain オブジェクト state**: 判断理解に必要なidentifier、現state variant、値。補間文字列よりstructured field。
3. **遷移情報**: 操作目的がstate遷移なら、source state、target state、トリガー commandまたはevent。

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

人間可読文から意味をparseせず、key-value fieldを使う。集約はmessageでグループ化し、fieldによるfilterができるようlogテンプレートを安定させる。

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

logレベルを意図的に選ぶ：

- `ERROR`: domain不変条件失敗、ユースケース完了不能、インフラ依存unhealthy。secretを漏らさず再現に足るcontext。
- `WARN`: リトライ可能timeoutなど回復可能異常、予期外だが処理済みedge case。
- `INFO`: 重要ビジネスイベントまたはライフサイクルstep。
- `DEBUG`: 特定問題診断向け詳細state。高コスト値はmatching levelのときだけ評価される `tracing::debug!` でguard。

## log から PII 漏洩を防ぐ

logは長寿命で広くアクセス可能： 公開境界として扱う。[PII 保護](/projects/kamae-rs/pii-protection/) のルールに従う。

- raw氏名、メール、電話、住所、位置、token、資格情報をlogしない。
- newtypeとredacting wrapperで `Debug` deriveや値補間のaccidental露出を防ぐ。
- identifierがsensitiveならhashまたはopaque referenceをlog。

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

identifierを分類してからlog、span、metrics、errorへ到達させる。フィールド名はsafeを決めない。identifierの意味、 derivation、再識別リスクが決める。

### デフォルト: log してよい

運用相関に役立ちsecretや直接個人identityを露出しないとき：

| 種別 | 例 | 通常安全な理由 |
| --- | --- | --- |
| Correlation / tracing | `correlation_id`, `trace_id`, `span_id`, `request_id` (HTTP) | 一時的または運用向け。identity ではない |
| Internal aggregate IDs | `order_id`, `request_id`, `shipment_id`, `command_id`, `event_id` | サービス内 opaque surrogate key |
| Process / job IDs | `job_id`, `outbox_id`, `batch_id`, `transaction_id` (internal) | インフラ相関 |
| Tenant / org context | `tenant_id`, `organization_id`, `fleet_id` | アクセス制御下 multi-tenant ops に必要 |
| Bounded domain enums | `state`, `command_name`, `event_type`, `error_code` | 低 cardinality。個人データではない |

「logしてよい」の要件：

1. **Opaque surrogate**: システム内ランダムまたはsequential。email、phone、氏名、政府ID、カードデータ由来でない。
2. **Secret ではない**: session token、API key、password、signed URL capabilityではない。
3. **単体再識別リスク低**: 値単体がアプリ制御datastore外で自然人を特定しない。
4. **Safe `Display` / `Debug`**: newtypeのformatting経路がlog向けにreview済みでnested PIIを露出しない。

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

一般application log、span、metrics label、error文字列に載せない：

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

インシデントでこれらが必要なら、明示認可付きrestricted audit exportまたはsupportツールへ。一般log retentionを広げて載せない。

### 条件付き: domain model で分類

よくありlogされうるが、プロジェクト明示判断後のみ。型と `Display`/`Debug` 契約に符号化。

| 種別 | ログしてよいとき | ログしないとき |
| --- | --- | --- |
| `user_id`, `passenger_id`, `customer_id`, `patient_id` | 自システム発行 opaque surrogate UUID/ULID | 値が email/phone、政府 ID、provider subject、PII 可逆 hash |
| `account_id`, `profile_id` | login identifier と無関係な内部 account key | login 名や人に紐づく public profile slug と同一 |
| `driver_id`, `staff_id`, `provider_id` | 運用向け内部 workforce/resource key | log で直接個人 identity または legal name と 1:1 |
| `device_id`, `installation_id` | tracking リスク方針が低い opaque app 生成 surrogate | vendor advertising ID または hardware serial |
| `external_id`, `partner_ref` | 契約上 ops log 可な opaque partner reference | partner 供給値に email、phone、national ID |
| Hashed identifier | セキュリティ review 済み pepper/HMAC pseudonym | システム横 fast hash of email/phone |

条件付きIDをlog可能にするとき `PassengerId` や `CorrelationId` 等named newtype。log不可は `Redacted<T>`、`SecretString`、approved adapter外で `Display` 意図的unavailable。

### metric と span の ID ルール

log safeなIDがmetric labelで自動safeではない。

- **Log する**: backendが許容するrequestあたりcardinalityならlog fieldとtrace attributeにaggregate ID
- **metric label にしない**: raw user/customer/passenger ID、timestamp、email、phone、IP、無界string。`state`、`command`、`error_code`、`tenant_id` など有界domain label（cardinality既知）

```rust
// Good metric labels: bounded domain vocabulary.
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);

// Avoid: per-user metric labels explode cardinality and leak identity into TSDB.
metrics::counter!("notification.sent", "user_id" => user_id.as_str()).increment(1);
```

### クイック判断チェックリスト

log行にIDを足す前：

1. secretまたはauth tokenか。Yesならlogしない。
2. 直接PIIまたは規制identifierか。Yesならlogしない。
3. 埋め込みPIIなし自システムopaque surrogateか。Yesなら通常log可。
4. このfield（`Display`/span/metric label）で意図以上を露出しないか。Yesならredact、approved schemeでhash、restricted auditのみ。
5. 型のformattingがsafe logging向けreview済みか。Noならlog前に型を直す。

## state 遷移を明示的に log

state遷移はdomain振る舞いの中心。before/after stateをlogしtrace、audit、インシデント調査でライフサイクル再構築可能に。

遷移がeventを出すとき、payload全体ではなくevent名またはtype（payloadがsafeでopsに有用な場合を除く）。

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

domainレベルlogはトランザクションを所有するユースケース近く。getterやvalidation helper各所に散らさない。

## error を actionable に

domain errorに失敗経路と影響objectを追跡できるcontext。周囲ユースケースのstructured identifierを再利用。ad-hocラベルを作らない。

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

各層で同一失敗をlogしない。ユースケースまたはapplication serviceが権威log行を所有しtyped errorを上へ。

## 構造化ログと error chain 統合

`thiserror` source chainと `tracing` fieldを連携し、1 log行でdomain contextと根因を見せる。

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

ガイドライン：

- `thiserror` enumでは `%error` で `#[source]` 原因を順序表示
- domain field（`request_id`、`command`、`error_code`）をerrorの `Display` 内ではなく横に
- ユースケースabort時active spanにerror記録：

```rust
tracing::Span::current().record("error", tracing::field::display(&error));
```

- raw client errorを意味論variantへマップしてからendpoint、SQL、secretを漏らさない
- enum variant由来 `error_code` 等bounded labelでmetric increment。full error textではない

error enum設計は [エラーハンドリング](/projects/kamae-rs/error-handling/) と照合。ユースケースがricher domain contextで同一失敗をlog済みならrepository adapterで重複logしない。

## 有用なときだけ `tracing`

`tracing` はガイドラインの便利実装だが必須依存ではない。structured log、span、相関が必要なプロジェクトでは `tracing` を使う。そうでなければ、同じ原則をプロジェクトのlogging facadeまたはcustom writerに適用する。

`tracing` 使用時：

- spanはユースケース/application service境界。internal helper各所ではない。spanは操作名とaggregate identifierを運ぶ
- 広いauto-derived fieldより明示field listの `#[instrument]`。raw DTOやsensitive payloadを受ける関数はexcludeしない限りinstrumentしない
- redaction方針に合うfield値syntax。`%field` は `Display`、`?field` は `Debug`。PIIを含むdomain objectでは両方safe表現

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

`tracing` spanをdomain eventやaudit記録と混同しない。observability補助。耐久性はdomain event型またはoutbox。

## domain outcome を計測

metricsはruntime機構だけでなくビジネスoutcomeを反映。このskillがモデル化するdomain概念に整合。

- **Counters**: 遷移、command受理/拒否、published event等
- **Histograms**: 各aggregate state滞在時間、ユースケース実行latency等意味dimension付きduration/size
- **Gauges**: 現在waiting request数等point-in-state

```rust
metrics::counter!("taxi_request.driver_assigned", "fleet" => fleet.as_str()).increment(1);
metrics::histogram!("taxi_request.state_duration_seconds", "from" => "waiting", "to" => "en-route")
    .record(duration.as_secs_f64());
```

domain型由来の一貫label。TSDB向けcardinality低く。raw IDやtimestampより有界state/command名セット。

## OpenTelemetry で telemetry export

log、metrics、traceのobservability backend exportにはOpenTelemetryをapplicationレベルdefault。domain/use-caseはfacade API（`tracing`、`metrics`）に留め、exporterはapplication startupのみ。

facadeは自動OTel接続しない。startupでbridge crate:

- `tracing` span/trace: `tracing-opentelemetry` 等
- `metrics`: `metrics-exporter-otel`、`metrics-opentelemetry` 等OTel `Meter` 転送recorder

Prometheus scrape向け `/metrics` はoptional。デプロイがOTLPを支持すればOTLP export優先。scraping必須時のみPrometheus text exporter。legacy `opentelemetry-prometheus` はdeprecated。text expositionは `opentelemetry-prometheus-text-exporter` またはcollector経由OTLP metrics。

domain/application層を特定exporter向けに設計しない。

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

request、command、transaction全体でcorrelation identifierを運ぶ。structured logに含め、実用的ならmetric labelまたはtrace attributeでlog/metrics/trace間pivot。

```rust
let correlation_id = CorrelationId::generate();
tracing::Span::current().record("correlation_id", correlation_id.as_str());
```

spanはinternal call各所ではなくユースケース境界。操作名とaggregate identifier。実行thread詳細ではない。

レビューでは、意味のないログメッセージ、ドメイン文脈の欠如、遷移ログの不足、非構造化ログ、ドメイン次元のないメトリクス、高カーディナリティラベル、PII漏洩、誤分類ID、重複エラーログを指摘する。

## レビューで見るところ

マスキングは [PII 保護](/projects/kamae-rs/pii-protection/) も参照。ログ・スパン・メトリクスに生の機密値や人物紐づきIDがないか。同一失敗の重複 `tracing::error!` や `%error` なしの文字列化はないか。メトリクスラベルに生IDや無制限文字列を載せ、関数名だけのログや状態・`from` / `to` のない遷移ログになっていないかも見る。エラーメトリクスは列挙や `error_code` か。ドメイン結果に結びつき、構造化されてレベルが適切か。
