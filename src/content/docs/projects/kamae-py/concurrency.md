---
title: "並行性と非同期"
sidebar:
  order: 10
---

Kamae Pythonは純粋ドメイン遷移を**同期**のまま保ち、I/Oはユースケースとアダプターで `async` 化する。この分離がなければ、イベントループ上で重いCPU処理やブロックORMが同時リクエスト全体を止め、ビジネスルールの単体テストもasyncioに引きずられる。

ユースケースの配線は [アプリケーション配線](/projects/kamae-py/application-wiring/)、ロックとトランザクションの境界は [状態遷移](/projects/kamae-py/state-transitions/) と [永続化、集約、イベント](/projects/kamae-py/persistence-events/) と照合する。

## デフォルトモデル

| レイヤー | 並行スタイル | 理由 |
| --- | --- | --- |
| **ドメイン遷移** | 同期純粋関数 | 隠れたスケジューリングなし。単体テストが容易 |
| **ユースケース** | ポートが非同期なら `async def` | ループをブロックせず I/O をオーケストレーション |
| **リポジトリ / HTTP アダプター** | 非同期ドライバー付き `async def` | `asyncpg`、`httpx`、aiobotocore など |
| **CPU バウンド作業** | `ProcessPoolExecutor` またはワーカーキュー | GIL のため Python スレッドは CPU を並列化しない |

```python
# assign_driver_use_case — full flow in state-transitions.md
waiting = await resolver.find_waiting(request_id)
if waiting is None:
    return Err(RequestNotFound(request_id=request_id))
en_route = assign_driver(waiting, driver_id, now)  # sync; runs on the event loop
await store.save_en_route(en_route, ...)
return Ok(en_route)
```

完全なユースケースは [状態遷移](/projects/kamae-py/state-transitions/#keep-use-cases-thin) を参照。

遷移は呼び出し元スレッドのイベントループ上で実行される。処理が軽ければ問題ないが、重いCPU処理を同期で走らせるとイベントループを塞ぐ。

## 実務における GIL

CPythonのGlobal Interpreter Lockは、プロセスごとに一度だけ1スレッドがPythonバイトコードを実行できるようにする。その含意は次のとおりである。

- **`asyncio`** はタスクがI/O待ちのときに優れる。1コルーチンがソケットをawaitしている間、他が実行される。
- **`threading`** は非同期非対応の**I/O バウンドブロッキングライブラリ**（一部DBドライバー、レガシー SDK）に役立つ。**CPU バウンドの Python ループ**は高速化しない。
- **`multiprocessing` / `ProcessPoolExecutor`** は、**CPU バウンド**なPython作業に対する既定の選択肢である。例として、画像処理、大規模集計、大きなペイロードの暗号処理、純PythonのML推論がある。

`async def` ユースケース内で長いCPUバウンドPython関数を直接実行しない。イベントループ全体をブロックし、同時リクエストをすべて停滞させる。

## CPU バウンドドメイン作業のオフロード

**ドメイン関数は同期のまま**保つ。ユースケースまたはインフラエッジからスケジュールする。

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor

_executor = ProcessPoolExecutor(max_workers=4)


async def resize_proof_image_use_case(
    store: ImageStore,
    image_id: UUID,
    max_edge_px: int,
) -> Result[ResizedImage, ResizeError]:
    raw = await store.load_bytes(image_id)
    loop = asyncio.get_running_loop()
    try:
        resized = await loop.run_in_executor(
            _executor,
            resize_image_bytes,  # sync; CPU-bound; picklable top-level function
            raw,
            max_edge_px,
        )
    except ImageTooLarge as exc:
        return Err(ResizeError.too_large(image_id, str(exc)))
    await store.save_resized(image_id, resized)
    return Ok(resized)
```

指針：

- ワーカープロセスには**プレーンデータ**（bytes、プリミティブ、frozen Pydanticモデル）を渡す。開いた接続、ORMセッション、ロックは渡さない。
- multiprocessingをPOSIXとWindowsで使うとき、ワーカー関数は**トップレベル**でpicklableであるべき。
- ジョブが長い、リトライが必要、プロセス再起動後も存続すべきときは**専用ワーカーサービス**（Celery、RQ、ARQ、SQSコンシューマー）を優先する。
- **ネイティブ拡張**（Pillow、numpy、一部暗号ライブラリ）内ではGILが解放される。公式に文書化された上限がある場合に限り、ネイティブ関数への同期呼び出しをイベントループ上で許容してよい。判断前にプロファイルする。

## スレッド vs プロセスプール

| アプローチ | 向いている用途 | 避けるとき |
| --- | --- | --- |
| `asyncio` のみ | ネットワーク I/O、非同期 DB | コルーチン内の CPU 重い Python ループ |
| デフォルトプール付き `threading` / `run_in_executor` | レガシー SDK のブロッキング I/O | CPU バウンド Python（GIL 競合） |
| `ProcessPoolExecutor` | CPU バウンド純 Python | 共有可変状態や開いた DB ハンドルが必要な関数 |
| 外部ワーカーキュー | 長いジョブ、リトライ、バックプレッシャー | キューオーバーヘッドが支配的なサブミリ秒作業 |

## ドメインレイヤーと非同期でないコード

ドメインモジュールは **asyncio なしで import できる**べきだ。ルールは次のとおり。

1. 純粋遷移はプレーンな `def` 関数。
2. `domain.py` 内で `asyncio.run`、`get_event_loop`、`await` を呼ばない。
3. ポートが同期と非同期の両方を露出する必要があるなら、アプリケーション境界では**1 つの非同期ポート**を優先し、同期アダプターはインフラエッジでのみ `asyncio.to_thread` で実装する。ドメインコードではしない。
4. 時刻と乱数は引数として注入する（`now: datetime`、`rng: Random`）。環境グローバルから読まない。同じ関数をワーカーとテストで実行できる。

## フレームワークエントリポイント

エグゼキュータとプロセスプールは**コンポジションルート**（FastAPI lifespan、Celeryアプリファクトリー）で配線し、ドメインパッケージのモジュールレベル副作用にはしない。

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.image_executor = ProcessPoolExecutor(max_workers=4)
    yield
    app.state.image_executor.shutdown(wait=True)
```

ポート配線は [アプリケーション配線](/projects/kamae-py/application-wiring/)、遅いワーカー周りのタイムアウトとリトライは [インフラの耐障害性](/projects/kamae-py/infrastructure-resilience/) を読む。

## レビューで見るところ

`async def` 内のブロックORM・ファイルI/O・CPUバウンドが `asyncio.to_thread` やエグゼキューター外に出ていないか。共有DBセッションやロックの所有が不明瞭でないかも見る（[エラーハンドリング](/projects/kamae-py/error-handling/)・[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）。モジュール級の可変キャッシュやシングルトンがないか、小さな遷移への広い `ProcessPoolExecutor` やリクエストごとプール作成がないかも確認する。

