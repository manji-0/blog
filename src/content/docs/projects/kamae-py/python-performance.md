---
title: "Python のパフォーマンスと書き方"
sidebar:
  order: 10
---

Pythonは正しくて静かに高コストなコードを書きやすい。Kamae Pythonではドメイン遷移は安価で同期のままにし、パフォーマンス作業は計測後に境界・リポジトリ・バッチジョブへ寄せる。

検証コストの詳細は [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/)、event loopの停滞は [並行処理](/projects/kamae-py/concurrency/)、遷移の形は [状態遷移](/projects/kamae-py/state-transitions/) を参照する。

<!-- constrained-by ./pydantic-performance.md -->
<!-- constrained-by ./concurrency.md -->

## 書き換え前に計測する

現実的なワークロードでプロファイルしてからスタイルを変える：

1. `py-spy`、`cProfile`、またはAPMで本番に近いリクエスト構成を負荷試験
2. ボトルネックがPython実行か、SQL往復・ネットワーク・過大ログかを確認
3. まずアルゴリズムとI/Oを直す。索引改善やクエリ1本削減は高速ループより効くことが多い

検証が支配的なら [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/)。event loopがCPU作業で止まるなら [並行処理](/projects/kamae-py/concurrency/)。

## Kamae コードでスタイルが効く層

| 層 | パフォーマンス姿勢 |
| --- | --- |
| 純粋遷移 | O(1)またはO(fields)。I/O・パース・隠れスキャンなし |
| ユースケース | 可能なら集約あたりリポジトリ往復1回。portでバッチ |
| リポジトリ / マッパー | N+1クエリと行ごとのアダプタ生成を避ける |
| 境界 | 1回パースし、検証済みドメインオブジェクトを内側へ |
| テスト | フィクスチャ再利用。同一payloadを何千回も再パースしない |

ドメインの明瞭さを先にする。プロファイルでホットパスに繰り返し作業が見えたときだけ最適化する。

## データ構造と所属判定

アクセス方法に合った構造を選ぶ。

| 必要 | 優先 | ホットパスで避ける |
| --- | --- | --- |
| 頻繁な所属判定 | `set` / `frozenset` | `x in long_list` |
| キー検索 | `dict` | ペア列の線形スキャン |
| 挿入順 + キー検索 | `dict`（3.7+） | 並列list + dict |
| 両端キュー | `collections.deque` | `list.pop(0)` |
| カウント | `collections.Counter` | ネストループ内の手動dict加算 |
| ソート挿入 / 範囲 | `bisect` on sorted list | リクエストごとの全再ソート |

```python
# 遅い: ループ内で毎回 O(n)
allowed_statuses = ["waiting", "en_route", "in_trip"]
for row in rows:
    if row["status"] in allowed_statuses:
        ...

# 数千行なら十分速い
ALLOWED_STATUSES = frozenset({"waiting", "en_route", "in_trip"})
for row in rows:
    if row["status"] in ALLOWED_STATUSES:
        ...
```

参照データが安定しているなら、モジュールスコープまたは起動時にルックアップ表を1回構築する。

## ループ、内包表記、ジェネレータ

内包表記とジェネレータ式は通常、明示 `for` と同程度に速く、読みやすいことも多い。高コストなのは**ループ内の作業**であり、内包にしたかどうかではない。

```python
# 全行をメモリに載せる
ids = [row["id"] for row in rows]

# 1パスだけ必要ならストリーム
total = sum(price * qty for price, qty in line_items)
```

指針：

- ストリームや大きなファイルは行単位で `yield` / ジェネレータ式
- 2パスが不要ならジェネレータを `list()` で包まない
- 不変作業はループ外へ：`TypeAdapter` 生成、regexコンパイル、`frozenset` / dictマップ

```python
RowAdapter = TypeAdapter(RequestRow)
ACTIVE = frozenset({"waiting", "en_route"})


def active_rows(rows: Iterable[Mapping[str, object]]) -> list[RequestRow]:
    return [RowAdapter.validate_python(row) for row in rows if row.get("status") in ACTIVE]
```

ネストループで集合を毎回走査しない。関連データは事前に索引化する。

```python
lines_by_order: dict[UUID, list[Line]] = {}
for line in all_lines:
    lines_by_order.setdefault(line.order_id, []).append(line)
for order in orders:
    for line in lines_by_order.get(order.id, ()):
        ...
```

## 属性と名前解決

Pythonはローカル名をグローバルや属性より速く解決する。プロファイルで効くときだけ、内側ループでよく使う呼び出しをローカルに束縛する。

```python
def normalize_many(values: Iterable[str]) -> list[str]:
    lower = str.lower
    return [lower(value) for value in values]
```

ホットパスでは深い属性チェーンより関数とデータを優先する。コールドパス全体の可読性をナノ秒のために捨てない。

## 文字列、バイト、シリアライズ

| パターン | コスト | 優先 |
| --- | --- | --- |
| ループ内の `s += piece` | 二次コピー | `"".join(parts)` または `io.StringIO` |
| 同一オブジェクトへの繰り返し `str(x)` | 余分な割り当て | 1回フォーマット。ログは識別子のみ |
| バッチexportで行ごと `json.dumps` | 高 | バッチencode。infrastructure端で `orjson` を検討 |
| ログ用の大きな状態への `model_dump()` | 高 | 識別子と `kind` のみ |

