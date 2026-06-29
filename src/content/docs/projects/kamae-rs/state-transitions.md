---
title: "状態遷移"
sidebar:
  order: 10
---

閉じた状態集合はenumと遷移メソッドで表し、非法遷移は型と `match` の網羅で落とす。遷移の内側で永続化やログを行うと、純粋性が失われ、テストや並行性の検討が難しくなる。

状態のデータ構造は [ドメインモデリング](/projects/kamae-rs/domain-modeling/)、保存とイベントは [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) に委ねる。

## ソース型で遷移を制約する

1つの状態だけが遷移できるときは、その特定の状態型を受け取る。広いenum全体を受け取らない。

```rust
pub struct WaitingRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
}

pub struct EnRouteRequest {
    request_id: RequestId,
    passenger_id: PassengerId,
    driver_id: DriverId,
}

impl WaitingRequest {
    pub fn assign_driver(self, driver_id: DriverId) -> EnRouteRequest {
        EnRouteRequest {
            request_id: self.request_id,
            passenger_id: self.passenger_id,
            driver_id,
        }
    }
}
```

非法ソースstateはコンパイル時に失敗する。

すべての前提が入力型に表れているときだけ、遷移を失敗しない（常に成功する）形にする。ソースstateや引数型から読み取れないデータに依存するルールがあるならドメインエラーを返す：

```rust
pub enum DomainError {
    DriverCannotServeAccessibilityRequest,
}

impl WaitingRequest {
    pub fn assign_driver(
        self,
        driver: DriverAssignment,
    ) -> Result<Transition<EnRouteRequest, TaxiRequestEvent>, DomainError> {
        if self.requires_accessible_vehicle && !driver.accepts_accessibility_requests {
            return Err(DomainError::DriverCannotServeAccessibilityRequest);
        }

        Ok(Transition {
            state: EnRouteRequest {
                request_id: self.request_id,
                passenger_id: self.passenger_id,
                driver_id: driver.driver_id,
            },
            events: vec![TaxiRequestEvent::DriverAssigned {
                request_id: self.request_id,
                driver_id: driver.driver_id,
                occurred_at: OccurredAt::now(),
            }],
        })
    }
}
```

`panic!`、`unwrap()`、「呼び出し側が先にチェック」コメントの裏に隠さない。コンパイラが前提を強制できないなら、失敗可能性をシグネチャに示す。

## `self` by value（所有権消費）の理由

state変更遷移で `&mut self` ではなく `self` を取る利点：

1. **旧 state を再利用できない。** `waiting.assign_driver(driver)` の後 `waiting` はmoveされ、再参照はコンパイルエラー。ランタイムフラグなしで二重割当バグを防ぐ。
2. **遷移は state 置換として読める。** 返却structが新しい真実。共有ハンドル上の隠れたmutationがない。
3. **永続化マッピングが容易。** ユースケースはmutable集約からcloneせず、所有 `EnRouteRequest` を `save_assigned` に渡せる。
4. **event ペアリングが明確。** `Transition { state, events }` を消費入力から一度構築。

`&mut self` を使うのは：

- 同一state内の小さなフィールド更新（ETA更新など）
- 単一save前にin-memory編集をバッチし、型システムがすでに非法stateを防いでいる（稀）

ライフサイクル移動（`Waiting` -> `EnRoute` -> `InTrip`）では `self` を優先。

## 境界では enum を使う

呼び出し側がすべての可能stateを保持、ロード、分岐するとき集約enumを使う。

```rust
pub enum TaxiRequest {
    Waiting(WaitingRequest),
    EnRoute(EnRouteRequest),
    InTrip(InTripRequest),
    Completed(CompletedRequest),
    Cancelled(CancelledRequest),
}
```

網羅的 `match` アームを使う。将来variantすべてに本当に不変でない限り、ドメインmatchで `_` を避ける。

集約境界を明示する。リクエスト集約を全体としてload/saveし、他集約参照はIDまたはスナップショットにとどめる。他集約のmutable stateを借りない。遷移は自集約の不変条件を守り、他の集約が所有する事実はユースケースかポリシー層で扱う。

## 複数遷移先

1ソースstateから複数targetへ行けるとき、単一struct型ではなくoutcome enumを返す。

```rust
pub enum WaitingExit {
    EnRoute(EnRouteRequest),
    Cancelled(CancelledRequest),
}

impl WaitingRequest {
    pub fn cancel(self, reason: CancellationReason) -> Transition<CancelledRequest, TaxiRequestEvent> {
        Transition {
            state: CancelledRequest {
                request_id: self.request_id,
                passenger_id: self.passenger_id,
                reason,
            },
            events: vec![/* ... */],
        }
    }
}

// Dispatcher at the use-case boundary when the command could branch:
pub enum WaitingTransition {
    Assigned(Transition<EnRouteRequest, TaxiRequestEvent>),
    Cancelled(Transition<CancelledRequest, TaxiRequestEvent>),
}
```

別メソッド（`assign_driver`、`cancel`）がそれぞれ `WaitingRequest` を消費する形でも同じcompile-time保証。1値につき1つだけ呼べる。

## 遷移結果を明示的に返す

遷移がeventを出すとき、隠れたstateをmutateせずoutcome structを返す。

