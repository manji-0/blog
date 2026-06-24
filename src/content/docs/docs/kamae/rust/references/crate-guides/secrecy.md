---
title: "secrecy"
sidebar:
  order: 10
---

詳細パターンは [`../pii-protection.md`](/docs/kamae/rust/references/pii-protection/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

`Debug` 出力に現れてはならず、メモリに必要以上に残してはならない資格情報などの secret 向け `secrecy` を使う。個人データ（PII）は `Redacted<T>` または custom `Debug` 付きドメイン newtype を優先する（`pii-protection.md` 参照）。

secret は `SecretString` または `SecretBox` 周りのプロジェクト固有 wrapper で保持する。`ExposeSecret` 経由の狭い adapter 関数でのみ値を露出する。

露出した secret 値を error バリアントに含めない。

## よくある組み合わせ

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `secrecy` + adapter | payment/auth モジュールのみ `ExposeSecret` | [`pii-protection.md`](/docs/kamae/rust/references/pii-protection/) |
| `secrecy` + `tracing` | `SecretString` をログしない。資格情報 struct は `skip` | [`pii-protection.md`](/docs/kamae/rust/references/pii-protection/#tracing-and-span-fields) |
| PII vs secrets | 個人データは `Redacted<T>`、資格情報は `secrecy` | [`pii-protection.md`](/docs/kamae/rust/references/pii-protection/#secrecy-vs-redactedt--when-to-use-which) |
