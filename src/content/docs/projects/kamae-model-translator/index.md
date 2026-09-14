---
title: "はじめに"
description: "kamae ドメインモデルを言語間で移植・連携する Agent Skill 群の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-model-translator](https://github.com/manji-0/kamae-model-translator)

## 目的

**kamae-model-translator**は、kamaeファミリー（TypeScript / Python / Rust / Scala）のドメインモデルを、言語をまたいで移す・やり取りするためのAgent Skill集です。エージェントが参照する移植・連携の設計ガイドをMarkdownで束ねます。

## 背景

言語ごとの書き方は分かれますが、判別unionの状態、純粋な遷移、境界でのDTO検証、PIIのredaction、リポジトリportとイベントといった骨格は共通です。別言語へのリライトやポリグロットなイベント交換で、その差が不変条件やwire表現のずれになるのを防ぎます。

## 関連文書

| 文書 | 役割 |
| --- | --- |
| [kamae-py](/projects/kamae-py/) | Python向けkamaeガイド |
| [kamae-rs](/projects/kamae-rs/) | Rust向けkamaeガイド |
| [kamae-scala](/projects/kamae-scala/) | Scala向けkamaeガイド |
| [kamae-ts](https://github.com/iwasa-kosui/kamae-ts) | TypeScript向けkamae（ブログ外） |
| [agent-skill-modelconverter](https://github.com/manji-0/kamae-model-translator) | スキルパッケージ本体 |

## 目標

- 同じドメインを別言語へ移植する手順を共有する（**port**）
- 通信表現（wire）経由で異言語サービスと交換する規約を共有する（**bridge**）
- 人とエージェントが同じ写像表を参照できる共通言語を持つ

## 対象外

同じ写像表を人とエージェントが共有するためのガイドです。単一言語内の実装レビューは各kamaeスキルで足ります。OpenAPI / Protobufからの機械生成だけを目的にする場合は、別のツールを選びます。詳細リファレンスの正はGitHub上のupstreamです。

## シナリオ

| 状況 | 使うSkill |
| --- | --- |
| TS→Rustなど同じドメインのリライト | **kamae-model-port**（[移植](/projects/kamae-model-translator/port/)） |
| JSON / Protobuf / gRPCでサービス連携 | **kamae-model-bridge**（[連携](/projects/kamae-model-translator/bridge/)） |
| スキル導入とルール上書き | [使い方](/projects/kamae-model-translator/usage/) |

## 構成

| 層 | ページ |
| --- | --- |
| 設計（トップ） | はじめに |
| 実装 | port（言語移植）、bridge（wire連携） |
| リファレンス | 使い方 |

GitHub上のパッケージ名は`agent-skill-modelconverter`です。インストールコマンドとリポジトリ名が異なる点に注意してください。

## 制約

portならソースとターゲットのkamaeスキルを先に読み、対応表で写像します。bridgeならwireを決め、各側がDTO境界でローカル型に落とします。同じ写像表を共有するためのガイドです。

## インタフェース

2つのSkillがセットで入ります。タスクに応じてportかbridgeかを選びます。インストールとルール上書きは[使い方](/projects/kamae-model-translator/usage/)です。

## 依存

各言語のkamaeが単一言語の設計、本リポジトリが言語横断の写像とwire、[rdra-ish](/projects/rdra-ish/)が任意の上流要件、という並びです。どれも必須ではありません。

## 検討して捨てた案

- ブログに全referenceを複製する案（upstreamと二重管理になる）
- IDLからの一括コード生成（kamaeの型安全な境界設計と相性が悪い）
- portとbridgeを1 Skillにまとめる案（タスクの切り分けが曖昧になる）

## 次に読む

移植順序と型対応は[port](/projects/kamae-model-translator/port/)、wire規約と契約テストは[bridge](/projects/kamae-model-translator/bridge/)です。導入は[使い方](/projects/kamae-model-translator/usage/)から始めてください。
