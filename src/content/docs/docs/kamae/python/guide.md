---
title: "Kamae Python ガイド"
sidebar:
  order: 1
  label: "ガイド"
---

Kamae Python は、uv でプロジェクトを管理し、Pydantic v2 モデルでドメイン状態を記述し、`kind` で共用体を判別し、状態変更を純粋関数で表現するサーバーサイド Python 3.12+ の方針です。

## ステップ 0: 適用ルールの確認

他の作業に入る前に、優先順位の高い順にルールファイルを確認してください。

1. プロジェクトルートの `.claude/rules/*.md` と `.codex/rules/*.md`
2. `~/.claude/rules/*.md` と `~/.codex/rules/*.md`
3. リポジトリの `rules/defaults/*.md`（プラグインのデフォルト）

各ルールについて:

- YAML フロントマターを読み、`applies-to` が `kamae-py` または `*` のものだけを適用する
- `name` でグループ化する。上位ティアが下位ティアより優先され、同一ティア内ではファイル名の辞書順で最後のものが勝つ
- 残った `library-preference`、`convention`、`override` ルールをタスク全体で適用する

ルールの書式とチェック ID の一覧は [ルール](/docs/kamae/python/rules/) を参照してください。

## ステップ 1: Python コンテキストの把握

1. `pyproject.toml`、`.python-version`、`uv.lock`、Ruff/mypy/pyright/pytest の設定、フレームワーク、既存のドメインパターンを確認する
2. デフォルトは `.python-version` に 3.12.x または 3.13.x、`requires-python = ">=3.12,<3.14"`、uv 管理の `pydantic>=2,<3`。PEP 695 のジェネリックモデル（`TransitionOutcome[TState, TEvent]` など）を使う場合は Pydantic **2.11+** を推奨（[`state-transitions.md`](/docs/kamae/python/references/state-transitions/) 参照）
3. デフォルトは Pydantic v2 プラグイン付き mypy: `plugins = ["pydantic.mypy"]` と `[tool.pydantic-mypy]` 下の厳格プラグインフラグ
4. `uv add`、`uv add --dev`、`uv lock`、`uv run ...` を使う。リポジトリが既に標準化していない限り `pip`、`requirements.txt`、Poetry、Pipenv は導入しない
5. `pydantic` が無い、または 1.x の場合は既存コードの移行前に確認する。新規コードでは uv 経由で Pydantic v2 を追加する
6. Python 3.12+ の構文をそのまま使う: `A | B`、`match`、`typing.assert_never`（3.11+）、`typing.Self`（3.11+）、モダンな標準ライブラリの typing
7. 下記の原則と矛盾しない限り、既存のモジュール構成・命名・依存の選択に合わせる
8. 現在のタスクに必要なリファレンスだけを読む

## 読む順序

タスクに合ったパスを選び、記載順に読む。コードベースですでに適用済みのステップは飛ばしてよい。

### グリーンフィールドのドメイン作業

1. [`domain-modeling.md`](/docs/kamae/python/references/domain-modeling/)
2. [`state-transitions.md`](/docs/kamae/python/references/state-transitions/)
3. [`boundary-defense.md`](/docs/kamae/python/references/boundary-defense/) と [`error-handling.md`](/docs/kamae/python/references/error-handling/)
4. [`aggregates.md`](/docs/kamae/python/references/aggregates/) と [`persistence-events.md`](/docs/kamae/python/references/persistence-events/)
5. [`taxi-request`](/docs/kamae/python/examples/taxi-request/) — コンパクトなエンドツーエンド例
6. 仕上げ前に [`quality-gates.md`](/docs/kamae/python/references/quality-gates/)

### ブラウンフィールド移行

1. [`migration-strategy.md`](/docs/kamae/python/references/migration-strategy/)
2. [`boundary-defense.md`](/docs/kamae/python/references/boundary-defense/)
3. 永続化に ORM を使う場合は [`orm-adapters.md`](/docs/kamae/python/references/orm-adapters/)
4. 移行したワークフローごとにグリーンフィールドのパスを続ける

