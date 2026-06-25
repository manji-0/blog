---
title: "テストデータ"
sidebar:
  order: 10
---

テストが public フィールドリテラルや生 ORM 行で状態を組み立てると、本番では構築できない無効状態を「通る」と誤認する。フィクスチャは公開コンストラクタと本番と同じポート経路を通す。

遷移の期待は [状態遷移](/docs/kamae-scala/state-transitions/)、広い入力の法則は [プロパティベーステスト](/docs/kamae-scala/property-based-tests/)、観測のアサーションは [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/) を参照する。

<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pii-protection.md -->

## 正当なフィクスチャを使う

テスト helper は本番と同じ factory で有効な ID と state を構築する。

```scala
def requestId(value: String = "req-1"): RequestId =
  RequestId(value).fold(err => throw new IllegalArgumentException(err.toString), identity)
```

失敗経路を検証するときは `.get` より `Either` アサーションを優先する。

helper は `src/test/scala/.../support/` やモジュールローカル `test` パッケージで共有する。fake port パターンは [開発環境](/docs/kamae-scala/dev-environment/) を参照。

## コンパイル時安全性テスト

別 state 型が遷移ソースを強制するとき、munit `compileErrors` テストで非法 state がコンパイルできないことを確認する:

```scala
test("EnRouteRequest is not WaitingRequest"):
  val errors = compileErrors("""
    import example.domain.*
    def onlyWaiting(request: WaitingRequest): Unit = ()
    onlyWaiting(enRouteFixture)
  """)
  assert(errors.nonEmpty)
```

例: [`CompileTimeSafetySuite.scala`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/examples/src/test/scala/kamae/examples/CompileTimeSafetySuite.scala)。

## フィクスチャから PII を除外する

コミット済みフィクスチャには合成 identifier を使う。本番 export をリポジトリにコピーしない。

redacted log、安全 error メッセージ、安全 metrics label、敏感データがあるときの response DTO シリアライズを observability テストで assert する。識別子ポリシーは [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/) の tier ルールに従う。

## 単体と統合フィクスチャを分離する

単体テストは DB や外部サービスを要求しない。統合テストはより豊かな行/DTO を組み立てても、境界 parser 経由で変換する。

永続化の実装を変更するときは、正常系に加えて DB 制約失敗、楽観的ロック競合、トランザクションロールバック、重複コマンド、idempotency key、outbox insert、event version 互換もテストする。純粋なユースケースはフェイクリポジトリで十分。トランザクションと制約に依存する挙動はアダプター統合テストで確認する。

## 安定した不変条件にはプロパティベーステストを使う

多入力で成り立つ不変条件には ScalaCheck（[プロパティベーステスト](/docs/kamae-scala/property-based-tests/) 参照）。遷移が純関数で不変条件が明示的な Kamae Scala に合う。

PR 前に [品質ゲート](/docs/kamae-scala/quality-gates/) のテストコマンドを実行する。

レビューでは、public 経路を迂回する無効状態の構築、非法遷移テストの欠如、フィクスチャへの本番 PII、境界変更の検証不足を指摘する。

## レビュー観点

### テストはコンストラクタと変換を検証しているか — Medium

public フィールドや生リテラルで無効なドメイン状態を作るテストを指摘する。

目的がマイグレーション互換、デシリアライズ強化、破損行処理、プロパティ縮小、コンパイル失敗カバレッジである無効構築のテストには指摘しない。

### 主要な非法遷移はカバーされているか — Medium

拒否される遷移、DTO 変換失敗、エラーマッピングのテストがない状態機械コードを指摘する。

### 境界と可観測性の失敗はテストされているか — Medium

未知フィールド、不正 DTO、マスキングされたログ / エラー、リードモデルの安全なシリアライズのテストなしに、境界変更を指摘する。

### フィクスチャに本番 PII が含まれていないか — Medium

コミット済みテストデータに実メール、電話、政府 ID、本番 identifier を指摘する。合成値を使う。

### 入力全体の不変条件はプロパティテストでカバーされているか — Low

[プロパティベーステスト](/docs/kamae-scala/property-based-tests/) も照合する。値オブジェクト検証、往復、遷移法則に例表カバレッジがなく、ジェネレータが公開コンストラクタを使えるときはプロパティテストを提案する。

### 設計の中心がコンパイル時安全性ならそれをテストしているか — Low

コンパイル時 state 安全性が中核の約束なら `compileErrors` テストを提案する。
