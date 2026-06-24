---
title: "Rust アプリケーション配線"
sidebar:
  order: 10
---

<!-- constrained-by ./aggregate-transactions.md -->
<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./persistence-events.md -->

## 基本方針

ドメイン遷移は純粋で小さく保つ。オーケストレーションは port に依存するユースケース型に置き、具体 DB や HTTP クライアントには依存させない。adapter は composition root（`main`、テスト setup、フレームワーク bootstrap）でのみ配線する。

サービスロケータ、グローバル singleton、重い DI コンテナより、struct フィールドの明示的依存を優先する。

## ポートとアダプタ

- **Port**: アプリケーションまたはドメイン crate 内の小さな trait。ユースケースが必要とすることを述べる（`RequestResolver`、`RequestStore`、`PaymentGateway`）。
- **Adapter**: その port のインフラ実装（`SqlxRequestStore`、`StripePaymentGateway`）。

port は ORM テーブルやクライアント SDK 表面ではなく、ユースケースのニーズに合わせる。

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

port trait を通して `sqlx::Error`、HTTP ステータス、SDK 型を漏らさない。

## 依存を持つ struct としてユースケースをモデル化する

各ユースケースに struct を与え、port をフィールド経由で注入する。静的ディスパッチの generics がデフォルト。ランタイム置換が必要で tradeoff を受け入れる場合のみ `Arc<dyn Port + Send + Sync>` を使う。

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

| Style | Use when | Avoid when |
| --- | --- | --- |
| Generic fields (`Resolver: RequestResolver`) | ライブラリ、バイナリ、テストのデフォルト | 呼び出しサイトですべての adapter 型を名前付けする必要がある |
| `Arc<dyn Port + Send + Sync>` | フレームワーク state、プラグイン型置換、大きな app グラフ | ホットパスで単相化が必要、または port が小さく安定 |
| 明示関数引数 | ワンオフスクリプト、非常に小さな handler | ワークフローが 2 依存を超える |
| Reader 型環境渡し | コードベース全体が一貫して使っている | FP 見た目のためだけに導入 |

プロジェクトがすでに標準化していない限り DI コンテナは導入しない。Axum `State`、Shuttle、または `main` の手動配線で通常十分である。

## composition root で配線する

adapter とユースケースを `main`、`bootstrap` モジュール、またはテストフィクスチャで構築する。handler は完成したユースケースまたは application state を受け取り、インフラを自前で組み立てない。

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

テストでは port を fake または in-memory adapter に差し替える。fake port で足りるとき、ドメインとユースケーステストを実 DB から解放する。

## 副作用をドメインコードから追い出す

ドメイン遷移は `Transition<_, _>` または `Result<_, DomainError>` を返す。ユースケースが I/O 順序を所有する: load、authorize、transition、persist、publish。repository と client は port の背後に留める。

handler が SQL や HTTP を直接呼び始めたら、port を抽出しワークフローをユースケース struct に移す。
