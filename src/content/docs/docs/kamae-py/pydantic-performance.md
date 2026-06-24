---
title: "Pydantic のパフォーマンス"
sidebar:
  order: 10
---

Pydantic v2 は境界とドメイン状態のデフォルトとして妥当だが、大きなモデルや高頻度エンドポイントでは検証に実コストがある。パフォーマンス改善は不変条件を弱める口実ではなく、**どこで何を再検証するか**を絞る話である。

型の選び方は [ドメインモデリング](/docs/kamae-py/domain-modeling/)、検証を飛ばしてよい経路は [unsafe 境界](/docs/kamae-py/unsafe-boundaries/)、受信データの入口は [境界防御](/docs/kamae-py/boundary-defense/) と整合させる。

## コストが現れる場所

| ホットスポット | 典型的な原因 | 最初の対応 |
| --- | --- | --- |
| リクエスト入口 | すべての HTTP ボディをネストモデルでパース | DTO を狭く保つ。エンドポイントが必要なフィールドだけパース |
| DB 再水和 | リストエンドポイントの各行で `validate_python` | 完全アグリゲート状態とリスト/読み取り DTO を分離 |
| 判別共用体 | `kind` ディスパッチ + バリアントごとの検証 | 共用体ごとに 1 つの `TypeAdapter`。すでに検証済みオブジェクトの再パースを避ける |
| ロギング / メトリクス | 大きな状態への `model_dump` | 識別子と `kind` のみログ。[PII と観測経路の保護](/docs/kamae-py/pii-protection/) を参照 |
| テスト | 同一フィクスチャの再検証 | コンストラクタまたはモジュールごとに 1 回キャッシュしたアダプターでフィクスチャ構築 |

`TypeAdapter` インスタンスはモジュールレベル定数にすべきだ。Pydantic はバリデータをキャッシュする。リクエストごとに新しいアダプターを構築するとスキーマコンパイル作業を繰り返す。

```python
TaxiRequestAdapter = TypeAdapter(TaxiRequest)  # module scope


def request_from_row(row: Mapping[str, object]) -> TaxiRequest:
    return TaxiRequestAdapter.validate_python(row)
```

## validate_python と validate_json

| メソッド | 入力 | 典型的な経路 |
| --- | --- | --- |
| `validate_python` | すでにデコードされた `dict` / `list` | `response.json()` → validate |
| `validate_json` | `bytes` / `str` JSON | 生 HTTP ボディ → validate |

中〜大モデルでは、`validate_json` は `json.loads` + `validate_python` より**1.2–2 倍速い**ことが多い。パースと検証が Pydantic の Rust コアを共有するため。差が大きいのは:

- ペイロードがエッジで JSON 文字列またはバイトのとき。
- モデルに多くのスカラーフィールドがあり、カスタムバリデータが少ないとき。

入力がすでに ORM またはプロセス内 API からの `dict` なら、`validate_python` が正しい。速度のために JSON 往復しない。

```python
# HTTP edge
async def parse_body(raw: bytes) -> CreateRequestInput:
    return CreateRequestInputAdapter.validate_json(raw)

# ORM row already dict-like
def from_row(row: Mapping[str, object]) -> RequestRow:
    return RequestRowAdapter.validate_python(row)
```

自分のスキーマでベンチマークする。マイクロベンチマークはフィールド数、共用体、バリデータで変わる。

## model_construct が許容されるとき

`model_construct` は検証をスキップする。不変条件がすでに強制された**信頼できる**経路でのみ使う。通常は、先行する Pydantic パースまたは型付き値を返した DB ドライバーの後、テスト済みマッパー内。

```python
def waiting_from_row(dto: RequestRow) -> Waiting:
    # dto was validated by RequestRowAdapter; row columns match Waiting fields.
    return Waiting.model_construct(
        kind="waiting",
        request_id=dto.request_id,
        passenger_id=dto.passenger_id,
        created_at=dto.created_at,
    )
```

外部 HTTP、キュー、ファイル入力で検証をスキップするために `model_construct` を使わない。完全な方針は [境界防御](/docs/kamae-py/boundary-defense/) と [unsafe 境界](/docs/kamae-py/unsafe-boundaries/) を読む。

