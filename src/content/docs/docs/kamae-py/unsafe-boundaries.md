---
title: "unsafe 境界"
sidebar:
  order: 10
---

> **いつ読むか:** `ctypes`、`cffi`、ネイティブ拡張、`model_construct`、広いキャスト、未検証バイト、その他 Python/Pydantic 不変条件を迂回するコードに触れるときに読む。
> **関連:** [`boundary-defense.md`](/docs/kamae-py/boundary-defense/)、[`pydantic-performance.md`](/docs/kamae-py/pydantic-performance/)、[`orm-adapters.md`](/docs/kamae-py/orm-adapters/)。

## デフォルト方針

未検証操作をドメインロジックから外に保つ。ドメインモデル、値オブジェクト、状態遷移、ユースケース、DTO 変換、PII マスキング、リポジトリプロトコルは、ネイティブポインタ API や Pydantic 検証の迂回を使ってはならない。

Python では次を安全でない境界と同等として扱う:

- `ctypes`、`cffi`、C 拡張、ネイティブ SDK ハンドル、メモリビュー、バイナリプロトコルパーサー。
- 広すぎるまたは不正確な型を持つ生成バインディングとコード生成クライアント。
- 検証を迂回するために使われる `BaseModel.model_construct`、`typing.cast`、`Any`、`# type: ignore`、未検証インデックス、広い `dict` アクセス。
- Pickle、動的インポート、`eval`、`exec`、またはコード実行可能な逆シリアライズ形式。

## 安全 API の背後に閉じ込める

未検証コードはアダプターまたはインフラモジュールに置く。ドメイン値を返す前にすべての前提条件を検証する小さな安全 API を露出する。

```python
class NonEmptyBytes(DomainModel):
    value: bytes

    @classmethod
    def parse(cls, value: bytes) -> "NonEmptyBytes":
        if not value:
            raise ValueError("bytes must be non-empty")
        return cls(value=value)


def first_byte(raw: bytes) -> int:
    data = NonEmptyBytes.parse(raw)
    return data.value[0]
```

未検証コードでテナントチェック、コンストラクタ、Pydantic アダプター、マスキングラッパー、エラーマッピングを迂回してはならない。

## ORM マッパー内の model_construct

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pydantic-performance.md -->

**チェックリスト対応（7.2、4.5）:** `model_construct` は検証をスキップする。上流がすでに不変条件を強制したときだけ使う。

### 安全パターン: 行 DTO → ドメイン状態

データベースドライバーまたは `RequestRow` アダプターがすでに型と必須フィールドを検証した。マッパーは frozen ドメインモデルへコピーし、バリデータを再実行しない。

```python
RequestRowAdapter = TypeAdapter(RequestRow)


def waiting_from_row(row: Mapping[str, object]) -> Waiting:
    dto = RequestRowAdapter.validate_python(row)
    # SAFETY: dto validated; columns map 1:1 to Waiting; kind is constant for this query.
    return Waiting.model_construct(
        kind="waiting",
        request_id=dto.request_id,
        tenant_id=dto.tenant_id,
        passenger_id=dto.passenger_id,
        created_at=dto.created_at,
        version=dto.version,
    )
```

すべての `model_construct` マッパーの要件:

1. 上流バリデータを名指しする **`# SAFETY:`** コメントで**文書化**する。
2. 無効行が `model_construct` ではなく DTO アダプターで失敗することを**テスト**する。
3. HTTP、キュー、ファイル入力に `model_construct` を**決して**呼ばない。
4. **フィールドリストを明示的に保つ** — 余分な DTO フィールドがドメイン状態を汚染しうるなら `**dto.model_dump()` をスプラットしない。

### 安全でないパターン（使わない）

```python
# Bypasses validation on external input.
def waiting_from_api(data: dict[str, Any]) -> Waiting:
    return Waiting.model_construct(**data)
```

ORM エンティティ、行 DTO、ドメイン状態間の完全なマッパーレイヤリングは [`orm-adapters.md`](/docs/kamae-py/orm-adapters/) を読む。

## ctypes: メモリとエラーハンドリング

**チェックリスト対応（7.3、7.4）:** ネイティブ呼び出しは明示的ライフタイムとエラーマッピングを持つアダプターに属する。

```python
import ctypes
from ctypes import c_int, c_void_p, POINTER


lib = ctypes.CDLL("libexample.so")
lib.example_process.argtypes = [c_void_p, c_int]
lib.example_process.restype = c_int


class NativeProcessError(Exception):
    def __init__(self, code: int) -> None:
        self.code = code


def process_buffer(data: bytes) -> int:
    if not data:
        raise ValueError("empty buffer")
    # copy=True: library must not retain pointer past call
    buf = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    code = lib.example_process(ctypes.cast(buf, c_void_p), len(data))
    if code != 0:
        raise NativeProcessError(code)
    return code
```

実践:

- エクスポートされるすべての関数に `argtypes` と `restype` を設定する。
- C API がインプレース変更とライフタイム規則を文書化しない限り、`from_buffer_copy` を優先する。
- C 側がポインタを非同期に保持するなら、Python `bytes` を直接渡さない。
- 非ゼロ戻りコードを型付き例外にマップする。顧客データを含む errno 文字列を漏らさない。
- `try/finally` でネイティブ割り当てを解放するか、ライブラリ提供の destroy 関数を使う。

