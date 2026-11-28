---
title: "はじめに"
description: "要件モデルをコードで書いてレビューし検証する rdra-ish DSL（main `169cdf3`）の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [rdra-ish-dsl](https://github.com/manji-0/rdra-ish-dsl) · 対象：main `169cdf3`（v3.0.0以降の未リリース版）

**rdra-ish** は、要件から設計までを1つの型付きモデルに保つDSLとCLIです。システムが提供する業務価値から、API・データ・状態遷移までを `.rdra` で書きます。CLIはモデルを型検査し、層の間の抜けを見つけ、ライフサイクルを検証します。さらに図・レビュー表・エクスポート・ドメインコードへ投影します。

## 目的

Wordや表に散らばりがちな「誰が・何を・どのデータに触るか」を、関係（predicate）で結んだグラフとしてコードに残します。同じモデルからレビュー用の図と表を出し、状態遷移の性質を機械で確かめ、実装のドメイン型まで生成します。

## 背景

rdra-ishは3つの源流を1つのモデルにまとめています。各部分は源流の名前をそのまま使います。

| モデルの部分 | 源流 | 要素 |
| --- | --- | --- |
| システムより上の要求と業務 | RDRA（神崎善司） | `requirement`、`goal`、`business`、`buc`、`flow`、`step`、`variation`、`condition`、`event`、`actor`、`extsystem` |
| システム境界より下、ユースケースから設計まで | ICONIXのロバストネス分析 | `usecase`、`screen`、`api`、`entity`、`field` |
| ライフサイクルと検証 | rdra-ish独自 | ライフサイクル、状態ルール、時相プロパティ |

RDRAからは中心の考え方を受け継ぎます。型付き要素の1つのグラフで、各層が次の層の理由になるという考え方です。システム境界の下では、ICONIXに従って各ユースケースをバウンダリ（`screen`、`extsystem`、`timer`）とコントロール（`api`）とエンティティ（`entity`）に分けて読みます。ここからロバストネス図、シーケンス図、ER図が出ます。

rdra-ishはオブジェクト指向設計の手前で止まり、API・データ・状態で終わります。名前は「RDRA-inspired Implementation and System Heuristics」の略です。BUC・業務フロー・ユースケースの読み方は [RDRA-ish Interpretation](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/rdra-ish-interpretation.md) に、設計判断は [Vision](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/vision.md) にあります。

## 目標

- 同じ `.rdra` から `check`、`lint`、`next`、図、表、エクスポート、`states`、`verify`、`codegen` を回せる
- RDRA 3.0の図をMermaidテキストで出し、BUC・ユースケース・アクター・エンティティで絞れる
- `export` でOpenAPI、AsyncAPI、DBML、SQL DDL、JSON Schema、TLA+のたたき台を出せる
- `verify` がすべての不変条件、`after` アサーション、時相プロパティを組み込みのチェッカーで判定する。JVMは要らない
- `verify` が既定で、状態ルールを任意の行数についてz3で証明する。`--no-prove` で外せる
- `--with-tlc` でTLCと突き合わせられる
- `codegen` でTypeScript、Rust、GoのドメインコードをKamaeスタイルで出し、`check --code`（実験的）でサービスコードがモデルに従っているかを確かめられる

## 対象外

関係を明示したモデルをレビューし検証するためのツールです。議事録やユーザーストーリーだけの初期探索には向きません。オブジェクト指向設計やサービスの実装そのものも扱いません。`codegen` の出力はエージェントや開発者が仕上げる土台です。

## シナリオ

1. Stage 0から段階的に `.rdra` を足します。各段階のあと `check` と `--buc` 付きの図でレビューし、`next` で次の段階を確かめます
2. CRUDマトリクスやシーケンス図でBUCの抜けを洗い、`states` でライフサイクルを確認します
3. ルールと時相プロパティを書き、`verify` で反例を探し、z3の証明の結果を見ます。必要なら `--with-tlc` で裏を取ります
4. `export --kind openapi` や `sql` でたたき台を出し、`codegen` でドメイン型を生成して、`check --code` で実装との差を見ます

## 構成

```diagram-design rdra-ish-pipeline
```

BUCはビジネス価値のスライス、業務フローは時間順の展開、ユースケースは効果を持つ相互作用の境界です。実務ではBUCで切り、フローで順番を追い、ユースケースで1操作とそのデータ・画面・API効果に名前を付けます。

