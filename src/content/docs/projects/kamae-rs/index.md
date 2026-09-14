---
title: "はじめに"
description: "サーバーサイドRustの堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-rs](https://github.com/manji-0/kamae-rs)

_Kamae（構え）— 備えの姿勢。_

## 目的

Kamae Rustは、サーバーサイドのドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。列挙型・newtype・`TryFrom`・`Result`などRustのイディオムに、同じ思想を落とし込みます。

## 背景

文字列のまま混ざるドメイン概念、`status`とOptionalで表せる無効状態、想定内失敗での`unwrap`/`panic!`、API JSONやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化が、変更のたびにレビュー負荷を上げます。[kamae-ts](https://github.com/iwasa-kosui/kamae-ts)のRust向け兄弟として、同じ防波堤を共有します。

## 関連文書

| 文書 | 役割 |
| --- | --- |
| [kamae-py](/projects/kamae-py/) | Python向けの同系ガイド |
| [kamae-scala](/projects/kamae-scala/) | Scala 3向けの同系ガイド |
| [kamae-model-translator](/projects/kamae-model-translator/) | 言語間移植・wire連携のAgent Skill |
| [kamae-rs リポジトリ](https://github.com/manji-0/kamae-rs) | スキル本体・テンプレート・review probe |

## 目標

- 無効状態を型で表現できないようにする
- 遷移を純粋関数に寄せ、副作用はユースケースとアダプターへ集約する
- 外部データはDTO経由でだけドメインへ入る
- ローカルとCIで同じ品質ゲートを回せる

## 対象外

フレームワーク選定の一般論、ORMの入門、インフラ全体の設計、コード生成器としての利用は対象外です。単一言語内で足りる作業は各ページを通読する必要はありません。

## シナリオ

| 状況 | 読む順 |
| --- | --- |
| 新規ドメインを型で起こす | [ドメインモデリング](/projects/kamae-rs/domain-modeling/) → [状態遷移](/projects/kamae-rs/state-transitions/) → [境界防御](/projects/kamae-rs/boundary-defense/) |
| スキルを入れて実装を始める | [使い方](/projects/kamae-rs/usage/) → 上記実装3本 |
| 依存クレートの置き方を確認する | [クレートガイド](/projects/kamae-rs/crate-guides/) |
| PR前のチェックを揃える | [品質ゲート](/projects/kamae-rs/quality-gates/) |

## 構成

| 層 | ページ |
| --- | --- |
| 設計（トップ） | はじめに |
| 実装 | ドメインモデリング、状態遷移、境界防御 |
| リファレンス | 使い方、クレートガイド、品質ゲート |

旧トピックURLは移動先へリダイレクトします。`references/`配下はすでにリダイレクト済みです。

## 制約

ここで示すのは強い既定です。既存の慣習と衝突する場合は慣習を優先し、ドメインの安全性に影響する逸脱だけを短く記録してください。各実装ページ末尾のレビュー観点は、そのトピックの確認項目です。

## インタフェース

エージェント向けの入口はAgent Skillです。実装時は`kamae-rs`、差分レビュー時は`kamae-rs-review`を使います。

```bash
npx skills add manji-0/kamae-rs -s kamae-rs -s kamae-rs-review -g -y
```

チームの命名やクレート好みは`.claude/rules/` / `.codex/rules/`で上書きできます。詳細は[使い方](/projects/kamae-rs/usage/)です。

## 依存

`Cargo.toml`に応じて[クレートガイド](/projects/kamae-rs/crate-guides/)を参照してください。エラー処理は`thiserror`/`anyhow`、シリアライズは`serde`、検証やnewtypeは`validator`/`garde`/`nutype`が中心です。シークレットは`secrecy`、観測は`tracing`/`metrics`、テストは`proptest`のガイドがあります。

## 検討して捨てた案

- トピックごとに独立した長文リファレンスをすべてブログに載せる案（メンテコストと重複が大きい）
- 単一の「手順だけ」クイックスタート（設計判断の文脈が欠ける）
- 旧URLを削除する案（ブックマークと外部リンクを壊す）

## 次に読む

初めてなら[使い方](/projects/kamae-rs/usage/)でスキルとテンプレートを入れ、[ドメインモデリング](/projects/kamae-rs/domain-modeling/)から実装3本を読んでください。仕上げは[品質ゲート](/projects/kamae-rs/quality-gates/)です。