### オブザーバビリティと PII のみ

1. [`pii-protection.md`](/docs/kamae/python/references/pii-protection/)
2. [`loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/)
3. [`logging-metrics.md`](/docs/kamae/python/references/logging-metrics/)
4. オブザーバビリティのテストアサーションは [`test-data.md`](/docs/kamae/python/references/test-data/)

## 正規の例

新しいリファレンスに全文スニペットをコピーしない。代わりに次の**正規**定義へリンクする。

| トピック | 正規リファレンス |
| --- | --- |
| ハッピーパスのユースケース | [`state-transitions.md`](/docs/kamae/python/references/state-transitions/#keep-use-cases-thin) |
| 永続化エラーのマッピング | [`error-handling.md`](/docs/kamae/python/references/error-handling/#preferred-pattern-early-return) |
| リポジトリポート（本番） | [`persistence-events.md`](/docs/kamae/python/references/persistence-events/#keep-repository-protocols-small) |
| リポジトリポート（入門） | [`domain-modeling.md`](/docs/kamae/python/references/domain-modeling/#define-repository-ports-with-protocols) |
| エンドツーエンドコード | [`taxi-request`](/docs/kamae/python/examples/taxi-request/) |
| Mypy / Pydantic プラグイン設定 | [`domain-modeling.md`](/docs/kamae/python/references/domain-modeling/#configure-mypy-with-the-pydantic-plugin) |
| 品質ゲートのコマンド | [`quality-gates.md`](/docs/kamae/python/references/quality-gates/#baseline-commands) |

## 原則

### ドメインモデリング

集約状態、値オブジェクト、識別子、リポジトリプロトコル、Pydantic 判別共用体を定義するときは [`references/domain-modeling.md`](/docs/kamae/python/references/domain-modeling/) を読む。

デフォルトはリテラル `kind` フィールド付きの凍結 Pydantic v2 状態バリアントと、`Annotated[A | B, Field(discriminator="kind")]` の共用体。共用体形データのランタイムパーサーには `TypeAdapter` を使う。

プロセス内の軽量な値オブジェクトには、同ファイルの Pydantic と `dataclasses` / attrs の選択表を参照。名目的 ID ラッパーや `__init_subclass__` パターンは同ファイルの強化された値型セクションを参照。デコレータで I/O・キャッシュ・バリデーションを隠さず、純粋な遷移が明示的引数で受け取るようにする。

大規模モデル、高頻度エンドポイント、`model_construct` のトレードオフ、msgspec 風の境界シリアライザでバリデーションコストが問題になる場合は [`references/pydantic-performance.md`](/docs/kamae/python/references/pydantic-performance/) を読む。

### 状態遷移

遷移、ユースケース、ドメインイベント、網羅的分岐を実装するときは [`references/state-transitions.md`](/docs/kamae/python/references/state-transitions/) を読む。

各有効な遷移を、入力型が許可されるソース状態、戻り値型がターゲット状態である純粋関数として表現する。時刻・ID・乱数は引数として注入する。

### 境界防御

API ペイロード、DB 行、環境変数、ファイル、キューメッセージ、外部 SDK レスポンスを受け入れるときは [`references/boundary-defense.md`](/docs/kamae/python/references/boundary-defense/) を読む。

境界では Pydantic v2 で外部データをパースする。`typing.cast`、広い `Any`、未検証の dict アクセスで未知データをドメインモデルにしない。

### エラーハンドリング

ユースケースの失敗、HTTP レスポンスへのエラーマッピング、非同期 `Result` フロー、例外を投げるべきかの判断には [`references/error-handling.md`](/docs/kamae/python/references/error-handling/) を読む。

想定されるドメイン失敗は明示的かつユースケース固有に保つ。例外はフレームワーク境界、想定外のインフラ失敗、プログラマエラー用に留める。

### ログとメトリクス

ドメインオブジェクト、状態遷移、ユースケース、ドメインイベント周りのログ・メトリクス・トレースを追加するときは [`references/logging-metrics.md`](/docs/kamae/python/references/logging-metrics/) を読む。

相関 ID、アカウント ID、メトリクス安全な語彙を分ける許可リスト階層は [`references/loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) を参照。

