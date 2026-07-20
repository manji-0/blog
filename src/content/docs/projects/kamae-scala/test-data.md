---
title: "テストデータ"
sidebar:
  order: 10
---

テストがpublicフィールドリテラルや生ORM行で状態を組み立てると、本番では構築できない無効状態を「通る」と誤認する。フィクスチャは公開コンストラクタと本番と同じポート経路を通す。

遷移の期待は [状態遷移](/projects/kamae-scala/state-transitions/)、広い入力の法則は [プロパティベーステスト](/projects/kamae-scala/property-based-tests/)、観測のアサーションは [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) を参照する。

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->

## 正当なフィクスチャを使う

テストhelperは本番と同じfactoryで有効なIDとstateを構築する。

```scala
def requestId(value: String = "req-1"): RequestId =
  RequestId(value).fold(err => throw new IllegalArgumentException(err.toString), identity)
```

失敗経路を検証するときは `.get` より `Either` アサーションを優先する。

helperは `src/test/scala/.../support/` やモジュールローカル `test` パッケージで共有する。fake portパターンは [開発環境](/projects/kamae-scala/dev-environment/) を参照。

## コンパイル時安全性テスト

別state型が遷移ソースを強制するとき、munit `compileErrors` テストで非法stateがコンパイルできないことを確認する：

```scala
test("EnRouteRequest is not WaitingRequest"):
  val errors = compileErrors("""
    import example.domain.*
    def onlyWaiting(request: WaitingRequest): Unit = ()
    onlyWaiting(enRouteFixture)
  """)
  assert(errors.nonEmpty)
```

例： [`CompileTimeSafetySuite.scala`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/examples/src/test/scala/kamae/examples/CompileTimeSafetySuite.scala)。

## フィクスチャから PII を除外する

コミット済みフィクスチャには合成identifierを使う。本番exportをリポジトリにコピーしない。

redacted log、安全errorメッセージ、安全metrics label、敏感データがあるときのresponse DTOシリアライズをobservabilityテストでassertする。識別子ポリシーは [ロギングとメトリクス](/projects/kamae-scala/logging-metrics/) のtierルールに従う。

## 単体と統合フィクスチャを分離する

単体テストはDBや外部サービスを要求しない。統合テストはより豊かな行/DTOを組み立てても、境界parser経由で変換する。

永続化の実装を変更するときは、正常系に加えてDB制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、idempotency key、outbox insert、event version互換もテストする。純粋なユースケースはフェイクリポジトリで十分。トランザクションと制約に依存する挙動はアダプター統合テストで確認する。

## 安定した不変条件にはプロパティベーステストを使う

多入力で成り立つ不変条件にはScalaCheck（[プロパティベーステスト](/projects/kamae-scala/property-based-tests/) 参照）。遷移が純関数で不変条件が明示的なKamae Scalaに合う。

PR前に [品質ゲート](/projects/kamae-scala/quality-gates/) のテストコマンドを実行する。

レビューでは、public経路を迂回する無効状態の構築、非法遷移テストの欠如、フィクスチャへの本番PII、境界変更の検証不足を指摘する。

## レビューで見るところ

publicフィールドや生リテラルで無効なドメイン状態を作るテストがないか（マイグレーション互換・破損行・コンパイル失敗カバレッジなど目的が明確なら除く）。拒否される遷移、DTO変換失敗、マスキングされたログやエラーのテストがあるか。フィクスチャに実メール・電話・政府ID・本番identifierがないかも見る。値オブジェクト検証や遷移法則に例表がなく公開コンストラクタを使えるならプロパティテストを提案し、コンパイル時安全性を中核にするなら`compileErrors`も検討する。