| 機能 | 得られるもの |
| --- | --- |
| `check`、`lint`、`next` | 型エラー、未解決の参照、層の間の抜け、各BUCの精緻化Stageと未解決の問い |
| `diagram`、`list`、`csv` | RDRA 3.0の図（Mermaid）、CRUDマトリクス、権限監査、ルール表 |
| `export` | `openapi`、`asyncapi`、`dbml`、`sql`、`json-schema`、`mermaid-er`、`tla` |
| `states` | 各エンティティの到達可能な状態と、それが破る状態ルール |
| `verify` | 不変条件・`after` アサーション・時相プロパティの判定と、状態ルールのz3による証明。`--with-tlc` はTLCによる外からの確認 |
| `codegen` | TypeScript、Rust、Goのドメインコード（状態型、行型、遷移関数、契約、適合性ハーネス） |
| `check --code` | サービスコードが生成物と一致し、契約に対してコンパイルでき、適合性テストを通るか（実験的） |
| `rdra-ish-lsp`、`rdra-ish lsp` | 診断、補完、ホバー、定義・参照、リネーム、整形などを提供する言語サーバー。バックグラウンドで回す `check` のライフサイクル検査の結果も出す |
| エージェントスキル、Claude Codeプラグイン | モデルの記述、レビュー、図、検証、生成契約に沿った実装のためのスキル。プラグインはスキルと言語サーバーをまとめて入れる |

## 制約

- 生成系サブコマンドは、parseエラーやresolveエラーがあると成果物を書きません
- ライフサイクルを探索するのは状態図とTLA+エクスポートだけです。ほかの図・表・エクスポートはライフサイクルのerrorを待ちません。errorは `check` で見ます
- 検証は有界です。結果は必ず `bounds:` 行で始まり、上限で止まった検査は `not decided` になります
- `verify` の判定は最後の `result:` 行（`ok`、`not decided`、`counterexample`、`tool_error`）に出ます
- `warning` はレビュー信号です。探索中は意図的に残してかまいません。`error` はモデルの信頼性を損なうのでブロッカーです
- `--buc` や `--entity` で、モデルの一部だけを検査できます

### 互換性の約束

rdra-ishはセマンティックバージョニングに従います。約束の範囲は [Compatibility](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/docs/compatibility.md) にあります。

| 守るもの | 内容 |
| --- | --- |
| 構文 | 読み込めるモデルは次のメジャーリリースまで読み込める |
| 意味 | 同じモデルに対し、`check` と `verify` は同じ範囲内で同じ判定（終了コードとerror名の集合）を返す |
| 診断名と `// expect` ヘッダ | 名前と文法は変わらない |
| CLI | サブコマンド、フラグ（`verify` の `--tlc-jobs`・`--tlc-workers` を含む）、`--kind`・`--format` の値、JSONキーとCSV列 |
| 終了コード | `0` は成功、`1` はerrorや読み込みの失敗、`2` は使い方の誤り、`101` はツールのバグ（panic） |
| 出力行 | `bounds:`、`result:`、`tlc_result:` 行の形 |
| Mermaid図 | `%%` ヘッダ、ノードID、`:::<kind>` などのエンコーディング |
| `codegen` | `--lang ts` が出すTypeScriptの型だけ |

`codegen` のそれ以外、`check --code`、`verify --symmetry`、`verify --plan`、`RDRA_TLC_HEAP=states` は実験的で、約束の外です。証明そのものは既定で走り、`--no-prove`・`--prove`・`--deny-unproved`・`--z3` の意味は保たれます。証明が出す `proved:`・`unproved:`・`lemma:` 行と `.lemma()` は実験的です。`--with-tlc` の `tlc:` 行の形も約束の外で、TLCの判定は `tlc_result:` 行で読みます。

panicしたときの `tool error:` 行の文言は版ごとに変わりえます。約束は終了コード `101` だけです。

## インタフェース

