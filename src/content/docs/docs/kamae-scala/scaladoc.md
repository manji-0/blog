---
title: "公開 API のドキュメント"
sidebar:
  order: 10
---

公開ドメイン API の Scaladoc は実装メモではなく**契約**である。不変条件、有効入力、`Either` の left ケース、遷移前提を書かないと、型は正しくても誤用がレビューをすり抜ける。

型設計は [ドメインモデリング](/docs/kamae-scala/domain-modeling/)、JNI の隔離は [JNI / ネイティブ境界](/docs/kamae-scala/jni-native-boundaries/)、チェックの自動化は [品質ゲート](/docs/kamae-scala/quality-gates/) と整合させる。

## 基本方針

Scaladoc は実装の説明ではなくドメイン契約を文書化する。公開ドメイン API では呼び出し側が依存できることを説明する: 不変条件、有効な構築経路、遷移ルール、エラー、副作用、安全境界。

長いモジュール解説より、公開アイテムごとの簡潔なドキュメントを優先する。微妙な不変条件を型で表す private helper を除き、すべてに Scaladoc を書く必要はないことが多い。

## 文書化する対象

公開 item のうち、呼び出し元が**依存してよい振る舞い**を説明する。実装の写しや名前の繰り返しは契約にならない。次がドメインまたは adapter 契約の一部であるとき、Scaladoc を書く。

- Newtype と value object: 意味、検証ルール、単位、範囲、プライバシー/redaction 期待
- コンストラクタと companion `apply`/`parse`: 受理/拒否入力と error バリアント
- State struct と enum: 有効ライフサイクル state と各 variant がいつ生成されるか
- 遷移メソッド: ソース state、ターゲット state、前提、発行 event、失敗モード
- Repository trait: トランザクション期待、一貫性保証、idempotency、error マッピング
- DTO 変換関数: 外部形状の仮定と検証境界

名前の繰り返しだけの docs は避ける:

```scala
/** Creates a request id. */
def apply(value: String): Either[RequestIdError, RequestId] = ...
```

契約指向の docs を優先:

```scala
/** A taxi request waiting for driver assignment.
  *
  * Construct with [[WaitingRequest.apply]] after validating IDs.
  */
final case class WaitingRequest(...)

/** Assigns a driver when accessibility preconditions are satisfied.
  *
  * @return [[DomainError.DriverCannotServeAccessibilityRequest]] when the driver cannot serve the request.
  */
def assignDriver(driver: DriverAssignment): Either[DomainError, Transition[EnRouteRequest, TaxiRequestEvent]]
```

## エラーと throw

メソッドが失敗しうるなら left/error ケースを文書化する。`Either` を使うべき domain メソッドに `throws` を文書化しない。

## 例は正当であること

Scaladoc 例は有効 ID と到達可能遷移を使う。無効入力に `.get` する test-only 近道をコピーしない。

## 関連型をリンク

state、event、error 間で `[[Type]]` リンクを使い、docs から state machine を辿れるようにする。

## スコープ

公開 domain ライブラリには Scaladoc のフルカバレッジを期待する。内部アプリケーションモジュールは、まず public port と aggregate root にスコープを絞ってよい。

公開 library を CI で publish するプロジェクトでは `sbt doc` を品質ゲートに含める（[品質ゲート](/docs/kamae-scala/quality-gates/) 参照）。

レビューでは、契約欠如の公開 API、隠された error ケース、不安全な Scaladoc 例、壊れた `[[Type]]` リンクを指摘する。

## レビュー観点

### エラー契約は文書化されているか — High

呼び出し元が扱うべき重要な error バリアントを隠す、domain `Either` を返す公開関数を指摘する。

### 例は安全な経路を示しているか — Medium

プライベートフィールドの近道で不変条件を持つ値を構築する、DTO 変換を迂回する、説明なしにエラーを `.get` する、PII を漏らす、不可能な状態遷移を示す例を指摘する。

### 公開ドメイン API は契約を文書化しているか — Medium

重要な不変条件、有効入力、単位、ライフサイクルルール、副作用、一貫性保証をドキュメントから欠く公開ドメイン newtype、コンストラクタ、状態型、遷移メソッド、リポジトリトレイト、DTO 変換、アダプタラッパを指摘する。

### Scaladoc リンクは維持されているか — Low

壊れた `[[Type]]` リンク、古い型名、もはやコンパイルしない例、現在のコンストラクタ / エラー / 状態挙動と矛盾するドキュメントを指摘する。
