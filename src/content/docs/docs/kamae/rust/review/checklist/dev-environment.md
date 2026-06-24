---
title: "開発環境 チェックリスト"
sidebar:
  order: 5
  label: "開発環境"
---

参照: [`dev-environment.md`](/docs/kamae/rust/references/dev-environment/)

## 11.1 ドメインコードは I/O 依存がないか — High

チームが Kamae 型の分割を掲げているのに、`domain` クレートやモジュールが `sqlx`、`axum`、`tonic` などのインフラクレートに依存している場合はフラグする。

## 11.2 ドメインとユースケースのテストは Docker なしで走るか — Medium

基本的な遷移やユースケーステストにフェイクポートで足りるのに、ライブ DB や外部サービスを要求するワークフローをフラグする。

## 11.3 フィクスチャはコンストラクタ経由で構築されているか — Medium

[`tests.md`](/docs/kamae/rust/review/checklist/tests/) も照合する。ドメイン / ユースケーステストで public フィールドリテラルや生 ORM 行により不変条件を迂回するテストヘルパをフラグする。

## 11.4 文書化されたローカルチェックループがあるか — Low

Kamae 慣習を採用しているのに、[`ci-setup.md`](/docs/kamae/rust/review/checklist/ci-setup/) と揃った高速パスとフル pre-push コマンド一覧がないプロジェクトをフラグする。

## 11.5 シークレットと PII はコミット済み env ファイルから除外されているか — High

[`pii-protection.md`](/docs/kamae/rust/references/pii-protection/) も照合する。コミットされた `.env`、例の実認証情報、デバッグのため生 PII をログするよう促すローカルセットアップドキュメントをフラグする。

## 11.6 テスト構成はクレート境界と一致しているか — Medium

ユースケース層のフェイクやインフラ層のアダプタではなく、ドメインテストが HTTP サーバや DB プールを直接引き込む場合はフラグする。
