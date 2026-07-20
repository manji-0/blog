---
title: "境界防御"
sidebar:
  order: 10
---

CirceやDBドライバは「要求された形状」を満たすことは証明しても、ドメイン上の意味（有効ID、テナント境界、金額の単位など）は保証しない。外部データはDTOで受け、検証付き変換でドメイン型へ変換する二段構えとする。

状態とopaque typeの設計は [ドメインモデリング](/projects/kamae-scala/domain-modeling/)、エラーの返し方は [エラーハンドリング](/projects/kamae-scala/error-handling/) を参照する。

## 外部でパースし、内部で検証する

外部システムは信頼できない形状を渡す。境界DTOにパースしてから、検証付きコンストラクタでドメイン型へ変換する。

```scala
final case class RequestRowDto(
    requestId: String,
    passengerId: String,
    status: String,
    requiresAccessibleVehicle: Boolean
)

object RequestRowDto:
  def toWaiting(dto: RequestRowDto): Either[BoundaryError, WaitingRequest] =
    for
      requestId <- RequestId(dto.requestId).left.map(BoundaryError.InvalidId.apply)
      passengerId <- PassengerId(dto.passengerId).left.map(BoundaryError.InvalidId.apply)
      _ <- Either.cond(dto.status == "waiting", (), BoundaryError.UnexpectedStatus(dto.status))
    yield WaitingRequest(requestId, passengerId, dto.requiresAccessibleVehicle)
```

JSON / DB / キューのcodecはDTOと行型に置き、不変条件を持つ集約ルートには付けない。

## codec の derive は検証ではない

CirceやPlay JSONの自動deriveは、無効なドメイン状態をデシリアライズしうる。codecはトランスポートの機械として扱い、DTOデコード後にドメイン検証する。

プロジェクトにCirceがある場合はスキルリポジトリの `references/library-guides/circe.md` を参照する。

## 未知フィールドと default は意図的に扱う

外部制御の入力では、黙って無視されるフィールドより明示的なスキーマを優先する。未知のenum文字列、欠落した判別子、default値の扱いを文書化する。

## 認可とテナントチェックは境界に属する

呼び出し元の身元、テナントスコープ、認可を、ドメインコマンドを構築する前に検証する。リポジトリクエリだけにアクセス制御を任せない。

## アンチパターン

- publicコンストラクタを持つドメインcase classへ直接デシリアライズする
- ドメインコードで `asInstanceOf` や `Any` / JSONノードからの未検証キャストを使う
- 永続化層とドメイン層でORMエンティティクラスを変換なしで共有する

## レビューで見るところ

非空・有効ID・正の金額・範囲・クロスフィールドなどドメイン不変条件をデシリアライズだけに頼っていないか。HTTP・キュー・DB・設定・CLIが検証付き変換なしに生データをドメインへ渡していないか。パスやボディのテナントID・所有権を認証コンテキストと比較せず信頼していないかも見る。欠落入力で意味が変わる広いdefaultや寛容な未知フィールド、不変条件やマスキングのため別DTOで足りるのにドメインへのcodec deriveがないか確認する。
