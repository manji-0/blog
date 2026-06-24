---
title: "マイグレーション戦略"
sidebar:
  order: 10
---

> **いつ読むか:** 既存のクラスベースまたは ORM 中心のコードベースに Kamae Python を導入するときに読む。
> **関連:** [`boundary-defense.md`](/docs/kamae-py/boundary-defense/)、[`orm-adapters.md`](/docs/kamae-py/orm-adapters/)、[`persistence-events.md`](/docs/kamae-py/persistence-events/)。

Kamae Python は到達状態を記述する。既存のクラスベースサービス、blob モデル、ORM 中心のコードは、ビッグバン書き換えなしで**段階的**にそこへ近づけられる。

デフォルトは **Strangler Fig** パターンである。新フローと高リスク領域を先に移行し、触れない安定レガシー経路はそのままにする。

## 原則

1. **製品作業を全面マイグレーションでブロックしない。**
2. **ビジネスルールを書き換える前に境界を改善する。**
3. **アグリゲートまたはワークフローを 1 つずつ移行する。**
4. **ユーザーが依存する振る舞いにテストを置く。**
5. **検証を弱めない限り、リポジトリの既存規約に従う。**

## 段階的ロールアウト

| フェーズ | 目標 | 典型的なタッチポイント | リスク |
| --- | --- | --- | --- |
| **0 — ベースライン** | uv、Ruff、mypy、触れたコードへの pytest | `pyproject.toml`、CI | 低 |
| **1 — 境界パース** | エッジで Pydantic により外部データを検証 | API DTO、DB 行モデル、キューペイロード | 低 |
| **2 — 状態形状** | 新規/変更フローで `status + Optional[...]` blob を判別共用体に置換 | 1 ワークフローのドメインモデル | 中 |
| **3 — 純粋遷移** | サービスメソッドからルールを名前付き関数へ | application/domain モジュール | 中 |
| **4 — ポート/アダプター** | ORM/SDK を `Protocol` ポートの背後に隠す | リポジトリ、クライアント | 中〜高 |
| **5 — 原子性永続化** | 状態 + イベントを一緒に保存、冪等性/バージョニング追加 | リポジトリアダプター、アウトボックス | 高 |
| **6 — 厳格ゲート** | mypy カバレッジ拡大、移行パスでポリシーチェッカー有効化 | CI、`files` 設定 | 継続 |

次フェーズをグローバルに完了する前にローカルで次を始める必要はない。1 ワークフロー内ではフェーズ順序を守る。

## フェーズ詳細

### フェーズ 1: まず境界パース

最低リスクの勝ち。最初は内部ドメインコードはそのまま。エッジで未検証データを止める。

```python
RequestRowAdapter = TypeAdapter(RequestRow)

def row_to_waiting(row: Mapping[str, object]) -> Waiting:
    dto = RequestRowAdapter.validate_python(row)
    return Waiting(...)
```

### フェーズ 2: レガシーモデルの横に判別共用体を導入

初日に古い `TaxiRequestService` クラスを削除しない。

```python
# New path
def assign_driver(waiting: Waiting, driver_id: UUID, now: datetime) -> EnRoute: ...

# Legacy wrapper during migration
class TaxiRequestService:
    def assign_driver(self, request_id: UUID, driver_id: UUID) -> None:
        row = self.repo.get(request_id)
        waiting = row_to_waiting(row)
        en_route = assign_driver(waiting, driver_id, datetime.now(UTC))
        self.repo.save(en_route.model_dump(mode="python"))
```

呼び出し側がユースケースへ移ったらラッパーを削除する。

### フェーズ 3: ユースケースを抽出

サービスメソッドをポートを受け取る非同期関数にする。完全実装: [`state-transitions.md`](/docs/kamae-py/state-transitions/#keep-use-cases-thin)。

```python
async def assign_driver_use_case(
    resolver: RequestResolver,
    store: RequestStore,
    request_id: UUID,
    driver_id: UUID,
    now: datetime,
) -> Result[EnRoute, AssignDriverError]:
    ...
```

コントローラーはユースケースを呼ぶ。レガシーサービスは削除まで委譲する。

### フェーズ 4: リポジトリプロトコル

SQLAlchemy/Django ORM クエリをアダプターモジュールへ移す。ユースケースが見るのはドメイン状態と明示的エラーのみであるべきだ。

`mapped_column` エンティティ、行 DTO、`domain_from_row_dto` マッパー、Django `select_for_update` 書き込みパターンは [`orm-adapters.md`](/docs/kamae-py/orm-adapters/) を読む。

### フェーズ 5: イベントとアウトボックス

監査、統合、非同期反応が必要なワークフローにだけドメインイベントを追加する。1 イベント型と 1 コンシューマーから始める。

## 共存ルール

新旧スタイルが共存している間:

- **新コード**は変更中のワークフローに Kamae Python に従う。
- **未変更レガシー**は即時マイグレーション不要。
- **混ぜない**: 同一アグリゲートの競合する真実の源として blob 状態モデルと判別共用体。
- **文書化**: 一時ラッパーに短いコメントを付け、可能なら同一エピックで削除する。

## 段階的型安全性

mypy カバレッジを徐々に拡大する:

```toml
[tool.mypy]
files = [
    "src/taxi_request",
    "tests/taxi_request",
]
```

移行したディレクトリを追加する。グローバル `--strict` の前に移行パッケージで `check_kamae_policy.py` を使う。

## してはいけないこと

- 1 垂直スライスを出す前にすべてのモデルを書き換える
- マイグレーションの見た目のためだけに DI フレームワークを導入する
- 境界が型付けされる前にすべてのレガシーメソッドに `Result` を強制する
- ワークフローがまだ CRUD だけ必要なのに、完全アウトボックス/イベントインフラでリリースをブロックする

## 1 ワークフロー移行の成功基準

- 外部入力が境界で Pydantic によりパースされる
- アグリゲート状態が frozen 判別共用体として表現される
- ビジネス遷移がテスト付き純粋関数である
- ユースケースが明示的エラーを返すか、インフラ失敗を明確にマップする
- リポジトリアダプターが必要なら状態を原子性保存する
- 可観測性が [`pii-protection.md`](/docs/kamae-py/pii-protection/) に従う

最初に移行するワークフローの選択は [`persistence-events.md`](/docs/kamae-py/persistence-events/) と [`application-wiring.md`](/docs/kamae-py/application-wiring/) を読む。

## レビュー観点

### 19.1 差分は全面書き換えの前に境界を改善しているか — Medium

触れたワークフローで DTO パース、状態型付け、エラーマッピングを先に締めずにレガシーサービスクラスを動かす大規模書き換えを指摘する。

### 19.2 互換シムは薄く一時的か — Low

利便のためドメインロジックを恒久的に二重化したり無効状態を保持したりする広いアダプター層を指摘する。

### 19.3 レガシーコードは明確に隔離されているか — Medium

文書化された境界なしに、新しい Kamae スタイルモジュールが旧層の型付きでない dict、可変グローバル、ORM エンティティに依存する箇所を指摘する。

### 19.4 移行はオブザーバビリティと PII 姿勢を保つか — High

移行経路が生ペイロードの旧ログを維持し、マスクを落とし、新設計で必要なトランザクション/アウトボックス保証を迂回する箇所を指摘する。

[`pii-protection.md`](/docs/kamae-py/pii-protection/) と [`persistence-events.md`](/docs/kamae-py/persistence-events/) と突き合わせる。
