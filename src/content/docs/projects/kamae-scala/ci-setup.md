---
title: "CI セットアップ"
sidebar:
  order: 10
---

CIはローカルで再現できる品質ゲートをマージ前に強制する層である。`scalafmt` / `scalafix` / テストがPRで抜けると、ドメイン安全性のレビュー前提が崩れる。

正規コマンドは [品質ゲート](/projects/kamae-scala/quality-gates/)。`kamae-scala`スキルリポジトリ自体の開発は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/)、アプリケーションの日常開発は [開発環境](/projects/kamae-scala/dev-environment/) を読む。

## 基本方針

CIはレビュアが依存する安全シグナルを強制する。フォーマット、lint、テスト、Scaladocがそれに当たる。デフォルトのパイプラインは単純で高速に保つ。負荷の高いチェックはリスク低減の効果が見込める場合だけ追加する。

既存コマンドを先に使う。CIがなければ、変更したScalaドメインコードをカバーする最小workflowから始める。

## スキルリポジトリworkflow

`kamae-scala`リポジトリは`.github/workflows/ci.yml`で2ジョブを実行する：

| ジョブ | 目的 |
| --- | --- |
| `package` | `validate_package.py`、review-probeスモークテスト、Python構文チェック |
| `scala` | `scalafmtCheckAll`、`scalafixAll --check`、compile、test、`taxiRequest`のScaladoc |

Scalaジョブは`package`に依存し、マニフェスト / リンク失敗をJVMツールチェーン取得前に早期失敗させる。

ローカル再現：

```bash
./scripts/ci.sh
```

## デフォルトGitHub Actionsテンプレート

スキルインストール時は同梱テンプレート（スキルリポジトリの`assets/templates/`）を使う：

- `github-ci.yml` → 通常Scala backend向け`.github/workflows/ci.yml`
- `github-ci-skill-package.yml` → スキル/プラグイン向け`.github/workflows/ci.yml`
- `validate_package.py` → skill-package workflow使用時`scripts/validate_package.py`
- `github-ci-stryker.yml` + `stryker4s.conf` → 任意のアサーション強度ジョブ（`--stryker`）

同梱スクリプトでコピー:

```bash
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target . --ci backend
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target . --ci skill-package
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target . --ci none --stryker
```

スクリプトはデフォルト非破壊。プレビューは`--dry-run`、意図的置換のみ`--force`。

Kamae review probeをCIまたはpre-pushに追加可能：

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py \
  src/main/scala/domain/ src/main/scala/application/ --json
```

probeはデフォルトadvisory。チームが方針化しない限り必須merge gateにしない。テンプレートコピー後、workflow内`path/to/kamae-scala`をインストール先に置き換える。

## 最小Scalaチェック

Scalaモジュールまたはマルチプロジェクトbuildでは次を優先：

```bash
sbt scalafmtCheckAll
sbt "scalafixAll --check"
sbt compile Test/compile
sbt test
sbt doc
```

既知のモジュール行列があるプロジェクトではモジュール、warningポリシー、Scaladocスコープを調整する。レガシーworkspace全体に`-Xfatal-warnings`を安易に導入しない。

このスキルパッケージでは追加で：

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py \
  skills/kamae-scala/examples/src/main/scala --json
```

## CIが守るべきもの

domain、boundary、PII、persistence、event、test、skillファイルに触れるPRでは次を必須：

- プラグインmanifest、skill frontmatter、link、Python script構文のpackage検証（skill/plugin repo）
- 触ったScalaの`scalafmtCheckAll`
- workspaceまたは変更モジュール向けrelevant`scalafixAll --check`
- constructor、遷移、boundary parsing、redaction、persistence retry、event互換をカバーするテスト
- 公開domain API契約変更時の`sbt doc`

## マトリクス戦略

次にわたってdomain挙動が変わるときmatrixを使う：

- JVM version（17 / 21）
- マルチプロジェクトbuild内のモジュール
- database adapterまたはpersistence backend
- JNI / native向けtarget OSまたはarchitecture

高コストmatrixエントリは、すべてのPRがコストを払う正当性がない限りscheduledまたは手動triggerにする。

## 任意のアサーション強度チェック

ドメインconstructor、遷移、境界変換が高リスクで通常スイートが緑のとき、ミューテーションテストを**別の任意ジョブ**として足す。native / セキュリティ探査とは混ぜない。

- PRはモジュールスコープのStrykerを優先し、フルツリーは定期実行にする。[ミューテーションテスト](/projects/kamae-scala/mutation-testing/)を参照
- スキルテンプレを使うときは`apply_templates.py --stryker`で`github-ci-stryker.yml`と`stryker4s.conf`をコピーする

excludeとモジュールフィルタが安定するまでミューテーションを必須にしない。結果をnative健全性やsecret scanと混同しない。

## リスク連動の安全ジョブ

JNI多めモジュール、暗号 / トークン処理、本番形状データに触れるmigrationスクリプトではoptional jobを検討する：

- ネイティブライブラリをロードするOS matrix build
- dependency audit / 脆弱性スキャン
- 資格情報 / PIIを扱うrepoではsecret scan
- Testcontainers付きadapter job（永続化変更向け）

すべてのアプリケーションモジュールをデフォルト必須としない。リスクに紐付ける。

## workflowの衛生

- JavaをLTS（17または21）にpinし、`actions/setup-java`で`cache: sbt`を有効にする。
- `sbt/setup-sbt@v1`で`project/build.properties`のsbtバージョンを使う。
- PRに`concurrency`と`cancel-in-progress: true`を追加する。
- ジョブがより多くを要さない限り`permissions: contents: read`を保つ。
- リポジトリ方針に従いaction majorまたはimmutable SHAをpinする。
- advisoryでない限り`continue-on-error`で失敗を隠さない。advisoryならworkflowで明示する。

## Branch protection

merge前にCI jobを必須化する。フルtestが遅すぎるならfast domain checkとslow integrationを分割し、fast jobは必須のままにする。

adapterあるbackendではDB integration、migration、outbox relayなどスコープ内リスク向けに別jobを追加する。

## ローカルparity

CIに近いローカルコマンドを文書化する。push前にレビュアが同じcore checkを実行できること：

```bash
./scripts/ci.sh
# or
sbt scalafmtCheckAll "scalafixAll --check" test doc
```

フルparityが遅すぎるならfast pathとfull pathを分けて文書化する。[開発環境](/projects/kamae-scala/dev-environment/)と[品質ゲート](/projects/kamae-scala/quality-gates/)を参照。

## レビューで見るところ

ドメイン変更なのに`scalafmtCheckAll`、関連`scalafix`、関連テスト、必要なScaladocが必須になっていないか。JNI / nativeモジュールにOS matrixの計画はあるか。`continue-on-error`が必須に見えたり、ローカル再現手段がないCIになっていないか。
