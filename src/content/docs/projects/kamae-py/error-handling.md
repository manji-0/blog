---
title: "エラーハンドリング"
sidebar:
  order: 10
---

想定内のビジネス失敗を広い例外に混ぜると、呼び出し元は何を復旧し何をユーザーに返すか判断できない。Kamaeではユースケースごとに失敗型を分け、インフラ例外はアダプター境界でユースケースエラーにマップする。

オーケストレーションの流れは [状態遷移](/projects/kamae-py/state-transitions/) とセットで読む。リトライ方針は [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/)、エラー文字列の漏洩は [PII と観測経路の保護](/projects/kamae-py/pii-protection/) を確認する。

## 期待される失敗は明示的に保つ

例外はスタックを巻き戻し、フレームワーク境界でしか捕捉しにくい。想定内の拒否（見つからない、状態が違う、在庫不足）は戻り値のバリアントに載せ、呼び出し元が分岐できるようにする。

ユースケースの失敗は操作ごとに固有であるべきだ。すべてのビジネスパスにcatch-allの `AppError` を使ってはならない。

```python
class RequestNotFound(DomainModel):
    kind: Literal["request_not_found"] = "request_not_found"
    request_id: UUID


class InvalidState(DomainModel):
    kind: Literal["invalid_state"] = "invalid_state"
    current_kind: str
    expected_kind: str


type AssignDriverError = Annotated[
    RequestNotFound | InvalidState | DriverNotAvailable,
    Field(discriminator="kind"),
]
```

エラーがプロセス、API、キュー、永続化の境界を越えるときは、Pydanticのエラーバリアントを使う。共用体エイリアス上のファクトリヘルパーではなく、特定のバリアント（例： `RequestNotFound(request_id=...)`）で `Err` を返す（プロジェクトが別の慣習を標準化している場合を除く）。プロセス内に閉じるエラーであれば、プロジェクトの方針に従いfrozen dataclassでもよい。

## ドメインフローには Result 値を優先する

プロジェクトがすでにResultライブラリを使うなら、期待されるビジネス失敗についてユースケースから `Result[Success, Error]` を返す。よくある選択肢：

- dry-pythonの `returns`（`Success` / `Failure`）
- rustedpyの `result`（`Ok` / `Err`。採用前にメンテナンス状況を確認）
- 小さなローカル `Ok` / `Err` 型

以下の例は `Ok` / `Err` を使う。コンストラクタとパターンマッチの名前はプロジェクトのライブラリに合わせる。

プロジェクトがアプリケーションサービスに例外を使うなら、ドメイン例外クラスは具体的に保ち、コントローラー境界で変換する。ドメイン関数から広い `Exception`、`ValueError`、HTTPフレームワーク例外を投げない。

リポジトリ、SDK、アダプターのエラーはインフラ/アプリケーション境界でユースケースエラーにマップする。プロジェクトが明示的にその規約を選んでいない限り、低レベルドライバー例外型をドメインユースケースの公開契約として露出しない。

アダプターでのリトライ、タイムアウト、サーキットブレーカーの配置については [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) を読む。

生のPII、シークレット、アクセストークン、顧客データを含むSQLスニペット、外部ペイロードをエラーバリアントまたは例外メッセージに入れない。

## コントローラー境界でエラーを変換する

ドメインエラーからHTTPまたはRPCレスポンスへのマッピングはドメインレイヤーの外で行う。

```python
def assign_driver_response(result: Result[EnRoute, AssignDriverError]) -> JSONResponse:
    match result:
        case Ok(value=en_route):
            return JSONResponse(en_route.model_dump(mode="json"), status_code=200)
        case Err(error=RequestNotFound()):
            return JSONResponse({"code": error.kind}, status_code=404)
        case Err(error=InvalidState()):
            return JSONResponse({"code": error.kind}, status_code=409)
        case Err(error=DriverNotAvailable()):
            return JSONResponse({"code": error.kind}, status_code=422)
        case _:
            assert_never(result)
```

プロジェクトの実際のResult形状に合わせてパターンを適用する。選んだライブラリでパターンマッチが扱いにくいなら、ライブラリの `is_ok` / `is_err` APIで分岐し、その後 `error.kind` で分岐する。

