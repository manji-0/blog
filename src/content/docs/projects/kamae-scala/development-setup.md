---
title: "スキルリポジトリの開発"
sidebar:
  order: 10
---

**kamae-scala** スキルリポジトリで作業するコントリビューター向けである（スキルをインストールした先のプロジェクト向けではない）。検証スクリプトや例subprojectのワークスペースが揃っていないと、スキル自体の変更が再現できない。

アプリケーション開発の手順は [開発環境](/projects/kamae-scala/dev-environment/)、チェックコマンドは [品質ゲート](/projects/kamae-scala/quality-gates/)、Actions配線は [CI セットアップ](/projects/kamae-scala/ci-setup/) を参照する。

## リポジトリの目的

- `scripts/validate_package.py` でスキルMarkdown、マニフェスト、例を検証可能に保つ
- sbtでtaxi-request例のコンパイルとテストを維持する
- 外部サービスなしでreview probeのスモークテストを実行可能に保つ

## コントリビューターループ

```bash
./scripts/ci.sh
```

`skills/kamae-scala-review/scripts/review_probe.py` を変更したときは、probeの単体テストを実行する（`./scripts/ci.sh` に含まれる）:

```bash
python3 -m unittest discover -s skills/kamae-scala-review/scripts -p 'review_probe_test.py' -v
```

## トピックの追加

チェックリストはリポジトリルートの `DEVELOPMENT.md`（スキル作業セクション）に従う。

## テンプレート

アプリケーションリポジトリ向けのスターターテンプレートは `skills/kamae-scala/assets/templates/` 配下にある。インストール済みスキルはスキルディレクトリ配下のファイルを含むが、本リポジトリルートの `build.sbt`、`.github/`、`scripts/` は確実にはインストールされない。

ターゲットリポジトリへテンプレートを適用するには `skills/kamae-scala/scripts/apply_templates.py` を使う：

```bash
python3 skills/kamae-scala/scripts/apply_templates.py --target /path/to/repo --dry-run
python3 skills/kamae-scala/scripts/apply_templates.py --ci skill-package --skill-package --target /path/to/skill-repo
```

`--force` なしでは既存ファイルを上書きしない。既存リポジトリに適用するときは先に `--dry-run` を使う。

## インストールの確認

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py skills/kamae-scala/examples/src/main/scala --json
```

変更を加える前に、パッケージ検証が通ることを確認する。

## ローカル品質ゲートの実行

[品質ゲート](/projects/kamae-scala/quality-gates/) のベースラインに加え、本リポジトリでは次も実行する：

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py skills/kamae-scala/examples/src/main/scala --json
sbt scalafmtCheckAll "scalafixAll --check" "project taxiRequest" compile Test/compile test doc
```

フォーマットチェックが失敗したら `sbt scalafmtAll` で適用する。

## スキルパッケージの作業

スキルは `skills/kamae-scala/` 配下にある：

- `SKILL.md` — ディスパッチガイドとfrontmatter
- `references/` — 詳細リファレンス
- `scripts/` — `apply_templates.py` などのヘルパースクリプト
- `assets/templates/` — インストール可能なプロジェクトテンプレート
- `examples/` — taxi-requestなどのsbt例

新しいリファレンスを追加したら `SKILL.md` からリンクし、スキルディスパッチャが拾えるようにする。`scripts/validate_package.py` がリンクを検査できるよう、相対リンクを優先する。

`skills/kamae-scala-review/scripts/review_probe.py` または `scripts/validate_package.py` を変更したら、コミット前に `python3 scripts/validate_package.py` とprobe単体テストを実行する。

## テスト用テンプレート適用

`skills/kamae-scala/scripts/apply_templates.py` はテンプレートをターゲットディレクトリにコピーする。テンプレート変更のテストには一時ディレクトリを使い、本リポジトリに影響を与えない：

```bash
mkdir -p /tmp/kamae-scala-test
python3 skills/kamae-scala/scripts/apply_templates.py --target /tmp/kamae-scala-test --ci backend --force
```

## コミット前

1. 上記のローカル品質ゲート一式を実行する。
2. `git diff` で意図しないテンプレートやmanifest変更がないか確認する。
3. コミットは焦点を絞る： 1論理変更1コミット。

## トラブルシューティング

- **sbt が古い**: `project/build.properties` の `sbt.version` とCIの `sbt/setup-sbt` を確認する。
- **probe が失敗する**: パス引数が `domain` または `examples` のScalaソースを指しているか確認する。
- **validate_package がリンクエラー**: `SKILL.md` と `references/` の相対リンクを修正する。
