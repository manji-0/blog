---
title: "CI セットアップ"
sidebar:
  order: 10
---

CI はローカルで再現できる品質ゲートをマージ前に強制する層である。`scalafmt` / `scalafix` / テストが PR で抜けると、ドメイン安全性のレビュー前提が崩れる。

正規コマンドは [品質ゲート](/docs/kamae-scala/quality-gates/)。`kamae-scala` スキルリポジトリ自体の開発は [スキルリポジトリの開発](/docs/kamae-scala/development-setup/)、アプリケーションの日常開発は [開発環境](/docs/kamae-scala/dev-environment/) を読む。

## 基本方針

CI はレビュアが依存する安全シグナルを強制する。フォーマット、lint、テスト、Scaladoc、パッケージ固有検証がそれに当たる。デフォルトのパイプラインは単純で高速に保ち、リスク低減の効果が見込める場合にのみ、負荷の高いチェックを追加する。

既存コマンドを先に使う。CI がなければ、変更した Scala ドメインコードをカバーする最小 workflow から始める。

## スキルリポジトリ workflow

`kamae-scala` リポジトリは `.github/workflows/ci.yml` で 2 ジョブを実行する:

| ジョブ | 目的 |
| --- | --- |
| `package` | `validate_package.py`、review-probe スモークテスト、Python 構文チェック |
| `scala` | `scalafmtCheckAll`、`scalafixAll --check`、compile、test、`taxiRequest` の Scaladoc |

Scala ジョブは `package` に依存し、マニフェスト / リンク失敗を JVM ツールチェーン取得前に早期失敗させる。

ローカル再現:

```bash
./scripts/ci.sh
```

ステップごと:

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py skills/kamae-scala/examples/src/main/scala --json
sbt scalafmtCheckAll "scalafixAll --check" "project taxiRequest" compile Test/compile test doc
```

## 必須レビュアーチェック

Kamae スタイルの Scala アプリケーションプロジェクトの CI には、最低限次を含める:

1. `sbt scalafmtCheckAll`
2. scalafix ルールが設定されているとき `sbt "scalafixAll --check"`
3. 可能なら `-Xfatal-warnings` 付きの `sbt compile Test/compile`
4. `sbt test`
5. ライブラリ公開または公開ドメイン API 文書化があるとき `sbt doc`

スキル / プラグインリポジトリでは追加で:

```bash
python3 scripts/validate_package.py
python3 skills/kamae-scala-review/scripts/review_probe.py <domain-or-example-path> --json
```

## 代表的なマトリクス

使うスタックに CI を合わせる:

| スタック | 追加 |
| --- | --- |
| Circe / JSON API | 境界パーステスト |
| doobie / Slick | 統合テストまたは testcontainers ジョブ |
| http4s / Pekko | ルート / ハンドラ契約テスト |
| ZIO / Cats Effect | ランタイムレイヤーが異なるとき別テスト設定 |

## workflow の衛生

- Java を LTS（17 または 21）に pin し、`actions/setup-java` で `cache: sbt` を有効にする。
- `sbt/setup-sbt@v1` で `project/build.properties` の sbt バージョンを使う。
- PR に `concurrency` と `cancel-in-progress: true` を追加する。
- ジョブがより多くを要さない限り `permissions: contents: read` を保つ。

## リスク連動の安全ジョブ

次を使うコードベースでは専用ジョブを追加する:

- JNI またはネイティブライブラリ
- 暗号 / トークン処理
- 本番形状データに触れる migration スクリプト

## アプリケーションテンプレート

アプリケーションリポジトリのブートストラップ用スターター workflow は `skills/kamae-scala/assets/templates/github-ci.yml` を参照する。

同梱スクリプトでコピー:

```bash
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target . --ci backend
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py --target . --ci skill-package
```

スクリプトはデフォルト非破壊。プレビューは `--dry-run`、意図的置換のみ `--force`。

Kamae review probe を CI または pre-push に追加可能:

```bash
python3 path/to/kamae-scala/skills/kamae-scala-review/scripts/review_probe.py \
  domain/src/main/scala application/src/main/scala --json
```

probe はデフォルト advisory。ドメイン型の迂回、PII 用語、境界漏れの review lead として使い、チームが方針化しない限り必須 merge gate にしない。

## ローカルとの差分

[開発環境](/docs/kamae-scala/dev-environment/#ローカルと-ci-が異なるとき) と同様、README または `CONTRIBUTING.md` にローカルと CI の差分を文書化する。助言的 probe ジョブとマージブロッカーを区別する。
