---
title: "公開 API のドキュメント"
sidebar:
  order: 10
---

> **いつ読むか:** 公開ドメイン API の rustdoc 契約、doctest、`# Safety` を整備するとき。
> **関連:** [`domain-modeling.md`](/docs/kamae-rs/domain-modeling/)、[`unsafe-boundaries.md`](/docs/kamae-rs/unsafe-boundaries/)、[`quality-gates.md`](/docs/kamae-rs/quality-gates/)。

## 基本方針

rustdoc は実装の説明ではなくドメイン契約を文書化する。公開ドメイン API では呼び出し側が依存できることを説明する: 不変条件、有効な構築経路、遷移ルール、エラー、副作用、安全境界。

長い module essay より公開 item の簡潔な docs を優先。微妙な不変条件を符号化する private helper 以外は rustdoc 不要なことが多い。

## 文書化する対象

ドメインまたは adapter 契約の一部である公開 item:

- Newtype と value object: 意味、検証ルール、単位、範囲、プライバシー/redaction 期待
- コンストラクタと `TryFrom`/`FromStr`: 受理/拒否入力と error バリアント
- State struct と enum: 有効ライフサイクル state と各 variant がいつ生成されるか
- 遷移メソッド: ソース state、ターゲット state、前提、発行 event、失敗モード
- Repository trait: トランザクション期待、一貫性保証、idempotency、error マッピング
- DTO 変換関数: 外部形状の仮定と検証境界
- Unsafe wrapper: safe API 保証と `unsafe fn` の `# Safety` 契約

名前の繰り返しだけの docs は避ける:

```rust
/// Creates a request id.
pub fn new(value: String) -> Result<RequestId, RequestIdError> { ... }
```

契約指向の docs を優先:

```rust
/// A non-empty identifier for a taxi request.
///
/// `RequestId` is created only after boundary validation. Empty or whitespace-only
/// input returns [`RequestIdError::Empty`].
pub struct RequestId(String);
```

## 関連するときの必須セクション

具体的契約価値がある標準 rustdoc 見出し:

- 呼び出し側が variant を扱う必要がある `Result` 関数向け `# Errors`
- 本番で panic しうる関数向け `# Panics`
- すべての `unsafe fn`、`unsafe trait`、呼び出し側が守る unsafe 契約向け `# Safety`
- 誤用しやすい constructor、遷移、DTO 変換向け `# Examples`

空の定型セクションは付けない。panic がなければ `# Panics` は不要。

## 例と doctest

可能ならコンパイルする例を示し、private フィールド近道ではなく安全な構築経路を示す。

crate setup、外部サービス、feature flag、意図的 compile fail が必要な例は適切な rustdoc fence を使う:

```rust
/// ```no_run
/// # async fn example(repo: impl RequestStore) -> Result<(), RepositoryError> {
/// #   Ok(())
/// # }
/// ```
```

重要な type-state 保証には `compile_fail` 例を控えめに。小さく安定させる。

### doctest の error handling

呼び出し側が `Result` variant をどう扱うか示す — doctest も失敗経路の契約。

```rust
/// ```
/// use booking_domain::RequestId;
///
/// let id = RequestId::new("req-1".into())?;
/// assert_eq!(id.as_str(), "req-1");
/// # Ok::<(), booking_domain::RequestIdError>(())
/// ```
```

ルール:

- fallible doctest は `# Ok::<(), ErrorType>(())` で終え、例内で `?` を使える
- 1 例 1 happy path。error variant は `# Errors` と enum variant リンクで
- `compile_fail` は失敗行を最小に（例: 誤った state 型への遷移呼び出し）

```rust
/// # Errors
///
/// Returns [`AssignDriverError::InvalidState`] when the request is not waiting.
```

panic 指向 API を明示文書化しない限り、公開 doctest で `unwrap()` を使わない。

## `#[doc(hidden)]` — 使うタイミング

public rustdoc index から隠しつつ macro、テスト、内部 crate 向けに利用可能にする:

