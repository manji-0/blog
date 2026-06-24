---
title: "Kamae Python レビュー"
sidebar:
  order: 3
  label: "レビュー"
---

[ガイド](/docs/kamae/python/guide/) のナレッジベースに照らして Python コードをレビューします。スタイルより、バグ・無効状態・データ漏洩・テスト不足を優先してください。

## ステップ 0: 適用ルールの確認

優先順位の高い順にルールファイルを確認します。

1. プロジェクトルートの `.claude/rules/*.md` と `.codex/rules/*.md`
2. `~/.claude/rules/*.md` と `~/.codex/rules/*.md`
3. リポジトリの `rules/defaults/*.md`

`applies-to` が `kamae-py-review` または `*` でないルールはスキップします。`check-toggle` で `enabled: false` のチェックは無効です。`convention` ルールはレビュー期待値を変えます。

## レビュー手順

1. [ガイド](/docs/kamae/python/guide/) を読む
2. `pyproject.toml`、`.python-version`、`uv.lock`、および `references/` 配下の関連リファレンスを読む
3. 利用可能ならリポジトリルートから `python3 skills/kamae-py-review/scripts/review_probe.py <変更された Python パス>` を実行する。出力はレビューの手がかりであり、確定した指摘ではない
4. レビュー対象の Python ファイルを読む
5. チェックリストの範囲を選ぶ:
   - フルな批判的レビュー: 下記チェックリストを順にすべてたどる
   - 小さく焦点を絞った差分: ルーティング行列に一致するチェックリストのみ、挙動が変わる場合は `tests.md` を追加
6. 指摘は重大度順に先に報告する。`path:line`、リスク、原則リファレンス、根拠、具体的な修正案を含める

指摘の例:

```text
High — src/application/assign_driver.py:42
Principle: error-handling §Keep Expected Failures Explicit
Evidence: `waiting = repo.get_waiting(request_id); waiting.driver_id = driver_id` mutates a frozen domain model through a broad dict fallback when the row is missing.
Fix: load through `TypeAdapter`, reject missing rows with `AssignDriverError.request_not_found`, and call `assign_driver(waiting, driver_id, now)` instead of mutating fields.
```

## ドキュメントマップ

チェックリスト項目番号（`N.M`）は下記チェックリストの順序と一致します。各チェックリストは `references/` 配下のトピックガイドにリンクします。

| # | チェックリスト | トピックガイド |
| --- | --- | --- |
| 1 | `domain-modeling.md` | `domain-modeling.md` |
| 2 | `state-transitions.md` | `state-transitions.md` |
| 3 | `error-handling.md` | `error-handling.md` |
| 4 | `boundary.md` | `boundary-defense.md` |
| 5 | `pii-protection.md` | `pii-protection.md` |
| 6 | `logging-metrics.md` | `logging-metrics.md` |
| 7 | `unsafe-boundaries.md` | `unsafe-boundaries.md` |
| 8 | `quality-gates.md` | `quality-gates.md` |
| 9 | `api-contracts.md` | `api-contracts.md` |
| 10 | `ci-setup.md` | `ci-setup.md` |
| 11 | `development-setup.md` | `development-setup.md` |
| 12 | `persistence-events.md` | `persistence-events.md` |
| 13 | `aggregates.md` | `aggregates.md` |
| 14 | `application-wiring.md` | `application-wiring.md` |
| 15 | `concurrency.md` | `concurrency.md` |
| 16 | `infrastructure-resilience.md` | `infrastructure-resilience.md` |
| 17 | `orm-adapters.md` | `orm-adapters.md` |
| 18 | `pydantic-performance.md` | `pydantic-performance.md` |
| 19 | `migration-strategy.md` | `migration-strategy.md` |
| 20 | `tests.md` | `test-data.md` |

## レビュープローブ

