---
title: "ミューテーションテスト"
sidebar:
  order: 10
---

カバレッジやプロパティテストは「コードが走ったか」「広い入力で法則が成り立つか」を見る。ミューテーションテストは別の問いを立てる。**この行が間違っていたら、テストは落ちるか。**

品質ゲートの通常テストは [品質ゲート](/projects/kamae-scala/quality-gates/)、入力空間の広げ方は [プロパティベーステスト](/projects/kamae-scala/property-based-tests/)、CIへの載せ方は [CI セットアップ](/projects/kamae-scala/ci-setup/) を参照する。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./property-based-tests.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./test-data.md -->

## 何を検証するか

[Stryker4s](https://stryker-mutator.io/docs/stryker4s/getting-started/) は、関数本体を `Right(())` に置き換える、比較を変える、match腕を消すなど小さなバグを故意に入れ、テストスイートを走らせる。

| 結果 | 意味 | 対応 |
| --- | --- | --- |
| **killed** | ミュータント下でテスト失敗 | 振る舞いがアサートされている |
| **survived** | テストが通ったまま | ギャップの可能性。テスト強化か理由付き除外 |
| **no coverage** | ミュータントに到達せず | テスト拡張か mutate スコープの絞り込み |
| **timeout** | ハングや過長 | ループ・リトライを調査。除外か修正 |

行・分岐カバレッジは実行されたことしか示さない。ミューテーションは誤動作に気づくかを示す。信頼できる決定的スイートへのプローブであり、ドメインテストの代替ではない。

## コストに見合うとき

通常テストとプロパティが緑で、フレークのないときだけ走らせる。静かな誤変更のコストが高い領域を対象にする。

向いている対象：

- 値オブジェクトのコンストラクタと検証述語
- 状態遷移と非法遷移エラー
- 金額、数量、冪等ロジック
- 不正入力を拒否すべきDTOマッパー
- PII redactionと安全な `Show` / `toString` 契約
- リファクタ後も不変条件を保つsafe wrapper

避けるべき対象：

- 純粋なglue、ログ、メトリクス副作用
- 生成コード、ScalaPB、boilerplateの `equals` / `hashCode`
- フレークな結合テストやライブI/O（先に直す）
- ミュータントの大半がノイズになる大きなUI・インフラ木

プロパティテストは**入力**を広げる。ミューテーションは**アサーションの強さ**を深める。ScalaCheckカバレッジが高くても、遷移をno-opにするミュータントを見逃しうる。

## Stryker4s を既定にする

ScalaドメインモジュールではStryker4sを既定ツールとする。sbtとmunit / ScalaTest / Weaverと組み合わせやすい。

```scala
// project/plugins.sbt
addSbtPlugin("io.stryker-mutator" % "sbt-stryker4s" % "0.16.1")
```

同梱 [`stryker4s.conf`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/assets/templates/stryker4s.conf) をリポジトリルートへコピーする。レポートは `.gitignore` に入れる（`stryker4s-report/`）。意図して成果物を保存する場合を除き、コミットしない。

## 前提条件

1. 変異対象の `sbt test`（またはモジュール部分集合）がクリーンツリーで**安定して**通る
2. フレークは修正または除外済み
3. 対象モジュール/パッケージが分かっている（通常は `domain`。全adapterではない）

ベースラインが落ちていると有用な信号にならない。先に [品質ゲート](/projects/kamae-scala/quality-gates/) を揃える。

## ローカル手順

### 狭く始める

```bash
# stryker4s.conf で設定したモジュール
sbt stryker

# mutate パターン例:
# mutate = [ "**/domain/**/*.scala" ]
```

`mutate` / `test-filter` を調整し、実行を行動可能に保つ。

### 行動可能な結果だけ読む

レポートではまず **survived** を見る。破られた業務ルールを符号化するテストを足してから再実行する。

### 正しい抽象で直す

survivedのとき：

1. 変異コードが間違っていたら壊れる**公開ドメインAPI**のテストを優先する
2. 多入力の不変条件ならプロパティを足すか締める（[プロパティベーステスト](/projects/kamae-scala/property-based-tests/)）
3. 正しいコードと等価、または意図的に未テストのglueなら、理由付きで除外する

```scala
test("assignDriver moves waiting to en route"):
  val outcome = waitingFixture.assignDriver(driverId("d1"))
  assertEquals(outcome.map(_.state.driverId), Right(driverId("d1")))
```

遷移がno-opになるとこのテストは落ちる。

## スコープと除外

```hocon
stryker4s {
  mutate = [ "**/domain/**/*.scala" ]
  test-filter = [ "**/domain/**" ]
  excluded-mutations = [ "StringLiteral" ]
}
```

生成コードのパッケージは設定で除外し、理由を設定隣かScaladocに書く。盲目除外はゲートの意味を潰す。

## 既存テスト層との関係

| 層 | ミューテーションの役割 |
| --- | --- |
| 値オブジェクト | no-opコンストラクタ、常に`Right`の検証、比較の入れ替え |
| ドメイン遷移 | 削除された腕、常成功遷移、無視されたエラー変種 |
| ユースケース | 欠落したport呼び出しや冪等チェック飛ばし（fake付き） |
| 境界DTO | 不正payload受入やフィールド黙殺 |
| プロパティ / 例 | ミュータントを*殺す*失敗アサーションの供給 |

フィクスチャ、`compileErrors`、プロパティの代替ではない。それらのテストが振る舞いを縛っているかの監査である。

## CI ガイド

ミューテーションジョブは**任意のアサーション強度チェック**であり、native/セキュリティ探査ではない。[CI セットアップ](/projects/kamae-scala/ci-setup/) を参照。

| モード | いつ | コマンドの形 |
| --- | --- | --- |
| **PR / モジュール限定** | 導入時の既定 | 変更パッケージに絞った `mutate` |
| **定期 / mainフル** | 夜間や週次で `domain` | domain向けフル `sbt stryker` |
| **Advisory** | 早期導入 | レポートアップロード。kill score必須化はまだしない |

```bash
python3 path/to/kamae-scala/skills/kamae-scala/scripts/apply_templates.py \
  --target . --ci none --stryker
```

- Workflow: [`github-ci-stryker.yml`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/assets/templates/github-ci-stryker.yml) → `.github/workflows/stryker.yml`
- Config: [`stryker4s.conf`](https://github.com/manji-0/kamae-scala/blob/main/skills/kamae-scala/assets/templates/stryker4s.conf) → `stryker4s.conf`

フォーマット、scalafix、unit/integrationは**必須**のまま。フィルタが安定してからミューテーションを必須化する。advisoryでない限り `continue-on-error` でsurvivedを隠さない。

## レビューで見るところ

`sbt-stryker4s` やCIの `sbt stryker` があるとき、このガイドと [品質ゲート](/projects/kamae-scala/quality-gates/) を読んでいるか。コンストラクタや遷移のsurvived mutantを非法状態や静かな成功経路の欠落テストとして扱っているか。ドメイン入口への広い除外よりテスト修正を選んでいるかも見る。
