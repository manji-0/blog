---
title: "品質ゲート"
sidebar:
  order: 10
---

変更したモジュールでは、`scalafmtCheckAll`、プロジェクトの `scalafix` 方針、焦点を絞ったテストを、ローカルとCIで同じコマンドとして揃える。以下が品質ゲートの正規コマンド一覧である。

アプリケーションのセットアップは [開発環境](/projects/kamae-scala/dev-environment/)、Actionsへの反映は [CI セットアップ](/projects/kamae-scala/ci-setup/)、スキルリポジトリ開発は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) を読む。

## ベースラインコマンド

リポジトリに既存コマンドがあればそれを優先する。なければ触ったScalaコード向けに次のデフォルトを使う：

```bash
sbt scalafmtAll
sbt scalafixAll
sbt compile Test/compile
sbt test
sbt doc
```

このスキルリポジトリではフルローカルCIループ：

```bash
./scripts/ci.sh
```

狭い変更では、触ったモジュールをカバーする最小コマンドセットを実行し、制限を明記する：

```bash
sbt "project domain" scalafmtCheck
sbt "project domain" test
```

CIでは `scalafmtCheckAll` を使う。ローカルでフォーマットチェックが失敗したら `scalafmtAll` で適用する。

## スキルパッケージと review probe チェック

スキル/プラグインリポジトリでは追加で実行する：

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py skills/kamae-scala/examples/src/main/scala --json
```

**kamae-scala** リポジトリ本体では `scripts/validate_package.py` と上記review probeを使う。例コードは `skills/kamae-scala/examples/` 配下のsbtサブプロジェクト `kamae-scala-taxi-request` にある。リポジトリルートから `sbt test` を実行する。このリポジトリの開発ワークフローは [スキルリポジトリの開発](/projects/kamae-scala/development-setup/) を参照。

スキルをインストールしたアプリケーションプロジェクトは、ドメインディレクトリが変わるときCIまたはpre-pushフックにprobeを追加してよい：

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py src/main/scala/domain/ src/main/scala/application/
```

## フォーマットのベースライン

変更を仕上げる前に触ったScalaファイルで `sbt scalafmtAll` を実行する。Kamaeではフォーマットはスタイルの好みの問題ではない。差分をレビューしやすく保ち、ドメイン、境界、PII、JNI、永続化の変更を確認しやすくするための手段である。

リポジトリルートに `.scalafmt.conf` をコミットし、モジュール間で揃える。フォーマットは設計レビューの代わりにならないが、未フォーマットのdomain diffはリスクのある変更を隠す。

## scalafix ベースライン

Scalaプロジェクトでは関連サブプロジェクトまたはワークスペースで `sbt scalafixAll` を実行する。既存コマンドがあればそれを使う。

プロジェクト慣習に合うscalafixルールを有効化する。修正より抑制を優先しない。

ドメインコードベースで有用なルール例：

- 未使用importとdead codeの除去
- 可能な箇所での明示的 `match` 網羅性
- 境界で誤って使われるdeprecated APIの検出

CIでscalafixを採用しているプロジェクトでは `scalafixAll --check` を追加する。[CI セットアップ](/projects/kamae-scala/ci-setup/) を参照。

## 抑制ルール

`@nowarn`、`// scalafix:off`、compiler `-Wconf` オーバーライドは可能な限り狭く：

- モジュールレベルよりitem/expressionレベルを優先
- 正確性、安全、PII、persistence、error handlingに触れる抑制には短い理由
- 本番domainパッケージでは広いmodule-level抑制を避ける

良い例：

```scala
@nowarn("msg=unused value")
def assignDriver(...): Either[AssignDriverError, Transition[EnRouteRequest, TaxiRequestEvent]] = ...
```

## コンパイラと scalafix シグナル — ドメイン安全性

無効状態や運用失敗を隠しうるパターンに特に注意：

