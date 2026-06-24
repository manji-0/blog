---
title: "ドメインマクロ"
sidebar:
  order: 10
---

> **いつ読むか:** derive や内部 proc-macro で繰り返しパターンを符号化するか判断するとき。
> **関連:** [`domain-modeling.md`](/docs/kamae-rs/domain-modeling/)、[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/)、[`crate-guides.md#nutype`](/docs/kamae-rs/crate-guides/#nutype)。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./boundary-defense.md -->

## 型を先に、マクロは次

マクロは繰り返し安定したパターンを符号化するものであり、欠けているドメインモデリングを隠す道具ではない。derive または proc-macro crate を追加する前に、同型パターンが 3 つ以上あり、手書きコードが drift しうることを確認する。

マクロ向き:

- 共有検証メッセージ付き newtype `TryFrom`/`FromStr`
- `Clone`、`Debug`、安定 `name()`/`version()` が必要なドメイン event struct
- 単一検証 string/integer を包む ID newtype

マクロ向きでない:

- 一度きりのビジネスルール
- 型ごとに異なる検証
- 生成コード内の `unwrap` や panic の隠蔽

## 内部 proc-macro の前に既存 crate を使う

| ニーズ | 推奨 | 備考 |
| --- | --- | --- |
| 検証付き newtype | [`nutype`](/docs/kamae-rs/crate-guides/#nutype)、`garde`、`validator` | 不変条件をソースで可視に保つ |
| 単純 derive | `derive_more`、標準 `derive` | 透明 newtype、display ヘルパー |
| 繰り返し event メタデータ | 内部 `#[derive(DomainEvent)]` | event が同一形状を共有するときのみ |

チームがパターンを所有し、外部 crate が契約を表現できないとき、内部 proc-macro crate（例: `my_app_domain_macros`）を導入する。

## 推奨内部マクロパターン

### `#[derive(NewtypeDomainId)]`

不透明 ID newtype 向けに検証コンストラクタと変換を生成:

```rust
#[derive(NewtypeDomainId)]
#[newtype(validate = "trim_non_empty")]
pub struct RequestId(String);

// Expands to: new/try_new, as_str, TryFrom<String>, Display, Eq, Hash
```

検証関数はマクロ crate 内で小さく単体テストする。プロジェクトが明示的に leaf での serde+検証を受け入れない限り、ドメイン ID に `Deserialize` を生成しない（[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/) 参照）。

### `#[derive(DomainEvent)]`

outbox と projection パイプラインで使う event レコードを標準化:

```rust
#[derive(DomainEvent)]
#[event(name = "taxi.driver_assigned", version = 1)]
pub struct DriverAssigned {
    pub request_id: RequestId,
    pub driver_id: DriverId,
    pub occurred_at: OccurredAt,
}
```

生成コードは次を提供すべき:

- redaction 向けフィールド可視性付き `Clone`、`Debug`
- `fn name(&self) -> &'static str` と `fn version(&self) -> u32`
- projection handler 向け optional `TryFrom<StoredEventEnvelope>`

スキーマ進化ストーリーが文書化されていない限り、event payload に無制限 `Serialize`/`Deserialize` を derive しない（[`service-boundaries.md`](/docs/kamae-rs/service-boundaries/) 参照）。

## 繰り返し match アーム向け宣言マクロ

proc-macro が重いとき、`macro_rules!` ヘルパーで projection や error マッピングの重複を減らす:

```rust
macro_rules! domain_event_match {
    ($event:expr, {
        $($name:literal => $handler:expr,)*
        _ => $fallback:expr,
    }) => {{
        match $event.name() {
            $($name => $handler,)*
            other => $fallback(other),
        }
    }};
}
```

宣言マクロは event を所有する crate 内に留める。サービス境界越しに macro DSL を export しない。

## 生成コードのレビュー期待

- 生成 impl は `Default`、public フィールド、不変条件を迂回する黙示 coercion を追加しない。
- event と ID の `Debug` はログ安全のまま（[`logging-metrics.md`](/docs/kamae-rs/logging-metrics/) 参照）。
- 型の rustdoc に展開を記載: どの trait が derive され、構築時にどの検証が走るか。

## マクロを使わない場合

- フィールド横断検証（amount + currency、日付範囲ルール）
- state machine 遷移 — state struct 上の明示メソッドとして保つ
- インフラマッピング（`FromRow`、gRPC メッセージ）— 境界ルールをレビューで読めるよう明示 DTO `TryFrom` を使う

レビューでは、不変条件を隠すマクロ、ログ非安全な生成 `Debug` / `Display`、少数型向けの過剰な内部 proc-macro、バージョン欠如の永続イベント、ドメイン型へのマクロ生成 serde / ORM derive を指摘する。

## レビュー観点

### マクロはドメイン不変条件を隠していないか — High

public フィールド、`Default`、黙示的な強制、手書きドメインルールと異なる検証を追加する proc-macro や derive を指摘する。

### 生成された Debug / Display はログに安全か — High

[`logging-metrics.md`](/docs/kamae-rs/logging-metrics/) も照合する。PII やシークレットを露出しうる ID、イベント、ペイロードへの生成 `Debug` / `Display` を指摘する。

### イベントマクロはバージョンメタデータを保持しているか — Medium

デプロイをまたいで永続化、キューイング、消費されるドメインイベントに、安定した `name` / `version`（または同等）がない場合は指摘する。

### マクロ生成ドメイン型では Deserialize / FromRow derive を避けているか — Medium

[`boundary-defense.md`](/docs/kamae-rs/boundary-defense/) も照合する。プロジェクトが明示的なリーフ検証慣習を文書化していない限り、不変条件を持つドメイン型へのマクロ生成 serde や ORM derive を指摘する。

### マクロは繰り返しで正当化されているか — Low

1〜2 型のために `nutype`、`TryFrom`、明示 impl の方がレビューで明確なのに、新しい内部 proc-macro クレートを導入する箇所を指摘する。