- CLI: `rdra-ish <subcommand> <inputs...>`。`rdra-ish --version` で版を表示します
- エディタ： `rdra-ish-lsp`（CLIに組み込んだ `rdra-ish lsp` も同じサーバー）とVS Code拡張（[使い方](/projects/rdra-ish/usage/#エディタとclaude-codeプラグイン)）
- 形式検証： `verify` 単体で判定します。z3があれば既定で証明も走り、なければ証明を飛ばして `note:` を出します。TLCは `--with-tlc` のときだけ使います（[形式検証](/projects/rdra-ish/formal-verification/)）
- コード生成： `codegen --lang ts|rust|go` と `check --code`（[コード生成](/projects/rdra-ish/codegen/)）
- エージェントスキル： `rdra-ish-write`、`rdra-ish-review`、`rdra-ish-diagram`、`rdra-ish-verify`、`rdra-ish-implement` など8つ。Claude Codeプラグイン `rdra-ish` でも入ります（[skills/README.md](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/skills/README.md)）

## 依存

- Rust製のCLIです。PyPI/uv、Nix flake、cargo、GitHub Releaseのバイナリで配布します。PyPIとReleaseのバイナリはv3.0.0で、このページの内容はNixかcargoでmainを入れたときのものです（[使い方](/projects/rdra-ish/usage/#インストール)）
- 図の出力はMermaidテキストだけで、追加依存はありません。画像が要るときは `mmdc` などで描画します
- `verify` は追加依存なしで動きます。証明にはz3、`--with-tlc` にはTLCが要ります。Nixで入れると両方そろいます

## 検討して捨てた案

1. **RDRA原典の完全互換**：実装レビューと検証の語彙を足すため、RDRA-ishとして切り分けました
2. **単一の巨大な `.rdra`**：Stage 0–7と `shared/`・`buc/` 配置による段階的精緻化を採りました
3. **生成物を正とする運用**：正はモデルです。エクスポートはたたき台で、`codegen --check` と `check --code` は生成物とモデルのずれを検出します
4. **TLCを `verify` の既定エンジンにする**：v3.0.0で組み込みチェッカーを既定にしました。TLCは `--with-tlc` で突き合わせる第二の意見です
5. **到達パターンから型を作る `typescript-states`**：v3.0.0で削除し、`codegen --lang ts` に一本化しました

## 関連文書

| 文書 | 内容 |
| --- | --- |
| [使い方](/projects/rdra-ish/usage/) | インストール、初回の一周、アップグレード |
| [段階的モデリング](/projects/rdra-ish/incremental-modeling/) | Stage 0–7の精緻化フロー |
| [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) | 要求からルールまでの実践例 |
| [言語リファレンス](/projects/rdra-ish/language-reference/) | DSLの構文と意味 |
| [CLI リファレンス](/projects/rdra-ish/cli-reference/) | サブコマンドとフラグ |
| [形式検証](/projects/rdra-ish/formal-verification/) | `verify`、`--with-tlc`、`--prove` |
| [検証の理論](/projects/rdra-ish/theory/) | 検証器の保証、その証拠と仮定、未解決の穴（v3.0.0以降のmain） |
| [コード生成](/projects/rdra-ish/codegen/) | `codegen` と `check --code` |
| [設計の評価](/projects/rdra-ish/design-review/) | 設計としての評価 |
| upstream [CHANGELOG](https://github.com/manji-0/rdra-ish-dsl/blob/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/CHANGELOG.md) | 各リリースの変更と破壊的変更 |

## 次に読む

| 目的 | ページ |
| --- | --- |
| まず動かす | [使い方](/projects/rdra-ish/usage/) |
| 書き方を段階的に学ぶ | [段階的モデリング](/projects/rdra-ish/incremental-modeling/) |
| 要求からルールまで追う | [店舗補充管理の例](/projects/rdra-ish/examples/store-restock/) |
| 構文を引く | [言語リファレンス](/projects/rdra-ish/language-reference/) |
| ライフサイクルを検証する | [形式検証](/projects/rdra-ish/formal-verification/) |
| 判定が何に支えられるかを知る | [検証の理論](/projects/rdra-ish/theory/) |
| 実装につなぐ | [コード生成](/projects/rdra-ish/codegen/) |

上流の要件モデルがrdra-ish、横断トレースが [dagayn](/projects/dagayn/)、実装のドメイン設計がkamae系、という並びで使うことが多いです。

サンプルはリポジトリの [`samples/`](https://github.com/manji-0/rdra-ish-dsl/tree/169cdf3fb49bbcaf0c7d452c32a57da18720fdd0/samples) にあります。

| サンプル | 内容 |
| --- | --- |
| `incremental-order` | 7段階の精緻化ウォークスルー |
| `ec-site` | 小さな端から端までのモデル |
| `clinic-ops` | API、イベント、アクセス制約。生成したPRDと設計書付き |
| `patent-ops`、`food-permit-ops`、`insurance-claim-ops` | 一次資料からモデル化した日本の業務領域 |
| `oidc-auth` | OpenID Connectの認証シナリオをすべて含むOpenID Provider |
| `personal-info`、`api-contract` | 個人データの扱い、APIコントラクトのメタデータとOpenAPIエクスポート |
| `formal-verification`、`formal-verification-fail` | 1ファイルずつの小さな `verify` の例 |