デフォルトは OpenTelemetry でログ・メトリクス・トレース。主なエクスポートはコレクターへの OTLP。Prometheus `/metrics` などのプル型は任意。意味のあるメッセージ、対象ドメインオブジェクトの状態、ライフサイクルが変わる操作では遷移コンテキストをログに残す。メトリクス名は安定、ラベルは低カーディナリティに。可能ならドメインイベントからメトリクスを導出する。

### PII 保護

ドメインモデル、DTO、ログ、メトリクス、エラー、トレース、イベントに個人データ・認証情報・トークン・顧客識別フィールドが含まれる場合は [`references/pii-protection.md`](/docs/kamae/python/references/pii-protection/) を読む。

ログ・トレース・エラー・メトリクス・イベントに載せてよい ID の判断は [`references/loggable-identifiers.md`](/docs/kamae/python/references/loggable-identifiers/) を参照。

デフォルトでマスクする。平文露出は明示的かつアダプター固有にする。

### 永続化とイベント

リポジトリ、トランザクション、アウトボックスレコード、冪等コマンド、楽観的ロック、イベントペイロードを設計するときは [`references/persistence-events.md`](/docs/kamae/python/references/persistence-events/) を読む。

集約状態と発行イベントをアトミックに永続化する。DB が強制できる不変条件には DB 制約を追加する。

集約ルート、一貫性境界、楽観的 vs 悲観的ロック、集約横断ワークフローは [`references/aggregates.md`](/docs/kamae/python/references/aggregates/) を読む。

### アプリケーション配線

ユースケースとリポジトリポート、フレームワークのエントリポイント、フェイク、明示引数と DI コンテナの選択には [`references/application-wiring.md`](/docs/kamae/python/references/application-wiring/) を読む。

明示的な関数引数と `typing.Protocol` ポートを優先する。依存の配線はコンポジションルートだけで行う。

CPU バウンドのドメイン処理、GIL、`ProcessPoolExecutor`、asyncio イベントループのブロックが問題になる場合は [`references/concurrency.md`](/docs/kamae/python/references/concurrency/) を読む。

### インフラの耐障害性

外部 API・DB・キューアダプター周りのリトライ・タイムアウト・サーキットブレーカーを追加するときは [`references/infrastructure-resilience.md`](/docs/kamae/python/references/infrastructure-resilience/) を読む。

tenacity、サーキットブレーカー、クライアントタイムアウトはインフラモジュールに置く。リトライは [`references/persistence-events.md`](/docs/kamae/python/references/persistence-events/) の冪等キーと組み合わせる。

### 移行戦略

既存のクラスベースや ORM 中心のコードベースに Kamae Python を導入するときは [`references/migration-strategy.md`](/docs/kamae/python/references/migration-strategy/) を読む。

ワークフローを 1 つずつ移行する。すべてのサービスクラスを書き換える前に境界パースを改善する。

永続化エンティティと Pydantic ドメインモデル間の SQLAlchemy 2.0・Django ORM マッパーパターンは [`references/orm-adapters.md`](/docs/kamae/python/references/orm-adapters/) を参照。

### テストデータ

フィクスチャ、ファクトリ、プロパティベーステスト（Hypothesis）、遷移テスト、境界テスト、永続化リトライテストを追加するときは [`references/test-data.md`](/docs/kamae/python/references/test-data/) を読む。

