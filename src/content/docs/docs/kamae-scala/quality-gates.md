---
title: "品質ゲート"
sidebar:
  order: 10
---

変更したモジュールでは、`scalafmtCheckAll`、プロジェクトの `scalafix` 方針、焦点を絞ったテストを、ローカルと CI で同じコマンドとして揃える。以下が品質ゲートの正規コマンド一覧である。

アプリケーションのセットアップは [開発環境](/docs/kamae-scala/dev-environment/)、Actions への反映は [CI セットアップ](/docs/kamae-scala/ci-setup/)、スキルリポジトリ開発は [スキルリポジトリの開発](/docs/kamae-scala/development-setup/) を読む。

## ベースラインコマンド

リポジトリに既存コマンドがあればそれを優先する。なければ触った Scala コード向けに次のデフォルトを使う:

```bash
sbt scalafmtAll
sbt scalafixAll
sbt compile Test/compile
sbt test
sbt doc
```

このスキルリポジトリではフルローカル CI ループ:

```bash
./scripts/ci.sh
```

狭い変更では、触ったモジュールをカバーする最小コマンドセットを実行し、制限を明記する:

```bash
sbt "project domain" scalafmtCheck
sbt "project domain" test
```

CI では `scalafmtCheckAll` を使う。ローカルでフォーマットチェックが失敗したら `scalafmtAll` で適用する。

## スキルパッケージと review probe チェック

スキル/プラグインリポジトリでは追加で実行する:

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py skills/kamae-scala/examples/src/main/scala --json
```

**kamae-scala** リポジトリ本体では `scripts/validate_package.py` と上記 review probe を使う。例コードは `skills/kamae-scala/examples/` 配下の sbt サブプロジェクト `kamae-scala-taxi-request` にある。リポジトリルートから `sbt test` を実行する。このリポジトリの開発ワークフローは [スキルリポジトリの開発](/docs/kamae-scala/development-setup/) を参照。

スキルをインストールしたアプリケーションプロジェクトは、ドメインディレクトリが変わるとき CI または pre-push フックに probe を追加してよい:

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py src/main/scala/domain/ src/main/scala/application/
```

## フォーマットのベースライン

変更を仕上げる前に触った Scala ファイルで `sbt scalafmtAll` を実行する。Kamae ではフォーマットはスタイルの好みの問題ではない。差分をレビューしやすく保ち、ドメイン、境界、PII、JNI、永続化の変更を確認しやすくするための手段である。

リポジトリルートに `.scalafmt.conf` をコミットし、モジュール間で揃える。フォーマットは設計レビューの代わりにならないが、未フォーマットの domain diff はリスクのある変更を隠す。

## scalafix ベースライン

Scala プロジェクトでは関連サブプロジェクトまたはワークスペースで `sbt scalafixAll` を実行する。既存コマンドがあればそれを使う。

プロジェクト慣習に合う scalafix ルールを有効化する。修正より抑制を優先しない。

ドメインコードベースで有用なルール例:

- 未使用 import と dead code の除去
- 可能な箇所での明示的 `match` 網羅性
- 境界で誤って使われる deprecated API の検出

CI で scalafix を採用しているプロジェクトでは `scalafixAll --check` を追加する。[CI セットアップ](/docs/kamae-scala/ci-setup/) を参照。

## 抑制ルール

`@nowarn`、`// scalafix:off`、compiler `-Wconf` オーバーライドは可能な限り狭く:

- モジュールレベルより item/expression レベルを優先
- 正確性、安全、PII、persistence、error handling に触れる抑制には短い理由
- 本番 domain パッケージでは広い module-level 抑制を避ける

良い例:

```scala
@nowarn("msg=unused value")
def assignDriver(...): Either[AssignDriverError, Transition[EnRouteRequest, TaxiRequestEvent]] = ...
```

## コンパイラと scalafix シグナル — ドメイン安全性

無効状態や運用失敗を隠しうるパターンに特に注意:

- domain/ユースケースの `throw`、`???`、安全でない `.get`/`.head`
- sealed domain 型に対する非網羅 `match`
- 金額、数量、期間、単位の `Double` 算術
- 広い `@nowarn` または `// scalafix:off` 抑制
- 明示境界なしの effectful ユースケース内 blocking 呼び出し

上記すべてを global 有効にする必要はない。触ったコードやローカル設定に現れた review シグナルとして使う。

## CI 期待

ベースラインを CI job で実行:

- `sbt scalafmtCheckAll`
- `sbt test`
- 採用時 `sbt scalafixAll --check`

ドメイン constructor、遷移、境界変換、JNI wrapper、persistence 挙動に関連するテストを含める。workflow テンプレートと branch protection は [CI セットアップ](/docs/kamae-scala/ci-setup/) 参照。

## Scaladoc と型契約

公開ドメイン API を変更したら `sbt doc` を実行する。公開コンストラクタ、遷移、repository ポート、JNI 周りの safe wrapper には、不変条件、エラー、前提、安全義務を文書化する。

判別 state enum、port trait、`Either` エラー意味論、境界 DTO 変換、redaction 挙動の周辺で文書を弱めない。詳細は [公開 API のドキュメント](/docs/kamae-scala/scaladoc/) を参照。

## テスト

ドメインコンストラクタ、遷移、DTO 変換、PII redaction、JNI wrapper、repository トランザクション、outbox 挙動、リトライ/idempotency パス向けに焦点を当てたテストを実行する。

| 関心 | テスト場所 | ガイド |
| --- | --- | --- |
| フィクスチャと遷移エッジ | unit/integration tests | [テストデータ](/docs/kamae-scala/test-data/) |
| 入力全体の不変条件 | ScalaCheck property | [プロパティベーステスト](/docs/kamae-scala/property-based-tests/) |
| コンパイル時 state 安全性 | munit `compileErrors` | [テストデータ](/docs/kamae-scala/test-data/#コンパイル時安全性テスト) |
| fake port とユースケース | application tests | [開発環境](/docs/kamae-scala/dev-environment/) |

生成バインディング、vendored コード、外部維持スナップショットはフル lint バーから免除してよいが、それらを包む safe wrapper は境界検証、PII、JNI 境界ガイダンスに従う。

レビューでは、未フォーマットの変更、新規 compiler/scalafix 警告、広い lint 抑制、ドメイン安全性リスクを隠す抑制、CI に表れないフォーマット / lint ゲートを指摘する。

## レビュー観点

### 抑制された lint がドメイン安全性リスクを隠していないか — High

`throw`、`???`、安全でない `.get`/`.head`、非網羅 `match`、`Double` 金額算術、広い `@nowarn`、blocking 呼び出し、PII の `toString`、境界デシリアライズに関する抑制や無視された警告を指摘する。

### lint 抑制は狭く正当化されているか — Medium

広い module-level `@nowarn`、`// scalafix:off`、説明のないドメイン、境界、PII、JNI、永続化、エラーハンドリング周辺の抑制を指摘する。

生成、ベンダー、互換コードでソースが文書化され隔離されている場合は格下げする。

### 関連モジュールの lint 結果はクリーンか — Medium

リポジトリが通常 `sbt compile`、`scalafixAll --check`、または同等の CI を触ったモジュールで走らせるのに、新しい警告やスキップされた lint ゲートがある場合は指摘する。

### フォーマット / lint ゲートは CI またはパッケージ検証に表れているか — Low

Scala ソース変更があるのにフォーマットと lint チェックの実行方法が文書化されていないパッケージを指摘する。`scalafmtCheckAll` とプロジェクトの関連 `scalafix` コマンドを提案する。

### 触った Scala コードはフォーマットされているか — Low

生成コードやベンダーコードを除き、`scalafmtCheckAll` に失敗する触った Scala ファイルを指摘する。
