---
title: "開発環境"
sidebar:
  order: 10
---

Kamaeスキルに従う**アプリケーション crate** をローカルで立ち上げる手順である。スキルパッケージ本体の編集は [スキルリポジトリの開発](/projects/kamae-rs/development-setup/) を読む。

日常のチェックは [品質ゲート](/projects/kamae-rs/quality-gates/)、フィクスチャの組み立ては [テストデータ](/projects/kamae-rs/test-data/)、CIへの反映は [CI セットアップ](/projects/kamae-rs/ci-setup/) を参照する。

<!-- constrained-by ./application-wiring.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./test-data.md -->

## 目的

Kamaeが想定する方法でドメインコードを実装・テストできるワークスペースを整える。型付きドメインモデル、ポートベースのユースケース、コンストラクタ経由のフィクスチャを揃え、レビュアとCIが同じチェックに依存できる状態を目指す。

**スキルに従う application crate** 向けガイド。スキルパッケージ自体の編集はリポジトリルート [`DEVELOPMENT.md`](https://github.com/manji-0/kamae-rs/blob/main/DEVELOPMENT.md) を参照。


## テンプレートからの初回ブートストラップ

`gh skill` または `npx skills` でインストールした場合、リポジトリルートの `Cargo.toml`、`rust-toolchain.toml`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などは同梱されない。プロジェクトブートストラップには [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/) 配下のテンプレートを使う。

最も手早い方法は、同梱スクリプトを使うことである。

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci backend
```

スキル/プラグインリポジトリ：

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py --target . --ci skill-package
```

`--force` なしでは既存ファイルを上書きしない。既存リポジトリに適用するときは先に `--dry-run` を使う。

## review probe の健全性チェック

ブートストラップ後、ドメインディレクトリで同梱review probeを実行し、レビュー前に一般的なKamaeスタンス問題を捕捉する：

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

review probeは既定では助言（advisory）モードである。出力はpanic、unsafe境界、serde derive、PII用語、rustdocの不足をレビューの手がかりとして扱い、チームが明示的に配線しない限り、失敗を伴うゲートにはしない。

推奨ローカルファイル：

- [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/Cargo.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/Cargo.toml) -> `Cargo.toml` または既存workspace manifestにマージ
- [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/rust-toolchain.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/rust-toolchain.toml) -> チームがMSRVまたはstable pinを共有するとき `rust-toolchain.toml`
- [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/gitignore`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/gitignore/) -> `.gitignore` または既存ファイルにマージ
- [`https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/validate_package.py`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/validate_package.py) -> スキル/プラグインリポジトリのみ `scripts/validate_package.py`

コミット前に `package.name`、workspace members、`[workspace.dependencies]` を調整する。アプリケーションリポジトリでは単一crateまたは [開発環境](/projects/kamae-rs/dev-environment/#推奨-crate-レイアウト) のworkspaceレイアウトから始める。

## 初回セットアップ

フォーマットとlintコンポーネント付きでRustをインストール：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

`Cargo.toml` がまだないプロジェクトでは、先に同梱テンプレートをコピーしてから：

```bash
cargo check
cargo test
rustc --version
```

チームがバージョンを共有するときはtoolchainをpin:

```bash
cp path/to/kamae-rs/skills/kamae-rs/assets/templates/rust-toolchain.toml .
```

## ローカルチェックループ

ブートストラップ後、[品質ゲート](/projects/kamae-rs/quality-gates/) のベースラインコマンドを実行する。スキル/プラグインリポジトリでは `python3 scripts/validate_package.py` も実行する。

クレートレイアウト、フェイクポート、テスト層、高速ループとフルpre-pushループの詳細は、本稿の後述セクションを参照する。

## ツールチェーン

フォーマット、lint、ドキュメントcomponent付きRust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup component add rustfmt clippy
```

チームがMSRVまたはstableを共有するときtoolchainをpin:

```toml
# rust-toolchain.toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

domain作業向けoptionalだが有用：

| ツール | 用途 |
| --- | --- |
| [cargo-nextest](https://nexte.st/) | 大 workspace での高速 test |
| [cargo-watch](https://github.com/watchexec/cargo-watch) | domain 編集中の test 再実行 |
| [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) | 移行中触った module のカバレッジ |

domain crateビルドは速く保つ。遷移やvalue object反復中はworkspace全体より `cargo test -p domain-crate` を優先。

## 推奨 crate レイアウト

責務を分割し、domainロジックをI/Oとframework型から解放。

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

単一crateプロジェクトはcrateの代わりにmodule:

```text
src/
  domain/
  application/
  infrastructure/
  api/
  main.rs                    # composition root
```

ルール：

- `domain` は `sqlx`、`axum`、`tonic` などI/O crateに依存しない
- handlerと `main` がadapterを配線。ユースケースはport traitのみ（[アプリケーション配線](/projects/kamae-rs/application-wiring/)）
- DTOは所有境界（`api`、`infrastructure`）の近く。`domain` 内に置かない

## ベースライン `Cargo.toml` 依存

既存利用から始める。Kamaeスタイルbootstrap時のcommon pairing:

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

依存があるとき [`crate-guides/`](/projects/kamae-rs/crate-guides/) からcrate guideを読み込む。guideがあるからといって `domain` にcrateを追加しない。

## スキルトピック別 dev-dependencies

| Topic | Typical dev-dependencies | Notes |
| --- | --- | --- |
| Async use cases | `tokio`, `tokio-test` | `#[tokio::test]` で async port をテスト |
| Property tests | `proptest`, `proptest-regressions` | [プロパティベーステスト](/projects/kamae-rs/property-based-tests/) |
| Compile-fail state safety | `trybuild` | [テストデータ](/projects/kamae-rs/test-data/) |
| HTTP boundary tests | `axum`, `tower`, `http-body-util` | fake use case で handler テスト |
| Persistence integration | `testcontainers`, `sqlx` (test feature) | 任意。大半 domain test は fake |
| Fake time | `time` + injected clock trait | wall-clock flakiness 回避 |

integration-test依存はadapterを所有するcrateに。`domain` には置かない。

## テスト層

不変条件を証明できる最下層でtest。

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

ドメイン層とユースケース層のテストにDockerは不要である。PostgreSQLやRedisなどが本当に必要なのは、アダプター層の統合テストに限る。

## Fake port とテストフィクスチャ

test用composition rootにfakeを注入。本番と同じconstructorでフィクスチャ構築（[テストデータ](/projects/kamae-rs/test-data/)）。

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

ガイドライン：

- `tests/support/` または `#[cfg(test)] mod test_support` でhelper共有
- fixtureの `expect` のみ。メッセージにfixture不変条件を述べる
- 欠けた振る舞いを隠すmega-mockよりportごと1 fake

## 任意ローカルサービス

アダプター統合テストが実際のインフラを要する場合、チームで共有する推奨手順を1つに決め、文書化する。

**docker-compose**（シンプル、repoにcheck-in）:

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

**testcontainers**（test内完結）:

- composeがないCI parityにgood
- 遅い。`infrastructure` integrationに限定

test前にmigration SQLまたはschemaをload。ローカルdev DBを本番credentialに向けない。

## 環境と secret

- 非secret placeholderの `.env.example` をcommit。`.env` はgit外
- domain内ではなくstartupのconfig crate経由でsecret読み取り
- ローカルlog前に [PII 保護](/projects/kamae-rs/pii-protection/) ルール

```bash
# .env.example
DATABASE_URL=postgres://postgres:dev@localhost:5432/my_service_test
RUST_LOG=info,my_service=debug
```

ローカルtracingには `RUST_LOG` + `main` の `tracing-subscriber` layerで足りる。domain開発中OpenTelemetry exporterはoptional。

## ローカル check ループ

[品質ゲート](/projects/kamae-rs/quality-gates/) と [CI セットアップ](/projects/kamae-rs/ci-setup/) に合わせる。編集中fast path、PR前full path。

**Fast path**（触ったcrate）:

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

kamae-rs pluginをvendored/インストールしているプロジェクトは、レビュー依頼前に変更Rustファイルでreview probe:

```bash
cargo run -q --manifest-path path/to/kamae-rs/Cargo.toml -p kamae-review-probe -- src/domain/ src/application/
```

probe出力はreview lead。自動失敗ではない。初回ブートストラップは本稿の「テンプレートからの初回ブートストラップ」を参照。

## エディタとエージェント

**rust-analyzer**

- マシンが許せば `rust-analyzer.check.command` を `clippy`
- プロジェクトが文書化したときだけ `rust-analyzer.rustfmt.extraArgs`

**Kamae skill**

- domain実装/refactor時Claude/Codexで `kamae-rs` skillをload
- crate嗜好は [kamae-rs リポジトリ](https://github.com/manji-0/kamae-rs) の `rules/` を参照
- エージェントを最初 `Cargo.toml` へ。crate guideとtopicが正しくloadされる

**Watch mode**（optional）:

```bash
cargo watch -x 'test -p domain --lib'
```

## 新 domain module の bootstrap チェックリスト

1. `domain` / `application` crate（またはmodule）を作成または特定
2. `thiserror` domain errorとvalue-object constructorを追加
3. ユースケース前にvalid/invalid構築の単体test
4. DB schemaではなく1ユースケース形のport trait
5. generic port fieldとtest内fake adapterでユースケース実装
6. APIまたはinfrastructure境界にDTO `TryFrom`
7. `main` またはtest bootstrapのみでユースケース配線
8. fast check loop。push前full path
9. diffに `kamae-rs-review`（またはprobe + 関連checklist）

レガシー codebaseでは全体再構成前に [段階的導入](/projects/kamae-rs/adoption/) の導入ラダーを登る。

## ローカルと CI が異なるとき

READMEまたは `CONTRIBUTING.md` に差分を明示：

- CIではtestするがローカルではないfeature flag
- optional Docker-only integration job
- MSRV job vs開発者stable toolchain
- advisory Miri/fuzz job

どの失敗がマージをブロックし、どれがスケジュール実行の助言（advisory）にとどまるのかを、開発者がREADMEや `CONTRIBUTING.md` で確認できるようにする（[CI セットアップ](/projects/kamae-rs/ci-setup/) を参照）。

## レビューで見るところ

- コミット済み `.env` や例の実認証情報、生PIIをログするよう促すセットアップはないか（[PII 保護](/projects/kamae-rs/pii-protection/)）。
- `domain` が `sqlx` / `axum` / `tonic` に依存し、ドメインテストがHTTPやDBプールを直接引き込んでいないかも見る。
- フェイクポートで足りるのにライブDB必須になっていないか。
- フィクスチャがコンストラクタを迂回していないか（[テストデータ](/projects/kamae-rs/test-data/)）。
- [CI セットアップ](/projects/kamae-rs/ci-setup/) と揃ったローカル高速パスはあるか。

