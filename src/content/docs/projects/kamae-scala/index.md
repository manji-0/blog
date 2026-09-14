---
title: "はじめに"
description: "サーバーサイドScala 3の堅牢なドメイン設計と実装ガイド"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-scala](https://github.com/manji-0/kamae-scala)

_Kamae（構え）— 備えの姿勢。_

## 目的

Kamae Scalaは、サーバーサイドのScala 3ドメインコードを型で守り、レビューしやすくするための設計スタンスとガイド集です。opaque types・sealed traits・`Either`・エフェクト型などScala 3のイディオムに、同じ思想を落とし込みます。

## 背景

文字列のまま混ざるドメイン概念、`status`とOptionalで表せる無効状態、想定内失敗での`throw`/`.get`、APIやDB行のドメイン直使い、観測経路へのPII、状態とイベントの非アトミックな永続化が、変更のたびにレビュー負荷を上げます。[kamae-rs](https://github.com/manji-0/kamae-rs)や[kamae-ts](https://github.com/iwasa-kosui/kamae-ts)と同じ防波堤を共有します。

## 関連文書

| 文書 | 役割 |
| --- | --- |
| [kamae-rs](/projects/kamae-rs/) | Rust向けの同系ガイド |
| [kamae-py](/projects/kamae-py/) | Python向けの同系ガイド |
| [kamae-model-translator](/projects/kamae-model-translator/) | 言語間移植・wire連携のAgent Skill |
| [kamae-scala リポジトリ](https://github.com/manji-0/kamae-scala) | スキル本体・テンプレート・review probe |

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
| 新規ドメインを型で起こす | [ドメインモデリング](/projects/kamae-scala/domain-modeling/) → [状態遷移](/projects/kamae-scala/state-transitions/) → [境界防御](/projects/kamae-scala/boundary-defense/) |
| スキルを入れて実装を始める | [使い方](/projects/kamae-scala/usage/) → 上記実装3本 |
| ライブラリの置き方を確認する | [ライブラリガイド](/projects/kamae-scala/library-guides/) |
| PR前のチェックを揃える | [品質ゲート](/projects/kamae-scala/quality-gates/) |

## 構成

| 層 | ページ |
| --- | --- |
| 設計（トップ） | はじめに |
| 実装 | ドメインモデリング、状態遷移、境界防御 |
| リファレンス | 使い方、ライブラリガイド、品質ゲート |

旧トピックURLは移動先へリダイレクトします。`references/`配下はすでにリダイレクト済みです。

## 制約

既定はScala 3.3以降、sbt 1.10以降、Java 17以降です。フォーマットにはscalafmt、lintにはscalafix（採用している場合）を使います。ここで示すのは強い既定です。慣習と衝突する場合は慣習を優先し、ドメインの安全性に影響する逸脱だけを短く記録してください。

## インタフェース

エージェント向けの入口はAgent Skillです。実装時は`kamae-scala`、差分レビュー時は`kamae-scala-review`を使います。

```bash
npx skills add manji-0/kamae-scala -s kamae-scala -s kamae-scala-review -g -y
```

チームの命名やライブラリ好みは`.claude/rules/` / `.codex/rules/`で上書きできます。詳細は[使い方](/projects/kamae-scala/usage/)です。

## 依存

`build.sbt`に応じて[ライブラリガイド](/projects/kamae-scala/library-guides/)を参照してください。エフェクトはCats/ZIO、JSONはCirce、HTTPはhttp4s/sttp、SQLはdoobie/slickが中心です。

## 検討して捨てた案

- エフェクトライブラリごとに実装ガイドを分割する案（サイドバーと重複が増える）
- 単一の「手順だけ」クイックスタート（設計判断の文脈が欠ける）
- 旧URLを削除する案（ブックマークと外部リンクを壊す）

## 次に読む

初めてなら[使い方](/projects/kamae-scala/usage/)でスキルとテンプレートを入れ、[ドメインモデリング](/projects/kamae-scala/domain-modeling/)から実装3本を読んでください。仕上げは[品質ゲート](/projects/kamae-scala/quality-gates/)です。
