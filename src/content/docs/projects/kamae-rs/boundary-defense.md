---
title: "境界防御"
sidebar:
  order: 10
---

`serde` やDBドライバは「要求された形状」を満たすことは証明しても、ドメイン上の意味（有効ID、テナント境界、金額の単位など）は保証しない。外部データはDTOで受け、`TryFrom` でドメイン型へ変換する二段構えとする。

状態とnewtypeの設計は [ドメインモデリング](/projects/kamae-rs/domain-modeling/)、エラーの返し方は [エラーハンドリング](/projects/kamae-rs/error-handling/)、serdeの使い分けは [クレートガイド（serde）](/projects/kamae-rs/crate-guides/#serde) を参照する。

## デシリアライズは形状パースに留める

JSONや行データが「形として正しい」ことと「ビジネスとして許可される」ことは別問題である。二段変換を省略すると、後段のドメインコードが暗黙に外部形状を信頼してしまう。

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

次の境界ではDTO → ドメイン変換を適用する：

- HTTPおよびRPCリクエスト
- DB行とクエリ結果
- キューメッセージとwebhook
- ファイル、環境変数、設定
- CLI引数

生の `String`、`Value`、DB行フィールドから、コンストラクタが不変条件を検証しない限り、ドメイン型を直接構築しない。

## API、DB、ドメイン型を分離する

デフォルトでは、ドメインエンティティに `Serialize`、`Deserialize`、`sqlx::FromRow`、Diesel deriveを付けない。外部表現が異なる、または不変条件を迂回できる場合はDTO/row structを使う。

小さな内部ツールや、本当に不変条件のない値オブジェクトでは例外もあり得る。重要な場合は理由を明記する。

## レビュー観点との対応

レビューチェックリストは次の実践に対応する：

| トピック | 節 |
| --- | --- |
| すべての境界で DTO → ドメイン | [すべての外部境界で検証する](#すべての外部境界で検証する) |
| `serde` は形状パースであり検証ではない | [デシリアライズは形状パースに留める](#デシリアライズは形状パースに留める) |
| 過剰 derive したドメインエンティティを避ける | [API、DB、ドメイン型を分離する](#apidbドメイン型を分離する) |
| DTO の default と未知フィールド | [DTO の default と未知フィールド](#dto-の-default-と未知フィールド) |
| 認可とテナント境界 | [認可とテナントチェック](#認可とテナントチェック) |
| 検証付きリーフのデシリアライズ | [値オブジェクト向け `serde(try_from)`](#値オブジェクト向け-serdetry_from) |

## 認可とテナントチェック

パス、クエリ、ボディ、メッセージでテナント、主体、リソース所有者を名指すフィールドは、認証コンテキストと照合するまで信頼しない。ドメイン状態を読み込む・変更する前に、ユースケースまたは専用policyポートで検証する。

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

ルール：

- セッションやトークンがすでにテナントスコープを持つとき、リクエストボディの `tenant_id` を信頼しない。
- HTTP層だけでなく、ロード後に集約の所有権を比較する。
- 認可失敗は型付きドメインまたはユースケースエラーにマップする。プロダクト方針で要求されない限り、テナント間でリソースの存在有無を漏らさない。

## DTO の default と未知フィールド

インバウンドDTOの `#[serde(default)]` と `Default::default()` は、クライアントがフィールドを省略したりプロキシが除去したりすると、ビジネス意味を黙って変えうる。

```rust
// 危険: 省略された `cancel_fee_waived` が false になり「未指定」ではない
#[derive(serde::Deserialize)]
pub struct CancelRequestDto {
    #[serde(default)]
    cancel_fee_waived: bool,
}
```

推奨：

- 省略に意味がある場合は `Option<T>` または明示enum（`Unspecified | Yes | No`）
- クライアントが送るべきフィールドは `default` なしで必須とする
- 部分更新と完全置換が異なる場合はcreate/update DTOを分ける

### `deny_unknown_fields` を使うタイミング

次の場合、インバウンドDTOに `#[serde(deny_unknown_fields)]` を追加する：

- APIがバージョン管理され、 typoを即失敗させたい（`passengerId` vs `passenger_id`）
- 綴り違いフィールドが無視され、誤った意味で成功してしまう
- 生産者と消費者の双方をコントロールできる、または互換ポリシーが厳密パースを許容する

`deny_unknown_fields` を省略する場合：

- 公開APIが将来互換のクライアント拡張を受け入れる必要がある
- webhookや第三者ペイロードに、保存または黙認する未知フィールドがある
- 移行用に `#[serde(alias = "...")]` を使い、エイリアスを尽くした後だけ未知キーを拒否したい

アウトバウンドDTOでは `deny_unknown_fields` はほぼ不要。安定フィールド名と明示optionalに注力する。

## 値オブジェクト向け `serde(try_from)`

不変条件を持つ単一フィールドのリーフ型では、通常コードと同じコンストラクタにデシリアライズを委譲する。[クレートガイド（serde）](/projects/kamae-rs/crate-guides/#serde) も参照。

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

ID、メール、スラッグ、有界数量に `try_from` を使う。コマンド、集約、複数フィールド検証にはDTO -> `TryFrom` を優先する。DTOを避けるために集約へ `try_from` だけを付けない。フィールド横断ルールは `TryFrom<CreateRequestDto>` に属する。

## HTTP Extractor（axum / actix-web）

ハンドラは薄く保つ： ワイヤ形状をextractし、ドメインコマンドに変換し、ユースケースを呼ぶ。

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

Extractorはトランスポート形状（JSON、パスセグメント）を証明する。`TryFrom` はドメイン意味を証明する。`TryFrom` とユースケースエラーは1つのadapterモジュールでHTTPステータスにマップする。

## データベース行（`sqlx::FromRow`）

行をrow structにマップし、ドメイン型に変換する。ドメインエンティティに `FromRow` deriveしない。

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

リポジトリadapterは `query_as::<_, WaitingRequestRow>` を実行し `try_into()` を呼ぶ。無効な保存データはドメインコードでpanicせず `RepositoryError::CorruptRow` になる。

## 設定と環境変数

env/設定をsettings DTOまたは `config` crate structにパースし、検証済み範囲と単位を持つドメイン設定型に変換する。

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

環境変数は暗黙default（`0`、空文字列）を持つ文字列である。他の外部境界と同様に扱う。

## gRPC メッセージ（tonic / prost）

生成されたprost型はワイヤDTOである。ユースケースの前にドメインコマンドへ変換する。

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

prost型をドメインモジュールに持ち込まない。`.proto` にフィールドが追加されてもDTO層はコンパイルし、`TryFrom` を明示的に更新する。無効なドメイン状態を黙って受け入れない。

## よくある crate の組み合わせ

| スタック | 境界パターン |
| --- | --- |
| `serde` + `thiserror` | DTO `Deserialize`、`TryFrom` が型付き error enum を返す |
| `garde` + `serde` + axum | `TryFrom` の前または内部で DTO を `garde` 検証; [クレートガイド（garde）](/projects/kamae-rs/crate-guides/#garde) 参照 |
| `sqlx` + `thiserror` | row struct に `FromRow`、ドメインへ `TryFrom`、行エラーは adapter でマップ |
| `config` + `serde` | env/ファイルから settings DTO、`TryFrom` でドメイン設定へ |
| `tonic` + `prost` | 生成メッセージ -> `TryFrom` -> ユースケース |


レビューでは、ハンドラが `String` IDをユースケースへ直接渡すことや、ドメインstructの `Deserialize` / `FromRow` / 無制限 `Serialize` deriveを指摘する。インバウンドDTOの意味を変える `default`、認証コンテキストと照合しないtenant / actor ID、ドメイン遷移に到達する `serde_json::Value` や `prost` 型も同様である。

## レビューで見るところ

非空や正の金額などドメイン不変条件を `Deserialize` だけに頼っていないか。HTTP・キュー・DB行・設定・CLIが検証付き `TryFrom` / コンストラクタなしに生データをドメインへ渡していないか。パスやボディのテナントIDを認証コンテキストと比較せず信頼していないかも見る。欠落で意味が変わるDTOに広い `Default` や未知フィールド許容はないか。不変条件付きエンティティに不要な `Deserialize` / `Serialize` / `FromRow` がなく、クロスフィールド集約と検証済みリーフの `#[serde(try_from = "...")]` を区別しているか。