- **Sealed trait** と downstream impl 防止用 trait impl hook
- 直接使わせない **macro 展開ヘルパー**
- `cfg(test)` だけでは doc 可視性が足りない **テスト専用 re-export**
- 文書化 surface が safe wrapper の **FFI shim**

チームが実際に出荷する public API の文書回避に `#[doc(hidden)]` を使わない。hidden item は `--document-hidden-items` で rustdoc に現れ、public なら semver ストーリーの一部。

本当に内部なら `pub(crate)` を優先。技術理由で `pub` 必須だが default docs index に出したくないとき `#[doc(hidden)]`。

## ドメイン型をリンク

近いドメイン概念と error variant に rustdoc intra-doc link:

- [`RequestId`]
- [`AssignDriverError::DriverNotAvailable`]
- [`WaitingRequest::assign_driver`]

壊れた intra-doc link は契約マップを腐らす documentation bug。

## Redaction と公開 docs

rustdoc に実 secret、token、メール、個人データ、本番 ID、顧客例を置かない。合成値を使い、重要なら redaction 挙動を示す。

型が意図的に `Debug` または serialization を redact するなら型 docs にその契約を記載。

## Lint と CI

library crate では `#![deny(rustdoc::broken_intra_doc_links)]` を有効化推奨。チームが docs を維持する準備がある public library API のみ `#![warn(missing_docs)]` — application crate に安易に課さない。

生成/vendored binding module は免除可。周りの safe wrapper はドメインと安全契約を文書化。

## よくある crate 組み合わせ

| スタック | rustdoc の焦点 |
| --- | --- |
| `thiserror` enum | `# Errors` が `#[error]` variant へリンク |
| State transitions | `?` と `Transition` outcome の `# Examples` |
| `unsafe` adapter | `unsafe fn` に `# Safety`; safe fn が前提を文書化 |

レビューでは、契約欠如の公開 API、隠されたエラー / パニック / `# Safety`、不安全な doctest 例、壊れた intra-doc リンク、不適切な `missing_docs` スコープを指摘する。

## レビュー観点

### エラー、パニック、安全性契約は文書化されているか — High

呼び出し元が扱うべき重要なエラーバリアントを隠す、ドメイン `Result` を返す公開関数を指摘する。本番パニックに `# Panics` セクションがない場合も指摘する。

すべての `unsafe fn`、`unsafe trait`、呼び出し元が守る unsafe 契約には `# Safety` セクションが必要。実装の健全性レビューは unsafe 境界チェックリストを使う。

### 例は安全な経路を示しているか — Medium

プライベートフィールドの近道で不変条件を持つ値を構築する、DTO 変換を迂回する、説明なしにエラーを unwrap する、PII を漏らす、不可能な状態遷移を示す例を指摘する。

doctest としてコンパイルできる例を優先する。明確な理由があるときだけ `no_run`、`ignore`、`compile_fail` を使う。

### 公開ドメイン API は契約を文書化しているか — Medium

重要な不変条件、有効入力、単位、ライフサイクルルール、副作用、一貫性保証をドキュメントから欠く公開ドメイン newtype、コンストラクタ、状態型、遷移メソッド、リポジトリトレイト、DTO 変換、アダプタラッパを指摘する。

レビュアや保守者が誤用しやすい微妙な不変条件をエンコードする非公開ヘルパ以外に rustdoc を要求しない。

### rustdoc リンクと doctest は維持されているか — Low

壊れたドキュメント内リンク、古い型名、もはやコンパイルしない例、現在のコンストラクタ / エラー / 状態挙動と矛盾するドキュメントを指摘する。

古いドキュメントが検証の迂回、エラーバリアントの誤処理、unsafe の誤用、機密データ漏洩を招く場合はエスカレートする。

### ドキュメント lint のスコープは適切か — Low

壊れたドキュメント内リンクを検出する手段のない公開ライブラリクレートを指摘する。適切なら `#![deny(rustdoc::broken_intra_doc_links)]` を提案する。

アプリケーションクレートや生成 / FFI バインディングに `#![warn(missing_docs)]` を要求しない。ただし生成コードを包む安全ラッパには契約ドキュメントが必要。
