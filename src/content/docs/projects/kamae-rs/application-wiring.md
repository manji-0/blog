---
title: "アプリケーション配線"
sidebar:
  order: 10
---

ユースケースstructがオーケストレーション（読み込み → 認可 → 遷移 → 永続化）を所有し、ハンドラは薄い入口に留める。具象のDBクライアントやHTTPクライアントをドメインに漏らすと、テストが実インフラに依存し、変更の影響範囲も読み取れなくなる。

リポジトリtraitの形は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/)、失敗の層分けは [エラーハンドリング](/projects/kamae-rs/error-handling/) と整合させる。

<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./persistence-events.md -->

## 基本方針

ドメイン遷移は純粋かつ小さく保ち、副作用を持たせない。ビジネス上の順序（読み込み、認可、遷移、保存）はportに依存するユースケース型が所有し、具体のDBクライアントやHTTPクライアントはユースケースのフィールドとして注入する。adapterの `new` や接続プールの取得はcomposition root（`main`、テストsetup、フレームワークbootstrap）だけが行う。

グローバルsingletonやサービスロケータは、テスト時の差し替えを難しくし、依存関係をコードから読み取れなくする。structフィールドの明示的依存を優先する。

## ポートとアダプタ

- **Port**: アプリケーションまたはドメインcrate内の小さなtrait。ユースケースが必要とすることを述べる（`RequestResolver`、`RequestStore`、`PaymentGateway`）。
- **Adapter**: そのportのインフラ実装（`SqlxRequestStore`、`StripePaymentGateway`）。

portはORMテーブルやクライアントSDK表面ではなく、ユースケースのニーズに合わせる。

```rust
pub trait RequestResolver {
    async fn find_waiting(&self, id: &RequestId) -> Result<Option<WaitingRequest>, RepositoryError>;
}

pub trait RequestStore {
    async fn save_assigned(
        &self,
        state: &EnRouteRequest,
        events: &[TaxiRequestEvent],
    ) -> Result<(), RepositoryError>;
}
```

port traitを通して `sqlx::Error`、HTTPステータス、SDK型を漏らさない。

## 依存を持つ struct としてユースケースをモデル化する

各ユースケースにstructを与え、portをフィールド経由で注入する。静的ディスパッチのgenericsがデフォルト。ランタイム置換が必要でトレードオフを受け入れる場合のみ `Arc<dyn Port + Send + Sync>` を使う。

```rust
pub struct AssignDriver<Resolver, Store> {
    resolver: Resolver,
    store: Store,
}

impl<Resolver, Store> AssignDriver<Resolver, Store>
where
    Resolver: RequestResolver,
    Store: RequestStore,
{
    pub fn new(resolver: Resolver, store: Store) -> Self {
        Self { resolver, store }
    }

    pub async fn execute(
        &self,
        request_id: RequestId,
        driver: DriverAssignment,
    ) -> Result<(), AssignDriverError> {
        let waiting = self
            .resolver
            .find_waiting(&request_id)
            .await
            .map_err(AssignDriverError::Repository)?
            .ok_or(AssignDriverError::RequestNotFound { request_id })?;

        let transition = waiting
            .assign_driver(driver)
            .map_err(AssignDriverError::Domain)?;

        self.store
            .save_assigned(&transition.state, &transition.events)
            .await
            .map_err(AssignDriverError::Repository)?;

        Ok(())
    }
}
```

ユースケースが一貫したトランザクションまたはワークフローを所有するとき、多数の裸関数引数よりこれを優先する。

## 配線スタイルを意図的に選ぶ

| スタイル | 使うとき | 避けるとき |
| --- | --- | --- |
| Generic fields (`Resolver: RequestResolver`) | ライブラリ、バイナリ、テストのデフォルト | 呼び出しサイトですべての adapter 型を名前付けする必要がある |
| `Arc<dyn Port + Send + Sync>` | フレームワーク state、プラグイン型置換、大きな app グラフ | ホットパスで単相化が必要、または port が小さく安定 |
| 明示関数引数 | ワンオフスクリプト、非常に小さな handler | ワークフローが 2 依存を超える |
| Reader 型環境渡し | コードベース全体が一貫して使っている | FP 見た目のためだけに導入 |

プロジェクトがすでに標準化していない限りDIコンテナは導入しない。Axum `State`、Shuttle、または `main` の手動配線で通常十分である。

## composition root で配線する

adapterとユースケースを `main`、`bootstrap` モジュール、またはテストフィクスチャで構築する。handlerは完成したユースケースかapplication stateを受け取り、インフラを自前で組み立てない。

```rust
// main.rs or bootstrap.rs
let pool = PgPool::connect(&database_url).await?;
let resolver = SqlxRequestResolver::new(pool.clone());
let store = SqlxRequestStore::new(pool);
let assign_driver = AssignDriver::new(resolver, store);

let app = Router::new().route(
    "/requests/{id}/assign",
    post({
        let assign_driver = assign_driver.clone();
        move |path, body| async move {
            assign_driver.execute(path.id, body.driver).await
        }
    }),
);
```

テストではportをfakeまたはin-memory adapterに差し替える。fake portで足りるとき、ドメインとユースケーステストを実DBから解放する。

## 副作用をドメインコードから追い出す

ドメイン遷移は `Transition<_, _>` または `Result<_, DomainError>` を返し、I/Oは持たない。ユースケースがload → authorize → transition → persist → publishの順序を所有し、repositoryとclientはportの背後に留める。

ハンドラの中で `sqlx::query` やHTTPクライアントを直接呼び始めたら、それは配線の漏れのサインだ。portを抽出し、ワークフローをユースケースstructに移す。典型例は「ドメイン呼び出しのあいだにDBを読む」ハンドラで、テストが実DBを要求し、トランザクション境界も曖昧になる。

## レビューで見るところ

- ハンドラやドメインがSQL / HTTP / キュー / SDKを直接呼んでいないか（`main` やテストのコンポジションルートは除く）。
- load → authorize → transition → persistが名前付きユースケースにまとまっているかも見る。
- ポートがORMやSDKの面を写した巨大トレイトになっていないか。
- ユースケーステストがライブDBなしでフェイクポートに差し替えられるか。
- 隠れたグローバルや突然のDIコンテナではなく、構造体フィールドや明示的な配線になっているかも確認する。

