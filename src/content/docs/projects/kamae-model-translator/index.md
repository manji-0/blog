---
title: "kamae-model-translator とは"
description: "kamae ドメインモデルを言語間で移植・連携する Agent Skill 群の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-model-translator](https://github.com/manji-0/kamae-model-translator)

**kamae-model-translator** は、kamaeファミリー（TypeScript / Python / Rust / Scala）のドメインモデルを、言語をまたいで移す・やり取りするための **Agent Skill** 集です。コード生成器ではなく、エージェントが参照する移植・連携の設計ガイドをMarkdownで束ねたものです。

言語ごとの書き方はidiomaticに分かれる（Zodのbrand、Pydanticのfrozen、Rustのnewtype、Scalaのopaqueなど）一方で、判別unionの状態、純粋な遷移、境界でのDTO検証、PIIのredaction、リポジトリportとイベント、といった骨格は共通です。別言語へのリライトやポリグロットなイベント交換で、その差がinvariantやwireのずれになるのを防ぐのが役割です。

単一言語内の実装は各kamaeスキルで足り、IDLからの機械生成だけが目的なら対象外です。

## 2つのSkill

| Skill | 何をするか | いつ使うか |
| --- | --- | --- |
| **kamae-model-port** | 同じドメインを別言語へ移植する | TS→Rustのリライトなど |
| **kamae-model-bridge** | wire経由で異言語サービスと交換する | JSON / Protobuf / gRPC、契約テスト |

portならソースとターゲットのkamaeスキルを先に読み、こちら側の対応表で写像します。bridgeならwireを言語中立に決め、各側がDTO境界でローカル型に落とします。

対応言語は [kamae-ts](https://github.com/iwasa-kosui/kamae-ts)、[kamae-py](https://github.com/manji-0/kamae-py)、[kamae-rs](https://github.com/manji-0/kamae-rs)、[kamae-scala](https://github.com/manji-0/kamae-scala) です。

## port: 移植の進め方

`migration-workflow.md` の順序は後段が前段に依存するので飛ばしません。状態型 → ID・値オブジェクト → 遷移 → エラー → 境界・DTO → PII → 永続化・イベント → 配線 → テスト、です。各段に検証条件と落とし穴があります。

よく見る対応は `type-mapping.md` にまとまっています。判別union、branded ID、Result / Either、遷移成果型などです。言語内のidiomaticな表記と、wire上の表記は別物だと思ってください。

例は `examples/taxi-request-ts-to-rs.md` と `examples/taxi-request-py-to-scala.md`。周辺は `state-transition-mapping.md`、`error-handling-mapping.md`、`id-and-branded-types.md`、`pii-and-sensitive.md`、`boundary-and-dto.md`、`persistence-event-mapping.md` を見る。

## bridge: wireの決め方

共有するcanonicalはだいたい次のとおりです。フィールドは `snake_case`、判別子 `kind` もsnake_caseリテラル、時刻はISO 8601 UTC、UUIDは小文字ハイフン、金額は整数セント＋通貨コード。TS / ScalaはcodecでcamelCaseと往復し、Python / Rustはwireと素直に揃いやすいです。

ドメイン型をwireに直接載せません。送信はdomain → outbound DTO → serialize、受信はdeserialize → inbound DTO → domainです。

詳細は `wire-format-conventions.md`、`discriminant-interop.md`、`serialization-compatibility.md`、`contract-testing.md` を見る。加えて `schema-evolution.md`、`dto-boundary-patterns.md`、`protobuf-mapping.md`。例は `examples/json-interop-ts-py.md` と `examples/grpc-interop-rs-scala.md`。

## インストールとルール

```bash
claude skills add manji-0/agent-skill-modelconverter
# または
npx @anthropic-ai/skills add manji-0/agent-skill-modelconverter
```

2つセットで入ります。タスクに応じてportかbridgeかを選んでください。

`.claude/rules/*.md` や `.codex/rules/*.md` で振る舞いを上書きできます。優先は **プロジェクトルール > ユーザーグローバル > 同梱defaults**。`applies-to` でport / bridge / `*` を指定します。チームの命名やwire例外はここに書くとエージェントが揃いやすいです。

## まわりと向き不向き

各言語のkamaeが単一言語の設計、本リポジトリが言語横断の写像とwire、[rdra-ish](/projects/rdra-ish/) が任意の上流要件、という並びです。

向いているのは、kamaeサービスを別言語へ書き直すとき、混在環境でイベントやAPI契約を揃えるとき、discriminated unionの写像をinvariant付きで決めたいときです。単一言語の実装レビューや、OpenAPI / Protobufからの機械生成だけが目的なら向きません。

作業後は状態variantの余計なoptional、ID型の取り違え、遷移の副作用、境界でのbypass、PIIのログ漏れを見る。bridgeならwire規約と契約テスト、portなら移植順序の飛ばしがないかも確認する。自動変換ではなく、同じ写像表を人とエージェントが共有するための共通言語だと思ってください。