```rust
pub struct Transition<TState, TEvent> {
    pub state: TState,
    pub events: Vec<TEvent>,
}
```

`TransitionOutcome<S, E>` は同趣旨。チームが最小型を好むならtype aliasまたはtuple `(S, Vec<E>)` でよい。

```rust
pub type TransitionOutcome<S, E> = (S, Vec<E>);

impl WaitingRequest {
    pub fn assign_driver(
        self,
        driver_id: DriverId,
        clock: &dyn Clock,
    ) -> Result<TransitionOutcome<EnRouteRequest, TaxiRequestEvent>, DomainError> {
        let occurred_at = clock.now();
        let state = EnRouteRequest { /* ... */ };
        let events = vec![TaxiRequestEvent::DriverAssigned { /* ... */, occurred_at }];
        Ok((state, events))
    }
}
```

ユースケースが結果を分解し、[永続化、集約、イベント](/projects/kamae-rs/persistence-events/) 経由で状態を保存し、イベントを発行する。遷移メソッド内のglobal bufferにeventを積まない。

state消費遷移では `self` by valueを優先。元stateを残す必要があるときだけborrow。

## テスト容易性: 時刻と乱数

`occurred_at` を打刻したり抽選結果を引く遷移は、テストで決定論が必要ならdomain内で `SystemTime::now()` や `thread_rng()` を直接呼ばない。

```rust
pub trait Clock {
    fn now(&self) -> OccurredAt;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> OccurredAt {
        OccurredAt::from_system_now()
    }
}

#[cfg(test)]
pub struct FixedClock(OccurredAt);

impl Clock for FixedClock {
    fn now(&self) -> OccurredAt {
        self.0
    }
}
```

遷移メソッドまたは小さなdomain serviceに `&dyn Clock` またはgeneric `C: Clock` を注入。乱数割当には `&mut dyn RngCore` またはport `fn draw_driver(&mut self, candidates: &[DriverId]) -> Option<DriverId>`。

テストは `FixedClock` およびseed付きRNGでevent payloadならびに順序をassert可能にする。

## ロードと dispatch

ロード後、集約enumをmatchしstate固有ロジックへ委譲：

```rust
pub fn assign_driver(
    request: TaxiRequest,
    driver_id: DriverId,
) -> Result<Transition<TaxiRequest, TaxiRequestEvent>, AssignDriverError> {
    match request {
        TaxiRequest::Waiting(waiting) => {
            let transition = waiting.assign_driver(driver_id)?;
            Ok(Transition {
                state: TaxiRequest::EnRoute(transition.state),
                events: transition.events,
            })
        }
        _ => Err(AssignDriverError::InvalidState),
    }
}
```

コマンドに対する非法ソースstateは境界matchで型付きエラー。panicではない。

## typestate と集約との関係

- **State struct + `self` 消費**: ライフサイクルが明確なサーバー側ドメイン層では、こちらをデフォルトとする
- **Typestate phantom marker**: フェーズ間で同じデータ形状だが操作が異なる。[ドメインモデリング](/projects/kamae-rs/domain-modeling/#typestate-with-phantom-types) を参照
- **集約トランザクション**: ユースケースがversion付き集約をload、純粋遷移、原子的save; [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) 参照


レビューでは、遷移が `&mut` と `status: String` で状態を書き換えることや、型で強制できる前提を `panic!` や `unwrap` に頼ることを指摘する。遷移内のglobal / staticバッファへのevent蓄積、テストseamなしの `OccurredAt::now()`、move意味論なしの同一ソース状態の二重使用も同様である。

## レビュー観点

### ミューテータは不変条件を保つか — High

クロスフィールドルール、ライフサイクル制限、合計、タイムスタンプ、所有権、テナントスコープに違反しうるセッターや部分更新メソッドを指摘する。

### 並行遷移は保護されているか — High

楽観的ロック、バージョンチェック、一意制約、冪等キー、シリアライザブルトランザクションなしに競合しうるライフサイクルや残高変更を指摘する。

バージョン付き保存とトランザクション境界の期待について [永続化、集約、イベント](/projects/kamae-rs/persistence-events/) も照合する。

### 認可とテナントチェックは遷移前に実施されているか — High

アクター、テナント、アカウント、能力の許可を証明する前に状態を遷移させるユースケースを指摘する。

### ドメインの match は網羅的で将来に強いか — Medium

各バリアントを明示的に扱うべきドメイン列挙型の `match` で `_` を使い将来のバリアントを隠している箇所を指摘する。

### 遷移は副作用が明示的でない限り純粋か — Medium

遷移メソッド内で永続化、ログ、メッセージ発行まで担う状態遷移を指摘する。状態とイベントを返し、副作用の調整はユースケースに任せることを提案する。

### 遷移関数は型でソース状態を制約しているか — Medium

特定の状態型を受け取れるのに、広い集約列挙型を受け取ってから実行時に状態を検査する関数を指摘する。

API、リポジトリ、シリアライズ、ディスパッチ境界の集約列挙型で、直ちに型付き状態ハンドラへ委譲する場合は指摘しない。

### 所有権で古い状態の再利用を防いでいるか — Low

遷移後にソース状態を使えなくすべき遷移では `self` を消費することを提案する。

