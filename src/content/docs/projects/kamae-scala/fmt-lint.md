---
title: "フォーマットと lint"
sidebar:
  order: 10
---

`scalafmt` とscalafixはスタイル論争ではなく、ドメイン・境界・PII・native・永続化の差分を読みやすくするための前提である。触ったScalaでは仕上げ前に揃える。

正規コマンドは [品質ゲート](/projects/kamae-scala/quality-gates/)、CIへの載せ方は [CI セットアップ](/projects/kamae-scala/ci-setup/) を参照する。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./ci-setup.md -->

## フォーマットのベースライン

ローカルは `sbt scalafmtAll`、CIは `sbt scalafmtCheckAll`。リポジトリルートに `.scalafmt.conf` を置き、モジュール間で揃える。scalafmtが戻す手揃えはしない。複雑な条件は小さなヘルパや名前付き値オブジェクトに切り出す。

## Scalafix とコンパイラのベースライン

ルールが設定されているときは該当プロジェクトで：

```bash
sbt "scalafixAll --check"
```

既存コマンドがあればそれを使う。ルールがSemanticDBを要するときは有効化する（[開発環境](/projects/kamae-scala/dev-environment/)）。チームが木をきれいに保てるならドメインモジュールに `-Xfatal-warnings`（または同等）を検討する。無関係な変更でグローバルlintを急に厳しくしない。

## ワークスペースでの lint 統一

マルチモジュールでは、adapterとdomainで同じバーになるようフォーマットとscalafixを集約する。

```scala
ThisBuild / scalafmtConfig := file(".scalafmt.conf")
ThisBuild / semanticdbEnabled := true
ThisBuild / semanticdbVersion := scalafixSemanticdb.revision

lazy val domain = project
  .settings(
    name := "booking-domain",
    scalacOptions ++= Seq("-Xfatal-warnings", "-Wunused:all")
  )
```

`domain` だけ締めるなど、方針の丸コピーは不要。

ドメイン向けの有用なルール例： 未使用import、sealed型の非網羅match、境界でのdeprecated誤用、金額・数量境界での黙ったwiden禁止。

## ドメイン安全性に効く信号

- ドメイン/ユースケースでの `throw`、`???`、無検査 `.get` / `.head`
- sealedドメインenumへの広い `_`
- 金額・数量・時間・単位での `Double` 算術やlossy cast
- 正しさリスクを隠す `@nowarn`、`// scalafix:off`、`-Wconf`
- 明示境界なしのeffectfulユースケース内ブロッキング
- 不変条件付き集約へのCirce codec derive

すべてをグローバル必須にはしない。触ったコードやローカル設定に現れたときのレビュー信号として使う。

## 抑制のルール

`@nowarn`、`// scalafix:off`、`-Wconf` はできるだけ狭くする。正しさ、安全、PII、永続化、エラー処理に効く抑制には短い理由を付ける。本番ドメインでのファイル全体 `scalafix:off` は避ける。

```scala
@nowarn("msg=unused") // temporary: retained for migration dual-read path
private def legacyStatusAlias: String = "waiting"
```

## 生成コードと第三者コード

生成バインディング、ScalaPB、vendoredスナップショットにドメインと同じlintバーを強制しない。隔離し生成元を文書化する。native/FFIを包むsafe wrapperは [JNI / ネイティブ境界](/projects/kamae-scala/jni-native-boundaries/) に従う。

## CI での期待

```bash
sbt scalafmtCheckAll
sbt "scalafixAll --check"
sbt test
```

フルが遅いときは変更をカバーする最小モジュール集合を走り制限を明記する。

| 目的 | アプローチ |
| --- | --- |
| ドメイン全体で均一 | 共有 `.scalafmt.conf` + `.scalafix.conf` |
| ドメインだけ厳格 | `domain` のみ `-Xfatal-warnings` |
| 生成ScalaPB / JNI | モジュール隔離。safe wrapperをlint |

## レビューで見るところ

- 触ったモジュールで `scalafmtCheckAll` やscalafix方針に失敗していないか。
- 正しさやPIIに効く `@nowarn` / `scalafix:off` へ理由を付けているか。
- 広い抑制でリスクを隠していないかも見る。

