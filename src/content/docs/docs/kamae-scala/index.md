---
title: "はじめに"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-scala](https://github.com/manji-0/kamae-scala)

_Kamae（構え）— 備えの姿勢。_

Kamae Scala は、サーバーサイドの Scala 3 ドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集である。[kamae-rs](https://github.com/manji-0/kamae-rs) や [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) と同じ思想を、Scala 3 のイディオム（opaque types、sealed traits、`Either`、エフェクト型）に落とし込んでいる。

すべてのリファレンスを通読する必要はない。今のタスクに関係するトピックだけを開けばよい。各リファレンス末尾の **レビュー観点** に、そのトピックのコードレビューで確認すべき項目がある。

## 何を目指すか

Kamae が守りたいのは、次のような失敗である。

- 文字列や数値のまま混在するドメイン概念
- `status` フィールドとオプショナル列で表せてしまう無効な状態
- `throw` や `.get` / `.head` に頼る想定内の失敗処理
- API JSON や DB 行をそのままドメイン型として使う境界の曖昧さ
- ログ・メトリクス・エラーへの PII 漏洩
- 状態変更とドメインイベントの非アトミックな永続化

Scala 3 では、opaque types、value class、sealed trait / `enum`、検証付き `apply` / `from` ファクトリ、`Either[DomainError, T]` といった型機能で、実用的な範囲でこれらをコンパイル時または構築時に弾く。

## コア原則

- **意味を型で表す** — opaque types、sealed traits、`enum`、検証付きコンストラクタでドメイン概念をモデル化する。
- **無効な遷移を型で封じる** — ソース状態ごとに遷移メソッドや型を分け、網羅的な `match` で分岐を閉じる。
- **`Either` で失敗を明示する** — ドメイン固有のエラー ADT とともに `Either[DomainError, T]` を使い、ドメインコードでは `throw`、`???`、unsafe `.get` を避ける。
- **境界で一度パースする** — 外部データは DTO / 行ケースクラスに入れてから検証付き変換でドメイン型へ変換する。
- **ユースケースは小さく配線する** — ポート（trait）経由で依存を受け取り、アダプタはコンポジションルートで注入する。
- **集約の変更はトランザクション内に** — 実用的な範囲で、ユースケースごとに集約の変更を 1 つのトランザクション境界に収める。
- **PII とシークレットは内側に** — マスキング用ラッパーの内側に置き、観測経路ではデフォルトでマスクする。
- **JNI / ネイティブは境界に閉じる** — ドメインロジックからは排除し、必要なら文書化された不変条件を持つ小さな安全 API の背後に隠す。
- **品質ゲートを揃える** — **scalafmt**・**scalafix**・テスト・Scaladoc をクリーンに保ち、CI をレビュー前提と一致させる。

これらは強い既定であり、絶対ではない。既存のプロジェクト慣習と矛盾する場合は慣習に従い、ドメイン安全性に影響する逸脱は短い説明を残す。

## 前提となるツールチェーン

新規プロジェクトの既定は次のとおり。既存コードベースでは、まずリポジトリの慣習を確認する。

- Scala 3.3+（`ThisBuild / scalaVersion`）
- sbt 1.10+（`project/build.properties`）
- Java 17 以上（LTS）
- フォーマットは **scalafmt**、lint は **scalafix**（プロジェクトで採用している場合）

## 状況別の読み方

### 新規ドメインを設計するとき

1. [ドメインモデリング](/docs/kamae-scala/domain-modeling/)
2. [状態遷移](/docs/kamae-scala/state-transitions/)
3. [境界防御](/docs/kamae-scala/boundary-defense/) と [エラーハンドリング](/docs/kamae-scala/error-handling/)
4. [永続化、集約、イベント](/docs/kamae-scala/persistence-events/)
5. [タクシー配車の例](/docs/kamae-scala/examples/taxi-request/)
6. 仕上げ前に [品質ゲート](/docs/kamae-scala/quality-gates/)

### 既存コードベースへ段階的に導入するとき

1. [段階的導入](/docs/kamae-scala/adoption/)
2. [境界防御](/docs/kamae-scala/boundary-defense/)
3. 永続化に ORM を使う場合は [ORM アダプター](/docs/kamae-scala/orm-adapters/)
4. 移行したワークフローごとに、上記「新規ドメイン」のパスを続ける

### オブザーバビリティと PII だけ見るとき

1. [PII 保護](/docs/kamae-scala/pii-protection/)
2. [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/)
3. テストのアサーションは [テストデータ](/docs/kamae-scala/test-data/)

### インフラ・開発環境の整備

| 関心 | リファレンス |
| --- | --- |
| ユースケース配線、DI | [アプリケーション配線](/docs/kamae-scala/application-wiring/) |
| Cats Effect / ZIO の選び方 | [エフェクトシステム](/docs/kamae-scala/effect-systems/) |
| サービス間契約、HTTP / gRPC | [サービス境界](/docs/kamae-scala/service-boundaries/) |
| ストリーム、継続クエリ | [ストリームと継続クエリ](/docs/kamae-scala/stream-continuous-queries/) |
| マクロ、derive | [ドメインマクロ](/docs/kamae-scala/domain-macros/) |
| JNI、ネイティブ | [JNI / ネイティブ境界](/docs/kamae-scala/jni-native-boundaries/) |
| テスト、フィクスチャ | [テストデータ](/docs/kamae-scala/test-data/) |
| プロパティベーステスト | [プロパティベーステスト](/docs/kamae-scala/property-based-tests/) |
| フォーマット、lint、品質ゲート | [品質ゲート](/docs/kamae-scala/quality-gates/) |
| 公開 API の Scaladoc | [公開 API のドキュメント](/docs/kamae-scala/scaladoc/) |
| ローカル開発・ブートストラップ | [開発環境](/docs/kamae-scala/dev-environment/) |
| スキルリポジトリの開発 | [スキルリポジトリの開発](/docs/kamae-scala/development-setup/) |
| CI | [CI セットアップ](/docs/kamae-scala/ci-setup/) |

## 依存ライブラリ

プロジェクトの `build.sbt` に応じて、必要なときだけ [ライブラリガイド](/docs/kamae-scala/library-guides/) を参照する。

| 用途 | ガイド付きライブラリ | 検出のみ（ローカル慣習の参考） |
| --- | --- | --- |
| エフェクト | `cats`、`zio` | `monix` |
| シリアライズ | `circe` | `play-json`、`json4s`、`upickle` |
| 検証 / 単位 | `refined` | `squants` |
| PII / シークレット | secrets パターン | — |
| 永続化 | `doobie` | `slick`、`quill`、`skunk` |
| ストリーム | `fs2` | `pekko-stream`、`zio-streams` |
| 設定 | `pureconfig` | — |
| テスト | `scalacheck` | `munit`、`scalatest`、`weaver` |

## 正規の例

新しいリファレンスに全文スニペットをコピーせず、次の定義へリンクする。

| トピック | 正規リファレンス |
| --- | --- |
| ハッピーパスのユースケース | [状態遷移 — ユースケースを薄く保つ](/docs/kamae-scala/state-transitions/#ユースケースを薄く保つ) |
| 永続化エラーのマッピング | [エラーハンドリング — Either による早期リターン](/docs/kamae-scala/error-handling/#推奨パターン-either-による早期リターン) |
| リポジトリポート | [永続化、集約、イベント — 責務でリポジトリを分離する](/docs/kamae-scala/persistence-events/#責務でリポジトリを分離する) |
| エンドツーエンドコード | [タクシー配車の例](/docs/kamae-scala/examples/taxi-request/) |
| 品質ゲートのコマンド | [品質ゲート — ベースラインコマンド](/docs/kamae-scala/quality-gates/#ベースラインコマンド) |

## リファレンス一覧

- [アプリケーション配線](/docs/kamae-scala/application-wiring/)
- [段階的導入](/docs/kamae-scala/adoption/)
- [ドメインモデリング](/docs/kamae-scala/domain-modeling/)
- [状態遷移](/docs/kamae-scala/state-transitions/)
- [エラーハンドリング](/docs/kamae-scala/error-handling/)
- [境界防御](/docs/kamae-scala/boundary-defense/)
- [PII 保護](/docs/kamae-scala/pii-protection/)
- [ロギングとメトリクス](/docs/kamae-scala/logging-metrics/)
- [JNI / ネイティブ境界](/docs/kamae-scala/jni-native-boundaries/)
- [品質ゲート](/docs/kamae-scala/quality-gates/)
- [公開 API のドキュメント](/docs/kamae-scala/scaladoc/)
- [CI セットアップ](/docs/kamae-scala/ci-setup/)
- [開発環境](/docs/kamae-scala/dev-environment/)
- [スキルリポジトリの開発](/docs/kamae-scala/development-setup/)
- [永続化、集約、イベント](/docs/kamae-scala/persistence-events/)
- [ORM アダプター](/docs/kamae-scala/orm-adapters/)
- [ストリームと継続クエリ](/docs/kamae-scala/stream-continuous-queries/)
- [ドメインマクロ](/docs/kamae-scala/domain-macros/)
- [エフェクトシステム](/docs/kamae-scala/effect-systems/)
- [サービス境界](/docs/kamae-scala/service-boundaries/)
- [テストデータ](/docs/kamae-scala/test-data/)
- [プロパティベーステスト](/docs/kamae-scala/property-based-tests/)

## 実践例

[タクシー配車の例](/docs/kamae-scala/examples/taxi-request/) で、opaque ID、分離した状態型、型付き遷移、ドメインイベントの流れを一通り追える。
