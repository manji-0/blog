---
title: "ドメインマクロ"
sidebar:
  order: 10
---

deriveやproc-macroは繰り返しパターンの**符号化**に使う道具であり、欠けているドメインモデリングを隠すためのものではない。同型が3つ以上あり、手書きがdriftしうるときだけ導入を検討する。

不変条件の本体は [ドメインモデリング](/projects/kamae-rs/domain-modeling/)、境界での検証は [境界防御](/projects/kamae-rs/boundary-defense/)、newtype生成は [クレートガイド（nutype）](/projects/kamae-rs/crate-guides/#nutype) と整合させる。

<!-- constrained-by ./domain-modeling.md -->
<!-- constrained-by ./boundary-defense.md -->

## 型を先に、マクロは次

具体的な判断基準は次のとおりである。

マクロ向き：

- 共有検証メッセージ付きnewtype `TryFrom`/`FromStr`
- `Clone`、`Debug`、安定 `name()`/`version()` が必要なドメインevent struct
- 単一検証string/integerを包むID newtype

マクロ向きでない：

- 一度きりのビジネスルール
- 型ごとに異なる検証
- 生成コード内の `unwrap` やpanicの隠蔽

## 内部 proc-macro の前に既存 crate を使う

| ニーズ | 推奨 | 備考 |
| --- | --- | --- |
| 検証付き newtype | [`nutype`](/projects/kamae-rs/crate-guides/#nutype)、`garde`、`validator` | 不変条件をソースで可視に保つ |
| 単純 derive | `derive_more`、標準 `derive` | 透明 newtype、display ヘルパー |
| 繰り返し event メタデータ | 内部 `#[derive(DomainEvent)]` | event が同一形状を共有するときのみ |

チームがパターンを所有し、外部crateが契約を表現できないとき、内部proc-macro crate（例： `my_app_domain_macros`）を導入する。

## 推奨内部マクロパターン

### `#[derive(NewtypeDomainId)]`

不透明ID newtype向けに検証コンストラクタと変換を生成：

```rust
#[derive(NewtypeDomainId)]
#[newtype(validate = "trim_non_empty")]
pub struct RequestId(String);

// Expands to: new/try_new, as_str, TryFrom<String>, Display, Eq, Hash
```

検証関数はマクロcrate内で小さく単体テストする。プロジェクトが明示的にleafでのserde+検証を受け入れない限り、ドメインIDに `Deserialize` を生成しない（[境界防御](/projects/kamae-rs/boundary-defense/) 参照）。

### `#[derive(DomainEvent)]`

outboxとprojectionパイプラインで使うeventレコードを標準化：

```rust
#[derive(DomainEvent)]
#[event(name = "taxi.driver_assigned", version = 1)]
pub struct DriverAssigned {
    pub request_id: RequestId,
    pub driver_id: DriverId,
    pub occurred_at: OccurredAt,
}
```

生成コードは次を提供すべき：

- redaction向けフィールド可視性付き `Clone`、`Debug`
- `fn name(&self) -> &'static str` と `fn version(&self) -> u32`
- projection handler向けoptional `TryFrom<StoredEventEnvelope>`

スキーマ進化ストーリーが文書化されていない限り、event payloadに無制限 `Serialize`/`Deserialize` をderiveしない（[サービス境界](/projects/kamae-rs/service-boundaries/) 参照）。

## 繰り返し match アーム向け宣言マクロ

proc-macroが重いとき、`macro_rules!` ヘルパーでprojectionやerrorマッピングの重複を減らす：

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

宣言マクロはeventを所有するcrate内に留める。サービス境界越しにmacro DSLをexportしない。

## 生成コードのレビュー期待

- 生成implは `Default`、publicフィールド、不変条件を迂回する黙示coercionを追加しない。
- eventとIDの `Debug` はログ安全のまま（[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/) 参照）。
- 型のrustdocに展開を記載： どのtraitがderiveされ、構築時にどの検証が走るか。

## マクロを使わない場合

- フィールド横断検証（amount + currency、日付範囲ルール）
- state machine遷移 — state struct上の明示メソッドとして保つ
- インフラマッピング（`FromRow`、gRPCメッセージ）— 境界ルールをレビューで読めるよう明示DTO `TryFrom` を使う

## レビューで見るところ

- proc-macroやderiveがpublicフィールド、`Default`、手書きと違う検証で不変条件を隠していないか。
- 生成 `Debug` / `Display` がPIIを漏らさないか（[ロギングとメトリクス](/projects/kamae-rs/logging-metrics/)）。
- 永続化されるイベントに安定した `name` / `version` があり、不変条件付きドメイン型へマクロ生成の `Deserialize` / `FromRow` を付けていないか（[境界防御](/projects/kamae-rs/boundary-defense/)）。
- 1〜2型なら `nutype` や `TryFrom` の方が明確でないかも見る。

