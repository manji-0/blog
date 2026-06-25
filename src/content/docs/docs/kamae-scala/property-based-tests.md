---
title: "プロパティベーステスト"
sidebar:
  order: 10
---

例表だけのテストは「書いた通り動く」ことは示すが、入力空間全体の法則は示さない。ScalaCheck は不変条件・往復・遷移の拒否ルールを広い入力で叩くのに向く。

フィクスチャの組み立ては [テストデータ](/docs/kamae-scala/test-data/)、状態機械の形は [状態遷移](/docs/kamae-scala/state-transitions/)、型の前提は [ドメインモデリング](/docs/kamae-scala/domain-modeling/) と [ライブラリガイド（scalacheck）](/docs/kamae-scala/library-guides/#scalacheck) を参照する。

<!-- constrained-by ./test-data.md -->
<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->

## プロパティテストがコストに見合う場合

不変条件が多入力にわたって成り立ち、例表は不完全または保守が面倒なとき property-based test を使う。

向いている対象:

- 値オブジェクトコンストラクタと検証ルール
- parse/format と DTO → domain `Either` の往復
- state machine 遷移法則と拒否ルール
- 金額、単位、タイムスタンプ境界挙動
- 冪等 handler と projection リプレイ
- redaction と安全 `toString` 契約

挙動が小さな閉じたケース集合、property が構造上自明、失敗が有用な最小例に shrink しない場合は通常の単体テストを優先。

## ドメインモジュールでは ScalaCheck を優先

shrinking、seed、composable strategy が不変条件テストに合うため、サーバー側ドメインコードのデフォルト推奨は ScalaCheck。プロジェクトがすでに標準化している場合のみ ScalaTest `ScalaCheckPropertyChecks`。

ScalaCheck を `Test` scope に追加。generator は test ソースまたは `support` パッケージに置き、本番ドメインコードには入れない。

```scala
libraryDependencies += "org.scalacheck" %% "scalacheck" % "1.18.1" % Test
libraryDependencies += "org.scalameta" %% "munit-scalacheck" % "1.0.0" % Test
```

`org.scalacheck` が classpath にあるとき [ライブラリガイド（scalacheck）](/docs/kamae-scala/library-guides/#scalacheck) を読む。

## public コンストラクタ経由で生成する

generator は本番パスが構築できる値を出す必要がある。strategy が raw case class リテラルや companion 迂回をすると、テストは通っても実呼び出しは失敗しうる。

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

無効入力が重要なら raw string または DTO を生成し constructor 拒否を assert — 無効データ周りにドメイン型を構築しない。

## property を明示的に符号化する

テスト内で法則に名前を付け、1 property に 1 焦点。

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

ライフサイクルルールでは到達可能 state だけ出す strategy を組み、遷移結果を assert する。

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

非法遷移では invalid な source state および action を生成し、特定 error variant を assert — `isLeft` だけにしない。

## shrinking をドメイン安全に保つ

縮小処理がコンストラクタを迂回する値を生成しないようにする。空文字、不可能な variant へ縮小された場合は、strategy を修正するか `==>` で前提を追加する。

自明でない入力のバグには `Prop.propWithSeed` またはコミット済み seed コメントで再現可能失敗を保存:

```scala
// Seed found: 0xdeadbeef — keep until regression is understood
property("regression example"):
  forAll(strategyGen) { input => /* ... */ }
```

実バグ修正を表す regression ノートはコミットする。

## 非決定論/I/O 境界をデフォルトで property test しない

property test は純粋ドメイン関数と、注入 clock または固定フィクスチャの決定論 adapter 向け。

デフォルトで避ける:

- `forAll` 内の live DB または network
- シード clock strategy なしの wall-clock 時刻
- テスト対象としての logging や metrics 副作用

生成 payload で DTO 変換、redaction、error マッピングをテスト。repository は制御不能 I/O ではなく fake または in-memory port で。

## 既存テスト層との統合

| 層 | プロパティテストの役割 |
| --- | --- |
| Value object | constructor 受理/拒否、往復 |
| Domain transition | 法則、非法遷移エラー |
| Use case | fake port での idempotency（実 infra ではない） |
| Boundary DTO | 不正/生成 payload が型付きエラーにマップ |
| Projection | リプレイ順序と checkpoint idempotency |

読みやすいシナリオは example ベース、`compileErrors` テストは型安全性約束（[テストデータ](/docs/kamae-scala/test-data/) 参照）。

## CI と実行予算

property test はケース数を増やす。ドメインモジュールでは通常デフォルトで足りる。デバッグ時のみローカルで `minSuccessfulTests` を上げる。

- crate が小さく高速でない限り CI ではデフォルト設定近くに保つ
- 特に遅い property は文書化し別 CI job で走らせる場合のみタグ付け
- 再現性を犠牲にしない限り CI で shrinking を無効化しない

`build.sbt` に `scalacheck` または `munit-scalacheck` があるとき、このガイドと不変条件のトピックガイドを [テストデータ](/docs/kamae-scala/test-data/) と一緒に読み込む。

レビューでは、public コンストラクタを迂回する generator、法則を述べない `isRight`/`isLeft` のみのアサーション、破棄すべき入力の曖昧な扱い、非法遷移の `isLeft` のみ確認、ライブ I/O への property test を指摘する。

## レビュー観点

### ジェネレータは公開コンストラクタを使っているか — High

`apply`、`Either` 検証 companion ではなく、生リテラルやプライベートフィールドでドメイン構造体を組み立てる ScalaCheck 戦略を指摘する。

### プロパティ内で非決定的 I/O は避けているか — High

注入フェイクや固定クロックなしに、ライブ DB、ネットワーク、壁時計に当たる `forAll` ブロックを指摘する。

### 前提条件は `==>` で強制されているか — Medium

ドメイン外入力を成功と失敗のどちらとも曖昧に扱うのではなく、明示的に破棄すべきプロパティを指摘する。

### 各プロパティは名前付き不変条件か — Medium

法則（往復、冪等性、拒否ルールなど）を述べず、`isRight`/`isLeft` だけを検証するプロパティテストを指摘する。

### 非法遷移は特定エラーまでテストされているか — Medium

[状態遷移](/docs/kamae-scala/state-transitions/) も照合する。呼び出し元がエラーバリアントに依存するのに、非法遷移で `isLeft` だけを確認するプロパティテストを指摘する。

### 縮小済みケースの回帰ノートはコミットされているか — Low

プロパティが微妙なバグを見つけ、最小反例を黙って消えさせたくないときは seed コメントや `propWithSeed` を提案する。
