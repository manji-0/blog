---
title: "開発セットアップ チェックリスト"
sidebar:
  order: 5
  label: "開発セットアップ"
---

リファレンス: [`development-setup.md`](/docs/kamae/python/references/development-setup/)。

## 11.1 ドメインコードはフレームワークと ORM の import がないか — High

チームが Kamae スタイルの分離を主張しているのに、`domain` モジュールが FastAPI、Django モデル、SQLAlchemy セッション、boto3、その他インフラクレートを import する箇所を指摘する。

## 11.2 ドメインとユースケースのテストは Docker なしで動くか — Medium

基本的な遷移やユースケーステストにフェイクポートで足りるのに、ライブ DB や外部サービスを要求するワークフローを指摘する。

## 11.3 フィクスチャはコンストラクタ経由で組み立てられているか — Medium

[`tests.md`](/docs/kamae/python/review/checklist/tests/) と突き合わせる。ドメイン/ユースケーステストで生 dict、`model_construct`、ORM 行により不変条件を迂回するテストヘルパーを指摘する。

## 11.4 文書化されたローカルチェックループがあるか — Low

[`ci-setup.md`](/docs/kamae/python/references/ci-setup/) と整合するファストパスとフル pre-push コマンド一覧なしに Kamae 規約を採用するプロジェクトを指摘する。

## 11.5 コミットされた env ファイルにシークレットと PII がないか — High

[`pii-protection.md`](/docs/kamae/python/references/pii-protection/) と突き合わせる。コミットされた `.env`、例の実認証情報、デバッグ用生 PII ログを促すローカルセットアップ文書を指摘する。

## 11.6 テスト配置はレイヤー境界に合っているか — Medium

ユースケース層のフェイクやインフラ層のアダプターではなく、ドメインテストが HTTP サーバーや DB プールを直接引く配置を指摘する。