- domain/ユースケースの `throw`、`???`、安全でない `.get`/`.head`
- sealed domain型に対する非網羅 `match`
- 金額、数量、期間、単位の `Double` 算術
- 広い `@nowarn` または `// scalafix:off` 抑制
- 明示境界なしのeffectfulユースケース内blocking呼び出し

上記すべてをglobal有効にする必要はない。触ったコードやローカル設定に現れたreviewシグナルとして使う。

## CI 期待

ベースラインをCI jobで実行：

- `sbt scalafmtCheckAll`
- `sbt test`
- 採用時 `sbt scalafixAll --check`

ドメインconstructor、遷移、境界変換、JNI wrapper、persistence挙動に関連するテストを含める。workflowテンプレートとbranch protectionは [CI セットアップ](/projects/kamae-scala/ci-setup/) 参照。

## Scaladoc と型契約

公開ドメインAPIを変更したら `sbt doc` を実行する。公開コンストラクタ、遷移、repositoryポート、JNI周りのsafe wrapperには、不変条件、エラー、前提、安全義務を文書化する。

判別state enum、port trait、`Either` エラー意味論、境界DTO変換、redaction挙動の周辺で文書を弱めない。詳細は [公開 API のドキュメント](/projects/kamae-scala/scaladoc/) を参照。

## テスト

ドメインコンストラクタ、遷移、DTO変換、PII redaction、JNI wrapper、repositoryトランザクション、outbox挙動、リトライ/idempotencyパス向けに焦点を当てたテストを実行する。

| 関心 | テスト場所 | ガイド |
| --- | --- | --- |
| フィクスチャと遷移エッジ | unit/integration tests | [テストデータ](/projects/kamae-scala/test-data/) |
| 入力全体の不変条件 | ScalaCheck property | [プロパティベーステスト](/projects/kamae-scala/property-based-tests/) |
| コンパイル時 state 安全性 | munit `compileErrors` | [テストデータ](/projects/kamae-scala/test-data/#コンパイル時安全性テスト) |
| fake port とユースケース | application tests | [開発環境](/projects/kamae-scala/dev-environment/) |

生成バインディング、vendoredコード、外部維持スナップショットはフルlintバーから免除してよいが、それらを包むsafe wrapperは境界検証、PII、JNI境界ガイダンスに従う。

レビューでは、未フォーマットの変更、新規compiler/scalafix警告、広いlint抑制、ドメイン安全性リスクを隠す抑制、CIに表れないフォーマット / lintゲートを指摘する。

## レビュー観点

### 抑制された lint がドメイン安全性リスクを隠していないか — High

`throw`、`???`、安全でない `.get`/`.head`、非網羅 `match`、`Double` 金額算術、広い `@nowarn`、blocking呼び出し、PIIの `toString`、境界デシリアライズに関する抑制や無視された警告を指摘する。

### lint 抑制は狭く正当化されているか — Medium

広いmodule-level `@nowarn`、`// scalafix:off`、説明のないドメイン、境界、PII、JNI、永続化、エラーハンドリング周辺の抑制を指摘する。

生成、ベンダー、互換コードでソースが文書化され隔離されている場合は格下げする。

### 関連モジュールの lint 結果はクリーンか — Medium

リポジトリが通常 `sbt compile`、`scalafixAll --check`、または同等のCIを触ったモジュールで走らせるのに、新しい警告やスキップされたlintゲートがある場合は指摘する。

### フォーマット / lint ゲートは CI またはパッケージ検証に表れているか — Low

Scalaソース変更があるのにフォーマットとlintチェックの実行方法が文書化されていないパッケージを指摘する。`scalafmtCheckAll` とプロジェクトの関連 `scalafix` コマンドを提案する。

### 触った Scala コードはフォーマットされているか — Low

生成コードやベンダーコードを除き、`scalafmtCheckAll` に失敗する触ったScalaファイルを指摘する。
