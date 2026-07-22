---
title: "ローカル検証セットアップ"
sidebar:
  order: 10
---

スキルテンプレートからプロジェクトを立ち上げる担当者向けの手順である。`build.sbt` やActions、検証スクリプトが揃っていないと、以降のドメイン規約をローカルで再現できない。

スキルパッケージ本体の編集は [スキルリポジトリの開発](/projects/kamae-scala/development-setup/)、日常のアプリ作業は [開発環境](/projects/kamae-scala/dev-environment/)、正規コマンドは [品質ゲート](/projects/kamae-scala/quality-gates/) を読む。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./dev-environment.md -->

## 同梱テンプレートを使う

`gh skill` または `npx skills` でインストールしたとき、リポジトリルートの `build.sbt`、`project/build.properties`、`.github/workflows/ci.yml`、`scripts/validate_package.py` などは自動では入らない。ブートストラップでは [`../assets/templates/`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/assets/templates/) を使う。

```bash
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py \
  --target /path/to/repo --ci backend --dry-run
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py \
  --target /path/to/repo --ci backend
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py \
  --target /path/to/repo --ci none --stryker
```

スキル/プラグイン向け：

```bash
python3 skills/kamae-scala/scripts/apply_templates.py \
  --target . --ci skill-package --dry-run
python3 skills/kamae-scala/scripts/apply_templates.py \
  --target . --ci skill-package
```

`--force` を付けない限り既存ファイルを上書きしない。

| テンプレ | 先 | 用途 |
| --- | --- | --- |
| `build.sbt` | `build.sbt` | Scala 3既定、semanticdb、ベース依存 |
| `project-build.properties` | `project/build.properties` | sbt version pin |
| `project-plugins.sbt` | `project/plugins.sbt` | scalafmt + scalafix |
| `scalafmt.conf` / `scalafix.conf` | ルート設定 | フォーマットとlint |
| `github-ci.yml` 等 | `.github/workflows/` | アプリ / スキルCI |
| `stryker4s.conf` + `github-ci-stryker.yml` | 任意ミューテーション（`--stryker`） | [ミューテーションテスト](/projects/kamae-scala/mutation-testing/) |

コミット前に `organization`、`name`、ライブラリ版、サブプロジェクトを合わせる。レイアウトは [開発環境](/projects/kamae-scala/dev-environment/) へ寄せる。CIテンプレ内の `path/to/kamae-scala` はインストール先かvendoredコピーに置き換える。

## 初回ツールチェーン

Java 17+ とsbt 1.10+ を入れる。`build.sbt` がなければテンプレ適用後に：

```bash
sbt compile
sbt test
```

## 初回検証パス

ブートストラップ後は [品質ゲート](/projects/kamae-scala/quality-gates/) のベースライン：

```bash
sbt scalafmtCheckAll
sbt "scalafixAll --check"
sbt compile Test/compile test doc
```

スキル/プラグインでは `python3 scripts/validate_package.py` と `./scripts/ci.sh` も実行する。

## Review probe の健全性確認

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py \
  domain/src/main/scala application/src/main/scala --json
```

単一モジュールなら `src/main/scala/.../domain` と `.../application` を渡す。probeはデフォルトadvisory。throw/unsafe get、codec derive、PII、永続化、Scaladocギャップのleadとして扱い、チームが方針化しない限り必須ゲートにしない。

## マルチモジュールブートストラップ

1. ルートにベーステンプレをコピー
2. `build.sbt` に `domain` / `application` / `infrastructure` / `interfaces` と `dependsOn` を追加
3. パッケージを段階移動し、都度 `sbt "project domain" compile`
4. adapter作業前に `application` テストへfake portを置く（[テストデータ](/projects/kamae-scala/test-data/)）
5. 触ったサブプロジェクトで高速ループ、push前にフルループ

ブートストラップ中に本番SQLダンプや `.env` をリポジトリへ持ち込まない。

## ローカルチェックループ

| いつ | コマンド |
| --- | --- |
| ドメイン編集中 | `sbt "project domain" test`、変更パスへのprobe |
| push前 | `sbt scalafmtCheckAll "scalafixAll --check" compile Test/compile test doc` |
| スキルrepo | `./scripts/ci.sh` |

フォーマット方針は [フォーマットと lint](/projects/kamae-scala/fmt-lint/)、Actionsは [CI セットアップ](/projects/kamae-scala/ci-setup/) へ。

## CI パリティの確認

1. ブランチをpushし、GitHub Actionsがローカルフルパスと同じsbtステップを走るか確認する
2. advisory probeがあるとき、スキルパスが正しいか確認する（壊れたパスは `continue-on-error: true` でsilently失敗しうる）
3. 任意ジョブ（結合テスト、cross-Scala）を `CONTRIBUTING.md` に書き、merge blockingを明示する

## レビューで見るところ

- テンプレ適用後に `organization` / サブプロジェクトが実態とずれていないか。
- 品質ゲートコマンドがローカルで再現できるか。
- review probeやStrykerを必須ゲートに誤ってしていないかも確認する。

