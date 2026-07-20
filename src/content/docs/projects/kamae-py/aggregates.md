---
title: "集約とトランザクション境界"
sidebar:
  order: 10
---

集約は「1コマンドで一貫させたい不変条件」の単位である。境界を広げすぎるとトランザクションが重くなり、狭すぎると集約横断の整合がイベントとオーケストレーションに押し出される。

状態の形は [状態遷移](/projects/kamae-py/state-transitions/)、保存とoutboxは [永続化、集約、イベント](/projects/kamae-py/persistence-events/)、失敗の返し方は [エラーハンドリング](/projects/kamae-py/error-handling/) を参照する。

## ここでの集約の定義

Kamae Pythonにおける**集約**は次の単位である：

- 1つの判別state共用体（`TaxiRequest = Waiting | EnRoute | ...`）
- その共用体を変える純粋遷移関数
- 遷移が出すドメインイベント
- 1コマンドあたり1つの整合境界

**集約ルート**はstate共用体を所有する識別子である。タクシー例では `request_id` が `TaxiRequest` のルートを指す。

すべてのDBテーブルを集約にしない。1コマンドで一貫させるビジネス不変条件ごとにルートを1つ選ぶ。

## 境界の内側と外側

| 1集約の内側 | 外側 / 別集約 |
| --- | --- |
| 同一ルートのstate variant | 独立ライフサイクルの `Passenger`、`Driver`、`Payment`、`Invoice` |
| ルートstateが参照する値オブジェクト | 参照のみの外部キー（同一コマンドで変更しない） |
| ルート遷移が出すイベント | 別ルートの状態変化を記述するイベント |

2つのルートが毎コマンドで一緒に変わる必要があるなら、境界が小さすぎる。統合するか、結果整合を受け入れる。

```python
# TaxiRequest 集約の内側
type TaxiRequest = Annotated[
    Waiting | EnRoute | InTrip | Completed | Cancelled,
    Field(discriminator="kind"),
]

# 別集約: assign_driver_use_case 内では変更しない
class DriverAvailability(DomainModel):
    driver_id: UUID
    is_available: bool
```

集約横断ルールはアプリケーションオーケストレーション、saga、反応型handlerに置く — 単一ルートの純粋遷移の中ではない。

## 1ユースケース、1集約、1整合境界

デフォルト：

```text
HTTP/queue command
  -> use case (application)
       -> load one aggregate state
       -> authorize
       -> pure transition
       -> build domain events
       -> repository.save(state, events)   # single TX
```

ユースケースが1トランザクションで2つの集約ルートを更新しない — 文書化された例外がない限り。2ルートを揃える必要があるときは：

1. **ドメインイベント + handler** で第二集約を更新（結果整合）
2. **プロセスマネージャ / saga** と補償ステップ
3. 真の不変条件が原子性を要求するなら**単一集約への再設計**

## トランザクションの所有者

**リポジトリアダプタ**が `save(...)` のDBトランザクションを所有する。ユースケースはビジネス順序、アダプタはcommit/rollbackを担当する。

portメソッドにトランザクション所有を文書化する。パラメータは [永続化、集約、イベント](/projects/kamae-py/persistence-events/) の正規portに合わせる：

```python
class RequestStore(Protocol):
    async def save_en_route(...) -> None:
        """Persist state and outbox rows atomically.

        Opens the transaction, writes aggregate state, inserts events/outbox
        records, and commits. Raises on infrastructure failure or version conflict.
        """
        ...
```

`save_state` と `insert_events` を別の公開リポジトリメソッドに分けない — インメモリfakeでも原子性を保つテスト用途を除く。

`VersionConflict` はユースケースで `Err` にマップ — [エラーハンドリング](/projects/kamae-py/error-handling/) を参照。

## 楽観的ロックと悲観的ロック

| 戦略 | 使うとき | リポジトリ信号 |
| --- | --- | --- |
| **楽観的**（デフォルト） | 多くのライフサイクル遷移。競合は稀またはリトライ可 | `expected_version`、条件付き `UPDATE`、一意制約 |
| **悲観的** | 在庫、残高、座席ホールド、強い競合 | `SELECT ... FOR UPDATE`、行ロック、serializable分離 |

楽観的ロックは凍結stateモデルと相性がよい：版を読み込み、純粋遷移を適用し、`expected_version` 付きで保存する。

悲観的ロックはアダプタに属する。SQLロックの詳細を純粋遷移へ漏らさない。

## 不変条件: アプリケーションとDB

両方を保つ：

- **純粋遷移** — 型と関数で明確に表せるルール
- **DB制約** — 並行でも守る必要があるルール（`UNIQUE`、`CHECK`、外部キー、非負金額）

アプリケーション検査は良い `Err` を返す。DB制約は2コマンドが競合したときの最後の防波堤である。

## 集約サイズの指針

小さく始める。良い集約は：

- 明確なルートIDがある
- state共用体が小さい
- 1回のリポジトリ呼び出しで読み書きできる
- 自身の履歴を記述するイベントを出す

次のときに分割を検討する：

- load/saveが重くなった
- 無関係なライフサイクルが1つのblobモデルを共有している
- コマンドごとに異なる整合戦略が必要

outboxと冪等性の詳細は [永続化、集約、イベント](/projects/kamae-py/persistence-events/) を読む。

## レビューで見るところ

1ユースケースが1トランザクションで2ルートを更新していないか。状態とイベントがoutbox等でアトミックに永続化されているか。集約ルートを迂回する直接更新はないか。楽観的版管理なしの競合書き込みはないか。悲観的ロックがドメイン遷移に漏れていないか。DB制約と狭いリポジトリ `Protocol` がアプリケーション検査を補完しているか。
