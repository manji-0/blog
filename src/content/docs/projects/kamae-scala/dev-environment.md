---
title: "開発環境"
sidebar:
  order: 10
---

Kamaeスキルに従う**アプリケーション sbt プロジェクト**をローカルで立ち上げる手順である。スキルパッケージ本体の編集は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) を読む。

日常のチェックは [品質ゲート](/projects/kamae-scala/quality-gates/)、フィクスチャの組み立ては [テストデータ](/projects/kamae-scala/test-data/)、CIへの反映は [CI セットアップ](/projects/kamae-scala/ci-setup/) を参照する。

<!-- constrained-by ./application-wiring.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./test-data.md -->

## 目的

Kamaeが想定する方法でドメインコードを実装・テストできるワークスペースを整える。型付きドメインモデル、ポートベースのユースケース、コンストラクタ経由のフィクスチャを揃え、レビュアとCIが同じチェックに依存できる状態を目指す。

**スキルに従うアプリケーション**向けガイド。スキルパッケージ自体の編集は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) を参照する。

## ツールチェーン

Javaとsbtをインストールする。

| コンポーネント | 最小バージョン | pin の場所 |
| --- | --- | --- |
| Java | 17 (LTS) | `JAVA_HOME`、CI の `setup-java` |
| Scala | 3.3+ | `build.sbt` の `ThisBuild / scalaVersion` |
| sbt | 1.10+ | `project/build.properties` |

```properties
# project/build.properties
sbt.version=1.10.11
```

ドメイン作業向けの任意だが有用なツール：

