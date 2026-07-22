---
title: "unsafe 境界"
sidebar:
  order: 10
---

`model_construct`、広い `cast`、ネイティブFFIは、型チェッカーを満足させてもランタイムの不変条件を保証しない。これらはアダプターかインフラに閉じ、小さな安全APIの内側で前提を検証してからドメイン値を返す。

通常の境界パースは [境界防御](/projects/kamae-py/boundary-defense/)、マッパーでの `model_construct` の条件は [ORM アダプター](/projects/kamae-py/orm-adapters/) と [Pydantic のパフォーマンス](/projects/kamae-py/pydantic-performance/) を参照する。

## デフォルト方針

未検証操作をドメインロジックから外に保つ。ドメインモデル、値オブジェクト、状態遷移、ユースケース、DTO変換、PIIマスキング、リポジトリプロトコルは、ネイティブポインタAPIやPydantic検証の迂回を使ってはならない。

Pythonでは次を安全でない境界と同等として扱う：

- `ctypes`、`cffi`、C拡張、ネイティブSDKハンドル、メモリビュー、バイナリプロトコルパーサー。
- 広すぎるまたは不正確な型を持つ生成バインディングとコード生成クライアント。
- 検証を迂回するために使われる `BaseModel.model_construct`、`typing.cast`、`Any`、`# type: ignore`、未検証インデックス、広い `dict` アクセス。
- Pickle、動的インポート、`eval`、`exec`、またはコード実行可能な逆シリアライズ形式。

## 安全 API の背後に閉じ込める

未検証コードはアダプターまたはインフラモジュールに置く。ドメイン値を返す前にすべての前提条件を検証する小さな安全APIを露出する。

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

未検証コードでテナントチェック、コンストラクタ、Pydanticアダプター、マスキングラッパー、エラーマッピングを迂回してはならない。

## ORM マッパー内の model_construct

<!-- constrained-by ./boundary-defense.md -->
<!-- constrained-by ./pydantic-performance.md -->

**チェックリスト対応（7.2、4.5）:** `model_construct` は検証をスキップする。上流がすでに不変条件を強制したときだけ使う。

### 安全パターン: 行 DTO → ドメイン状態

データベースドライバーまたは `RequestRow` アダプターがすでに型と必須フィールドを検証した。マッパーはfrozenドメインモデルへコピーし、バリデータを再実行しない。

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

すべての `model_construct` マッパーの要件：

1. 上流バリデータを名指しする **`# SAFETY:`** コメントで**文書化**する。
2. 無効行が `model_construct` ではなくDTOアダプターで失敗することを**テスト**する。
3. HTTP、キュー、ファイル入力に `model_construct` を**決して**呼ばない。
4. **フィールドリストを明示的に保つ** — 余分なDTOフィールドがドメイン状態を汚染しうるなら `**dto.model_dump()` をスプラットしない。

### 安全でないパターン（使わない）

```python
# Bypasses validation on external input.
def waiting_from_api(data: dict[str, Any]) -> Waiting:
    return Waiting.model_construct(**data)
```

ORMエンティティ、行DTO、ドメイン状態間の完全なマッパーレイヤリングは [ORM アダプター](/projects/kamae-py/orm-adapters/) を読む。

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

実践：

- エクスポートされるすべての関数に `argtypes` と `restype` を設定する。
- C APIがインプレース変更とライフタイム規則を文書化しない限り、`from_buffer_copy` を優先する。
- C側がポインタを非同期に保持するなら、Python `bytes` を直接渡さない。
- 非ゼロ戻りコードを型付き例外にマップする。顧客データを含むerrno文字列を漏らさない。
- `try/finally` でネイティブ割り当てを解放するか、ライブラリ提供のdestroy関数を使う。

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

文書化されたヘッダーがあるサードパーティSDK統合でビルド複雑さを最小にしたいときは **ABI** を選ぶ。

**API** を選ぶとき：

- C表面が小さく、薄い `.c` シムをベンダーできる。
- 定義されたエラー伝播で `ffi.callback` が必要。
- ABI構造体パッキングがプラットフォーム間で脆い。

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

HTTP境界と同じルールで、ネイティブ出力はドメインモデルの前に必ずPydantic DTO経由で変換する。

## 安全不変条件を文書化する

ネイティブラッパー関数または未検証構築経路ごとに次を説明する：

- 操作を安全にする不変条件。
- その不変条件が確立される場所。
- 拒否される無効入力。
- PIIとシークレットがログ、エラー、コールバック、メトリクス、メモリダンプを通して漏れないようにする方法。

型チェッカーとPydanticが検証できないことをコードが行うときは、docstringまたは近くの `# SAFETY:` コメントを優先する。

## ラッパーをテストする

ネイティブまたは未検証境界の変更では、安全ラッパー周りに焦点を絞ったテストを追加する： 正常入力、境界入力、拒否経路、null/無効ハンドル、エラー経路、マスキング、不変条件を保つ変更経路。

バイナリパーサーまたはネイティブ重いアダプターでは、プロパティテスト、ファジング、サニタイザー有効ビルド、ベンダー提供テストスイートを検討する。すべてのドメイン変更に要求しないが、メモリ、ポインタライフタイム、バイナリ互換が中核リスクのときは推奨する。

```python
def test_process_buffer_rejects_empty() -> None:
    with pytest.raises(ValueError):
        process_buffer(b"")


def test_waiting_from_row_does_not_accept_missing_version() -> None:
    with pytest.raises(ValidationError):
        waiting_from_row({"request_id": str(uuid4()), "kind": "waiting"})
```

## レビューで見るところ

- ネイティブ呼び出しが検証付き安全APIの背後に閉じ、呼び出し元義務がdocstringにあるか。
- 正規コンストラクタなしでドメイン値を組み立てたり、FFI経路でPIIを出したりしていないかも見る。
- `ctypes` / `cffi` / `model_construct` / 広い `cast` がドメイン遷移やユースケースにないか。
- ラッパーに境界・拒否・無効ハンドルのテストと、エイリアシング等の不変条件文書があるかも確認する。

