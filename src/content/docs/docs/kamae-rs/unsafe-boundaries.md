---
title: "unsafe 境界"
sidebar:
  order: 10
---

> **いつ読むか:** `unsafe`、FFI、`MaybeUninit`、`Pin` をドメイン外の adapter に閉じ込めるとき。
> **関連:** [境界防御](/docs/kamae-rs/boundary-defense/)、[PII 保護](/docs/kamae-rs/pii-protection/)、[品質ゲート](/docs/kamae-rs/quality-gates/)。

## 基本方針

`unsafe` をドメインロジックから追い出す。ドメインエンティティ、値オブジェクト、state 遷移、ユースケース、DTO 変換、PII redaction、repository trait は通常 safe Rust。

許容コストで safe Rust に表現できない要求のときだけ `unsafe`:

- FFI または OS/runtime 統合
- raw pointer、メモリレイアウト、初期化を包む safe 抽象の実装
- 契約上 unsafe 呼び出しを要求する crate との連携
- safe 設計が不十分と証明された後の計測済み低レベル性能

所有権、検証、constructor、privacy、serde 変換、tenant チェック、error handling を迂回するために `unsafe` を使わない。

## unsafe を safe API の背後に閉じ込める

`unsafe` block は可能な限り小さく、コア domain ではなく adapter または infrastructure module に置く。

`unsafe` に入る前にすべての前提を強制する safe API を公開:

```rust
pub struct NonEmptyBytes(Vec<u8>);

impl NonEmptyBytes {
    pub fn new(bytes: Vec<u8>) -> Result<Self, NonEmptyBytesError> {
        if bytes.is_empty() {
            return Err(NonEmptyBytesError::Empty);
        }
        Ok(Self(bytes))
    }

    pub fn first_byte(&self) -> u8 {
        // SAFETY: `NonEmptyBytes::new` rejects empty vectors and the field is private,
        // so every `NonEmptyBytes` value contains at least one byte.
        unsafe { *self.0.get_unchecked(0) }
    }
}
```

呼び出し側が前提を守る必要があるなら `unsafe fn` と `# Safety` セクション。モジュールが前提を自分でチェックできるなら safe 関数を優先。

## Safety コメント

すべての `unsafe` block、`unsafe fn`、`unsafe trait`、`unsafe impl` で説明:

- どの不変条件が操作を sound にするか
- その不変条件がどこで確立されるか
- alias、lifetime、初期化、alignment、bounds がなぜ有効か
- 将来の mutation や refactor 後も不変条件がどう保たれるか

操作を言い換えるだけ（「pointer を dereference」など）のコメントは避ける。soundness を正当化すること。

## ドメイン境界を保つ

unsafe は constructor や検証を迂回して domain 値を作らない。raw データを DTO/row に変換し、safe コードと同じ `TryFrom`、`FromStr`、constructor 経路を使う。

unsafe は `Debug`、log、panic メッセージ、FFI callback、metrics label、raw memory dump 経由で PII を露出しない。unsafe 境界を越える前に sensitive データを wrap または redact。

## FFI エラーハンドリング（`extern "C"`）

C API は通常 integer code と optional out-parameter で失敗を示す。ドメインコードの前に FFI 境界で `Result` にマップ。

```rust
#[repr(i32)]
enum NativeStatus {
    Ok = 0,
    InvalidArgument = -1,
    NotFound = -2,
    Internal = -99,
}

extern "C" {
    fn native_lookup(id: *const c_char, out: *mut *mut c_char) -> i32;
}

pub fn lookup_name(id: &str) -> Result<String, NativeLookupError> {
    let c_id = CString::new(id).map_err(|_| NativeLookupError::InvalidId)?;
    let mut out_ptr: *mut c_char = std::ptr::null_mut();
    let status = unsafe { native_lookup(c_id.as_ptr(), &mut out_ptr) };

    match status {
        x if x == NativeStatus::Ok as i32 => {
            // SAFETY: contract says `out_ptr` is valid and NUL-terminated on Ok.
            let c_str = unsafe { CStr::from_ptr(out_ptr) };
            let value = c_str
                .to_str()
                .map_err(|_| NativeLookupError::InvalidUtf8)?
                .to_owned();
            unsafe { libc::free(out_ptr as *mut _) };
            Ok(value)
        }
        x if x == NativeStatus::NotFound as i32 => Err(NativeLookupError::NotFound),
        x if x == NativeStatus::InvalidArgument as i32 => {
            Err(NativeLookupError::InvalidArgument)
        }
        _ => Err(NativeLookupError::Internal { code: status }),
    }
}
```

ルール:

- raw C string を `TryFrom` なしに domain 型へ伝播しない
- C API 契約に従い safe wrapper でリソース解放
- 未知 status code は専用 variant にマップ。`0` で `unwrap` しない

## `MaybeUninit` safe wrapper

safe Rust がコンパイラに初期化を証明できないが API が read 前に確立する場合 `MaybeUninit` を使う。

```rust
pub struct FixedBuffer<const N: usize> {
    bytes: [MaybeUninit<u8>; N],
    len: usize,
}

impl<const N: usize> FixedBuffer<N> {
    pub fn push(&mut self, byte: u8) -> Result<(), BufferFull> {
        if self.len >= N {
            return Err(BufferFull);
        }
        self.bytes[self.len].write(byte);
        self.len += 1;
        Ok(())
    }

    pub fn as_slice(&self) -> &[u8] {
        // SAFETY: `len` bytes were written via `write`; indices beyond `len` are never read.
        unsafe { std::slice::from_raw_parts(self.bytes.as_ptr() as *const u8, self.len) }
    }
}
```

