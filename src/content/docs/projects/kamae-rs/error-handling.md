---
title: "エラーハンドリング"
sidebar:
  order: 10
---

ドメインコードで `unwrap` や `panic` に頼ると、想定内のビジネス失敗とバグの区別がつかなくなる。Kamaeではドメイン固有の `enum` と `Result` で失敗を明示し、インフラエラーはアダプター境界で変換する。

ユースケースの流れは [状態遷移](/projects/kamae-rs/state-transitions/) および [アプリケーション配線](/projects/kamae-rs/application-wiring/) とセットである。ログとソースチェーンは [ロギングとメトリクス](/projects/kamae-rs/logging-metrics/)、`thiserror` の置き方は [クレートガイド（thiserror）](/projects/kamae-rs/crate-guides/#thiserror) を参照する。

## ドメイン固有のエラー enum を使う

呼び出し元が分岐すべき失敗は列挙型のバリアントに載せ、`anyhow` や文字列エラーはHTTPハンドラなど報告境界まで留める。

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

ドメインおよびユースケースコードでは `panic!`、`todo!`、`unimplemented!`、`unwrap()`、`expect()` を避ける。代わりに型付きエラーまたはテスト専用ヘルパーを使う。

許容される例外：

- テストとフィクスチャ
- 網羅的ドメイン推論で守られた真に到達不能な分岐
- クラッシュが意図された挙動であるプロセス起動時の設定失敗

## インフラエラーを意図的に変換する

インフラとアプリケーションロジックの境界で、repositoryおよびadapterエラーをユースケースエラーにマップする。

```rust
let request = repository
    .find_by_id(&request_id)
    .await
    .map_err(AssignDriverError::Repository)?;
```

低レベルcrateのerror型を、明示的なプロジェクト慣習でない限り、ドメインユースケースの公開エラー契約にしない。

## 非同期ユースケースと `Result`

Rustサーバーコードでは慣用的な形は `async fn -> Result<T, E>` であり、`Result<Future<_>, E>` ではない。futureは `Result` に解決し、async本体で `?` を使う。

層を分離する：

| 層 | 典型的な形状 | エラー型 |
| --- | --- | --- |
| ドメイン遷移 | 同期 `fn` または所有権を消費するメソッド | `DomainError` |
| ユースケース | `async fn` | `#[from]` バリアントを持つ `UseCaseError` |
| ポート / アダプタ | trait 内 `async fn` | `RepositoryError`, `ClientError`, ... |

可能ならドメイン遷移は同期かつ純粋に保つ。asyncはI/Oを伴うユースケースとアダプタに属する。

[アプリケーション配線](/projects/kamae-rs/application-wiring/#依存を持つ-struct-としてユースケースをモデル化する) に正規の `AssignDriver` 非同期ユースケース形状がある。パターンはport経由のロード、純粋ドメイン遷移、別portへのpersistであり、各 `.await` ではインフラエラーをマップする。

ガイドライン：

- `.await` サイトで `map_err` または `#[from]` によりインフラエラーをマップする。
- ユースケースでmutexガードなどのロックを `.await` 越しに保持しない。
- 本当に独立したport呼び出しだけ、ユースケース層で `tokio::try_join!` 等を使う。
- ハンドラ内の文字列的リトライより、`ConcurrentModification` のような型付きリトライ可能エラーを優先する。

プロジェクトがすでに標準化していない限り、`ResultAsync` 風コンビネータは導入しない。`?` と層別error enumがKamaeのRustデフォルトである。

## `#[source]` と `#[from]` でエラーを連鎖させる

`thiserror` のsource連鎖を使い、呼び出し側とobservabilityツールが文字列連結なしで失敗経路を辿れるようにする。

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

ガイドライン：

- 下位層エラーは `#[from]` または明示バリアントで包む。唯一の文脈として `format!("{e}")` にしない。
- インフラエラーを包んでも、リーフバリアントは意味論的に保つ（`ConcurrentModification`、`RateLimited`）。
- PIIをエラーメッセージや `Display` に付けない。ドメインIDのみ（[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) 参照）。
- ユースケースパスごとに権威あるerror返却は1つ。adapterはマップし、ドメインは各層をログせず型付きenumを返す。

構造化ログと統合するとき、操作を所有する層で一度だけエラーを記録し、`{error}` / `%error` フォーマットで全連鎖を出力する（[構造化ログとエラーチェーンの統合](/projects/kamae-rs/logging-metrics/#構造化ログとエラーチェーン統合) 参照）。

## レビューで見るところ

- エラーの `Display` にメール・電話・トークン・生ボディが入っていないか（[PII 保護](/projects/kamae-rs/pii-protection/)）。
- ドメインやユースケースで `panic!` / `unwrap` / `expect` が常態化していないか。
- mutexや行ロックを `.await` またいで持っていないか。
- asyncドメイン遷移やインフラエラーの素通しがないか。
- `sqlx` / HTTPクライアント失敗を公開APIへそのまま出していないか。
- `format!` でソースチェーンを消していないか。
- ドメインエラーが `anyhow` / `Box<dyn Error>` / `String` になっていないか。
- 呼び出し元が分岐すべきなのに `Other(String)` のような曖昧バリアントになっていないか。

