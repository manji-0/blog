---
title: "Kamae"
description: サーバーサイドのドメイン設計のためのガイド
tableOfContents: false
---

Kamae（構え）は、サーバーサイドのドメインコードを堅牢に設計・レビューするためのスタンスとガイド集である。型やバリデーションで無効な状態を表現しにくくし、境界で外部データを一度パースし、状態遷移と永続化を明示的に保つ——そのための読み物を、言語別にまとめている。

## ドキュメント

| | 概要 |
| --- | --- |
| [Rust](/docs/kamae/rust/) | 列挙型・newtype・`Result` と境界 DTO で守る Rust 向けガイド |
| [Python](/docs/kamae/python/) | Pydantic v2 の判別共用体と純粋な状態遷移関数を軸にした Python 3.12+ 向けガイド |

どちらも同じ思想の言語別版である。[Rust のはじめに](/docs/kamae/rust/) または [Python のはじめに](/docs/kamae/python/) から入り、今のタスクに関係するリファレンスだけを開くのがよい。各リファレンス末尾の **レビュー観点** に、そのトピックのコードレビューで確認すべき項目がある。

## ソースリポジトリ

- [kamae-rs](https://github.com/manji-0/kamae-rs)
- [kamae-py](https://github.com/manji-0/kamae-py)

各リポジトリには Claude / Codex 向けスキルパッケージも同梱されています。このサイトのドキュメントは、スキル原文をブログ読者向けの読み物として再構成した版です。
