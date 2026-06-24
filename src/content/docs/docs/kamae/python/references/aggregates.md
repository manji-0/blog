---
title: "アグリゲートとトランザクション境界"
sidebar:
  order: 10
---

> **いつ読むか:** アグリゲートルートの選択、一貫性境界、楽観的/悲観的ロック、またはアグリゲート横断ワークフローを検討するとき。
> **関連:** [`persistence-events.md`](/docs/kamae/python/references/persistence-events/)、[`state-transitions.md`](/docs/kamae/python/references/state-transitions/)、[`error-handling.md`](/docs/kamae/python/references/error-handling/)。

## ここでのアグリゲートの定義

Kamae Python における**アグリゲート**は、次の単位である:

- 1 つの判別状態共用体（`TaxiRequest = Waiting | EnRoute | ...`）
- その共用体を変更する純粋遷移関数
- それらの遷移が発行するドメインイベント
- コマンドごとの 1 つの一貫性境界

**アグリゲートルート**は状態共用体を所有するアイデンティティである。タクシーの例では、`request_id` が `TaxiRequest` アグリゲートルートを識別する。

すべてのデータベーステーブルをアグリゲートとしてモデル化しない。1 コマンドで一貫性を保つ必要があるビジネス不変条件ごとに 1 ルートを優先する。

## 境界の内側と外側

| 1 アグリゲート内 | 外側 / 別アグリゲート |
| --- | --- |
| 同一ルートの状態バリアント | 独立したライフサイクルを持つ `Passenger`、`Driver`、`Payment`、`Invoice` |
| ルート状態が参照する値オブジェクト | ルックアップにのみ使われ、同一コマンドで変更されない外部キー |
| ルートの遷移が発行するイベント | 別ルートの状態変化を記述するイベント |

2 つのルートがすべてのコマンドで一緒に変わる必要があるなら、境界を小さくモデル化しすぎている可能性がある。マージするか、結果整合性を受け入れる。

```python
# Inside TaxiRequest aggregate
type TaxiRequest = Annotated[
    Waiting | EnRoute | InTrip | Completed | Cancelled,
    Field(discriminator="kind"),
]

# Separate aggregate: do not mutate inside assign_driver_use_case
class DriverAvailability(DomainModel):
    driver_id: UUID
    is_available: bool
```

アグリゲート横断ルールは、アプリケーションレイヤーのオーケストレーション、サガ、またはリアクティブハンドラーに属する。単一ルートの純粋遷移の内側には置かない。

## 1 ユースケース、1 アグリゲート、1 一貫性境界

デフォルトルール:

```text
HTTP/queue command
  -> use case (application)
       -> load one aggregate state
       -> authorize
       -> pure transition
       -> build domain events
       -> repository.save(state, events)   # single TX
```

ユースケースは、プロジェクトに明示的で文書化された例外がない限り、1 トランザクションで 2 つのアグリゲートルートを更新してはならない。2 つのルートを整合させる必要があるときは、次を優先する:

1. 第 2 アグリゲート向けの**ドメインイベント + ハンドラー**（結果整合性）
2. 補償ステップ付きの**プロセスマネージャー / サガ**
3. 真の不変条件が原子性を要求するときの**単一アグリゲートの再設計**

## トランザクションの所有者

**リポジトリアダプター**が `save(...)` のデータベーストランザクションを所有すべきである。ユースケースはビジネス上の順序を所有し、アダプターはコミット/ロールバックを所有する。

ポートメソッドにトランザクションの所有権を文書化する。パラメータは [`persistence-events.md`](/docs/kamae/python/references/persistence-events/#keep-repository-protocols-small) の**正規**ポートと一致する:

```python
class RequestStore(Protocol):
    async def save_en_route(...) -> None:
        """Persist state and outbox rows atomically.

        Opens the transaction, writes aggregate state, inserts events/outbox
        records, and commits. Raises on infrastructure failure or version conflict.
        """
        ...
```

テストが依然として原子性セマンティクスを強制するインメモリフェイクを使う場合を除き、`save_state` と `insert_events` を別々の公開リポジトリメソッドに分割しない。

`VersionConflict` をユースケースで `Err` にマップする — [`error-handling.md`](/docs/kamae/python/references/error-handling/#preferred-pattern-early-return) を参照。

## 楽観的 vs 悲観的並行性

| 戦略 | 使うとき | リポジトリシグナル |
| --- | --- | --- |
| **楽観的**（デフォルト） | ほとんどのライフサイクル遷移。競合は稀またはリトライ可能 | `expected_version`、条件付き `UPDATE`、一意制約 |
| **悲観的** | 在庫、残高、座席ホールド、強い競合 | `SELECT ... FOR UPDATE`、行ロック、シリアライザブル分離 |

楽観的ロックは frozen 状態モデルと相性が良い。バージョンを読み込み、純粋遷移を適用し、`expected_version` で保存する。

悲観的ロックはアダプターに属する。SQL ロックの詳細を純粋遷移関数に漏らさない。

## 不変条件: アプリケーション vs データベース

両方のレイヤーを維持する:

- **純粋遷移**は型と関数が明確に表現できるルールを強制する。
- **データベース制約**は並行性下でも存続すべきルールを強制する（`UNIQUE`、`CHECK`、外部キー、非負金額）。

アプリケーションチェックは良い `Err` 値を生成する。2 つのコマンドが競合するとき、データベース制約はバックストップである。

## アグリゲートサイズの指針

小さく始める。良いアグリゲートは:

- 明確なルート ID を持つ
- 小さな状態共用体を持つ
- 1 回のリポジトリ呼び出しで読み込み・保存できる
- 自身の履歴を記述するイベントを発行する

次のときにアグリゲートを分割する:

- 読み込み/保存が重くなりすぎる
- 無関係なライフサイクルが 1 つの blob モデルを共有している
- 異なるコマンドが異なる一貫性戦略を必要とする

アウトボックスと冪等性の詳細は [`persistence-events.md`](/docs/kamae/python/references/persistence-events/) を読む。
