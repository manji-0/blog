---
title: "unsafe 境界"
sidebar:
  order: 10
---

`unsafe` ブロックはコンパイラの保証を外す。ドメイン型の中に置くのではなくアダプターに閉じ、安全APIの内側で前提・ライフタイム・エイリアシングを検証してから値を返す。

通常の境界は [境界防御](/projects/kamae-rs/boundary-defense/)、doc契約は [公開 API のドキュメント](/projects/kamae-rs/rustdoc/)、lint方針は [品質ゲート](/projects/kamae-rs/quality-gates/) と揃える。

## 基本方針

`unsafe` をドメインロジックから追い出す。ドメインエンティティ、値オブジェクト、状態遷移、ユースケース、DTO変換、PIIのマスキング、リポジトリtraitは、通常はsafe Rustで書く。

許容コストでsafe Rustに表現できない要求のときだけ `unsafe`:

- FFIまたはOS/runtime統合
- raw pointer、メモリレイアウト、初期化を包むsafe抽象の実装
- 契約上unsafe呼び出しを要求するcrateとの連携
- safe設計が不十分と証明された後の計測済み低レベル性能

所有権、検証、constructor、privacy、serde変換、tenantチェック、error handlingを迂回するために `unsafe` を使わない。

## unsafe を safe API の背後に閉じ込める

`unsafe` ブロックは可能な限り小さくし、コアのドメイン層ではなく、アダプターまたはインフラモジュールに置く。

すべての前提を強制してから `unsafe` に入るsafe APIを公開：

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

呼び出し側が前提を守る必要があるなら `unsafe fn` と `# Safety` セクション。モジュールが前提を自分でチェックできるならsafe関数を優先。

## Safety コメント

すべての `unsafe` block、`unsafe fn`、`unsafe trait`、`unsafe impl` で説明：

- どの不変条件が操作をsoundにするか
- その不変条件がどこで確立されるか
- alias、lifetime、初期化、alignment、boundsがなぜ有効か
- 将来のmutationやrefactor後も不変条件がどう保たれるか

操作を言い換えるだけ（「pointerをdereference」など）のコメントは避ける。soundnessを正当化すること。

## ドメイン境界を保つ

unsafeはconstructorや検証を迂回してdomain値を作らない。rawデータをDTO/rowに変換し、safeコードと同じ `TryFrom`、`FromStr`、constructor経路を使う。

unsafeは `Debug`、log、panicメッセージ、FFI callback、metrics label、raw memory dump経由でPIIを露出しない。unsafe境界を越える前にsensitiveデータをwrapまたはredact。

## FFI エラーハンドリング（`extern "C"`）

C APIは通常integer codeとoptional out-parameterで失敗を示す。ドメインコードの前にFFI境界で `Result` にマップ。

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

ルール：

- raw C stringを `TryFrom` なしにdomain型へ伝播しない
- C API契約に従いsafe wrapperでリソース解放
- 未知status codeは専用variantにマップ。`0` で `unwrap` しない

## `MaybeUninit` safe wrapper

safe Rustがコンパイラに初期化を証明できないがAPIがread前に確立する場合 `MaybeUninit` を使う。

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

`&[MaybeUninit<u8>]` をcallerに公開しない。部分writeをabandonするとき `Drop` で初期化またはdrop。

## `Pin` と自己参照 struct

一部safe抽象（async future、特定C callback）はpinned storageを要求。pinningはadapter module内に留める。

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

pin後に型をmoveしてはならない理由を文書化。プロファイルが証明しない限り手動self-referentialより `Pin<Box<T>>` を優先。

## レビューとテスト

unsafe境界変更ではsafe wrapper周りに焦点テスト：

- 通常と境界入力
- constructor拒否経路
- safety不変条件を保つmutation経路
- 該当するFFI error経路とnull/invalid handle

可能ならMiri、sanitizer build、fuzz/property、crate固有safety test。すべてのdomain変更に必須ではないが、unsafe blockがmemory、pointer aliasing、初期化、FFI lifetime契約を所有するとき推奨。

## Miri と Sanitizer — コマンドと典型所見

### Miri（未定義動作検出）

crateまたはworkspaceルートから：

```bash
cargo +nightly miri test -p my_adapter_crate
```

Miriがよく捕まえるもの：

- FFIが二重freeまたは `free` 後使用するuse-after-free
- 早すぎるsafe slice昇格による `MaybeUninit` 未初期化read
- 無効長の `unsafe` `from_raw_parts`
- FFI handleの誤った `Send`/`Sync` implによるdata race

Miriは遅い。ワークスペース全体ではなく、`unsafe` を所有するadapter crateで、CI nightlyまたはpre-releaseで実行する。

### AddressSanitizer（ASan）

```bash
RUSTFLAGS="-Zsanitizer=address" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

典型： C library連携のheap buffer overflow、大コピー bufferのstack overflow。

### ThreadSanitizer（TSan）

```bash
RUSTFLAGS="-Zsanitizer=thread" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

典型： 同期なしでスレッド共有される `Send` FFI handleのrace。

package名とtargetはリポジトリに合わせ調整。non-trivial unsafeならadapter crate READMEに正確なコマンドを文書化。safe domain crateは自前 `unsafe` がなければsanitizer不要なことが多い。


## レビューで見るところ

- 通常の `TryFrom` / コンストラクタを迂回するドメイン構築や、ログ・FFI経由のPII露出をunsafeが許していないか。
- 公開APIが文書化されていないエイリアシング前提を呼び出し元に押し付けず、安全関数の背後に封じ込めているかも見る。
- ドメイン遷移やPIIラッパ内に `unsafe` / `transmute` はないか。
- unsafeラッパに境界・拒否経路のテストと、必要ならMiriやファジはあるか。
- 各unsafeブロックに不変条件を説明する `SAFETY:` コメントがあるか。