HTTP JSONを大規模に扱うときは、自前のpayloadサイズで `validate_json`、`orjson`、msgspecを比較する。ドメインモデルはPydanticのまま。より速いシリアライザはワイヤ端 — [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) を参照。

## コピー、ビュー、メモリ

不要なコピーはメモリとGC圧力を増やす。

- 層をまたぐときは不変ドメインstateを参照渡し。毎ホップ `dict(model)` しない
- 独立コピーが本当に必要なときだけ `list(seq)`
- 共有グラフを変えない限りリクエスト経路で `copy.deepcopy` しない
- 読み取り専用スキャンならスライスより `itertools.islice` を検討

凍結Pydanticモデルと小さな `dataclass(frozen=True)` は参照渡しが安い。

## スケールする標準ライブラリ

手書きスキャンの前にstdlibを使う。

| モジュール | 用途 |
| --- | --- |
| `itertools` | 中間listなしの連結・グループ化・窓 |
| `functools.cache` / `lru_cache` | 不変参照データの純粋パース |
| `heapq` | 全ソートなしのtop-k |
| `bisect` | ソート列の維持 |
| `collections.defaultdict` | 繰り返し `if key not in dict` を避ける |
| `enum.Enum` | 高速な同一性チェック付き定数 |

```python
from itertools import batched


def publish_in_chunks(events: Sequence[DomainEvent], size: int) -> None:
    for chunk in batched(events, size):  # Python 3.12+
        publisher.send_batch(chunk)
```

## 遅延と即時

必要になるまで作業を遅らせる：

- 境界で入力を1回パースし、内側へドメイン型を渡す
- エラー詳細文字列は失敗分岐でのみ構築
- ファイルとネットワークは必要な経路の中で開く。import副作用で開かない

不変条件の強制が必要な場所では即時：境界検証、マイグレーション、失敗を早く見せたいテストフィクスチャ。

## キャッシュのルール

| キャッシュ | OK | NG |
| --- | --- | --- |
| モジュール級 `TypeAdapter` | スキーマ固定 | テナントごとに動的スキーマで版キーなし |
| 純粋設定パーサの `functools.cache` | 入力がハッシュ可能で不変 | 再起動なしで変わる外部データ |
| read modelキャッシュ（Redis、LRU） | version/ETagキー。書き込みで無効化 | HTTPの生dictをドメイン真実として扱う |

未検証の外部payloadをドメイン真実としてキャッシュしない。TTLまたは版キーを文書化する。

## リポジトリとバッチパターン

バックエンドの遅さの多くはPython構文ではなくI/Oの形である。

1. **N+1:** 関連行を1クエリまたは有界な少数で読み、Pythonで1回マップ
2. **行ごとのアダプタ:** モジュール級アダプタとマッパーを再利用（[ORM アダプター](/projects/kamae-py/orm-adapters/)）
3. **再検証:** 行DTOは1回。信頼経路だけ `model_construct`（[Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/)）
4. **大きなリストendpoint:** 狭いread DTO。テーブル表示に完全な集約共用体を水和しない

```python
class RequestReader(Protocol):
    async def list_waiting_ids(self, limit: int) -> Sequence[UUID]: ...
    async def load_waiting_many(self, ids: Sequence[UUID]) -> Sequence[Waiting]: ...
```

## 遷移を安く保つ

純粋遷移は凍結モデルを1つ割り当てて返す。次をしない：

- すでにドメイン型のデータへJSON再パースや `TypeAdapter` 再実行
- 索引があるのに無制限集合のスキャン
- 集約全体を文字列化するログフォーマッタ呼び出し

派生データが必要なら、入力stateのフィールドから計算するか、ユースケースから明示引数で渡す。

## マイクロ最適化しないもの

プロファイルに出ない議論は省略する：

- I/O支配の `for` と内包表記
- 小さな判別共用体の `match` と `if/elif`
- コールド設定コードのtupleと小さな凍結dataclass
- まれにしか生成されないクラスへの早すぎる `__slots__`

ホットパスが特定できてから、より速いライブラリ・バッチ・プロセスオフロードへ進む。

## プロファイルのチェックリスト

パフォーマンス変更を入れる前に：

1. 現実的なデータ量でレイテンシとCPUのベースラインを取る
2. 修正が計算量・定数・I/O回数のどれを変えるか記録
3. バッチ化や索引化が行ごとクエリに戻ったら失敗するテストを足す
4. 非自明なスタイルならPRまたはコミットに計測根拠を残す

[品質ゲート](/projects/kamae-py/quality-gates/) を満たすこと。パフォーマンスの口実で境界検証やドメイン不変条件を弱めない。

## レビューで見るところ

- プロファイルなしのマイクロ最適化や、ホットパスでの `TypeAdapter` 再生成はないか。
- ループ内のN+1クエリや `list.pop(0)`、行ごとの `json.dumps` はないか。
- 信頼できない入力への `model_construct` や、ログ用の大きな `model_dump()` はないか。
- バッチ意図を表すportがあるのに1件ずつ読み書きしていないか。
- Pydantic検証コストの議論は [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) と整合しているか。

