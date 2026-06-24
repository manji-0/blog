---
title: "Rust 境界防御"
sidebar:
  order: 10
---

## デシリアライズは形状パースに留める

`serde` はデータが要求された形状を持つことを証明するだけで、ドメイン上の意味を満たすことは保証しない。まず DTO にデシリアライズし、`TryFrom` でドメイン型に変換する。

```rust
#[derive(serde::Deserialize)]
pub struct CreateRequestDto {
    passenger_id: String,
}

impl TryFrom<CreateRequestDto> for CreateRequestCommand {
    type Error = CreateRequestError;

    fn try_from(dto: CreateRequestDto) -> Result<Self, Self::Error> {
        Ok(Self {
            passenger_id: PassengerId::new(dto.passenger_id)?,
        })
    }
}
```

## すべての外部境界で検証する

次に対して DTO -> ドメイン変換を適用する:

- HTTP および RPC リクエスト
- DB 行とクエリ結果
- キューメッセージと webhook
- ファイル、環境変数、設定
- CLI 引数

生の `String`、`Value`、DB 行フィールドから、コンストラクタが不変条件を検証しない限り、ドメイン型を直接構築しない。

## API、DB、ドメイン型を分離する

デフォルトでは、ドメインエンティティに `Serialize`、`Deserialize`、`sqlx::FromRow`、Diesel derive を付けない。外部表現が異なる、または不変条件を迂回できる場合は DTO/row struct を使う。

小さな内部ツールや、本当に不変条件のない値オブジェクトでは例外もあり得る。重要な場合は理由を明記する。

## チェックリストとの対応

レビューチェックリストは次の実践に対応する:

| Item | Topic | Section |
| --- | --- | --- |
| 4.1 | すべての境界で DTO -> ドメイン | [すべての外部境界で検証する](#すべての外部境界で検証する) |
| 4.2 | `serde` は形状パースであり検証ではない | [デシリアライズは形状パースに留める](#デシリアライズは形状パースに留める) |
| 4.3 | 過剰 derive したドメインエンティティを避ける | [API、DB、ドメイン型を分離する](#apidbドメイン型を分離する) |
| 4.4 | DTO の default と未知フィールド | [DTO の default と未知フィールド](#dto-の-default-と未知フィールド) |
| 4.5 | 認可とテナント境界 | [認可とテナントチェック](#認可とテナントチェック) |
| 4.6 | 検証付きリーフのデシリアライズ | [値オブジェクト向け `serde(try_from)`](#値オブジェクト向け-serdetry_from) |

## 認可とテナントチェック

パス、クエリ、ボディ、メッセージでテナント、主体、リソース所有者を名指すフィールドは、認証コンテキストと照合するまで信頼しない。ドメイン状態を読み込む・変更する前に、ユースケースまたは専用 policy ポートで検証する。

```rust
pub struct AuthenticatedActor {
    pub tenant_id: TenantId,
    pub actor_id: ActorId,
}

impl AssignDriverUseCase {
    pub async fn execute(
        &self,
        actor: &AuthenticatedActor,
        cmd: AssignDriverCommand,
    ) -> Result<(), AssignDriverError> {
        if cmd.tenant_id != actor.tenant_id {
            return Err(AssignDriverError::TenantMismatch);
        }

        let waiting = self
            .resolver
            .find_waiting(&cmd.request_id)
            .await?
            .ok_or(AssignDriverError::NotFound)?;

        if waiting.tenant_id() != actor.tenant_id {
            return Err(AssignDriverError::Forbidden);
        }

        // transition and persist ...
        Ok(())
    }
}
```

ルール:

- セッションやトークンがすでにテナントスコープを持つとき、リクエストボディの `tenant_id` を信頼しない。
- HTTP 層だけでなく、ロード後に集約の所有権を比較する。
- 認可失敗は型付きドメインまたはユースケースエラーにマップする。プロダクト方針で要求されない限り、テナント間でリソースの存在有無を漏らさない。

## DTO の default と未知フィールド

インバウンド DTO の `#[serde(default)]` と `Default::default()` は、クライアントがフィールドを省略したりプロキシが除去したりすると、ビジネス意味を黙って変えうる。

```rust
// 危険: 省略された `cancel_fee_waived` が false になり「未指定」ではない
#[derive(serde::Deserialize)]
pub struct CancelRequestDto {
    #[serde(default)]
    cancel_fee_waived: bool,
}
```

推奨:

- 省略に意味がある場合は `Option<T>` または明示 enum（`Unspecified | Yes | No`）
- クライアントが送る必要があるフィールドは `default` なしで必須にする
- 部分更新と完全置換が異なる場合は create/update DTO を分ける

### `deny_unknown_fields` を使うタイミング

次の場合、インバウンド DTO に `#[serde(deny_unknown_fields)]` を追加する:

- API がバージョン管理され、 typo を即失敗させたい（`passengerId` vs `passenger_id`）
- 綴り違いフィールドが無視され、誤った意味で成功してしまう
- 生産者と消費者の双方をコントロールできる、または互換ポリシーが厳密パースを許容する

`deny_unknown_fields` を省略する場合:

- 公開 API が将来互換のクライアント拡張を受け入れる必要がある
- webhook や第三者ペイロードに、保存または黙認する未知フィールドがある
- 移行用に `#[serde(alias = "...")]` を使い、エイリアスを尽くした後だけ未知キーを拒否したい

アウトバウンド DTO では `deny_unknown_fields` はほぼ不要。安定フィールド名と明示 optional に注力する。

## 値オブジェクト向け `serde(try_from)`

不変条件を持つ単一フィールドのリーフ型では、通常コードと同じコンストラクタにデシリアライズを委譲する。[`crate-guides/serde.md`](/docs/kamae/rust/references/crate-guides/serde/) も参照。

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Deserialize)]
#[serde(try_from = "String")]
pub struct EmailAddress(String);

impl TryFrom<String> for EmailAddress {
    type Error = EmailAddressError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        EmailAddress::new(value)
    }
}
```

ID、メール、スラッグ、有界数量に `try_from` を使う。コマンド、集約、複数フィールド検証には DTO -> `TryFrom` を優先する。DTO を避けるために集約に `try_from` だけを付けない。フィールド横断ルールは `TryFrom<CreateRequestDto>` に属する。

## HTTP Extractor（axum / actix-web）

ハンドラは薄く保つ: ワイヤ形状を extract し、ドメインコマンドに変換し、ユースケースを呼ぶ。

### axum

```rust
#[derive(serde::Deserialize)]
pub struct AssignDriverBody {
    driver_id: String,
}

pub async fn assign_driver(
    Auth(actor): Auth,
    Path(request_id): Path<String>,
    Json(body): Json<AssignDriverBody>,
    State(app): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let cmd = AssignDriverCommand::try_from(AssignDriverDto {
        tenant_id: actor.tenant_id,
        request_id,
        driver_id: body.driver_id,
    })?;

    app.assign_driver.execute(&actor, cmd).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

### actix-web

```rust
#[derive(serde::Deserialize)]
pub struct AssignDriverBody {
    driver_id: String,
}

#[post("/requests/{request_id}/assign")]
pub async fn assign_driver(
    actor: AuthenticatedActor,
    path: web::Path<String>,
    body: web::Json<AssignDriverBody>,
    app: web::Data<AppState>,
) -> Result<HttpResponse, ApiError> {
    let cmd = AssignDriverCommand::try_from(AssignDriverDto {
        tenant_id: actor.tenant_id.clone(),
        request_id: path.into_inner(),
        driver_id: body.driver_id.clone(),
    })?;

    app.assign_driver.execute(&actor, cmd).await?;
    Ok(HttpResponse::NoContent().finish())
}
```

Extractor はトランスポート形状（JSON、パスセグメント）を証明する。`TryFrom` はドメイン意味を証明する。`TryFrom` とユースケースエラーは 1 つの adapter モジュールで HTTP ステータスにマップする。

## データベース行（`sqlx::FromRow`）

行を row struct にマップし、ドメイン型に変換する。ドメインエンティティに `FromRow` derive しない。

```rust
#[derive(sqlx::FromRow)]
struct WaitingRequestRow {
    request_id: String,
    passenger_id: String,
    tenant_id: String,
    version: i64,
}

impl TryFrom<WaitingRequestRow> for Versioned<WaitingRequest> {
    type Error = RepositoryError;

    fn try_from(row: WaitingRequestRow) -> Result<Self, Self::Error> {
        Ok(Versioned {
            value: WaitingRequest::new(
                RequestId::new(row.request_id)?,
                PassengerId::new(row.passenger_id)?,
                TenantId::new(row.tenant_id)?,
            )?,
            version: AggregateVersion::new(row.version)?,
        })
    }
}
```

リポジトリ adapter は `query_as::<_, WaitingRequestRow>` を実行し `try_into()` を呼ぶ。無効な保存データはドメインコードで panic せず `RepositoryError::CorruptRow` になる。

## 設定と環境変数

env/設定を settings DTO または `config` crate struct にパースし、検証済み範囲と単位を持つドメイン設定型に変換する。

```rust
#[derive(serde::Deserialize)]
pub struct BookingSettingsDto {
    max_passengers: u32,
    currency_code: String,
    assignment_timeout_secs: u64,
}

impl TryFrom<BookingSettingsDto> for BookingSettings {
    type Error = ConfigError;

    fn try_from(dto: BookingSettingsDto) -> Result<Self, Self::Error> {
        if dto.max_passengers == 0 {
            return Err(ConfigError::InvalidMaxPassengers);
        }
        Ok(Self {
            max_passengers: PassengerCount::new(dto.max_passengers)?,
            currency: CurrencyCode::new(dto.currency_code)?,
            assignment_timeout: DurationSeconds::new(dto.assignment_timeout_secs)?,
        })
    }
}

pub fn load_booking_settings() -> Result<BookingSettings, ConfigError> {
    let dto: BookingSettingsDto = config::Config::builder()
        .add_source(config::Environment::default().separator("__"))
        .build()?
        .try_deserialize()?;
    dto.try_into()
}
```

環境変数は暗黙 default（`0`、空文字列）を持つ文字列である。他の外部境界と同様に扱う。

## gRPC メッセージ（tonic / prost）

生成された prost 型はワイヤ DTO である。ユースケースの前にドメインコマンドへ変換する。

```rust
impl TryFrom<proto::AssignDriverRequest> for AssignDriverCommand {
    type Error = AssignDriverError;

    fn try_from(req: proto::AssignDriverRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            tenant_id: TenantId::new(req.tenant_id)?,
            request_id: RequestId::new(req.request_id)?,
            driver_id: DriverId::new(req.driver_id)?,
            idempotency_key: req
                .idempotency_key
                .map(IdempotencyKey::new)
                .transpose()?,
        })
    }
}

pub async fn assign_driver(
    auth: Request<AuthenticatedActor>,
    request: Request<proto::AssignDriverRequest>,
) -> Result<Response<proto::AssignDriverResponse>, Status> {
    let actor = auth.into_inner();
    let cmd = AssignDriverCommand::try_from(request.into_inner())
        .map_err(|e| Status::invalid_argument(e.to_string()))?;

    if cmd.tenant_id != actor.tenant_id {
        return Err(Status::permission_denied("tenant mismatch"));
    }

    // use case ...
    Ok(Response::new(proto::AssignDriverResponse {}))
}
```

prost 型をドメインモジュールに持ち込まない。`.proto` にフィールドが追加されても DTO 層はコンパイルし、`TryFrom` を明示的に更新する。無効なドメイン状態を黙って受け入れない。

## よくある crate の組み合わせ

| Stack | Boundary pattern |
| --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`、`TryFrom` が型付き error enum を返す |
| `garde` + `serde` + axum | `TryFrom` の前または内部で DTO を `garde` 検証; [`crate-guides/garde.md`](/docs/kamae/rust/references/crate-guides/garde/) 参照 |
| `sqlx` + `thiserror` | row struct に `FromRow`、ドメインへ `TryFrom`、行エラーは adapter でマップ |
| `config` + `serde` | env/ファイルから settings DTO、`TryFrom` でドメイン設定へ |
| `tonic` + `prost` | 生成メッセージ -> `TryFrom` -> ユースケース |

## レビューシグナル

次をレビューでフラグする:

- ハンドラが `String` ID をユースケースに直接渡す
- ドメイン struct が `Deserialize`、`FromRow`、無制限 `Serialize` を derive している
- インバウンド DTO が手数料、同意、所有権の意味を変えるフィールドに `default` を使う
- ワイヤの tenant/actor ID を認証コンテキストと比較せず使う
- `serde_json::Value` や `prost` 型がドメイン遷移メソッドに到達する

## レビュー観点

### 4.1 外部境界はすべて DTO → ドメインで変換されているか — High

HTTP ハンドラ、キューコンシューマ、DB 行マッパ、ファイル / 設定 / 環境リーダ、CLI パーサが、検証付き変換なしに生データをドメインロジックへ渡す箇所をフラグする。

値がアダプタ層に留まる生 DTO / リードモデル構築、検証付き `TryFrom` / コンストラクタ経路内の直接ドメイン構築にはフラグを立てない。

### 4.2 serde を検証とみなしていないか — High

非空文字列、有効な ID、正の金額、範囲、クロスフィールドルールなどのドメイン不変条件を `Deserialize` だけに頼るコードをフラグする。

### 4.3 ドメインエンティティは外部形式向けに過剰に derive されていないか — Medium

不変条件やマスキングを守るために別 DTO / 行で十分なのに、ドメインエンティティに `Deserialize`、`Serialize`、`FromRow` がある場合はフラグする。

意図的なリードモデル、プロジェクション、レスポンス専用 DTO の `Serialize` にはフラグを立てない。

### 4.4 DTO の既定値と未知フィールドは意図的か — Medium

欠落や綴り違いの入力がビジネス意味を変えうる受信 DTO で、広い `Default`、オプションフィールド、寛容な未知フィールド処理をフラグする。互換性が不要なら明示的な既定値と `deny_unknown_fields` を優先する。

### 4.5 認可とテナント境界はチェックされているか — High

ドメイン操作前に認証コンテキストと比較せず、パス / ボディのテナント ID、アクター ID、所有権クレームを信頼するハンドラやユースケースをフラグする。

### 4.6 検証済みリーフのデシリアライズと集約パースは区別されているか — Medium

クロスフィールドルールを DTO と `TryFrom` で強制できるのに、集約、コマンド、複数フィールドエンティティに `Deserialize` がある場合はフラグする。通常コードと同じコンストラクタへ委譲するリーフ値オブジェクト（ID、メール、スラッグ）の `#[serde(try_from = "...")]` にはフラグを立てない。
