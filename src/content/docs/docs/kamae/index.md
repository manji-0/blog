---
title: Kamae
description: サーバーサイドのドメイン設計のためのガイド
tableOfContents: false
---

Kamae（構え）は、サーバーサイドのドメインコードを堅牢に設計・レビューするためのスタンスとガイド集です。型やバリデーションで無効な状態を表現しにくくし、境界で外部データを一度パースし、状態遷移と永続化を明示的に保つ——そのための読み物を、言語別にまとめています。

## ドキュメント

| | 概要 |
| --- | --- |
| [Rust](/docs/kamae/rust/) | 列挙型・newtype・`Result` と境界 DTO で守る Rust 向けガイド |
| [Python](/docs/kamae/python/) | Pydantic v2 の判別共用体と純粋な状態遷移関数を軸にした Python 3.12+ 向けガイド |

どちらも同じ思想の言語別版です。[はじめに](/docs/kamae/rust/) または [はじめに](/docs/kamae/python/) から入り、必要なリファレンスだけ開くのがおすすめです。

## ソースリポジトリ

- [kamae-rs](https://github.com/manji-0/kamae-rs)
- [kamae-py](https://github.com/manji-0/kamae-py)

各リポジトリには Claude / Codex 向けスキルパッケージも同梱されています。このサイトのドキュメントは、スキル原文をブログ読者向けの読み物として再構成した版です。
