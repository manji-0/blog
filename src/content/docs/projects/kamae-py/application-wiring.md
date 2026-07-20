---
title: "アプリケーション配線"
sidebar:
  order: 10
---

ユースケースはビジネス上の順序（読み込み → 認可 → 遷移 → 永続化）を所有し、インフラの詳細はポートの背後に隠す。ハンドラや遷移関数がSQLやHTTPを直接呼ぶと、テストが実DBに依存し、変更の影響範囲も読み取れなくなる。

ポートの形は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) のリポジトリ契約と、[ドメインモデリング](/projects/kamae-py/domain-modeling/) のProtocol定義に合わせる。非同期配線とリトライはそれぞれ [並行性と非同期](/projects/kamae-py/concurrency/)、[インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) を参照する。

## デフォルト方針: DI コンテナではなく明示的引数

Kamae PythonはReaderモナド、サービスロケーター、重いDIフレームワークより**プレーンな関数パラメータ**を優先する。

```python
async def assign_driver_use_case(
    resolver: RequestResolver,
    store: RequestStore,
    authorizer: RequestAuthorizer,
    actor: Actor,
    request_id: UUID,
    driver_id: UUID,
    now: datetime,
) -> Result[EnRoute, AssignDriverError]:
    ...
```

依存関係は型付きポートとしてユースケース境界に入る。純粋遷移関数はインフラに依存しないまま保たれる。完全なオーケストレーション例は [状態遷移](/projects/kamae-py/state-transitions/#keep-use-cases-thin) を参照する。

リポジトリがすでに標準化していない限り、新規コードのためにDIコンテナを採用しない。

## レイヤーの責務

依存の向きは一方向に保つ。ドメインはフレームワークやORMを知らず、アプリケーションはポート（`Protocol`）だけを知り、インフラが具象実装を提供する。ドメインがSQLAlchemyやFastAPIをimportし始めると、単体テストがフレームワーク起動を要求し、ビジネスルールの変更がインフラ変更と絡み合う。

| レイヤー | 責務 | 依存先 |
| --- | --- | --- |
| **Domain** | frozen モデル、値オブジェクト、純粋遷移、エラーバリアント | stdlib、Pydantic |
| **Application** | 非同期ユースケース、オーケストレーション、認可順序 | ドメインポート（`Protocol`） |
| **Infrastructure** | ポートを実装する DB/HTTP/キュー/SDK アダプター | フレームワーク、ドライバー |
| **Interface** | コントローラー、コンシューマー、CLI、コンポジションルート | application + infrastructure |

ドメインコードはインフラパッケージをインポートしてはならない。

## ポートとアダプター

**ポート**はユースケースが必要とするものを表す `typing.Protocol` 型である。**正規**の `RequestResolver` と `RequestStore` の形状： [永続化、集約、イベント](/projects/kamae-py/persistence-events/#keep-repository-protocols-small)。入門的なポート概念： [ドメインモデリング](/projects/kamae-py/domain-modeling/#define-repository-ports-with-protocols)。

**アダプター**はインフラモジュール内の具象実装である。

```text
src/
  taxi_request/
    domain.py              # states, transitions, events, errors
    application.py         # use cases
    ports.py               # Protocol definitions (or beside use cases)
  infrastructure/
    postgres_request_store.py
    http_driver_directory.py
  api/
    routes.py              # composition root for HTTP
```

ポート名は汎用の `get` / `update` より、`find_waiting` や `save_en_route` のようにユースケースに沿って狭く保つ。

## コンポジションルート

依存関係の配線はフレームワークエントリポイントでのみ行う：

- FastAPIルートモジュールと `Depends`
- ASGI lifespan起動
- Celery/RQタスクファクトリー
- CLI `main`

```python
def build_assign_driver_use_case(session: AsyncSession) -> AssignDriverUseCase:
    resolver = PostgresRequestResolver(session)
    store = PostgresRequestStore(session)
    authorizer = RequestAuthorizer(...)
    return partial(
        assign_driver_use_case,
        resolver=resolver,
        store=store,
        authorizer=authorizer,
    )
```

フレームワーク固有の構築は `api/` または `infrastructure/` に留める。ユースケースはポートを受け取るプレーン関数または小さな呼び出し可能オブジェクトのままである。

## 推奨しないもの

| アプローチ | デフォルトにしない理由 |
| --- | --- |
| Reader / environment モナド | Python では読みにくい。明示的引数で十分 |
| グローバルサービスレジストリ | 依存関係を隠し、テストを複雑化 |
| ユースケースへの ORM モデル注入 | 永続化形状をアプリケーション層に漏らす |
| ドメインコード全体への `@inject` | ドメインはフレームワークフリーであるべき |

プロジェクトがすでにFastAPI `Depends` を使うなら、コントローラー境界でユースケース依存関係を構築するために使う。純粋遷移の内側では使わない。

## フェイクでのテスト

テストは本番と同じポート型でインメモリまたはフェイクアダプターを渡すべきだ。フェイクは [永続化、集約、イベント](/projects/kamae-py/persistence-events/#keep-repository-protocols-small) の**正規**ポートを実装する。

```python
class FakeRequestStore:
    def __init__(self) -> None:
        self.saved: list[tuple[EnRoute, tuple[DriverAssigned, ...]]] = []

    async def save_en_route(
        self,
        state: EnRoute,
        events: tuple[DriverAssigned, ...],
        *,
        expected_version: int,
        idempotency_key: str,
    ) -> None:
        self.saved.append((state, events))
```

アプリケーションテストにはフェイクを使う。トランザクション、制約、ロックのテストには実データベースアダプターを使う。

発信HTTP、キュー、SDK呼び出しをリトライ、タイムアウト、サーキットブレーカー方針で包むときは [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) を読む。

## レビューで見るところ

ハンドラやドメインがSQL / HTTP / キュー / SDKを直接呼んでいないか（`main` やテストのコンポジションルートは除く）。load → authorize → transition → persistが名前付きユースケースにまとまっているかも見る。ポートがORMやSDKの面を写した巨大 `Protocol` になっていないか。ユースケーステストがライブDBなしでフェイクに差し替えられるか。隠れたグローバルや突然のDIコンテナではなく、関数引数や明示的な配線になっているかも確認する。