## 例外が属する場所

例外は「呼び出し元が分岐して復旧する通常のビジネス結果」には向かない。次のような、フレームワークや境界が処理する失敗に留める。

- 外部境界でのPydantic `ValidationError`（入力形状が壊れている）
- フレームワークまたはリトライ機構が処理すべき予期しないインフラ失敗（DBダウン、タイムアウト）
- 到達不能な `assert_never` パスなどのプログラマエラー

「リクエストが見つからない」「無効な状態」「ドライバー利用不可」は `Err(...)` で返す。下記の表と [非同期ユースケースと Result](#非同期ユースケースと-result) で、インフラ失敗との線引きを確認する。

## 非同期ユースケースと Result

サーバーサイドのユースケースは通常 `async def` で `Result[Success, Error]` を返す。Pythonではこれは `Awaitable[Result[T, E]]` である。別の `ResultAsync` 型は不要だ。

### ビジネス失敗とインフラ失敗を分離する

| 結果 | 表現 | 例 |
| --- | --- | --- |
| 期待されるビジネス失敗 | `Err(...)` | not found、invalid state、forbidden |
| 予期しないインフラ失敗 | 送出される例外 | DB ダウン、タイムアウト、バグ |
| 回復可能な並行競合 | マップ時は `Err(...)`、またはプロジェクト方針に応じたリトライ可能例外 | version conflict、重複コマンド |

純粋遷移は同期的なままとする。非同期にするのはユースケースとアダプターのみである。

### 推奨パターン: 早期リターン

長いモナドチェーンより読みやすい早期リターンを優先する。[状態遷移](/projects/kamae-py/state-transitions/#keep-use-cases-thin) の**正規**ユースケースから始め、`save_en_route` 周辺に永続化エラーマッピングを追加する：

```python
    en_route = assign_driver(waiting, driver_id, now)
    event = driver_assigned_event(en_route, now)

    try:
        await store.save_en_route(
            en_route,
            (event,),
            expected_version=waiting.version,
            idempotency_key=str(request_id),
        )
    except VersionConflict:
        return Err(
            InvalidState(
                current_kind=waiting.kind,
                expected_kind="waiting",
            )
        )

    return Ok(en_route)
```

フレームワークのリトライや5xxレスポンスを起動すべきインフラエラーは例外のままにできる：

```python
    except InfrastructureError:
        raise
```

呼び出し側が安定した `Err` 契約を必要とするときは、ドライバー固有の例外をアダプター境界でユースケースエラーにマップする。

### ライブラリ固有の非同期 Result 型

プロジェクトがすでに `returns` を使うなら、`FutureResult` / `IOResult` は許容される。マイグレーションの見た目のためだけに導入しない。

`result`（`Ok` / `Err`）では、ユースケース内で早期リターンによる非同期合成を保つ。このリファレンスの例は `Ok` / `Err` 名を使う。

### コントローラー境界は同期フレンドリーに保つ

コントローラーはユースケースをawaitし、その後 `Result` をHTTP/RPCにマップする：

```python
async def assign_driver_endpoint(...) -> JSONResponse:
    result = await assign_driver_use_case(...)
    return assign_driver_response(result)
```

フレームワークのレスポンス型をドメインまたはアプリケーションモジュールに漏らさない。

## レビューで見るところ

エラーテキストにメール・電話・トークン・生ボディが入っていないか（[PII と観測経路の保護](/projects/kamae-py/pii-protection/)）。広い `except Exception` やインフラ例外の素通し、本番のビジネス `assert` がないか。mutexや行ロックを `await` またいで持っていないか（[並行性と非同期](/projects/kamae-py/concurrency/)）。SQLAlchemy / HTTP失敗を公開APIへそのまま出していないか。ドメインエラーが裸の `Exception` / `ValueError` / 文字列になっていないか。`raise ... from` でチェーンを保っているか。asyncドメイン遷移やインフラエラーの素通しがないか。呼び出し元が分岐すべきなのに曖昧なバリアントになっていないか。

