---
title: "JNI とネイティブ境界"
sidebar:
  order: 10
---

Scala / JVMドメインコードはJNI、JNA、`sun.misc.Unsafe`、ネイティブライブラリを直接呼ばない。必要なときはインフラadapterに閉じ、狭いScala APIの背後にネイティブ実装を隠す。

境界パースは [境界防御](/projects/kamae-scala/boundary-defense/)、エラー層は [エラーハンドリング](/projects/kamae-scala/error-handling/)、PIIは [PII保護](/projects/kamae-scala/pii-protection/)、文書化は [公開 API のドキュメント](/projects/kamae-scala/scaladoc/)、CIは [CI セットアップ](/projects/kamae-scala/ci-setup/) と整合させる。

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./error-handling.md -->
<!-- constrained-by ./pii-protection.md -->
<!-- constrained-by ./scaladoc.md -->

## 基本方針

JNI、JNA、`System.loadLibrary`、`Unsafe`をドメインロジックから追い出す。ドメインエンティティや状態遷移は通常JVM上の純粋Scalaに留める。repository traitも同様である。

ネイティブ連携は、安全なJVM APIでは許容コストで要件を表現できないときだけ使う：

- 暗号アクセラレータ、メディアコーデック、独自SDK
- 組織がすでに所有するレガシーC/C++ライブラリ
- 安全設計で不足が証明されたあとの計測済み低レベル性能作業

検証、コンストラクタ、プライバシー、テナントチェック、型付きerror handlingを迂回するためにネイティブを使わない。

## ネイティブコードを安全APIの背後に閉じる

ネイティブエントリポイントは最小にし、コアドメインパッケージではなくadapterまたはインフラモジュールに置く。境界を越える前にすべての前提を強制する狭いScala APIを公開する：

```scala
final class NativeLookup private (handle: Long):
  def lookupName(id: NonEmptyId): Either[NativeLookupError, DisplayName] =
    // validate before JNI
    val raw = NativeLookup.nativeLookup(handle, id.value)
    NativeStatus.fromCode(raw.code) match
      case NativeStatus.Ok =>
        DisplayName(raw.value).left.map(NativeLookupError.CorruptOutput.apply)
      case NativeStatus.NotFound =>
        Left(NativeLookupError.NotFound)
      case other =>
        Left(NativeLookupError.NativeFailure(other))

object NativeLookup:
  @native def nativeLookup(handle: Long, id: String): NativeResult
```

ルール：

- ネイティブ呼び出し前にScalaで入力を検証する。
- ネイティブステータスコードを型付きエラーにマップする。`UnsatisfiedLinkError`をユースケースへ生で投げない。
- C/API契約に従いwrapperでネイティブリソースを解放またはcloseする。
- ネイティブ層が前提とする不変条件（alignment、non-null、UTF-8、thread affinity）を文書化する。

## ドメイン遷移でのネイティブ呼び出し禁止

ドメイン遷移は純粋Scalaのまま。ネイティブ処理はportの背後のインフラadapterで行う。ハンドラがJNIを直接呼び始めたら、portを抽出しadapterへ移す。

## ドメイン境界を保つ

ネイティブコードがコンストラクタを迂回してドメイン値を作らない。生bytes / 文字列をDTOに入れ、安全コードと同じ検証factoryを使う。[境界防御](/projects/kamae-scala/boundary-defense/)を参照。

ネイティブコードがlog、例外メッセージ、metrics label、生メモリダンプでPIIを漏らさない。敏感データはネイティブ境界を越える前にwrapまたはredactする。[PII保護](/projects/kamae-scala/pii-protection/)を参照。

## ネイティブ境界でのエラーハンドリング

C風APIは整数コードとoptional outパラメータで失敗を示すことが多い。ドメインコードの前にwrapperで`Either`にマップする。

```scala
enum NativeStatus:
  case Ok, InvalidArgument, NotFound, Internal

object NativeStatus:
  def fromCode(code: Int): NativeStatus = code match
    case 0  => Ok
    case -1 => InvalidArgument
    case -2 => NotFound
    case _  => Internal
```

未知ステータスコードは専用variantへマップする。明示契約なしに`0`を成功とみなさない。

## テスト

ドメイン / applicationテストではネイティブラッパーをmockまたはfakeする。実ネイティブ統合テストはadapterモジュールに限定し、明示的なCI job（OS matrix、ネイティブartifact、ライブラリロードパス）を持つ。[CI セットアップ](/projects/kamae-scala/ci-setup/)のリスク連動ジョブを参照。

## レビューで見るところ

ドメインまたは遷移コードがJNI / JNA / `Unsafe`を直接呼んでいないか。wrapperがHTTPやキュー由来の未検証`String` / `Array[Byte]`を受けていないか。ネイティブ失敗が裸`RuntimeException`文字列になっていないか。安全wrapperに前提とリソース所有のScaladocはあるか。変更したnative多めモジュールにCI jobはあるか。
