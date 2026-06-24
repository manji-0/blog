---
title: "並行性と非同期"
sidebar:
  order: 10
---

> **いつ読むか:** CPU バウンドのドメイン作業、GIL、`ProcessPoolExecutor`、または asyncio イベントループのブロックが懸念されるときに読む。
> **関連:** [`application-wiring.md`](/docs/kamae-py/application-wiring/)、[`state-transitions.md`](/docs/kamae-py/state-transitions/)、[`infrastructure-resilience.md`](/docs/kamae-py/infrastructure-resilience/)。

Kamae Python は I/O バウンドのアプリケーションコードに **asyncio** を前提とする: HTTP ハンドラー、リポジトリアダプター、キューコンシューマー。純粋ドメイン遷移は**同期的**のまま。この分離により、イベントループなしでビジネスルールをテストしやすく保つ。

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

完全なユースケースは [`state-transitions.md`](/docs/kamae-py/state-transitions/#keep-use-cases-thin) を参照。

遷移は呼び出し側スレッドのイベントループ上で実行される。高速なら問題ない。重い CPU 作業を行うときは問題である。

## 実務における GIL

CPython の Global Interpreter Lock は、プロセスごとに一度に 1 スレッドだけが Python バイトコードを実行できるようにする。含意:

- **`asyncio`** はタスクが I/O 待ちのときに優れる。1 コルーチンがソケットを await している間、他が実行される。
- **`threading`** は非同期非対応の**I/O バウンドブロッキングライブラリ**（一部 DB ドライバー、レガシー SDK）に役立つ。**CPU バウンドの Python ループ**は高速化しない。
- **`multiprocessing` / `ProcessPoolExecutor`** は**CPU バウンド** Python 作業のデフォルトの逃げ道: 画像処理、大規模集計、大きなペイロードの暗号、純 Python の ML 推論。

`async def` ユースケース内で長い CPU バウンド Python 関数を直接実行しない。イベントループ全体をブロックし、同時リクエストをすべて停滞させる。

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

指針:

- ワーカープロセスには**プレーンデータ**（bytes、プリミティブ、frozen Pydantic モデル）を渡す。開いた接続、ORM セッション、ロックは渡さない。
- multiprocessing を POSIX と Windows で使うとき、ワーカー関数は**トップレベル**で picklable であるべき。
- ジョブが長い、リトライが必要、プロセス再起動後も存続すべきときは**専用ワーカーサービス**（Celery、RQ、ARQ、SQS コンシューマー）を優先する。
- **ネイティブ拡張**（Pillow、numpy、一部暗号ライブラリ）内で GIL を解放する。文書化され上限があるなら、ネイティブへの同期呼び出しはイベントループ上で許容されうる。まずプロファイルする。

## スレッド vs プロセスプール

| アプローチ | 向いている用途 | 避けるとき |
| --- | --- | --- |
| `asyncio` のみ | ネットワーク I/O、非同期 DB | コルーチン内の CPU 重い Python ループ |
| デフォルトプール付き `threading` / `run_in_executor` | レガシー SDK のブロッキング I/O | CPU バウンド Python（GIL 競合） |
| `ProcessPoolExecutor` | CPU バウンド純 Python | 共有可変状態や開いた DB ハンドルが必要な関数 |
| 外部ワーカーキュー | 長いジョブ、リトライ、バックプレッシャー | キューオーバーヘッドが支配的なサブミリ秒作業 |

## ドメインレイヤーと非同期でないコード

ドメインモジュールは **asyncio なしでインポート可能**であるべきである。ルールは次のとおりである。

1. 純粋遷移はプレーンな `def` 関数。
2. `domain.py` 内で `asyncio.run`、`get_event_loop`、`await` を呼ばない。
3. ポートが同期と非同期の両方を露出する必要があるなら、アプリケーション境界では**1 つの非同期ポート**を優先し、同期アダプターはインフラエッジでのみ `asyncio.to_thread` で実装する。ドメインコードではしない。
4. 時刻と乱数は引数として注入する（`now: datetime`、`rng: Random`）。環境グローバルから読まない。同じ関数をワーカーとテストで実行できる。

## フレームワークエントリポイント

エグゼキュータとプロセスプールは**コンポジションルート**（FastAPI lifespan、Celery アプリファクトリー）で配線し、ドメインパッケージのモジュールレベル副作用にはしない。

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.image_executor = ProcessPoolExecutor(max_workers=4)
    yield
    app.state.image_executor.shutdown(wait=True)
```

ポート配線は [`application-wiring.md`](/docs/kamae-py/application-wiring/)、遅いワーカー周りのタイムアウトとリトライは [`infrastructure-resilience.md`](/docs/kamae-py/infrastructure-resilience/) を読む。

## レビュー観点

### 15.1 CPU バウンドのドメイン処理はイベントループ外か — High

`asyncio.to_thread`、エグゼキューター、明示的同期境界なしに、`async def` ハンドラやユースケース内のブロック ORM、ファイル I/O、重いパース、CPU バウンドループを指摘する。

### 15.2 ドメインコードで共有可変状態を避けているか — Medium

明示引数やポートでテスト可能にできるのに、遷移やユースケースが使うモジュールレベルの可変キャッシュ、グローバル、シングルトンを指摘する。

### 15.3 プロセス/スレッドプールはスコープが適切で正当化されているか — Medium

小さな純粋遷移への広い `ProcessPoolExecutor`、ライフサイクル管理なしのリクエストごとプール作成を指摘する。

### 15.4 ロックとセッションは正しくスコープされているか — High

所有権やトランザクション境界が不明瞭なまま、並行タスク間で共有される DB セッション、ORM アイデンティティマップ、ロックを指摘する。

await/ロック相互作用は [`error-handling.md`](/docs/kamae-py/error-handling/) と [`persistence-events.md`](/docs/kamae-py/persistence-events/) と突き合わせる。
