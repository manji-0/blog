---
title: "ミューテーションテスト"
sidebar:
  order: 10
---

カバレッジやプロパティテストは「コードが走ったか」「広い入力で法則が成り立つか」を見る。ミューテーションテストは別の問いを立てる。**この行が間違っていたら、テストは落ちるか。**

品質ゲートの通常テストは [品質ゲート](/projects/kamae-rs/quality-gates/)、入力空間の広げ方は [プロパティベーステスト](/projects/kamae-rs/property-based-tests/)、CIへの載せ方は [CI セットアップ](/projects/kamae-rs/ci-setup/) を参照する。

<!-- constrained-by ./quality-gates.md -->
<!-- constrained-by ./property-based-tests.md -->
<!-- constrained-by ./ci-setup.md -->
<!-- constrained-by ./test-data.md -->

## 何を検証するか

[`cargo-mutants`](https://mutants.rs/) は、関数本体を `Ok(())` に置き換える、比較を変える、match腕を消すなど小さなバグを故意に入れ、テストスイートを走らせる。

| 結果 | 意味 | 対応 |
| --- | --- | --- |
| **caught** | ミュータント下でテスト失敗 | 振る舞いがアサートされている |
| **missed** | テストが通ったまま | ギャップの可能性。テスト強化か理由付きスキップ |
| **unviable** | コンパイル不能 | カバレッジ信号なし。通常無視 |
| **timeout** | ハングや過長 | ループ・リトライを調査。スキップか修正 |

行・分岐カバレッジは実行されたことしか示さない。ミューテーションは誤動作に気づくかを示す。信頼できる決定的スイートへのプローブであり、ドメインテストの代替ではない。

## コストに見合うとき

通常テストとプロパティが緑で、フレークのないときだけ走らせる。静かな誤変更のコストが高い領域を対象にする。

向いている対象：

- 値オブジェクトのコンストラクタと検証述語
- 状態遷移と非法遷移エラー
- 金額、数量、冪等ロジック
- 不正入力を拒否すべきDTO `TryFrom` / 境界マップ
- PII redactionと安全な `Display` / `Debug` 契約
- リファクタ後も不変条件を保つsafe wrapper

避けるべき対象：

- 純粋なglue、ログ、メトリクス副作用
- 生成コード、vendored、redaction契約以外の `Debug` / `Display` boilerplate
- フレークな結合テストやライブI/O（先に直す）
- ミュータントの大半がノイズになる大きなUI・インフラ木

プロパティテストは**入力**を広げる。ミューテーションは**アサーションの強さ**を深める。`proptest` カバレッジが高くても、遷移をno-opにするミュータントを見逃しうる。リスクが正当化する高価値モジュールでは両方使う。

## `cargo-mutants` を既定にする

Rustドメインcrateでは [`cargo-mutants`](https://mutants.rs/) を既定ツールとする。`cargo test`（任意で `cargo nextest`）と動き、注釈なしで始められ、GitHub Actionsにも載せやすい。

```bash
cargo install --locked cargo-mutants
# CIバイナリ: taiki-e/install-action の tool: cargo-mutants
```

`mutants.out/` を `.gitignore` に入れる（スキルのgitignoreテンプレに含まれる）。意図して成果物を保存する場合を除き、コミットしない。

## 前提条件

1. 変異対象の `cargo test`（またはパッケージ部分集合）がクリーンツリーで**安定して**通る
2. フレークは修正または除外済み。ミューテーションはフレークをノイズに増幅する
3. 対象crate/パスが分かっている（通常は `domain` / 純粋アプリロジック。全adapterではない）

ベースラインが落ちていると有用な信号にならない。先に [品質ゲート](/projects/kamae-rs/quality-gates/) を揃える。

## ローカル手順

### 狭く始める

```bash
# ワークスペース全体（遅い）
cargo mutants

# 1パッケージ
cargo mutants -p domain

# 触ったファイル
cargo mutants --file 'src/domain/**/*.rs'

# git diff に触れるミュータント（PRリハーサル）
git diff main...HEAD > /tmp/pr.diff
cargo mutants --in-diff /tmp/pr.diff
```

CIではツリーコピーを避けるため `--in-place` を使う。ローカル実験はデフォルトのコピーモードが安全。

### 行動可能な結果だけ読む

stdoutは既定で **missed** と **timeout** を強調する。詳細は `mutants.out/`。テスト追加後は `--file` で再実行する。

### 正しい抽象で直す

missedのとき：

1. 変異コードが間違っていたら壊れる**公開ドメインAPI**のテストを優先する。ミュータント専用のprivate単体テストは避ける
2. 多入力の不変条件ならプロパティを足すか締める（[プロパティベーステスト](/projects/kamae-rs/property-based-tests/)）
3. 正しいコードと等価、または意図的に未テストのglueなら、理由付きでスキップする

ミュータント文字列を殺すだけのアサーションは書かない。破られた業務ルールを符号化する。

```rust
#[test]
fn assign_driver_moves_waiting_to_en_route() {
    let waiting = WaitingRequest::new(request_id(), passenger_id());
    let outcome = waiting.assign_driver(driver_id()).expect("assign");
    assert!(matches!(outcome.state, EnRouteRequest { .. }));
    assert_eq!(outcome.state.driver_id(), driver_id());
}
```

遷移がno-opになるとこのテストは落ちる。ミュータントdiff文言を追わない。

## スコープ、フィルタ、スキップ

ノイズを下げ、missedを行動可能に保つ。同梱 [`mutants.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/mutants.toml) を `.cargo/mutants.toml` に置く：

```toml
exclude_globs = [
  "**/generated/**",
  "**/bin/**",
]
```

意味のないミュータントはスキップする。モジュール単位は設定のexcludeを優先し、コード隣に判断を置きたいときだけ属性を使う。

`cargo-mutants` **ランナー**はツールであり通常のcrate依存ではない。`#[mutants::skip]` が必要なときだけ小さな [`mutants`](https://docs.rs/mutants/) ヘルパを入れる：

```toml
[dependencies]
mutants = "0.0.3"
```

```rust
#[mutants::skip]
fn cache_warming_hint() {
    // 性能のみ。振る舞いは他でカバー、または受容したリスク。
}
```

スキップは隣接コメントかrustdocに理由を書く。盲目スキップはゲートの意味を潰す。生成コードや `Debug` ノイズは先に `.cargo/mutants.toml` のパス/`exclude_re` で絞る。

## 既存テスト層との関係

| 層 | ミューテーションの役割 |
| --- | --- |
| 値オブジェクト | no-opコンストラクタ、常に`Ok`の検証、比較の入れ替え |
| ドメイン遷移 | 削除された腕、常成功遷移、無視されたエラー変種 |
| ユースケース | 欠落したport呼び出しや冪等チェック飛ばし（fake付き） |
| 境界DTO | 不正payload受入やフィールド黙殺 |
| プロパティ / 例 | ミュータントを*捕まえる*失敗アサーションの供給 |

フィクスチャ、`trybuild`、プロパティの代替ではない。それらのテストが振る舞いを縛っているかの監査である。層の分担は [開発環境](/projects/kamae-rs/dev-environment/) を参照。

## CI ガイド

ミューテーションジョブは**任意のアサーション強度チェック**であり、unsafe/セキュリティ探査ではない。[CI セットアップ](/projects/kamae-rs/ci-setup/) を参照。全ツリーのミュータント実行で些細なPRを止めない。

| モード | いつ | コマンドの形 |
| --- | --- | --- |
| **PR増分** | 導入時の既定 | baseブランチに対する `--in-diff` |
| **定期 / mainフル** | 夜間や週次で `domain` | `cargo mutants -p domain --in-place` |
| **シャードフル** | 大きな木 | `--shard i/n` + 緑のテスト後 `--baseline=skip` |

```bash
python3 path/to/kamae-rs/skills/kamae-rs/scripts/apply_templates.py \
  --target . --ci none --mutants
```

- Workflow: [`github-ci-mutants.yml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/github-ci-mutants.yml) → `.github/workflows/cargo-mutants.yml`
- Config: [`mutants.toml`](https://github.com/manji-0/kamae-rs/blob/main/skills/kamae-rs/assets/templates/mutants.toml) → `.cargo/mutants.toml`

`-p domain` と `paths:` をcrateに合わせる。失敗時は `mutants.out` をアップロードする。

フォーマット、clippy、unit/integrationは**必須**のまま。excludeと増分が安定してからミューテーションを必須化する。advisoryでない限り `continue-on-error` でmissedを隠さない。

ローカル再現：

```bash
git fetch origin main
git diff origin/main...HEAD > /tmp/pr.diff
cargo mutants --in-diff /tmp/pr.diff -p domain
```

パッケージ一覧と `.cargo/mutants.toml` のノブをworkflow隣に文書化し、レビュアがCI失敗を再現できるようにする。

## レビューで見るところ

- `mutants` 依存やCIの `cargo mutants` があるとき、このガイドと [品質ゲート](/projects/kamae-rs/quality-gates/) を読んでいるか。
- コンストラクタや遷移のsurviving mutantを非法状態や静かな成功経路の欠落テストとして扱っているか。
- ドメイン入口への広い `#[mutants::skip]` よりテスト修正を選んでいるかも見る。

