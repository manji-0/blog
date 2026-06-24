---
title: "並行性 チェックリスト"
sidebar:
  order: 5
  label: "並行性"
---

リファレンス: [`concurrency.md`](/docs/kamae/python/references/concurrency/)。

## 15.1 CPU バウンドのドメイン処理はイベントループ外か — High

`asyncio.to_thread`、エグゼキューター、明示的同期境界なしに、`async def` ハンドラやユースケース内のブロック ORM、ファイル I/O、重いパース、CPU バウンドループを指摘する。

## 15.2 ドメインコードで共有可変状態を避けているか — Medium

明示引数やポートでテスト可能にできるのに、遷移やユースケースが使うモジュールレベルの可変キャッシュ、グローバル、シングルトンを指摘する。

## 15.3 プロセス/スレッドプールはスコープが適切で正当化されているか — Medium

小さな純粋遷移への広い `ProcessPoolExecutor`、ライフサイクル管理なしのリクエストごとプール作成を指摘する。

## 15.4 ロックとセッションは正しくスコープされているか — High

所有権やトランザクション境界が不明瞭なまま、並行タスク間で共有される DB セッション、ORM アイデンティティマップ、ロックを指摘する。

await/ロック相互作用は [`error-handling.md`](/docs/kamae/python/references/error-handling/) と [`aggregates.md`](/docs/kamae/python/references/aggregates/) と突き合わせる。
