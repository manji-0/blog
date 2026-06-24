---
title: "移行戦略 チェックリスト"
sidebar:
  order: 5
  label: "移行戦略"
---

リファレンス: [`migration-strategy.md`](/docs/kamae/python/references/migration-strategy/)。

## 19.1 差分は全面書き換えの前に境界を改善しているか — Medium

触れたワークフローで DTO パース、状態型付け、エラーマッピングを先に締めずにレガシーサービスクラスを動かす大規模書き換えを指摘する。

## 19.2 互換シムは薄く一時的か — Low

利便のためドメインロジックを恒久的に二重化したり無効状態を保持したりする広いアダプター層を指摘する。

## 19.3 レガシーコードは明確に隔離されているか — Medium

文書化された境界なしに、新しい Kamae スタイルモジュールが旧層の型付きでない dict、可変グローバル、ORM エンティティに依存する箇所を指摘する。

## 19.4 移行はオブザーバビリティと PII 姿勢を保つか — High

移行経路が生ペイロードの旧ログを維持し、マスクを落とし、新設計で必要なトランザクション/アウトボックス保証を迂回する箇所を指摘する。

[`pii-protection.md`](/docs/kamae/python/references/pii-protection/) と [`persistence-events.md`](/docs/kamae/python/references/persistence-events/) と突き合わせる。
