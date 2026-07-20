---
title: "公開 API のドキュメント"
sidebar:
  order: 10
---

公開ドメインAPIのScaladocは実装メモではなく**契約**である。不変条件、有効入力、`Either`のleftケース、遷移前提を書かないと、型は正しくても誤用がレビューをすり抜ける。

型設計は [ドメインモデリング](/projects/kamae-scala/domain-modeling/)、遷移は [状態遷移](/projects/kamae-scala/state-transitions/)、エラーは [エラーハンドリング](/projects/kamae-scala/error-handling/)、JNIの隔離は [JNI / ネイティブ境界](/projects/kamae-scala/jni-native-boundaries/)、チェックの自動化は [品質ゲート](/projects/kamae-scala/quality-gates/) と整合させる。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./quality-gates.md -->

## 基本方針

Scaladocは実装の説明ではなくドメイン契約を文書化する。公開ドメインAPIでは不変条件や遷移ルールなど、呼び出し側が依存できることを説明する。

長いパッケージ解説より、公開アイテムごとの簡潔なドキュメントを優先する。微妙な不変条件を型で表すprivate helperを除き、すべてにScaladocを書く必要はないことが多い。

## 文書化する対象

次がドメインまたはadapter契約の一部であるとき、Scaladocを書く：

- opaque typeと値オブジェクト： 意味、検証ルール、単位、範囲、プライバシー / redaction期待
- コンストラクタ / `apply` / `from`: 受理 / 拒否入力と返るerrorバリアント
- state case classとsealed trait: 有効ライフサイクルstate、各variantがいつ生成されるか
- 遷移メソッド： ソースstate、ターゲットstate、前提、発行event、失敗モード
- repository trait: トランザクション期待、一貫性保証、idempotency、errorマッピング
- DTO変換関数： 外部形状の仮定と検証境界
- ネイティブラッパー: 安全API保証とJNI / JNA向け不変条件

名前の繰り返しだけのdocsは避ける：

```scala
/** Creates a request id. */
def apply(value: String): Either[RequestIdError, RequestId]
```

契約指向のdocsを優先する：

```scala
/** A non-empty identifier for a taxi request.
  *
  * Created only after boundary validation. Empty or whitespace-only input
  * returns [[RequestIdError.Empty]].
  */
opaque type RequestId = String
```

## 必要なときのセクションとタグ

契約価値があるときだけScaladocタグを使う：

- `@return` / 本文で`Either`のleftケースを述べ、呼び出し側が処理すべきvariantを示す
- `@throws`は本番コードでthrowしうるメソッドのみ（ドメインでは`Either`を優先し、型付きエラー経路に`throws`を書かない）
- `@param`は非自明な単位、テナントスコープ、version期待向け
- `@example`は誤用しやすいコンストラクタ、遷移、DTO変換向け

空の定型タグは付けない。

## 例は正当であること

例は可能ならコンパイルし、安全な構築経路を示す。test-only近道をコピーしない。

```scala
/** @example
  * {{{
  * RequestId("req-1") match
  *   case Right(id) => id
  *   case Left(err) => // handle [[RequestIdError]]
  * }}}
  */
```

ルール：

- 例はhappy pathを1つ。error variantは`[[Error.Variant]]`リンクで述べる。
- 公開Scaladoc例で無効入力に`.get`しない。
- `compileErrors`型保証はテストに置き、壊れやすいScaladoc snippetにしない。

## 関連型をリンクする

`[[Type]]` / `[[Type.method]]`で近傍ドメイン概念とerror variantをリンクする：

- `[[RequestId]]`
- `[[DomainError.DriverCannotServeAccessibilityRequest]]`
- `[[WaitingRequest.assignDriver]]`

壊れたリンクは契約マップの腐敗であり、documentation bugとして扱う。

## redactionと公開docs

Scaladocに実secretやメール、個人データ、本番IDを入れない。合成値を使い、必要ならredaction挙動を示す。

型が意図的に`toString` / `Show`をredactするなら、型docsで契約を述べる。[PII保護](/projects/kamae-scala/pii-protection/)を参照。

## スコープとCI

公開domainライブラリにはScaladocのフルカバレッジを期待する。内部アプリケーションモジュールは、まずpublic portとaggregate rootにスコープを絞ってよい。

公開domain API契約を変更したらCIでdoc生成を有効にする：

```bash
sbt doc
```

生成、vendored、JNI bindingモジュールは免除してよいが、それらを包むsafe wrapperにはドメインと安全契約を書く。

## よくある組み合わせ

| スタック | Scaladocの焦点 |
| --- | --- |
| Error ADT | `[[Error.Variant]]`リンクでleftケースを文書化 |
| State遷移 | 到達可能source/target stateの`@example` |
| JNI adapter | 安全Scala APIの前提条件 |

## レビューで見るところ

公開APIに契約欠如はないか。`Either`の重要errorバリアントが隠れていないか。例が`.get`、PII漏洩、不可能な遷移を示していないか。壊れた`[[Type]]`リンクや現行挙動と矛盾するdocsはないか。