すべての `model_construct` マッパーに、入力が信頼できる理由と上流でどの不変条件チェックが行われるかを述べる短いコメントを文書化する。

### model_construct を検討するとき（ベンチマークヒューリスティック）

| シグナル | おおよその閾値 | アクション |
| --- | --- | --- |
| プロファイルで `validate_python` がリクエスト CPU の 10–15% 超 | DTO 狭窄後 | **テスト済み**行マッパーにだけ `model_construct` 追加 |
| リストエンドポイントが > 500 行/リクエストを水和 | 同一スキーマを 2 回検証（行 + ドメイン） | 行 DTO + ドメインへ `model_construct` |
| 単一フィールドパッチ | 完全共用体の再検証 | 避ける。再パースではなく対象遷移を使う |
| 外部入力 | 任意 | **決して** `model_construct` しない |

現実的負荷試験で検証が壁時間の ~5% 未満なら、明確さを `model_construct` より優先する。

## msgspec 境界 → Pydantic ドメインパイプライン

[msgspec](https://jcristharif.com/msgspec/) などは単純で安定したスキーマの JSON エンコード/デコードで Pydantic より速いことがある。Kamae Python は依然としてバリデータ表現力、エコシステム統合、mypy プラグインサポートのため、ドメイン状態と判別共用体に Pydantic を好む。

許容パターン: **ワイヤエッジに msgspec、ドメインに Pydantic。**

```python
import msgspec
from uuid import UUID


class CreateRequestWire(msgspec.Struct, forbid_unknown_fields=True):
    passenger_id: UUID
    pickup_lat: float
    pickup_lng: float


CreateRequestWireDecoder = msgspec.json.Decoder(CreateRequestWire)


def parse_create_request(body: bytes) -> CreateRequestInput:
    wire = CreateRequestWireDecoder.decode(body)
    # Map into Pydantic DTO or domain command for validators Pydantic owns.
    return CreateRequestInput(
        passenger_id=wire.passenger_id,
        pickup_lat=wire.pickup_lat,
        pickup_lng=wire.pickup_lng,
    )
```

パイプライン:

```text
HTTP bytes → msgspec.Struct (wire) → Pydantic DTO (strict) → domain command/state → use case
```

ルール:

- msgspec struct は**トランスポート形状**であり、第 2 のドメインモデルではない。
- ハンドオフ後、Pydantic またはドメインコンストラクタでフィールド横断とビジネスルールを実行する。
- 両パスでテストなしに msgspec と Pydantic の検証ルールを乖離させて維持しない。

切り替え前に**自分の**ペイロードサイズとエンドポイント構成でベンチマーク比較する。おもちゃモデルのマイクロベンチマークは API ゲートウェイスループットを予測しにくい。

## バッチ処理向け TypeAdapter キャッシュ戦略

取り込みや一覧処理では、行ごとに `TypeAdapter` を new するとスキーマコンパイルが繰り返され、CPU が境界検証に消える。モジュールレベルで 1 インスタンスを共有し、ループ内では `validate_python` だけを呼ぶ。

| パターン | 実装 | 使うとき |
| --- | --- | --- |
| モジュールレベルアダプター | `FooAdapter = TypeAdapter(Foo)` | 繰り返しパースのデフォルト |
| バッチ検証 | `[FooAdapter.validate_python(row) for row in rows]` | 中規模リスト。最も単純 |
| NDJSON への `validate_json` | 1 アダプター。行をループ | 取り込みワーカー |
| 事前サイズリスト + ループ | 行ごとのアダプター作成を避ける | ジョブあたり数千行 |
| ファクトリの `functools.cache` | スキーマがキーで変わる場合のみ | 動的スキーマ（稀） |

```python
from functools import cache

TaxiRequestAdapter = TypeAdapter(TaxiRequest)


def hydrate_requests(rows: Sequence[Mapping[str, object]]) -> list[TaxiRequest]:
    # Reuse module adapter; no per-row TypeAdapter().
    return [TaxiRequestAdapter.validate_python(row) for row in rows]


@cache
def adapter_for_schema_version(version: int) -> TypeAdapter[TaxiRequest]:
    # Rare: versioned wire format in long-running worker
    ...
```

プロファイルで検証が支配的である非常に大きなバッチでは:

1. **狭い行 DTO**（安価）に検証する。
2. フィルタを通過した行にだけドメインへ `model_construct` する。
3. CPU バウンドバッチは `asyncio.to_thread` またはワーカープールへオフロードを検討。[並行性と非同期](/docs/kamae-py/concurrency/) を参照。

## 不変条件を迂回せずに作業を減らす

1. **ユースケースごとにモデルを分割する。** リストビューは完全アグリゲート共用体を必要としない。リポジトリポートで狭い読み取り DTO を使う。
2. **純粋遷移は安価に保つ。** 遷移関数はすでに検証済みドメイン状態を受け取る。すべてのフィールドで JSON を再パースしたり Pydantic を再実行したりしない。
3. **プロセス内専用ヘルパーには dataclass を優先する。** 選択表は [ドメインモデリング](/docs/kamae-py/domain-modeling/) を参照。明示的マッパーなしに同じ概念を Pydantic と dataclass の両方で重複しない。
4. **I/O を伴うバリデータを避ける。** `@field_validator` と `@model_validator` はすべての構築で実行される。高コストチェックは明示的依存を持つユースケースまたはインフラアダプターに属する。
5. **境界でのみ `strict=True` を使う。** 強制変換（`"123"` → `123`）はコストがあり、データ品質問題を隠す。外部 DTO で strict パースを有効にし、すべての内部ハンドオフでは有効にしない。

## キャッシュ戦略

キャッシュは**検証の後**に置く。生の dict や未検証 JSON をキャッシュヒット時にそのままドメインとして扱うと、古いスキーマや壊れた行が長く残る。バージョンまたは ETag でキーを切り、無効化方針を決めてから導入する。

| 戦略 | 使うとき |
| --- | --- |
| モジュールレベル `TypeAdapter` | 同一スキーマの繰り返しパース |
| レイヤーを通過する frozen ドメインインスタンス | 状態はすでに検証済み。遷移は新しい frozen モデルを構築 |
| 読み取りモデルキャッシュ（Redis、プロセス内 LRU） | 高コストなアグリゲート組み立て。検証**後**にキャッシュ。バージョンまたは ETag でキー |
| 純粋パースヘルパーの `functools.lru_cache` | プロセスごとに 1 回パースする小さな不変設定または参照データ |

外部システムの生 dict をキャッシュし、キャッシュミス時の再検証なしにドメインオブジェクトとして扱わない。無効化はアグリゲートバージョンまたは TTL 方針に結び付ける。

## プロファイルチェックリスト

ホットパスで Pydantic を置き換える前に:

1. 現実的負荷試験で `py-spy` または `cProfile` でプロファイルする。ノートブックの単一 `validate_python` 呼び出しではない。
2. ボトルネックが検証かどうかを確認する。N+1 クエリ、イベントループ上の同期 I/O、ロギングでの oversized `model_dump` ではない。
3. まず狭い DTO と `model_construct` マッパーパターンを適用する。
4. その後にだけ、Pydantic ドメインモデルを保ちつつ境界でより速いシリアライザーを検討する。

CPU バウンド検証または変換を asyncio イベントループから外すべきときは [並行性と非同期](/docs/kamae-py/concurrency/) を読む。

## レビュー観点

### `model_construct` は信頼できる内部経路に限定されているか — High

完全バリデーションが必要な境界データ、ORM 行、部分的に信頼できる dict への `model_construct` を指摘する。

文書化された不変条件で既に検証済み内部状態を再水和するホットパスでの `model_construct` は指摘しない。

### パフォーマンスショートカットは不変条件を保つか — High

余分フィールド、古いバージョン、無効な判別子をドメインコードに入れうる、スキップされたバリデータ、無効化された設定チェック、キャッシュアダプターを指摘する。

### 高頻度境界は意図的に最適化されているか — Low

必要箇所で完全バリデーションがまだ適用されている根拠なく、ホットエンドポイントで高コストなネスト検証をする箇所を指摘する。

プロファイリングやスループット要件がトレードオフを正当化するときだけ msgspec や狭い DTO アダプターを提案する。

