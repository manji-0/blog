---
title: "エラーハンドリング"
sidebar:
  order: 10
---

> **いつ読むか:** ユースケースの失敗のモデル化、HTTP レスポンスへのエラーマッピング、非同期 `Result` フロー、または例外を投げるべきかの判断。
> **関連:** [`state-transitions.md`](/docs/kamae/python/references/state-transitions/)、[`infrastructure-resilience.md`](/docs/kamae/python/references/infrastructure-resilience/)、[`pii-protection.md`](/docs/kamae/python/references/pii-protection/)。

## 期待される失敗は明示的に保つ

ユースケースの失敗は操作に固有であるべきだ。すべてのビジネスパスに catch-all の `AppError` を使わない。

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

エラーがプロセス、API、キュー、永続化境界を越えるときは Pydantic エラーバリアントを使う。共用体エイリアス上のファクトリヘルパーではなく、特定のバリアント（例: `RequestNotFound(request_id=...)`）で `Err` を返す。プロジェクトがすでに標準化していない限り。純粋にプロセス内のエラーなら、プロジェクトがすでに好むなら frozen dataclass でもよい。

## ドメインフローには Result 値を優先する

プロジェクトがすでに Result ライブラリを使うなら、期待されるビジネス失敗についてユースケースから `Result[Success, Error]` を返す。よくある選択肢:

- dry-python の `returns`（`Success` / `Failure`）
- rustedpy の `result`（`Ok` / `Err`。採用前にメンテナンス状況を確認）
- 小さなローカル `Ok` / `Err` 型

以下の例は `Ok` / `Err` を使う。コンストラクタとパターンマッチの名前はプロジェクトのライブラリに合わせる。

プロジェクトがアプリケーションサービスに例外を使うなら、ドメイン例外クラスは具体的に保ち、コントローラー境界で変換する。ドメイン関数から広い `Exception`、`ValueError`、HTTP フレームワーク例外を投げない。

リポジトリ、SDK、アダプターのエラーはインフラ/アプリケーション境界でユースケースエラーにマップする。プロジェクトが明示的にその規約を選んでいない限り、低レベルドライバー例外型をドメインユースケースの公開契約として露出しない。

アダプターでのリトライ、タイムアウト、サーキットブレーカーの配置については [`infrastructure-resilience.md`](/docs/kamae/python/references/infrastructure-resilience/) を読む。

生の PII、シークレット、アクセストークン、顧客データを含む SQL スニペット、外部ペイロードをエラーバリアントまたは例外メッセージに入れない。

## コントローラー境界でエラーを変換する

ドメインエラーから HTTP または RPC レスポンスへのマッピングはドメインレイヤーの外で行う。

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

プロジェクトの実際の Result 形状に合わせてパターンを適用する。選んだライブラリでパターンマッチが扱いにくいなら、ライブラリの `is_ok` / `is_err` API で分岐し、その後 `error.kind` で分岐する。

## 例外が属する場所

例外は次に適している:

- 外部境界での Pydantic `ValidationError`。
- フレームワークまたはリトライ機構が処理すべき予期しないインフラ失敗。
- 到達不能な `assert_never` パスなどのプログラマエラー。

「リクエストが見つからない」「無効な状態」「ドライバー利用不可」などの通常のビジネス結果に例外は適さない。プロジェクトが明示的にドメイン固有例外を標準化していない限り。

## 非同期ユースケースと Result

サーバーサイドのユースケースは通常 `async def` で `Result[Success, Error]` を返す。Python ではこれは `Awaitable[Result[T, E]]` である。別の `ResultAsync` 型は不要だ。

### ビジネス失敗とインフラ失敗を分離する

| 結果 | 表現 | 例 |
| --- | --- | --- |
| 期待されるビジネス失敗 | `Err(...)` | not found、invalid state、forbidden |
| 予期しないインフラ失敗 | 送出される例外 | DB ダウン、タイムアウト、バグ |
| 回復可能な並行競合 | マップ時は `Err(...)`、またはプロジェクト方針に応じたリトライ可能例外 | version conflict、重複コマンド |

純粋遷移は同期的のまま。非同期なのはユースケースとアダプターのみ。

### 推奨パターン: 早期リターン

長いモナドチェーンより読みやすい早期リターンを優先する。[`state-transitions.md`](/docs/kamae/python/references/state-transitions/#keep-use-cases-thin) の**正規**ユースケースから始め、`save_en_route` 周辺に永続化エラーマッピングを追加する:

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

フレームワークのリトライや 5xx レスポンスを起動すべきインフラエラーは例外のままにできる:

```python
    except InfrastructureError:
        raise
```

呼び出し側が安定した `Err` 契約を必要とするときは、ドライバー固有の例外をアダプター境界でユースケースエラーにマップする。

### ライブラリ固有の非同期 Result 型

プロジェクトがすでに `returns` を使うなら、`FutureResult` / `IOResult` は許容される。マイグレーションの見た目のためだけに導入しない。

`result`（`Ok` / `Err`）では、ユースケース内で早期リターンによる非同期合成を保つ。このリファレンスの例は `Ok` / `Err` 名を使う。

### コントローラー境界は同期フレンドリーに保つ

コントローラーはユースケースを await し、その後 `Result` を HTTP/RPC にマップする:

```python
async def assign_driver_endpoint(...) -> JSONResponse:
    result = await assign_driver_use_case(...)
    return assign_driver_response(result)
```

フレームワークのレスポンス型をドメインまたはアプリケーションモジュールに漏らさない。
