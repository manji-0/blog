---
title: "マイグレーション戦略"
sidebar:
  order: 10
---

既存のサービスクラスやORM中心のコードを一度に書き換えると、境界・永続化・観測性の穴が同時に広がる。Kamaeでは触れたワークフローごとに、パース → 型付き状態 → ポート分離 → 原子性永続化の順で段階的に締める。

最初の境界改善は [境界防御](/projects/kamae-py/boundary-defense/)、マッパー導入は [ORM アダプター](/projects/kamae-py/orm-adapters/)、コマンド単位の一貫性は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を参照する。

デフォルトは **Strangler Fig** パターンである。新フローと高リスク領域を先に移行し、触れない安定レガシー経路はそのままにする。

## 原則

1. **製品作業を全面マイグレーションでブロックしない。**
2. **ビジネスルールを書き換える前に境界を改善する。**
3. **集約またはワークフローを 1 つずつ移行する。**
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

全体で次のフェーズへ進む前に、別ワークフローで先に着手してよい。ただし1ワークフロー内ではフェーズ順序を守る。

## フェーズ詳細

### フェーズ 1: まず境界パース

リスクが最も低い改善である。最初の段階では内部のドメインコードはそのままにし、エッジで未検証データを止める。

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

サービスメソッドをポートを受け取る非同期関数にする。完全実装： [状態遷移](/projects/kamae-py/state-transitions/#ユースケースは薄く保つ)。

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

SQLAlchemy/Django ORMクエリをアダプターモジュールへ移す。ユースケースが扱うのはドメイン状態と明示的なエラーだけにすべきだ。

`mapped_column` エンティティ、行DTO、`domain_from_row_dto` マッパー、Django `select_for_update` 書き込みパターンは [ORM アダプター](/projects/kamae-py/orm-adapters/) を読む。

### フェーズ 5: イベントとアウトボックス

監査、統合、非同期反応が必要なワークフローにだけドメインイベントを追加する。1イベント型と1コンシューマーから始める。

## 共存ルール

新旧スタイルが共存している間：

- **新コード**は変更中のワークフローでKamae Pythonに従う。
- **未変更レガシー**は即時マイグレーション不要。
- **混ぜない**: 同一集約について、blob状態モデルと判別共用体を競合する真実の源として併用しない。
- **文書化**: 一時ラッパーに短いコメントを付け、可能なら同一エピックで削除する。

## 段階的型安全性

mypyカバレッジを徐々に拡大する：

```toml
[tool.mypy]
files = [
    "src/taxi_request",
    "tests/taxi_request",
]
```

移行したディレクトリを追加する。グローバル `--strict` の前に移行パッケージで `check_kamae_policy.py` を使う。

## してはいけないこと

次は移行が長期化しやすい典型パターンである。症状に心当たりがあれば、一度立ち止まってスライスを小さくする。

- 1垂直スライスを出す前にすべてのモデルを書き換える（「半年フリーズ」型の全面書き換え）
- マイグレーションの見た目のためだけにDIフレームワークを導入する
- 境界が型付けされる前にすべてのレガシーメソッドに `Result` を強制する
- ワークフローがまだCRUDだけ必要なのに、完全アウトボックス/イベントインフラでリリースをブロックする

## 1 ワークフロー移行の成功基準

「全体の移行が終わった」ではなく、**触った 1 ワークフローが観測可能に Kamae 準拠になった**ことを基準にする。次が揃えば、そのスライスはレビューと本番投入の候補になる。

- 外部入力が境界でPydanticによりパースされる
- 集約状態がfrozen判別共用体として表現される
- ビジネス遷移がテスト付き純粋関数である
- ユースケースが明示的エラーを返すか、インフラ失敗を明確にマップする
- リポジトリアダプターが必要なら状態を原子性保存する
- 可観測性が [PII と観測経路の保護](/projects/kamae-py/pii-protection/) に従う

最初に移行するワークフローの選択は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) と [アプリケーション配線](/projects/kamae-py/application-wiring/) を読む。

## レビューで見るところ

- 移行経路が旧ログの生ペイロードやマスク欠落、トランザクション/アウトボックス迂回を残していないか（[PII と観測経路の保護](/projects/kamae-py/pii-protection/)・[永続化、集約、イベント](/projects/kamae-py/persistence-events/)）。
- 新モジュールが旧の型なしdict・可変グローバル・ORMに依存していないかも見る。
- 全面書き換えの前にDTOパース・状態型付け・エラーマッピングを締めているか、互換シムが薄く一時的かも確認する。

