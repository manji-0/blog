---
title: "Rust エラーハンドリング"
sidebar:
  order: 10
---

## ドメイン固有のエラー enum を使う

ドメインおよびユースケースコードでは `Result<T, E>` と具体的な error enum を使う。

```rust
#[derive(Debug, thiserror::Error)]
pub enum AssignDriverError {
    #[error("request not found: {request_id}")]
    RequestNotFound { request_id: RequestId },
    #[error("request is not waiting")]
    InvalidState,
    #[error("driver is not available: {driver_id}")]
    DriverNotAvailable { driver_id: DriverId },
}
```

ドメイン関数から `anyhow::Error`、`Box<dyn Error>`、`String` を返さない。それらはエラーを報告またはログするアプリケーション境界付近では許容される。

## ドメインコードで panic を避ける

ドメインおよびユースケースコードの `panic!`、`todo!`、`unimplemented!`、`unwrap()`、`expect()` をフラグするか避ける。代わりに型付きエラーまたはテスト専用ヘルパーを使う。

許容される例外:

- テストとフィクスチャ
- 網羅的ドメイン推論で守られた真に到達不能な分岐
- クラッシュが意図された挙動であるプロセス起動時の設定失敗

## インフラエラーを意図的に変換する

インフラとアプリケーションロジックの境界で、repository および adapter エラーをユースケースエラーにマップする。

```rust
let request = repository
    .find_by_id(&request_id)
    .await
    .map_err(AssignDriverError::Repository)?;
```

低レベル crate の error 型を、明示的なプロジェクト慣習でない限り、ドメインユースケースの公開エラー契約にしない。

## 非同期ユースケースと `Result`

Rust サーバーコードでは慣用的な形は `async fn -> Result<T, E>` であり、`Result<Future<_>, E>` ではない。future は `Result` に解決し、async 本体で `?` を使う。

層を分離する:

| Layer | Typical shape | Error type |
| --- | --- | --- |
| Domain transition | sync `fn` または consuming method | `DomainError` |
| Use case | `async fn` | `#[from]` バリアントを持つ `UseCaseError` |
| Port / adapter | trait 内 `async fn` | `RepositoryError`, `ClientError`, ... |

可能ならドメイン遷移は同期かつ純粋に保つ。async は I/O を行うユースケースと adapter に属する。

[`application-wiring.md`](/docs/kamae/rust/references/application-wiring/#model-use-cases-as-structs-with-dependencies) に正規の `AssignDriver` 非同期ユースケース形状がある。パターンは: port 経由でロード、純粋ドメイン遷移、別 port で persist — 各 `.await` サイトでインフラエラーをマップする。

ガイドライン:

- `.await` サイトで `map_err` または `#[from]` によりインフラエラーをマップする。
- ユースケースで mutex ガードなどのロックを `.await` 越しに保持しない。
- 本当に独立した port 呼び出しだけ、ユースケース層で `tokio::try_join!` 等を使う。
- ハンドラ内の文字列的リトライより、`ConcurrentModification` のような型付きリトライ可能エラーを優先する。

プロジェクトがすでに標準化していない限り、`ResultAsync` 風コンビネータは導入しない。`?` と層別 error enum が Kamae の Rust デフォルトである。

## `#[source]` と `#[from]` でエラーを連鎖させる

`thiserror` の source 連鎖を使い、呼び出し側と observability ツールが文字列連結なしで失敗経路を辿れるようにする。

```rust
#[derive(Debug, thiserror::Error)]
pub enum AssignDriverError {
    #[error("request not found: {request_id}")]
    RequestNotFound { request_id: RequestId },
    #[error("domain transition failed")]
    Domain(#[from] TaxiRequestError),
    #[error("persistence failed")]
    Repository(#[from] RepositoryError),
}

#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("database query failed")]
    Query(#[source] sqlx::Error),
    #[error("optimistic lock conflict on {aggregate_id}")]
    ConcurrentModification { aggregate_id: RequestId },
}
```

ガイドライン:

- 下位層エラーは `#[from]` または明示バリアントで包む。唯一の文脈として `format!("{e}")` にしない。
- インフラエラーを包んでも、リーフバリアントは意味論的に保つ（`ConcurrentModification`、`RateLimited`）。
- PII をエラーメッセージや `Display` に付けない。ドメイン ID のみ（[`logging-metrics.md`](/docs/kamae/rust/references/logging-metrics/) 参照）。
- ユースケースパスごとに権威ある error 返却は 1 つ。adapter はマップし、ドメインは各層をログせず型付き enum を返す。

構造化ログと統合するとき、操作を所有する層で一度だけエラーを記録し、`{error}` / `%error` フォーマットで全連鎖を出力する（[Integrate Error Chains with Structured Logging](/docs/kamae/rust/references/logging-metrics/#integrate-error-chains-with-structured-logging) 参照）。
