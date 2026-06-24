---
title: "kamae-rs"
sidebar:
  order: 0
  label: "概要"
---

> ソース: [https://github.com/manji-0/kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

堅牢なサーバーサイドドメインコードを設計・レビューするための Rust スキル集です。[`kamae-ts`](https://github.com/iwasa-kosui/kamae-ts) の Rust 向け兄弟プロジェクトで、薄いスキル・トピックガイド・レビューチェックリストという構成は同じまま、原則を Rust のイディオムに落とし込んでいます。

## 提供スキル

### `kamae-rs`

Rust のドメインモデル、ユースケース、リポジトリ、状態遷移、境界 DTO のパース、型付きエラー、PII（個人識別情報）の扱い、検証・レビュー周辺のコードを実装・変更・リファクタリング・修正するときに使います。

中核となる原則:

- 列挙型、構造体、プライベートフィールドの newtype、検証付きコンストラクタでドメインの意味をモデル化する。
- 実用的な範囲で、無効な状態遷移をコンパイル時に失敗させる。
- ドメイン固有のエラー列挙型とともに `Result<T, E>` を使う。
- 外部データは DTO / 行 / 設定用構造体に変換してからドメイン型を構築する。
- ユースケースは小さなポート経由で配線し、アダプタはコンポジションルートで注入する。
- 実用的な範囲で、ユースケースごとに集約の変更を 1 つのトランザクション境界内に収める。
- PII とシークレットはマスキング用ラッパーの内側に置く。
- デフォルトではドメインロジックから `unsafe` を排除する。避けられない場合は、文書化された安全性不変条件を持つ小さな安全 API の背後に隠す。
- 触った Rust コードのフォーマットと lint ゲートをクリーンに保つ。lint 抑制は狭い範囲で正当化された設計判断として扱う。
- rustdoc で公開ドメイン契約を文書化する: 不変条件、エラー、遷移ルール、例、および該当する場合は Safety セクション。
- CI をレビュー前提と揃える: パッケージ検証、フォーマット、lint、テスト、rustdoc、リスクに応じた unsafe / セキュリティジョブ。

### `kamae-rs-review`

Rust コードレビュー時に使います。ドメインモデリング、遷移、エラーハンドリング、アプリケーション配線、集約トランザクション、境界検証、PII 保護、unsafe 境界、フォーマット / lint、rustdoc、CI 設定、永続化 / イベント、ストリームと継続クエリ、ドメインマクロ、サービス境界、テストについて、重要度タグ付きのチェックリストファイルを順にたどります。

## パッケージ構成

Claude と Codex 向けのマニフェストの両方を含みます:

- `.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` は Claude プラグインパッケージを記述します。
- `.codex-plugin/plugin.json` と `.agents/plugins/marketplace.json` は Codex プラグインパッケージを記述し、Codex を `./skills/` に向けます。

公開やパッケージアーカイブの共有前に `python3 scripts/validate_package.py` を実行してください。スモークテストは JSON マニフェスト、スキルの frontmatter、相対 Markdown リンク、マニフェストのスキルパス、クレートガイド参照を検証します。

## レビューツール

`cargo run -p kamae-review-probe -- <path>` を実行すると、チェックリストをたどる前に Rust ファイルからレビューの手がかりを収集できます。プローブは `syn` でソースをパースし、意図的に保守的です。人間やエージェントの検査向けにパターンを強調表示するだけで、それ自体は所見を生成しません。

アプリケーションクレートでのドメインコードの実装とテストについては、[`references/dev-environment.md`](/docs/kamae/rust/references/dev-environment/) を参照してください。

## カスタマイズ

プロジェクトごとの上書きルールは、リポジトリ内の `.claude/rules/`、`.codex/rules/`、または `rules/defaults/` に Markdown ファイルとして置けます。詳細は [`rules.md`](/docs/kamae/rust/rules/) を参照してください。

## リポジトリ構成

```text
skills/kamae-rs/          実装ガイダンス
skills/kamae-rs-review/   レビュー手順とチェックリスト
rules/                    プロジェクト / ユーザー上書き形式
```

## ライセンス

MIT
