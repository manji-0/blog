---
title: "使い方"
description: "kamae-scala スキルのインストールと開発環境のセットアップ"
sidebar:
  order: 5
  label: "使い方"
---

## 範囲

Kamaeスキルをエージェントに入れ、アプリケーションsbtプロジェクトまたはスキルリポジトリをローカルで立ち上げる手順です。ドメイン設計の原則は[ドメインモデリング](/projects/kamae-scala/domain-modeling/)以降の実装ページ、チェックコマンドは[品質ゲート](/projects/kamae-scala/quality-gates/)を参照してください。

## スキルのインストール

実装時は`kamae-scala`、差分レビュー時は`kamae-scala-review`です。

```bash
npx skills add manji-0/kamae-scala -s kamae-scala -s kamae-scala-review -g -y
```

チームの命名やライブラリ好みは`.claude/rules/` / `.codex/rules/`で上書きできます。[kamae-scala リポジトリ](https://github.com/manji-0/kamae-scala)の`rules/`を正とします。

## アプリケーションのブートストラップ

`npx skills`でインストールした場合、リポジトリルートの`build.sbt`、`.github/`、`scripts/`は同梱されません。テンプレートは`skills/kamae-scala/assets/templates/`配下です。

```bash
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target /path/to/repo --dry-run
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target /path/to/repo
```

`--force`なしでは既存ファイルを上書きしません。

## ツールチェーン

| コンポーネント | 最小バージョン | pinの場所 |
| --- | --- | --- |
| Java | 17 (LTS) | `JAVA_HOME`、CIの`setup-java` |
| Scala | 3.3+ | `build.sbt`の`ThisBuild / scalaVersion` |
| sbt | 1.10+ | `project/build.properties` |

```properties
# project/build.properties
sbt.version=1.10.11
```

任意だが有用： [Coursier](https://get.coursier.io/)、[Metals](https://scalameta.org/metals/)、sbt-revolver。

## 推奨モジュールレイアウト

```text
my-service/
  build.sbt
  domain/           # opaque IDs, transitions, domain errors
  application/      # use cases, port traits
  infrastructure/   # adapters
  api/              # handlers, DTOs
```

`domain`はHTTPクライアントやORMに依存しません。配線の詳細は[ドメインモデリング](/projects/kamae-scala/domain-modeling/)を参照してください。

## review probe

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py src/main/scala/domain --json
```

出力はレビューの手がかりであり、既定では失敗を伴うゲートにはしません。

## ローカルチェックループ

日常のコマンドは[品質ゲート](/projects/kamae-scala/quality-gates/)のベースラインに揃えます。

```bash
sbt "project domain" test
sbt scalafmtCheckAll
sbt test
```

## スキルリポジトリでの開発

**kamae-scala**スキルリポジトリで作業するコントリビューター向けです。

```bash
git clone https://github.com/manji-0/kamae-scala.git
cd kamae-scala
./scripts/ci.sh
```

コミット前は`python3 scripts/validate_package.py`とreview probeのスモークテストを実行します。upstreamの[DEVELOPMENT.md](https://github.com/manji-0/kamae-scala/blob/main/DEVELOPMENT.md)が正です。

## ルールの上書き

`.claude/rules/*.md`や`.codex/rules/*.md`で振る舞いを上書きできます。優先は**プロジェクトルール > ユーザーグローバル > 同梱defaults**です。

## 次に読む

型の置き方は[ドメインモデリング](/projects/kamae-scala/domain-modeling/)から実装3本へ。依存ライブラリは[ライブラリガイド](/projects/kamae-scala/library-guides/)、PR前の確認は[品質ゲート](/projects/kamae-scala/quality-gates/)です。