```python
handle = lib.create_handle()
try:
  ...
finally:
    lib.destroy_handle(handle)
```

## cffi: ABI モード vs API モード

| モード | 選ぶとき | トレードオフ |
| --- | --- | --- |
| **ABI**（`ffi.dlopen`） | ベンダーが安定 `.so` / `.dll` を提供。C ヘッダーがある | 配線は速い。正しい構造体レイアウトと呼び出し規約に依存 |
| **API**（`ffi.set_source` + compile） | C スニペットを制御するか速度/インラインヘルパーが必要 | CI にビルドステップ。所有権が明確。監査しやすい |

文書化されたヘッダーがあるサードパーティ SDK 統合でビルド複雑さを最小にしたいときは **ABI** を選ぶ。

**API** を選ぶとき:

- C 表面が小さく、薄い `.c` シムをベンダーできる。
- 定義されたエラー伝播で `ffi.callback` が必要。
- ABI 構造体パッキングがプラットフォーム間で脆い。

```python
# ABI example
import cffi

ffi = cffi.FFI()
ffi.cdef("""
    int parse_packet(const uint8_t *data, size_t len, struct Result *out);
""")
lib = ffi.dlopen("libpacket.so")


def parse_packet_safe(data: bytes) -> PacketDto:
    if len(data) > MAX_PACKET_SIZE:
        raise ValueError("packet too large")
    buf = ffi.from_buffer(data)
    out = ffi.new("struct Result *")
    rc = lib.parse_packet(buf, len(data), out)
    if rc != 0:
        raise PacketParseError(rc)
    return PacketDtoAdapter.validate_python({
        "kind": ffi.string(out.kind).decode(),
        "sequence": int(out.sequence),
    })
```

HTTP 境界と同じルールで、ネイティブ出力はドメインモデルの前に必ず Pydantic DTO 経由で変換する。

## 安全不変条件を文書化する

ネイティブラッパー関数または未検証構築経路ごとに次を説明する:

- 操作を安全にする不変条件。
- その不変条件が確立される場所。
- 拒否される無効入力。
- PII とシークレットがログ、エラー、コールバック、メトリクス、メモリダンプを通して漏れないようにする方法。

型チェッカーと Pydantic が検証できないことをコードが行うときは、docstring または近くの `# SAFETY:` コメントを優先する。

## ラッパーをテストする

ネイティブまたは未検証境界の変更では、安全ラッパー周りに焦点を絞ったテストを追加する: 正常入力、境界入力、拒否経路、null/無効ハンドル、エラー経路、マスキング、不変条件を保つ変更経路。

バイナリパーサーまたはネイティブ重いアダプターでは、プロパティテスト、ファジング、サニタイザー有効ビルド、ベンダー提供テストスイートを検討する。すべてのドメイン変更に要求しないが、メモリ、ポインタライフタイム、バイナリ互換が中核リスクのときは推奨する。

```python
def test_process_buffer_rejects_empty() -> None:
    with pytest.raises(ValueError):
        process_buffer(b"")


def test_waiting_from_row_does_not_accept_missing_version() -> None:
    with pytest.raises(ValidationError):
        waiting_from_row({"request_id": str(uuid4()), "kind": "waiting"})
```

## レビュー観点

### ネイティブアクセスは安全な抽象の背後に閉じているか — High

呼び出し元に文書化されていないエイリアシング、ライフタイム、FFI、所有権前提を守らせる公開 API を指摘する。ネイティブ呼び出し前に入力を検証する安全関数を優先する。

ラッパーが前提を完全検証できない場合は docstring に呼び出し元の義務を書く。

### ネイティブコードがドメイン構築やマスクを迂回できないか — High

正規アダプター/コンストラクター経路なしで生データからドメイン値を組み立てるネイティブコード、またはログ、`repr`、例外、FFI コールバック、メトリクスラベル、生バッファで PII/シークレットを露出するコードを指摘する。

### 未検証/ネイティブコードはドメインロジックにないか — High

ドメインエンティティ、値オブジェクト、状態遷移、ユースケース、DTO 変換、PII ラッパー、リポジトリプロトコル内の `ctypes`、`cffi`、ネイティブ拡張呼び出し、未検証バッファ処理、`model_construct`、広い `cast`、生 `bytes` パースを指摘する。

安全 API の背後に隔離され、ドメインコンストラクタ、バリデーション、認可、マスクを迂回しないアダプター/インフラモジュール内のネイティブコードは指摘しない。

### ネイティブ境界は適切なツールでテストされているか — Medium

正常入力、境界入力、拒否コンストラクタ、変更経路、無効ハンドル、エラー経路に焦点を当てたテストのないネイティブラッパーを指摘する。

ネイティブブロックがメモリ、ポインタエイリアシング、初期化、FFI ライフタイム契約を所有する場合はファズやプロパティテストを提案する。小さな安全ドメイン変更ごとに必須ではない。

### ネイティブ箇所で安全性不変条件は文書化されているか — Medium

不変条件、成立箇所、エイリアシング・ライフタイム・初期化・整列・境界が妥当な理由を説明しないネイティブ/未検証ブロックを指摘する。

操作を言い換えただけのコメントは受け入れない。

