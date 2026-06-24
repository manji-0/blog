---
title: "開発環境"
sidebar:
  order: 10
---

> **対象読者:** Kamae スキルに従うアプリケーション crate をローカルで開発する担当者。スキルパッケージ本体は [スキルリポジトリの開発](/docs/kamae-rs/development-setup/) を参照。
> **いつ読むか:** 初回ブートストラップ、ツールチェーン、crate レイアウト、fake port、ローカル品質ゲートを整えるとき。
> **関連:** [品質ゲート](/docs/kamae-rs/quality-gates/)、[テストデータ](/docs/kamae-rs/test-data/)、[CI セットアップ](/docs/kamae-rs/ci-setup/)。

<!-- constrained-by ./application-wiring.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./test-data.md -->

## 目的

Kamae が期待する方法で domain コードを実装・テストできる workspace をセットアップする: typed domain model、port ベースユースケース、constructor ベースフィクスチャ、レビュアと CI が依存する同一チェック。

**スキルに従う application crate** 向けガイド。スキルパッケージ自体の編集はリポジトリルート [`DEVELOPMENT.md`](/docs/kamae-rs/../../../DEVELOPMENT/) を参照。


## テンプレートからの初回ブートストラップ

`gh skill` または `npx skills` でインストールした場合、リポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などは同梱されない。プロジェクトブートストラップには [`../assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) 配下のテンプレートを使う。

最速の経路は同梱スクリプト:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

スキル/プラグインリポジトリ:

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

`--force` なしでは既存ファイルを上書きしない。既存リポジトリに適用するときは先に `--dry-run` を使う。

## review probe の健全性チェック

ブートストラップ後、ドメインディレクトリで同梱 review probe を実行し、レビュー前に一般的な Kamae スタンス問題を捕捉する:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

probe はデフォルトで advisory。出力は panic、unsafe 境界、serde derive、PII 用語、rustdoc ギャップのレビューリードとして扱い、チームが配線しない限り失敗ゲートにしない。

推奨ローカルファイル:

- [`../assets/templates/Cargo.toml`](../assets/templates/Cargo.toml) -> `Cargo.toml` または既存 workspace manifest にマージ
- [`../assets/templates/rust-toolchain.toml`](../assets/templates/rust-toolchain.toml) -> チームが MSRV または stable pin を共有するとき `rust-toolchain.toml`
- [`../assets/templates/gitignore`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/gitignore/) -> `.gitignore` または既存ファイルにマージ
- [`../assets/templates/validate_package.py`](../assets/templates/validate_package.py) -> スキル/プラグインリポジトリのみ `scripts/validate_package.py`

コミット前に `package.name`、workspace members、`[workspace.dependencies]` を調整する。アプリケーションリポジトリでは単一 crate または [開発環境](/docs/kamae-rs/dev-environment/#recommended-crate-layout) の workspace レイアウトから始める。

## 初回セットアップ

フォーマットと lint コンポーネント付きで Rust をインストール:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

`Cargo.toml` がまだないプロジェクトでは、先に同梱テンプレートをコピーしてから:

```bash
cargo check
cargo test
rustc --version
```

チームがバージョンを共有するときは toolchain を pin:

```bash
cp path/to/kamae-rs/skills/kamae-rs/assets/templates/rust-toolchain.toml .
```

## ローカルチェックループ

ブートストラップ後、[品質ゲート](/docs/kamae-rs/quality-gates/) のベースラインコマンドを実行する。スキル/プラグインリポジトリでは `python3 scripts/validate_package.py` も実行する。

crate レイアウト、fake port、テスト層、fast vs full pre-push ループは [開発環境](/docs/kamae-rs/dev-environment/) を参照。

## ツールチェーン

フォーマット、lint、ドキュメント component 付き Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

チームが MSRV または stable を共有するとき toolchain を pin:

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

domain 作業向け optional だが有用:

| ツール | 用途 |
| --- | --- |
| [cargo-nextest](https://nexte.st/) | 大 workspace での高速 test |
| [cargo-watch](https://github.com/watchexec/cargo-watch) | domain 編集中の test 再実行 |
| [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) | 移行中触った module のカバレッジ |

domain crate ビルドは速く保つ。遷移や value object 反復中は workspace 全体より `cargo test -p domain-crate` を優先。

## 推奨 crate レイアウト

責務を分割し、domain ロジックを I/O と framework 型から解放。

```text
my-service/
  Cargo.toml                 # workspace root
  crates/
    domain/                  # entities, value objects, transitions, domain errors
    application/             # use cases, port traits, use-case errors
    infrastructure/          # SQL/HTTP/queue adapters, outbox, telemetry wiring
    api/                     # Axum/tonic handlers, DTOs, composition root
  tests/                     # optional workspace integration tests
```

単一 crate プロジェクトは crate の代わりに module:

```text
src/
  domain/
  application/
  infrastructure/
  api/
  main.rs                    # composition root
```

ルール:

- `domain` は `sqlx`、`axum`、`tonic` など I/O crate に依存しない
- handler と `main` が adapter を配線。ユースケースは port trait のみ（[アプリケーション配線](/docs/kamae-rs/application-wiring/)）
- DTO は所有境界（`api`、`infrastructure`）の近く。`domain` 内に置かない

## ベースライン `Cargo.toml` 依存

既存利用から始める。Kamae スタイル bootstrap 時の common pairing:

```toml
[dependencies]
thiserror = "2"
serde = { version = "1", features = ["derive"] }
tracing = "0.1"

[dev-dependencies]
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
proptest = "1"
trybuild = "1"
```

依存があるとき [`crate-guides/`](/docs/kamae-rs/crate-guides/) から crate guide を読み込む。guide があるからといって `domain` に crate を追加しない。

## スキルトピック別 dev-dependencies

| Topic | Typical dev-dependencies | Notes |
| --- | --- | --- |
| Async use cases | `tokio`, `tokio-test` | `#[tokio::test]` で async port をテスト |
| Property tests | `proptest`, `proptest-regressions` | [プロパティベーステスト](/docs/kamae-rs/property-based-tests/) |
| Compile-fail state safety | `trybuild` | [テストデータ](/docs/kamae-rs/test-data/) |
| HTTP boundary tests | `axum`, `tower`, `http-body-util` | fake use case で handler テスト |
| Persistence integration | `testcontainers`, `sqlx` (test feature) | 任意。大半 domain test は fake |
| Fake time | `time` + injected clock trait | wall-clock flakiness 回避 |

integration-test 依存は adapter を所有する crate に。`domain` には置かない。

## テスト層

不変条件を証明できる最下層で test。

| 層 | テスト対象 | I/O |
| --- | --- | --- |
| Domain unit | constructors, transitions, domain errors | None |
| Use case | orchestration with fake ports | None |
| Adapter unit | SQL mapping, DTO `TryFrom`, redaction | Fake or in-memory |
| API/integration | handler -> use case -> adapter | Test DB or container optional |
| Property | input-wide laws | None in the property body |

```bash
# Fast loop while editing domain code
cargo test -p domain --lib

# Use case tests with fakes
cargo test -p application --lib

# Full workspace before push
cargo test --all-targets --all-features
```

domain と use-case test に Docker 不要。PostgreSQL、Redis 等が本当に必要な adapter integration のみ container。

## Fake port とテストフィクスチャ

test 用 composition root に fake を注入。本番と同じ constructor でフィクスチャ構築（[テストデータ](/docs/kamae-rs/test-data/)）。

```rust
// application/tests/support/fakes.rs
pub struct FakeRequestStore {
    pub saved: Mutex<Vec<(EnRouteRequest, Vec<TaxiRequestEvent>)>>,
}

impl RequestStore for FakeRequestStore {
    async fn save_assigned(
        &self,
        state: &EnRouteRequest,
        events: &[TaxiRequestEvent],
    ) -> Result<(), RepositoryError> {
        self.saved.lock().unwrap().push((state.clone(), events.to_vec()));
        Ok(())
    }
}

pub fn assign_driver_use_case() -> AssignDriver<FakeResolver, FakeRequestStore> {
    AssignDriver::new(FakeResolver::default(), FakeRequestStore::default())
}
```

ガイドライン:

- `tests/support/` または `#[cfg(test)] mod test_support` で helper 共有
- fixture の `expect` のみ。メッセージに fixture 不変条件を述べる
- 欠けた振る舞いを隠す mega-mock より port ごと 1 fake

## 任意ローカルサービス

adapter integration が実 infra を要するとき、チーム向け blessed path を 1 つ文書化。

**docker-compose**（シンプル、repo に check-in）:

```yaml
# compose.yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: my_service_test
    ports:
      - "5432:5432"
```

**testcontainers**（test 内完結）:

- compose がない CI parity に good
- 遅い。`infrastructure` integration に限定

test 前に migration SQL または schema を load。ローカル dev DB を本番 credential に向けない。

## 環境と secret

- 非 secret placeholder の `.env.example` を commit。`.env` は git 外
- domain 内ではなく startup の config crate 経由で secret 読み取り
- ローカル log 前に [PII 保護](/docs/kamae-rs/pii-protection/) ルール

```bash
# .env.example
DATABASE_URL=postgres://postgres:dev@localhost:5432/my_service_test
RUST_LOG=info,my_service=debug
```

ローカル tracing には `RUST_LOG` + `main` の `tracing-subscriber` layer で足りる。domain 開発中 OpenTelemetry exporter は optional。

## ローカル check ループ

[品質ゲート](/docs/kamae-rs/quality-gates/) と [CI セットアップ](/docs/kamae-rs/ci-setup/) に合わせる。編集中 fast path、PR 前 full path。

**Fast path**（触った crate）:

```bash
cargo fmt --all
cargo clippy -p domain -p application --all-targets -- -D warnings
cargo test -p domain -p application
```

**Full path**（pre-push）:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets --all-features
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features
```

kamae-rs plugin を vendored/インストールしているプロジェクトは、レビュー依頼前に変更 Rust ファイルで review probe:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

probe 出力は review lead。自動失敗ではない。初回ブートストラップは本稿の「テンプレートからの初回ブートストラップ」を参照。

## エディタとエージェント

**rust-analyzer**

- マシンが許せば `rust-analyzer.check.command` を `clippy`
- プロジェクトが文書化したときだけ `rust-analyzer.rustfmt.extraArgs`

**Kamae skill**

- domain 実装/refactor 時 Claude/Codex で `kamae-rs` skill を load
- crate 嗜好は [kamae-rs リポジトリ](https://github.com/manji-0/kamae-rs) の `rules/` を参照
- エージェントを最初 `Cargo.toml` へ。crate guide と topic が正しく load される

**Watch mode**（optional）:

```bash
cargo watch -x 'test -p domain --lib'
```

## 新 domain module の bootstrap チェックリスト

1. `domain` / `application` crate（または module）を作成または特定
2. `thiserror` domain error と value-object constructor を追加
3. ユースケース前に valid/invalid 構築の単体 test
4. DB schema ではなく 1 ユースケース形の port trait
5. generic port field と test 内 fake adapter でユースケース実装
6. API または infrastructure 境界に DTO `TryFrom`
7. `main` または test bootstrap のみでユースケース配線
8. fast check loop。push 前 full path
9. diff に `kamae-rs-review`（または probe + 関連 checklist）

レガシー codebase では全体再構成前に [段階的導入](/docs/kamae-rs/adoption/) の導入ラダーを登る。

## ローカルと CI が異なるとき

README または `CONTRIBUTING.md` に差分を明示:

- CI では test するがローカルではない feature flag
- optional Docker-only integration job
- MSRV job vs 開発者 stable toolchain
- advisory Miri/fuzz job

どの失敗が merge を block し、どれが scheduled advisory か開発者が知ること（[CI セットアップ](/docs/kamae-rs/ci-setup/)）。

レビューでは、ドメイン crate のインフラ依存、fake port で足りるのに実 DB 必須のテスト、不変条件を迂回するテストヘルパ、文書化されていないローカル品質ゲート、コミットされた秘密や生 PII ログ、ドメインテストの HTTP / DB 直結を指摘する。

## レビュー観点

### シークレットと PII はコミット済み env ファイルから除外されているか — High

[PII 保護](/docs/kamae-rs/pii-protection/) も照合する。コミットされた `.env`、例の実認証情報、デバッグのため生 PII をログするよう促すローカルセットアップドキュメントを指摘する。

### ドメインコードは I/O 依存がないか — High

チームが Kamae 型の分割を掲げているのに、`domain` クレートやモジュールが `sqlx`、`axum`、`tonic` などのインフラクレートに依存している場合は指摘する。

### テスト構成はクレート境界と一致しているか — Medium

ユースケース層のフェイクやインフラ層のアダプタではなく、ドメインテストが HTTP サーバや DB プールを直接引き込む場合は指摘する。

### ドメインとユースケースのテストは Docker なしで走るか — Medium

基本的な遷移やユースケーステストにフェイクポートで足りるのに、ライブ DB や外部サービスを要求するワークフローを指摘する。

### フィクスチャはコンストラクタ経由で構築されているか — Medium

[テストデータ](/docs/kamae-rs/test-data/) も照合する。ドメイン / ユースケーステストで public フィールドリテラルや生 ORM 行により不変条件を迂回するテストヘルパを指摘する。

### 文書化されたローカルチェックループがあるか — Low

Kamae 慣習を採用しているのに、[CI セットアップ](/docs/kamae-rs/ci-setup/) と揃った高速パスとフル pre-push コマンド一覧がないプロジェクトを指摘する。

