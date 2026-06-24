---
title: "garde"
sidebar:
  order: 10
---

詳細パターンは [`../boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/) を優先する。このファイルは crate 固有のデフォルトのみを扱う。

プロジェクトが composable な検証ルール付き derive ベース検証を好む場合、DTO 向け `garde` を使う。

ドメインコンストラクタを権威とする。DTO 検証ルールだけがドメイン不変条件の唯一の所在にならないようにする。

## よくある組み合わせ

| Stack | Pattern | Topic guide |
| --- | --- | --- |
| `garde` + `serde` + axum | `Json<Dto>` -> `dto.validate()` -> `Command::try_from(dto)` | [`boundary-defense.md`](/docs/kamae/rust/references/boundary-defense/#http-extractors-axum--actix-web) |
| `garde` + `thiserror` | adapter で `garde` report を境界 error enum にマップ | [`error-handling.md`](/docs/kamae/rust/references/error-handling/) |
| `garde` + leaf newtypes | DTO フィールド検証 + ドメイン newtype 向け `TryFrom` | [`domain-modeling.md`](/docs/kamae/rust/references/domain-modeling/) |

`garde` は DTO 形状を検証する。`TryFrom` はドメイン意味（フィールド横断ルール、テナントスコープ、ID 意味論）の権威のままである。