任意のプローブ [`review_probe.py`](https://github.com/manji-0/kamae-py/blob/main/scripts/review_probe.py) は、Kamae チェックリストへよくルーティングされるパターン（ネイティブ/未検証境界、リント抑制、暗黙の時刻/乱数、Pydantic 迂回、PII 用語、永続化/イベントコード、asyncio の運用リスク、docstring 契約の欠落）を Python ファイルからスキャンします。

プローブ出力は何を詳しく見るかの選択にだけ使う。到達可能な不変条件違反、漏洩、健全性リスク、プロジェクト方針違反をコードで確認するまで指摘として報告しない。

## レビュールーティング行列

| 差分のシグナル | 読み込むチェックリスト |
| --- | --- |
| 新規/変更されたドメイン型、値オブジェクト、Pydantic 状態、コンストラクタ、ミューテータ、金額/時刻/単位フィールド | `domain-modeling.md`、`state-transitions.md`、`tests.md` |
| 状態機械の遷移、ライフサイクル/ステータス変更、楽観的ロック、コマンドハンドラ | `state-transitions.md`、`aggregates.md`、`persistence-events.md`、`tests.md` |
| 例外、Result 値、ドメインエラー列挙、インフラエラーマッピング | `error-handling.md`、`tests.md` |
| `async def` ユースケース、`await`、ポート呼び出し、await をまたぐロック | `error-handling.md`、`application-wiring.md`、`concurrency.md`、`tests.md` |
| ユースケース関数/クラス、ハンドラ配線、リポジトリプロトコル、アダプター注入 | `application-wiring.md`、`persistence-events.md`、`tests.md` |
| HTTP/キュー/CLI/設定/DB 入力、DTO、`TypeAdapter`、ORM 行マッピング | `boundary.md`、`domain-modeling.md`、`orm-adapters.md`、`tests.md` |
| PII/シークレット/トークン、ログ、トレース、メトリクス、エラー、`repr`/`str` | `pii-protection.md`、`logging-metrics.md`、`tests.md` |
| `ctypes`、`cffi`、ネイティブ拡張、`model_construct`、広いキャスト、未検証バイト | `unsafe-boundaries.md`、`boundary.md`、`tests.md` |
| Ruff、mypy/pyright、`# type: ignore`、`noqa`、pytest ゲート、CI 品質チェック | `quality-gates.md`、関連チェックリスト、`tests.md` |
| docstring、公開 API 契約、リポジトリプロトコル文書、イベントスキーマ | `api-contracts.md`、関連チェックリスト、`tests.md` |
| CI ワークフロー、必須チェック、GitHub Actions、uv/ruff/mypy/pytest ジョブ、助言チェック | `ci-setup.md`、`quality-gates.md`、`tests.md` |
| 開発環境、フェイクポート、ローカルテストループ、docker-compose、`.env.example` | `development-setup.md`、`application-wiring.md`、`tests.md` |
| リポジトリ、トランザクション、DB 制約、アウトボックス/イベント、リトライ/冪等性 | `persistence-events.md`、`aggregates.md`、`state-transitions.md`、`tests.md` |
| SQLAlchemy/Django ORM エンティティ、行マッパー、セッション利用 | `orm-adapters.md`、`boundary.md`、`persistence-events.md`、`tests.md` |
| CPU バウンド処理、GIL、`ProcessPoolExecutor`、asyncio イベントループのブロック | `concurrency.md`、`application-wiring.md`、`tests.md` |
| 外部 API/DB/キュー周りの tenacity リトライ、サーキットブレーカー、クライアントタイムアウト | `infrastructure-resilience.md`、`persistence-events.md`、`tests.md` |
| `model_construct`、バリデーションオーバーヘッド、msgspec 境界シリアライザ | `pydantic-performance.md`、`boundary.md`、`tests.md` |
| レガシーサービスクラス、段階的移行、互換シム | `migration-strategy.md`、`boundary.md`、`tests.md` |
| `hypothesis`、プロパティテスト、フィクスチャ、ファクトリ、遷移表 | `tests.md`、関連ドメインチェックリスト |
| テスト専用ヘルパー、ビルダー、フィクスチャ、マスクアサーション | `tests.md` |

関心がまたがる差分では近いチェックリストも使う。汎用アドバイスを繰り返すために無関係なファイルは読み込まない。

## チェックリストの順序

- [`checklist/domain-modeling.md`](/docs/kamae/python/review/checklist/domain-modeling/)
- [`checklist/state-transitions.md`](/docs/kamae/python/review/checklist/state-transitions/)
- [`checklist/error-handling.md`](/docs/kamae/python/review/checklist/error-handling/)
- [`checklist/boundary.md`](/docs/kamae/python/review/checklist/boundary/)
- [`checklist/pii-protection.md`](/docs/kamae/python/review/checklist/pii-protection/)
- [`checklist/logging-metrics.md`](/docs/kamae/python/review/checklist/logging-metrics/)
- [`checklist/unsafe-boundaries.md`](/docs/kamae/python/review/checklist/unsafe-boundaries/)
- [`checklist/quality-gates.md`](/docs/kamae/python/review/checklist/quality-gates/)
- [`checklist/api-contracts.md`](/docs/kamae/python/review/checklist/api-contracts/)
- [`checklist/ci-setup.md`](/docs/kamae/python/review/checklist/ci-setup/)
- [`checklist/development-setup.md`](/docs/kamae/python/review/checklist/development-setup/)
- [`checklist/persistence-events.md`](/docs/kamae/python/review/checklist/persistence-events/)
- [`checklist/aggregates.md`](/docs/kamae/python/review/checklist/aggregates/)
- [`checklist/application-wiring.md`](/docs/kamae/python/review/checklist/application-wiring/)
- [`checklist/concurrency.md`](/docs/kamae/python/review/checklist/concurrency/)
- [`checklist/infrastructure-resilience.md`](/docs/kamae/python/review/checklist/infrastructure-resilience/)
- [`checklist/orm-adapters.md`](/docs/kamae/python/review/checklist/orm-adapters/)
- [`checklist/pydantic-performance.md`](/docs/kamae/python/review/checklist/pydantic-performance/)
- [`checklist/migration-strategy.md`](/docs/kamae/python/review/checklist/migration-strategy/)
- [`checklist/tests.md`](/docs/kamae/python/review/checklist/tests/)

## 重大度クラス

- High: 実行時失敗の可能性、無効状態の許容、未検証の外部データ、PII 漏洩
- Medium: 弱いドメイン契約、非網羅的なエラー/状態処理、永続化の一貫性リスク
- Low: 保守性、イディオム、即座に正しさを損なわないテスト品質の問題

差分が外部境界、認可/テナント分離、金額、不可逆ライフサイクル遷移、永続化/イベントのアトミシティ、シークレット、ネイティブ健全性、FFI、誤解を招く公開 API 文書、壊れたドメインコードをマージしうる CI ゲート、正しさリスクを隠すリント抑制、本番オブザーバビリティに触れる場合はエスカレートする。型チェックで封じ込められている、テストのみ、起動時のみ、信頼できるアダプター内部、生成コード、非公開ヘルパーの docstring、助言的 CI、フラグ行から見えない近傍の不変条件でブロックされる場合は格下げする。現実的な呼び出し元が悪い状態や漏洩に到達できる根拠がない限り指摘しない。

必要な根拠:

- 臭いだけでなく、迂回経路または欠けているガードを示す
- 破られている不変条件またはドメインルールを名指しする
- 既存のコンストラクタ、バリデータ、DB 制約、認可チェック、テストがすでにカバーしているか確認する
- 推測のスタイル指摘より「問題なし」を優先する

問題がなければ明確にそう述べ、残存リスクやテストギャップに触れる。
