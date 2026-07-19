---
title: "kamae-model-translator とは"
description: "kamae ドメインモデルを言語間で移植・連携する Agent Skill 群の概要"
sidebar:
  order: 0
  label: "はじめに"
---

> ソースリポジトリ: [kamae-model-translator](https://github.com/manji-0/kamae-model-translator)

**kamae-model-translator** は、[kamae](https://github.com/iwasa-kosui/kamae-ts) ファミリー（TypeScript / Python / Rust / Scala）のドメインモデルを、言語をまたいで正しく移す・サービス間でやり取りするための **Agent Skill** リポジトリである。コード生成器ではなく、AIエージェントが参照する **移植・連携の設計ガイド** をMarkdownで束ねたものである。

## 背景：kamae は言語ごとに idiomatic だが、概念は共通

kamae系のドキュメントは言語ごとに最適な型・ライブラリ・パターンを採用する。TypeScriptではZodのbranded typeとCompanion Object、Rustではnewtypeと `Result`、PythonではPydantic v2のfrozen model、Scalaではopaque typeと `Either`、といった差がある。

一方で、ドメインの骨格は共通である。判別可能unionによる状態型、純粋な遷移関数、境界でのDTO検証、PIIのredaction、リポジトリportとドメインイベント。これらはどの言語でも同じ意味を持つ。

問題は、サービスを別言語に書き直すときや、ポリグロットなマイクロサービス間でイベントを交換するときに、**言語固有の書き方の差** がinvariantの欠落やwire formatの不整合につながることである。kamae-model-translatorはそのギャップを埋める参照集である。

## 2 つの Skill

リポジトリは独立した2つのSkillで構成される。タスクに応じてどちらか一方だけを使う。

| Skill | 目的 | 典型シナリオ |
| --- | --- | --- |
| **kamae-model-port** | ある言語のドメインモデルを **別言語に移植** する | TS サービスを Rust に書き直す、Python モデルを Scala に翻訳する |
| **kamae-model-bridge** | 異言語サービス間でモデルを **wire format 経由で交換** する | JSON イベント、Protobuf/gRPC、契約テスト、スキーマ進化 |

portは「同じドメインを別言語で再実装する」、bridgeは「別言語のサービスとデータを送受信する」という切り分けである。単一言語内の作業は各kamaeスキル（kamae-rs等）を使い、IDLからの機械生成だけが目的なら本リポジトリの対象外である。

## 対応言語

4言語すべてのkamaeバリアントをカバーする。

| 言語 | Kamae スキル | リポジトリ |
| --- | --- | --- |
| TypeScript | kamae | [iwasa-kosui/kamae-ts](https://github.com/iwasa-kosui/kamae-ts) |
| Python | kamae-py | [manji-0/kamae-py](https://github.com/manji-0/kamae-py) |
| Rust | kamae-rs | [manji-0/kamae-rs](https://github.com/manji-0/kamae-rs) |
| Scala | kamae-scala | [manji-0/kamae-scala](https://github.com/manji-0/kamae-scala) |

portではソース言語とターゲット言語のkamaeスキルを先に読み、本リポジトリの対応表で概念を写像する。bridgeではwire formatを言語中立に定義し、各側がDTO境界でローカル型に変換する。

## kamae-model-port

型安全・状態遷移の正しさ・ドメインinvariantを保ったまま、モデル全体を別言語へ移すためのSkillである。

### 参照ドキュメント

| ファイル | 内容 |
| --- | --- |
| `type-mapping.md` | 4 言語対応表（判別 union、branded ID、Result、PII 等） |
| `state-transition-mapping.md` | 遷移関数の写像（Companion Object / `impl` / `extension`） |
| `error-handling-mapping.md` | エラー型、Result 合成、コントローラ層への変換 |
| `id-and-branded-types.md` | newtype / opaque type と検証保証 |
| `pii-and-sensitive.md` | redaction wrapper、資格情報型 |
| `boundary-and-dto.md` | 外部 → DTO → ドメインのパイプライン |
| `persistence-event-mapping.md` | リポジトリ port、ドメインイベント、`Transition` 成果型 |
| `migration-workflow.md` | 9 段階の移植順序と検証基準 |

### 推奨移植順序

`migration-workflow.md` が定める順序は、後段が前段の型に依存するため **飛ばさない** ことが前提である。

1. **状態型** — 各variantと判別union（土台）
2. **ID・値オブジェクト** — branded / newtype
3. **遷移関数** — 純粋なドメインロジック
4. **エラー型** — use-case単位のエラー enum
5. **境界・DTO** — 外部入力の検証パイプライン
6. **PII・機密型** — redactionとexposeパターン
7. **永続化・イベント** — リポジトリportと `Transition` 成果
8. **アプリケーション配線** — use caseとDI
9. **テスト・品質ゲート** — プロパティテスト、契約の確認

各段階に「この段階で満たすべき検証条件」と「よくある落とし穴」が書かれている。例えば状態型では「その状態に無関係なoptionalフィールドを置かない」、ID型では「`RequestId` と `PassengerId` の取り違えがコンパイルエラーになること」がチェックポイントになる。

### 例

- **TS → Rust**: `examples/taxi-request-ts-to-rs.md` — taxi-requestドメインを段階的に写像
- **Python → Scala**: `examples/taxi-request-py-to-scala.md`

## kamae-model-bridge

ポリグロットサービス間でkamaeモデルをJSON / Protobuf / gRPC / メッセージキュー経由で交換するSkillである。

### Wire 規約（概要）

すべてのkamaeサービスが共有するcanonicalルールである。

| 項目 | 規約 |
| --- | --- |
| フィールド名 | wire 上は `snake_case` |
| 判別子（`kind`） | `snake_case` リテラル（例: `"en_route"`） |
| タイムスタンプ | ISO 8601 UTC（`"2024-03-15T10:30:00Z"`） |
| UUID | 小文字ハイフン付き |
| 金額 | 整数セント + 通貨コード |

TypeScriptとScalaはcamelCase ↔ snake_caseをcodecで変換する。PythonとRustはwire形式と素直に一致する。ドメイン型はwireに直接載せず、**送信側は domain → outbound DTO → serialize**、**受信側は deserialize → inbound DTO → domain** という二段変換を守る。

### 参照ドキュメント

| ファイル | 内容 |
| --- | --- |
| `wire-format-conventions.md` | フィールド、スカラー、イベント envelope、null vs absent |
| `discriminant-interop.md` | `kind` / `event_name` の言語間マッピング |
| `serialization-compatibility.md` | null 扱い、strict parse、数値精度、日時 |
| `contract-testing.md` | 共有 fixture、CDCT、JSON Schema 検証 |
| `schema-evolution.md` | 安全な変更 vs breaking change、バージョニング |
| `dto-boundary-patterns.md` | 送受信側 DTO 設計 |
| `protobuf-mapping.md` | kamae DU → `oneof`、状態 → `message`、エラー → gRPC status |

### 例

- **TS ↔ Python JSON**: `examples/json-interop-ts-py.md`
- **Rust ↔ Scala gRPC**: `examples/grpc-interop-rs-scala.md`

## 型対応の一例

`type-mapping.md` のmaster tableから抜粋した対応関係である。port作業のたびに全文を参照する。

| 概念 | TypeScript | Python | Rust | Scala |
| --- | --- | --- | --- | --- |
| 判別 union | `type U = A \| B` + `kind` literal | `Annotated[A \| B, Field(discriminator="kind")]` | `enum U { A(AState), B(BState) }` | `enum U { case A(v: AState), ... }` |
| Branded ID | `z.brand()` + Companion | frozen wrapper `class XId(DomainModel)` | `pub struct XId(...)` + `new()` | `opaque type XId` + `apply()` |
| Result | neverthrow / fp-ts 等 | `Ok` / `Err` | `Result<T, E>` | `Either[E, T]` |
| 遷移成果 | 新状態を返す | `TransitionOutcome[TState, TEvent]` | `Transition<TState> { state, events }` | `Transition[TState, TEvent]` |

判別子の表記は **ソース言語内** ではPascalCase（TS）やsnake_case（Python）などidiomaticだが、**wire 上** はbridge規約に統一する、という二層構造に注意する。

## プロジェクトルール

`.claude/rules/*.md` や `.codex/rules/*.md` でSkillの振る舞いを上書き・拡張できる。優先順位は **プロジェクトルール > ユーザーグローバル > リポジトリ同梱 defaults** である。各ruleはYAML frontmatterで `applies-to: kamae-model-port` / `kamae-model-bridge` / `*` を指定する。

チーム固有の命名、ライブラリ選好、wire formatの例外をここに書いておくと、エージェントが一貫した判断をする。

## インストール

```bash
# Claude Code
claude skills add manji-0/agent-skill-modelconverter

# npx
npx @anthropic-ai/skills add manji-0/agent-skill-modelconverter
```

2つのSkillはセットで入る。タスクに応じてportかbridgeかを選ぶ。

## kamae ドキュメントとの関係

| レイヤ | 役割 |
| --- | --- |
| **kamae / kamae-py / kamae-rs / kamae-scala** | 各言語での idiomatic なドメイン設計（単一言語） |
| **kamae-model-translator** | 言語横断の写像・wire 規約（ポリグロット） |
| **rdra-ish**（任意） | 要件モデルから UC・API・状態レビュー、必要なら TLA+/TLC（上流） |

移植前にソース言語のkamaeスキルでモデル構造を把握し、port / bridgeスキルで写像ルールを当てる、という読み方が自然である。

## 使うべき場面 / 使わない場面

**向いているケース**

- kamaeで書いたサービスを別言語に **書き直す**（リライト、段階的移行）
- TS / Python / Rust / Scalaが混在する環境で **イベントや API 契約** を揃えたい
- 「このTSのdiscriminated unionをRustでどう表現するか」を **invariant 付き** で答えたい
- 契約テストやスキーマ進化の方針をkamaeの型設計と **整合** させたい

**向いていないケース**

- 単一言語内の実装・レビュー（各kamaeスキルで足りる）
- OpenAPI / Protobuf定義からの **機械的コード生成のみ**（本Skillは設計判断の参照）
- kamae原則を使わないレガシーコードのad hoc変換

## レビュー観点

portまたはbridgeの作業後、次を確認すると効果的である。

- **状態型**: 各variantにその状態専用のフィールドだけがあるか。optionalの「時々ある」フィールドで状態機械を壊していないか
- **ID 型**: 異なるID型の混同がコンパイル / 型チェックで防げるか
- **遷移**: 純粋関数として副作用なし。禁止遷移は型またはexhaustive matchで表現されているか
- **境界**: 信頼できない入力はDTOで検証し、`cast` / `unwrap` / 直接構築でbypassしていないか
- **PII**: ログ・serialize・`Debug` で資格情報が漏れないか
- **Wire（bridge）**: フィールド名・判別子・日時・金額がcanonical規約に一致するか
- **進化（bridge）**: スキーマ変更がbreaking/additiveのいずれかであることを明示し、契約テストが更新されているか
- **移植順序（port）**: 状態型より先に永続化層を書いていないか。workflowの段階を飛ばしていないか

kamae-model-translatorは自動変換ツールではない。**エージェントと人間が同じ写像表を参照し、ポリグロット環境でもドメイン invariant を失わない** ための共通言語である。移植はworkflowの段階を1つずつ閉じ、bridgeはwire規約と契約テストで境界を固定する運用が最も効く。