`&[MaybeUninit<u8>]` を caller に公開しない。部分 write を abandon するとき `Drop` で初期化または drop。

## `Pin` と自己参照 struct

一部 safe 抽象（async future、特定 C callback）は pinned storage を要求。pinning は adapter module 内に留める。

```rust
pub struct PinnedCallback {
    inner: Pin<Box<CallbackState>>,
}

impl PinnedCallback {
    pub fn new(handler: impl FnOnce() + Send + 'static) -> Self {
        Self {
            inner: Box::pin(CallbackState { handler: Some(handler), ..Default::default() }),
        }
    }

    pub fn register(&mut self) -> Result<(), RegisterError> {
        // SAFETY: `inner` is pinned before passing its address to C; CallbackState does not move afterward.
        unsafe { register_c_callback(self.inner.as_mut().get_unchecked_mut()) }
    }
}
```

pin 後に型を move してはならない理由を文書化。プロファイルが証明しない限り手動 self-referential より `Pin<Box<T>>` を優先。

## レビューとテスト

unsafe 境界変更では safe wrapper 周りに焦点テスト:

- 通常と境界入力
- constructor 拒否経路
- safety 不変条件を保つ mutation 経路
- 該当する FFI error 経路と null/invalid handle

可能なら Miri、sanitizer build、fuzz/property、crate 固有 safety test。すべての domain 変更に必須ではないが、unsafe block が memory、pointer aliasing、初期化、FFI lifetime 契約を所有するとき推奨。

## Miri と Sanitizer — コマンドと典型所見

### Miri（未定義動作検出）

crate または workspace ルートから:

```bash
cargo +nightly miri test -p my_adapter_crate
```

Miri がよく捕まえるもの:

- FFI が二重 free または `free` 後使用する use-after-free
- 早すぎる safe slice 昇格による `MaybeUninit` 未初期化 read
- 無効長の `unsafe` `from_raw_parts`
- FFI handle の誤った `Send`/`Sync` impl による data race

Miri は遅い。whole workspace ではなく `unsafe` を所有する adapter crate で、CI nightly または pre-release で実行。

### AddressSanitizer（ASan）

```bash
RUSTFLAGS="-Zsanitizer=address" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

典型: C library 連携の heap buffer overflow、大コピー buffer の stack overflow。

### ThreadSanitizer（TSan）

```bash
RUSTFLAGS="-Zsanitizer=thread" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

典型: 同期なしでスレッド共有される `Send` FFI handle の race。

package 名と target はリポジトリに合わせ調整。non-trivial unsafe なら adapter crate README に正確なコマンドを文書化。safe domain crate は自前 `unsafe` がなければ sanitizer 不要なことが多い。


レビューでは、ドメイン・ユースケース・遷移モジュール内の `unsafe`、`TryFrom` なしの FFI 戻り値のドメイン変換、証明済み `write` 前の `MaybeUninit` read、self-referential struct の move、redaction なしの PII / secret の plain `*const c_char` FFI を指摘する。

## レビュー観点

### unsafe がドメイン構築やマスキングを迂回できないか — High

通常の `TryFrom`、`FromStr`、コンストラクタ経路なしに生データからドメイン値を構築する unsafe、またはログ、`Debug`、パニックメッセージ、FFI コールバック、メトリクスラベル、生メモリバッファ経由で PII / シークレットを露出する unsafe を指摘する。

### unsafe は安全な抽象の背後に封じ込められているか — High

呼び出し元に文書化されていないエイリアシング、ライフタイム、境界、初期化、FFI、所有権の前提を要求する公開 API を指摘する。`unsafe` ブロックの前に前提を検査する安全関数を優先する。

API が `unsafe fn` である必要があるなら、呼び出し元の義務を名指す `# Safety` 契約を要求する。

### ドメインロジックに unsafe はないか — High

ドメインエンティティ、値オブジェクト、状態遷移、ユースケース、DTO 変換、PII ラッパ、リポジトリトレイト内の `unsafe` ブロック、`unsafe fn`、`unsafe impl`、生ポインタ参照、`MaybeUninit`、`transmute`、境界チェックなしインデックスを指摘する。

安全 API の背後に隠れ、ドメインコンストラクタ、検証、認可、マスキングを迂回しないアダプタ / インフラモジュールに隔離された unsafe には指摘しない。

### unsafe 境界は適切なツールでテストされているか — Medium

通常入力、境界入力、拒否されるコンストラクタ、変更経路、null / 無効 FFI ハンドル、エラー経路に焦点を当てたテストのない unsafe ラッパを指摘する。

unsafe ブロックがメモリ、ポインタエイリアシング、初期化、FFI ライフタイム契約を担うときは Miri、サニタイザ、ファジング、プロパティテストを提案する。小さな安全ドメイン変更すべてにそれらを要求しない。

### 安全性不変条件は unsafe 箇所で文書化されているか — Medium

不変条件、成立箇所、エイリアシング・ライフタイム・初期化・整列・境界が有効な理由を説明する近傍の `SAFETY:` コメントのない unsafe ブロックを指摘する。

操作を言い換えただけのコメントは受け入れない。

