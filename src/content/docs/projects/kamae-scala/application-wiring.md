---
title: "アプリケーション配線"
sidebar:
  order: 10
---

ユースケースクラスがオーケストレーション（読み込み → 認可 → 遷移 → 永続化）を所有し、ルートやハンドラは薄い入口に留める。具象のJDBCクライアントやHTTPクライアントをドメインに漏らすと、テストが実インフラに依存し、変更の影響範囲も読み取れなくなる。

失敗の層分けは [エラーハンドリング](/projects/kamae-scala/error-handling/)、遷移の形は [状態遷移](/projects/kamae-scala/state-transitions/) と整合させる。

## 小さなクラスとしてユースケースをモデル化する

コンストラクタ引数またはreader / environmentレイヤー経由でportを注入する。リポジトリやクライアントのstatic singletonは避ける。

```scala
final class AssignDriver[F[_]: Monad](
    requests: TaxiRequestRepository[F],
    drivers: DriverRepository[F]
)
```

## コンポジションルート

具象adapterの配線はアプリケーションのbootstrapモジュール（`Main`、`Bootstrap`、またはZIO `App` レイヤー）だけで行う。ドメインとapplicationパッケージはtraitに依存し、JDBC / HTTPドライバには依存しない。

## ドメイン遷移を純粋に保つ

ユースケースが状態を読み込み、純粋な遷移を呼び、結果を永続化する。遷移メソッドの中にSQLやJSONパースを埋め込まない。

## エッジでのエラーマッピング

HTTP / gRPC / CLI adapterが `UseCaseError` をレスポンスコードとクライアント向けメッセージにマップする。リポジトリ例外の文字列をデフォルトで漏らさない。

[エラーハンドリング](/projects/kamae-scala/error-handling/) と [状態遷移](/projects/kamae-scala/state-transitions/) を参照する。