| ツール | 用途 |
| --- | --- |
| [Coursier](https://get.coursier.io/) | 依存取得の高速化。`cs install sbt` |
| [Metals](https://scalameta.org/metals/) | Scala 3 の IDE サポート、定義ジャンプ、コンパイルエラー表示 |
| [sbt-revolver](https://github.com/spray/sbt-revolver) | アダプター / API 作業中の高速リロード |

ドメインsubprojectのビルドは速く保つ。遷移やvalue objectの反復中はモノレポ全体より `sbt "project domain" test` を優先する。

## 推奨モジュールレイアウト

責務を分割し、ドメインロジックをI/Oとフレームワーク型から解放する。

**マルチモジュール sbt**（サービス向け推奨）:

```text
my-service/
  build.sbt                    # aggregate root
  project/
    build.properties
    plugins.sbt
  domain/                      # entities, opaque IDs, transitions, domain errors
  application/                 # use cases, port traits, use-case errors
  infrastructure/              # doobie/Slick adapters, outbox, telemetry wiring
  interfaces/                  # http4s/Pekko handlers, DTOs, composition root
```

**シングルモジュール**プロジェクトはsubprojectの代わりにパッケージを使う：

```text
src/main/scala/
  com/example/domain/
  com/example/application/
  com/example/infrastructure/
  com/example/interfaces/
src/test/scala/
  com/example/domain/
  com/example/application/
  com/example/infrastructure/support/   # fakes, fixtures
```

ルール：

- `domain` はdoobie、Slick、http4s、Pekko、JDBCドライバに依存しない。
- ハンドラと `main` がアダプターを配線する。ユースケースはポートtraitのみに依存する（[アプリケーション配線](/projects/kamae-scala/application-wiring/)）。
- DTOは所有境界（`interfaces`、`infrastructure`）の近くに置き、`domain` 内には置かない。

aggregate `build.sbt` の例：

```scala
lazy val domain = (project in file("domain"))
  .settings(
    name := "my-service-domain",
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-core" % "2.12.0"
    )
  )

lazy val application = (project in file("application"))
  .dependsOn(domain)
  .settings(name := "my-service-application")

lazy val infrastructure = (project in file("infrastructure"))
  .dependsOn(domain, application)
  .settings(
    name := "my-service-infrastructure",
    libraryDependencies ++= Seq(
      "org.tpolecat" %% "doobie-core" % "1.0.0-RC9"
    )
  )

lazy val interfaces = (project in file("interfaces"))
  .dependsOn(application, infrastructure)
  .settings(name := "my-service-interfaces")
```

## ベースライン依存

プロジェクトがすでに使っているものから始める。Kamaeスタイルのコードをブートストラップするときの一般的な組み合わせ：

```scala
libraryDependencies ++= Seq(
  "org.typelevel" %% "cats-core" % "2.12.0",
  "org.typelevel" %% "cats-effect" % "3.6.1",
  "io.circe" %% "circe-core" % "0.14.10",
  "org.typelevel" %% "log4cats-slf4j" % "2.7.0"
)

libraryDependencies ++= Seq(
  "org.scalameta" %% "munit" % "1.1.0" % Test,
  "org.scalacheck" %% "scalacheck" % "1.18.1" % Test
)
```

依存があるとき [ライブラリガイド](/projects/kamae-scala/library-guides/) からガイドを読み込む。ガイドがあるからといって `domain` にライブラリを追加しない。

scalafixを使うときはルートビルドでsemanticdbを有効にする（テンプレート `build.sbt` 参照）:

```scala
ThisBuild / semanticdbEnabled := true
ThisBuild / semanticdbVersion := scalafixSemanticdb.revision
```

## スキルトピック別テスト依存

| トピック | 典型的なテスト依存 | 備考 |
| --- | --- | --- |
| エフェクト付きユースケース | `munit-cats-effect`、`cats-effect` (Test) | 制御されたランタイムで `IO` / `F[_]` ユースケースをテスト |
| プロパティテスト | `scalacheck`、`munit-scalacheck` | [プロパティベーステスト](/projects/kamae-scala/property-based-tests/) を参照 |
| コンパイル失敗による状態安全性 | munit の `compileErrors` | [テストデータ](/projects/kamae-scala/test-data/) を参照 |
| HTTP 境界テスト | `http4s-munit`、`http4s-circe` (Test) | フェイクユースケースでルートをテスト |
| 永続化統合 | Testcontainers、doobie (Test) | 任意。大半のドメインテストはフェイクで足りる |
| フェイク時間 | 注入された `Clock` / `Instant` trait | 壁時計によるフレークを避ける |

統合テスト依存はアダプターを所有するsubprojectに置き、`domain` には置かない。

## テスト層

不変条件を証明できる最下層でテストする。

| 層 | テスト対象 | I/O |
| --- | --- | --- |
| Domain unit | constructors、transitions、domain errors | なし |
| Use case | フェイクポートでのオーケストレーション | なし |
| Adapter unit | SQL マッピング、DTO の `Either` パース、redaction | フェイクまたはインメモリ |
| API/integration | handler → use case → adapter | Test DB またはコンテナは任意 |
| Property | 入力全体の法則 | プロパティ本体ではなし |

```bash
# ドメインコード編集中の高速ループ
sbt "project domain" test

# フェイク付きユースケーステスト
sbt "project application" test

# push 前のワークスペース全体
sbt scalafmtCheckAll "scalafixAll --check" compile Test/compile test doc
```

ドメインとユースケースのテストにDockerは不要である。PostgreSQL、Redisなどが本当に必要なのは、アダプター統合テストに限る。

## フェイクポートとテストフィクスチャ

テスト用composition rootにフェイクを注入する。本番と同じコンストラクタでフィクスチャを構築する（[テストデータ](/projects/kamae-scala/test-data/)）。

```scala
// application/src/test/scala/.../support/FakeTaxiRequestRepository.scala
final class FakeTaxiRequestRepository extends TaxiRequestRepository[Id]:
  val saved: mutable.ListBuffer[(EnRouteRequest, List[TaxiRequestEvent])] =
    mutable.ListBuffer.empty

  def saveAssigned(
      state: EnRouteRequest,
      events: List[TaxiRequestEvent],
      expectedVersion: Long
  ): Id[Either[AssignDriverError, Unit]] =
    Id.pure:
      saved += ((state, events))
      Right(())

def assignDriverUseCase(): AssignDriver[Id] =
  AssignDriver(FakeDriverResolver(), FakeTaxiRequestRepository())
```

ガイドライン：

- `src/test/scala/.../support/` または専用テストsubprojectでフィクスチャヘルパーを共有する。
- `Either` 結果には `assertEquals(obtained, expected)` を使う。`.get` はフィクスチャ自体が壊れているときだけ（不変条件をコメントで述べる）。
- 欠けた振る舞いを隠すメガモックより、ポートごとに1フェイクを優先する。

## 任意ローカルサービス

アダプター統合テストが実インフラを要するとき、チームで共有する推奨手順を1つ文書化する。

**docker-compose**（シンプル、リポジトリにcheck-in）:

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

**Testcontainers**（テスト内完結）:

- composeがない環境でのCIパリティに有効。
- 遅い。`infrastructure` 統合テストに限定する。

テスト前にmigration SQLまたはスキーマをロードする。ローカル開発DBを本番credentialに向けない。

## 環境とシークレット

- 非シークレットのプレースホルダーを `.env.example` にコミットする。`.env` はgit外に置く。
- ドメインコード内ではなく、起動時のconfig読み込み（`pureconfig`、Caliban config、プラットフォームenv）経由でシークレットを読む。
- ローカルログ前に [PII 保護](/projects/kamae-scala/pii-protection/) と [ライブラリガイド（secrets）](/projects/kamae-scala/library-guides/#secrets) を参照する。

```bash
# .env.example
DATABASE_URL=jdbc:postgresql://localhost:5432/my_service_test
LOG_LEVEL=INFO
```

ローカルログにはSLF4J + logbackとパッケージレベルロガーで足りる。ドメイン開発中のOpenTelemetry exporterは任意である。

## ローカルチェックループ

[品質ゲート](/projects/kamae-scala/quality-gates/) と [CI セットアップ](/projects/kamae-scala/ci-setup/) に合わせる。編集中は高速パス、PR前はフルパスを使う。

**高速パス**（触ったsubproject）:

```bash
sbt scalafmtAll
sbt "project domain" "project application" compile Test/compile
sbt "project domain" "project application" test
```

**フルパス**（pre-push）:

```bash
sbt scalafmtCheckAll
sbt "scalafixAll --check"
sbt compile Test/compile test doc
```

kamae-scalaスキルをインストールしているプロジェクトでは、レビュー依頼前に変更Scalaファイルでreview probeを実行する：

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py \
  domain/src/main/scala application/src/main/scala
```

probe出力はreview leadとして扱い、自動失敗にはしない。初回ブートストラップは [ローカル検証](/projects/kamae-scala/local-validation/) を参照する。

リポジトリがテンプレートから `scripts/ci.sh` をvendoringしている場合、スキルパッケージのフルループは `./scripts/ci.sh` で実行する。

## エディタとエージェント

**Metals（VS Code / Cursor）**

- `build.sbt` 変更後にビルドをインポートする（`Metals: Import build`）。
- テンプレートの `.scalafmt.conf` で保存時フォーマットを有効にする。
- チームがより厳しいローカルシグナルを許容するとき、開発ビルドで `-Xfatal-warnings` を使う。

**Kamae スキル**

- ドメインコードの実装・リファクタ時に `kamae-scala` スキルをロードする。
- `.claude/rules/` または `.codex/rules/` にライブラリ嗜好のプロジェクトルールを追加する。
- エージェントを最初に `build.sbt` と `project/*.sbt` へ向け、ライブラリガイドとトピックファイルが正しくロードされるようにする。

**ウォッチモード**（任意、sbt）:

```bash
sbt ~"project domain" test
```

## 新ドメインモジュールのブートストラップチェックリスト

1. `domain` / `application` subproject（またはパッケージ）を作成または特定する。
2. ドメインエラー ADTと検証済みopaque ID companionを追加する。
3. ユースケース追加前にvalid / invalid構築の単体テストを書く。
4. DBスキーマではなく1ユースケース形のポートtraitを定義する。
5. ジェネリックポートパラメータとテスト内フェイクアダプターでユースケースを実装する。
6. interfaceまたはinfrastructure境界にDTO → ドメインの `Either` パースを追加する。
7. `main` またはテストbootstrapのみでユースケースを配線する。
8. 高速チェックループを実行し、push前にフルパスを実行する。
9. diffに `kamae-scala-review`（またはprobe + 関連チェックリスト）を実行する。

レガシーコードベースでは、全体再構成の前に [段階的導入](/projects/kamae-scala/adoption/) の導入ラダーを登る。

## ローカルと CI が異なるとき

READMEまたは `CONTRIBUTING.md` に差分を明示する：

- CIでテストするがローカルではないScalaまたはJavaバージョン
- 任意のDocker専用統合ジョブ
- 助言的なreview-probeまたはポリシーチェック
- クロスビルドまたはプラットフォーム固有ジョブ

どの失敗がマージをブロックし、どれがスケジュール実行の助言にとどまるかを開発者が把握できるようにする（[CI セットアップ](/projects/kamae-scala/ci-setup/) を参照）。

## サンプルプロジェクト

本スキルリポジトリのtaxi-request例は `skills/kamae-scala/examples/` 配下のsbt subproject `kamae-scala-taxi-request` である。リポジトリルートから：

```bash
sbt "project taxiRequest" test
```

スキルパッケージコントリビューター向けコマンドは [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) を参照する。エンドツーエンドのコード解説は [タクシー配車例](/projects/kamae-scala/examples/taxi-request/) を参照する。