テストは本番と同じコンストラクタ、Pydantic アダプター、遷移関数を通す。

### ネイティブと unsafe 境界

`ctypes`、`cffi`、ネイティブ拡張、生成バインディング、`model_construct`、広いキャスト、未検証バイトなど Python/Pydantic の不変条件を迂回しうるコードには [`references/unsafe-boundaries.md`](/docs/kamae/python/references/unsafe-boundaries/) を読む。

unsafe や未検証の操作はドメインロジックの外に置き、小さな検証済み API の背後に隠す。

### API 契約

公開ドメイン API、リポジトリプロトコル、遷移関数、DTO 変換、イベントスキーマ、安全ラッパーの文書化には [`references/api-contracts.md`](/docs/kamae/python/references/api-contracts/) を読む。

docstring には不変条件、受け入れ可能な構築経路、エラー、副作用、トランザクション期待、マスク動作を書く。

### 品質ゲート

ドメイン、境界、PII、永続化、テスト、サンプルコードを変更する前に [`references/quality-gates.md`](/docs/kamae/python/references/quality-gates/) を読む。

触れたコードには `uv run ruff format`、`uv run ruff check`、`uv run mypy`、焦点を絞った `uv run pytest` を優先する。

### 開発環境のセットアップ

Kamae Python スキルで作業・利用するローカルワークスペースの準備には [`references/development-setup.md`](/docs/kamae/python/references/development-setup/) を読む。

uv をインストールし、`uv python install` と `uv sync` を実行してから、コミット前にローカルの品質ゲート一式を走らせる。依存変更は別コミットにし、`uv.lock` を再生成する。

### ローカル検証のセットアップ

ローカルの `pyproject.toml`、`.gitignore`、mypy/Pydantic プラグイン設定、Ruff、pytest、スキルパッケージ検証のブートストラップには [`references/local-validation.md`](/docs/kamae/python/references/local-validation/) を読む。

[`assets/templates/`](/docs/kamae/python/assets/templates/) からテンプレートをコピーするには [`scripts/apply_templates.py`](https://github.com/manji-0/kamae-py/blob/main/scripts/apply_templates.py) を使うか、手動でマージする。リポジトリルートのファイルはスキルと一緒に必ずしもインストールされない。

ブートストラップ後は [`scripts/check_kamae_policy.py`](https://github.com/manji-0/kamae-py/blob/main/scripts/check_kamae_policy.py) でプロジェクトが Kamae Python の方針に沿っているか簡易確認する。デフォルトは助言的。警告をエラーにするには `--strict` を使う。

### CI セットアップ

GitHub Actions、ブランチ保護の指針、リポジトリ検証ジョブの作成・更新には [`references/ci-setup.md`](/docs/kamae/python/references/ci-setup/) を読む。

CI はローカル開発と同じ uv ベースの品質ゲートを実行し、ロックファイルのドリフトで失敗させる。

## 実践例

コンパクトなエンドツーエンド例が役立つときは [`taxi-request`](/docs/kamae/python/examples/taxi-request/) を読む。Pydantic v2 判別共用体、凍結状態モデル、純粋遷移、ドメインイベント、境界パースを示す。

## 方針の適用

判断を使う。既存コードベースに文書化された別パターンがあれば、境界バリデーションを弱めたり無効状態を表しやすくしたりしない限りそれに従う。新規コードでこれらの原則から外れる場合は、制約を短いコメントで説明する。

ブラウンフィールドでは、全面書き換えの前に [`references/migration-strategy.md`](/docs/kamae/python/references/migration-strategy/) から始める。

## 変更のレビュー

変更パスに対しては [レビューガイド](/docs/kamae/python/review/) を使う。周辺がレガシーでもよい。小さな差分では、まず `python skills/kamae-py-review/scripts/review_probe.py <paths>` を実行し、ルーティングされたチェックリストと、挙動が変わる場合は `tests.md` だけを読み込む。
