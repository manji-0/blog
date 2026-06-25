---
title: "エラーハンドリング"
sidebar:
  order: 10
---

ドメインコードで `unwrap` や `panic` に頼ると、想定内のビジネス失敗とバグの区別がつかなくなる。Kamaeではドメイン固有の `enum` と `Result` で失敗を明示し、インフラエラーはアダプター境界で変換する。

ユースケースの流れは [状態遷移](/docs/kamae-rs/state-transitions/) および [アプリケーション配線](/docs/kamae-rs/application-wiring/) とセットである。ログとソースチェーンは [ロギングとメトリクス](/docs/kamae-rs/logging-metrics/)、`thiserror` の置き方は [クレートガイド（thiserror）](/docs/kamae-rs/crate-guides/#thiserror) を参照する。

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

[アプリケーション配線](/docs/kamae-rs/application-wiring/#model-use-cases-as-structs-with-dependencies) に正規の `AssignDriver` 非同期ユースケース形状がある。パターンはport経由のロード、純粋ドメイン遷移、別portへのpersistであり、各 `.await` ではインフラエラーをマップする。

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
- PIIをエラーメッセージや `Display` に付けない。ドメインIDのみ（[ロギングとメトリクス](/docs/kamae-rs/logging-metrics/) 参照）。
- ユースケースパスごとに権威あるerror返却は1つ。adapterはマップし、ドメインは各層をログせず型付きenumを返す。

構造化ログと統合するとき、操作を所有する層で一度だけエラーを記録し、`{error}` / `%error` フォーマットで全連鎖を出力する（[構造化ログとエラーチェーンの統合](/docs/kamae-rs/logging-metrics/#構造化ログとエラーチェーン統合) 参照）。

## レビュー観点

### エラーメッセージは PII とシークレットを避けているか — High

[PII 保護](/docs/kamae-rs/pii-protection/) も照合する。メール、電話、トークン、生のSQL / HTTPボディを埋め込むエラーの `Display` テキストを指摘する。

### ドメインとユースケースコードでパニックは避けているか — High

テスト、フィクスチャ、起動コード、真に到達不能な分岐以外での `panic!`、`todo!`、`unimplemented!`、`unwrap()`、`expect()` を指摘する。

起動 / 設定のフェイルファストパニック、テスト / フィクスチャのパニック、マイグレーションアサーション、同一式で既に証明された不変条件を守る `expect` メッセージには指摘しない。

### ロックは await 点をまたいで保持されていないか — High

プロジェクトが明示的に設計していない限り、ユースケースやアダプタでmutexガード、DB行ロック、その他の排他リソースを `.await` をまたいで保持する箇所を指摘する。

### async ユースケースは正しく層分けされているか — Medium

I/Oを伴うasyncドメイン遷移、`Result<impl Future<...>, E>` 型API、マッピングなしに `async fn` 境界を通過するインフラエラー型を指摘する。

### インフラエラーは意図的に変換されているか — Medium

`sqlx::Error`、`diesel::result::Error`、HTTPクライアントエラー、設定エラーを公開ドメイン / ユースケースAPIへそのまま漏らす箇所を指摘する。

### エラーは `#[source]` / `#[from]` でチェーンされているか — Medium

内部失敗を `format!` で文字列化し、`thiserror` のソースチェーンを失うユースケースエラーを指摘する。

### ドメインエラーは具体的な列挙型か — Medium

ドメインコンストラクタやユースケースから `anyhow::Result`、`eyre::Result`、`Box<dyn Error>`、`String`、不透明なcatch-allエラーを返す箇所を指摘する。

### エラーバリアントは呼び出し元にとって意味があるか — Low

呼び出し元が網羅的に分岐する必要があるのに `Other(String)` や `InvalidInput(String)` のような曖昧なバリアントを指摘する。

