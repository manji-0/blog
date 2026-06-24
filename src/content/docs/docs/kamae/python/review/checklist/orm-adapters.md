---
title: "ORM アダプター チェックリスト"
sidebar:
  order: 5
  label: "ORM アダプター"
---

リファレンス: [`orm-adapters.md`](/docs/kamae/python/references/orm-adapters/)。

## 17.1 ORM エンティティはドメインモジュール外か — High

ドメイン状態、遷移、ユースケースモジュールが SQLAlchemy モデル、Django モデル、セッション束縛エンティティを import する箇所を指摘する。

## 17.2 マッパーは入出力双方で検証するか — High

未検証属性アクセス、`model_construct`、`cast` で行→ドメイン変換する箇所を指摘する。Pydantic アダプターまたは明示コンストラクタを使うべき。

## 17.3 セッションとトランザクションはアダプターが所有するか — Medium

リポジトリアダプターが永続化の関心を所有すべきなのに、ユースケースが ORM セッションを直接管理する箇所を指摘する。

## 17.4 遅延読み込みはドメイン/ユースケース経路に入らないか — Medium

遷移やユースケースロジック中にトリガーされる暗黙の遅延読み込み、デタッチインスタンス、N+1 クエリパターンを指摘する。

## 17.5 楽観的ロック列は一貫してマッピングされているか — High

保存時に無視される version/etag 列、または並行変更を黙って上書きしうる ORM 更新を指摘する。

[`aggregates.md`](/docs/kamae/python/references/aggregates/) と突き合わせる。
