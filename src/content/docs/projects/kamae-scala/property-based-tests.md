---
title: "プロパティベーステスト"
sidebar:
  order: 10
---

例表だけのテストは「書いた通り動く」ことは示すが、入力空間全体の法則は示さない。ScalaCheckは不変条件・往復・遷移の拒否ルールを広い入力で叩くのに向く。

フィクスチャの組み立ては [テストデータ](/projects/kamae-scala/test-data/)、状態機械の形は [状態遷移](/projects/kamae-scala/state-transitions/)、型の前提は [ドメインモデリング](/projects/kamae-scala/domain-modeling/) と [ライブラリガイド（scalacheck）](/projects/kamae-scala/library-guides/#scalacheck) を参照する。

<!-- constrained-by ./test-data.md -->
<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->

## プロパティテストがコストに見合う場合

不変条件が多入力にわたって成り立ち、例表は不完全または保守が面倒なときproperty-based testを使う。

向いている対象：

- 値オブジェクトコンストラクタと検証ルール
- parse/formatとDTO → domain `Either` の往復
- state machine遷移法則と拒否ルール
- 金額、単位、タイムスタンプ境界挙動
- 冪等handlerとprojectionリプレイ
- redactionと安全 `toString` 契約

挙動が小さな閉じたケース集合、propertyが構造上自明、失敗が有用な最小例にshrinkしない場合は通常の単体テストを優先。

## ドメインモジュールでは ScalaCheck を優先

shrinking、seed、composable strategyが不変条件テストに合うため、サーバー側ドメインコードのデフォルト推奨はScalaCheck。プロジェクトがすでに標準化している場合のみScalaTest `ScalaCheckPropertyChecks`。

ScalaCheckを `Test` scopeに追加。generatorはtestソースまたは `support` パッケージに置き、本番ドメインコードには入れない。

```scala
libraryDependencies += "org.scalacheck" %% "scalacheck" % "1.18.1" % Test
libraryDependencies += "org.scalameta" %% "munit-scalacheck" % "1.0.0" % Test
```

`org.scalacheck` がclasspathにあるとき [ライブラリガイド（scalacheck）](/projects/kamae-scala/library-guides/#scalacheck) を読む。

## public コンストラクタ経由で生成する

generatorは本番パスが構築できる値を出す必要がある。strategyがraw case classリテラルやcompanion迂回をすると、テストは通っても実呼び出しは失敗しうる。

```scala
import org.scalacheck.Gen
import org.scalacheck.Prop.forAll

def validRequestIdGen: Gen[RequestId] =
  Gen.nonEmptyListOf(Gen.numChar).map(_.mkString).flatMap { raw =>
    RequestId(raw) match
      case Right(id) => Gen.const(id)
      case Left(_)   => Gen.fail
  }

property("request id rejects blank input"):
  forAll(Gen.stringOf(Gen.alphaNumChar)) { raw =>
    if raw.trim.isEmpty then RequestId(raw).isLeft
    else true
  }
```

無効入力が重要ならraw stringまたはDTOを生成しconstructor拒否をassert — 無効データ周りにドメイン型を構築しない。

## property を明示的に符号化する

テスト内で法則に名前を付け、1 propertyに1焦点。

| Property kind | Example law |
| --- | --- |
| Round trip | DTO → domain → DTO が safe field を保持 |
| Idempotence | 同一コマンド 2 回適用で追加効果なし |
| Invariant preservation | 有効 `Money` + 有効 `Money` が負結果を出さない |
| Rejection | 非法遷移が常に同じ error variant |
| Projection replay | 順序通り event を畳むと snapshot + tail と等しい |

```scala
property("money addition is commutative for same currency"):
  forAll(moneyGen, moneyGen) { (a, b) =>
    a.currency == b.currency ==> (a + b == b + a)
  }
```

前提を満たさない入力については、空虚な成功をアサートせず、`==>` または `Prop.when` で棄却する。

## state machine を strategy としてモデル化する

ライフサイクルルールでは到達可能stateだけ出すstrategyを組み、遷移結果をassertする。

```scala
def waitingRequestGen: Gen[WaitingRequest] =
  for
    id        <- validRequestIdGen
    passenger <- validPassengerIdGen
  yield WaitingRequest(id, passenger, requiresAccessibleVehicle = false)

property("assign driver advances state"):
  forAll(waitingRequestGen, validDriverIdGen) { (waiting, driver) =>
    waiting.assignDriver(driver).map(_.state) match
      case Right(_: EnRouteRequest) => true
      case _                        => false
  }
```

非法遷移ではinvalidなsource stateおよびactionを生成し、特定error variantをassert — `isLeft` だけにしない。

## shrinking をドメイン安全に保つ

縮小処理がコンストラクタを迂回する値を生成しないようにする。空文字、不可能なvariantへ縮小された場合は、strategyを修正するか `==>` で前提を追加する。

自明でない入力のバグには `Prop.propWithSeed` またはコミット済みseedコメントで再現可能失敗を保存：

```scala
// Seed found: 0xdeadbeef — keep until regression is understood
property("regression example"):
  forAll(strategyGen) { input => /* ... */ }
```

実バグ修正を表すregressionノートはコミットする。

## 非決定論/I/O 境界をデフォルトで property test しない

property testは純粋ドメイン関数と、注入clockまたは固定フィクスチャの決定論adapter向け。

デフォルトで避ける：

- `forAll` 内のlive DBまたはnetwork
- シードclock strategyなしのwall-clock時刻
- テスト対象としてのloggingやmetrics副作用

生成payloadでDTO変換、redaction、errorマッピングをテスト。repositoryは制御不能I/Oではなくfakeまたはin-memory portで。

## 既存テスト層との統合

| 層 | プロパティテストの役割 |
| --- | --- |
| Value object | constructor 受理/拒否、往復 |
| Domain transition | 法則、非法遷移エラー |
| Use case | fake port での idempotency（実 infra ではない） |
| Boundary DTO | 不正/生成 payload が型付きエラーにマップ |
| Projection | リプレイ順序と checkpoint idempotency |

読みやすいシナリオはexampleベース、`compileErrors` テストは型安全性約束（[テストデータ](/projects/kamae-scala/test-data/) 参照）。

## CI と実行予算

property testはケース数を増やす。ドメインモジュールでは通常デフォルトで足りる。デバッグ時のみローカルで `minSuccessfulTests` を上げる。

- crateが小さく高速でない限りCIではデフォルト設定近くに保つ
- 特に遅いpropertyは文書化し別CI jobで走らせる場合のみタグ付け
- 再現性を犠牲にしない限りCIでshrinkingを無効化しない

`build.sbt` に `scalacheck` または `munit-scalacheck` があるとき、このガイドと不変条件のトピックガイドを [テストデータ](/projects/kamae-scala/test-data/) と一緒に読み込む。

レビューでは、publicコンストラクタを迂回するgenerator、法則を述べない `isRight`/`isLeft` のみのアサーション、破棄すべき入力の曖昧な扱い、非法遷移の `isLeft` のみ確認、ライブI/Oへのproperty testを指摘する。

## レビュー観点

### ジェネレータは公開コンストラクタを使っているか — High

`apply`、`Either` 検証companionではなく、生リテラルやプライベートフィールドでドメイン構造体を組み立てるScalaCheck戦略を指摘する。

### プロパティ内で非決定的 I/O は避けているか — High

注入フェイクや固定クロックなしに、ライブDB、ネットワーク、壁時計に当たる `forAll` ブロックを指摘する。

### 前提条件は `==>` で強制されているか — Medium

ドメイン外入力を成功と失敗のどちらとも曖昧に扱うのではなく、明示的に破棄すべきプロパティを指摘する。

### 各プロパティは名前付き不変条件か — Medium

法則（往復、冪等性、拒否ルールなど）を述べず、`isRight`/`isLeft` だけを検証するプロパティテストを指摘する。

### 非法遷移は特定エラーまでテストされているか — Medium

[状態遷移](/projects/kamae-scala/state-transitions/) も照合する。呼び出し元がエラーバリアントに依存するのに、非法遷移で `isLeft` だけを確認するプロパティテストを指摘する。

### 縮小済みケースの回帰ノートはコミットされているか — Low

プロパティが微妙なバグを見つけ、最小反例を黙って消えさせたくないときはseedコメントや `propWithSeed` を提案する。
