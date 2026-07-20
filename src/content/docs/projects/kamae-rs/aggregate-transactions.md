---
title: "集約とトランザクション境界"
sidebar:
  order: 10
---

1つの集約ルートが一緒に変わるべき不変条件を所有する。ユースケースはその集約を読み、純粋遷移を走らせ、ストレージが許すなら1つのトランザクション境界で結果を永続化する。

状態の型と純粋遷移は [状態遷移](/projects/kamae-rs/state-transitions/) と [ドメインモデリング](/projects/kamae-rs/domain-modeling/)、保存とイベントは [永続化、集約、イベント](/projects/kamae-rs/persistence-events/)、配線は [アプリケーション配線](/projects/kamae-rs/application-wiring/) を参照する。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./state-transitions.md -->
<!-- constrained-by ./persistence-events.md -->
<!-- constrained-by ./application-wiring.md -->

## 既定のスタンス

クロス集約のルールはID、スナップショット、ドメインイベント、後続ユースケースで扱う。メモリ上で2ルートを変異し、呼び出し元が両方保存することを期待しない。

## 集約ルートの表し方

集約ごとに主表現を1つ選ぶ：

- **状態struct族** — 型付き遷移（`WaitingRequest`、`EnRouteRequest`、…）
- **集約enum** — ロード/保存とディスパッチ（`TaxiRequest`）
- **ルートstruct** — 1エンティティがライフサイクルを明確に所有し、子値オブジェクトに独立mutation経路がないとき

ルートだけが集約不変条件を変えてよい。子はルートメソッドや消費する状態遷移経由で更新し、外部から直接変異しない。

## ユースケースがトランザクション境界を所有する

ユースケースが次の並びを所有する：

```text
begin/load -> authorize -> transition (pure) -> save state + events -> commit
```

ドメインコードはトランザクションを開始・コミットしない。ポートが操作を公開し、adapterがアトミックに実装する。

```rust
pub async fn execute(&self, cmd: AssignDriverCommand) -> Result<(), AssignDriverError> {
    let waiting = self.load_waiting(&cmd.request_id).await?;
    self.authorize(&cmd.actor, &waiting)?;

    let transition = waiting
        .assign_driver(cmd.driver)
        .map_err(AssignDriverError::Domain)?;

    self.store
        .save_assigned(&transition.state, &transition.events)
        .await?;

    Ok(())
}
```

状態とアウトボックス/イベント行の一貫性が必要なら、`save_*` ポートが同一DBトランザクションで両方書く。詳細は [永続化、集約、イベント](/projects/kamae-rs/persistence-events/)。

## 楽観的並行性が既定

競合しうる集約には単調な `version` または `updated_at` チェックをルートに付ける。ロードが現行versionを返し、セーブが古い書き込みを拒否する。

```rust
pub struct Versioned<T> {
    pub value: T,
    pub version: AggregateVersion,
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("concurrent modification for request {request_id}")]
    ConcurrentModification { request_id: RequestId },
}
```

典型フロー:

1. `Versioned<WaitingRequest>` をロード
2. `value` 上で純粋遷移
3. `expected_version = version` でセーブ
4. 0行更新やversion不一致を `ConcurrentModification` にマップ

競合は型付きユースケースエラーとして露出する。呼び出し元がリトライや409にできる。

## 悲観ロックは狭く使う

`SELECT … FOR UPDATE` や行ロックは、楽観リトライが危険または高すぎる短い臨界区間向けである。在庫予約、座席ホールド、台帳記帳などが該当する。

ルール：

- ロックはadapterトランザクション内で取得し、ドメインコードでは取らない
- ロック区間は小さくする。ランタイムとプール方針が明示設計されていない限り、`.await` をまたいで保持しない
- SQL詳細を上に漏らさず、`reserve_inventory_for_update` のようなドメイン固有ポートを優先する

## 神集約なしでクロス集約を調整する

1コマンドが複数ルートに触れるとき：

| 状況 | 好ましいアプローチ |
| --- | --- |
| 1ルートが決定を所有し、他は事実だけ必要 | IDでスナップショットやリードモデルを読む |
| 両方変え、片方失敗でもう片方もロールバック必須 | 単一ユースケース、明示順序、saga/outbox、または対応DBなら1トランザクション |
| 結果整合でよい | ドメインイベント + 下流consumer |

クロス集約のオーケストレーションをrepository adapterに隠さない。ユースケースが業務ステップに名前を付ける。

## 冪等性は境界の近くに置く

HTTPクライアント、キューconsumer、アウトボックスプロセッサなどリトライしうるコマンドは `CommandId` または冪等キーを持つ。状態変更と一緒に、またはdedupe表に永続化し、重複配信で遷移を二重適用しない。

冪等性はトランザクション物語の一部であり、ハンドラの後付けではない。[テストデータ](/projects/kamae-rs/test-data/) も参照。

## レビューで見るところ

1ユースケースがアトミックな作業単位を調整しているか。無関係な呼び出し元から状態保存・イベント発行を担わせていないか。version/CASなしの競合書き込みや、集約ルートを迂回する変更はないか。楽観で足りるのに広い悲観ロックを `.await` またぎで取っていないかも見る。冪等キーなしの二重適用は境界で塞がれているか。
