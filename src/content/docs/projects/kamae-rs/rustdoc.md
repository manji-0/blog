---
title: "公開 API のドキュメント"
sidebar:
  order: 10
---

公開ドメインAPIのrustdocは実装メモではなく**契約**である。不変条件、有効入力、`# Errors`、`# Panics`、`# Safety` を書かないと、型は正しくても誤用がレビューをすり抜ける。

型設計は [ドメインモデリング](/projects/kamae-rs/domain-modeling/)、unsafeの隔離は [unsafe 境界](/projects/kamae-rs/unsafe-boundaries/)、チェックの自動化は [品質ゲート](/projects/kamae-rs/quality-gates/) と整合させる。

## 基本方針

rustdocは実装の説明ではなくドメイン契約を文書化する。公開ドメインAPIでは呼び出し側が依存できることを説明する： 不変条件、有効な構築経路、遷移ルール、エラー、副作用、安全境界。

長いモジュール解説より、公開アイテムごとの簡潔なドキュメントを優先する。微妙な不変条件を型で表すprivate helperを除き、すべてにrustdocを書く必要はないことが多い。

## 文書化する対象

公開itemのうち、呼び出し元が**依存してよい振る舞い**を説明する。実装の写しや名前の繰り返しは契約にならない。次がドメインまたはadapter契約の一部であるとき、rustdocを書く。

- Newtypeとvalue object: 意味、検証ルール、単位、範囲、プライバシー/redaction期待
- コンストラクタと `TryFrom`/`FromStr`: 受理/拒否入力とerrorバリアント
- State structおよびenum: 有効ライフサイクルstate、各variantがいつ生成されるか
- 遷移メソッド： ソースstate、ターゲットstate、前提、発行event、失敗モード
- Repository trait: トランザクション期待、一貫性保証、idempotency、errorマッピング
- DTO変換関数： 外部形状の仮定と検証境界
- Unsafe wrapper: safe API保証と `unsafe fn` の `# Safety` 契約

名前の繰り返しだけのdocsは避ける：

```rust
/// Creates a request id.
pub fn new(value: String) -> Result<RequestId, RequestIdError> { ... }
```

契約指向のdocsを優先：

```rust
/// A non-empty identifier for a taxi request.
///
/// `RequestId` is created only after boundary validation. Empty or whitespace-only
/// input returns [`RequestIdError::Empty`].
pub struct RequestId(String);
```

## 関連するときの必須セクション

具体的契約価値がある標準rustdoc見出し：

- 呼び出し側がvariantを扱う必要がある `Result` 関数向け `# Errors`
- 本番でpanicしうる関数向け `# Panics`
- すべての `unsafe fn`、`unsafe trait`、呼び出し側が守るunsafe契約向け `# Safety`
- 誤用しやすいconstructor、遷移、DTO変換向け `# Examples`

空の定型セクションは付けない。panicがなければ `# Panics` は不要。

## 例と doctest

可能ならコンパイルする例を示し、privateフィールド近道ではなく安全な構築経路を示す。

crate setup、外部サービス、feature flag、意図的compile failが必要な例は適切なrustdoc fenceを使う：

```rust
/// ```no_run
/// # async fn example(repo: impl RequestStore) -> Result<(), RepositoryError> {
/// #   Ok(())
/// # }
/// ```
```

重要なtype-state保証には `compile_fail` 例を控えめに。小さく安定させる。

### doctest の error handling

呼び出し側が `Result` variantをどう扱うか示す — doctestも失敗経路の契約。

```rust
/// ```
/// use booking_domain::RequestId;
///
/// let id = RequestId::new("req-1".into())?;
/// assert_eq!(id.as_str(), "req-1");
/// # Ok::<(), booking_domain::RequestIdError>(())
/// ```
```

ルール：

- fallible doctestは `# Ok::<(), ErrorType>(())` で終え、例内で `?` を使える
- 1例1 happy path。error variantは `# Errors` とenum variantリンクで
- `compile_fail` は失敗行を最小に（例： 誤ったstate型への遷移呼び出し）

```rust
/// # Errors
///
/// Returns [`AssignDriverError::InvalidState`] when the request is not waiting.
```

panic指向APIを明示文書化しない限り、公開doctestで `unwrap()` を使わない。

## `#[doc(hidden)]` — 使うタイミング

public rustdoc indexから隠しつつmacro、テスト、内部crateでも利用できるようにする：

- **Sealed trait** とdownstream impl防止用trait impl hook
- 直接使わせない **macro 展開ヘルパー**
- `cfg(test)` だけではdoc可視性が足りない **テスト専用 re-export**
- 文書化surfaceがsafe wrapperの **FFI shim**

チームが実際に出荷するpublic APIの文書回避に `#[doc(hidden)]` を使わない。hidden itemは `--document-hidden-items` でrustdocに現れ、publicならsemverストーリーの一部。

本当に内部なら `pub(crate)` を優先。技術理由で `pub` 必須だがdefault docs indexに出したくないとき `#[doc(hidden)]`。

## ドメイン型をリンク

近いドメイン概念とerror variantにrustdoc intra-doc link:

- [`RequestId`]
- [`AssignDriverError::DriverNotAvailable`]
- [`WaitingRequest::assign_driver`]

壊れたintra-doc linkは契約マップを腐らすdocumentation bug。

## Redaction と公開 docs

rustdocに実secret、token、メール、個人データ、本番ID、顧客例を置かない。合成値を使い、重要ならredaction挙動を示す。

型が意図的に `Debug` またはserializationをredactするなら型docsにその契約を記載。

## Lint と CI

library crateでは `#![deny(rustdoc::broken_intra_doc_links)]` を有効化推奨。チームがdocsを維持する準備があるpublic library APIのみ `#![warn(missing_docs)]` — application crateに安易に課さない。

生成/vendored binding moduleは免除可。周りのsafe wrapperはドメインと安全契約を文書化。

## よくある crate 組み合わせ

| スタック | rustdoc の焦点 |
| --- | --- |
| `thiserror` enum | `# Errors` が `#[error]` variant へリンク |
| State transitions | `?` と `Transition` outcome の `# Examples` |
| `unsafe` adapter | `unsafe fn` に `# Safety`; safe fn が前提を文書化 |

レビューでは、契約欠如の公開API、隠されたエラー / パニック / `# Safety`、不安全なdoctest例、壊れたintra-docリンク、不適切な `missing_docs` スコープを指摘する。

## レビューで見るところ

公開の `Result` 関数が重要なエラーバリアントを隠し、本番パニックに `# Panics`、`unsafe` に `# Safety` がない箇所はないか。例がプライベート近道や無説明のunwrap、PII漏洩、不可能な遷移を示していないかも見る。公開newtype・コンストラクタ・遷移・リポジトリトレイトに不変条件や単位が書かれているか。壊れたintra-docリンクや古いdoctestはなく、公開ライブラリなら `rustdoc::broken_intra_doc_links` を検討できるか。
