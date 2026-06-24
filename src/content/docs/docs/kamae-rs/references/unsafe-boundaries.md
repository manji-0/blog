---
title: "Rust Unsafe Boundaries"
sidebar:
  order: 10
---

## Default Stance

Keep `unsafe` out of domain logic. Domain entities, value objects, state transitions, use cases, DTO conversion, PII redaction, and repository traits should normally be safe Rust.

Use `unsafe` only when the requirement cannot be expressed with safe Rust at acceptable cost:

- FFI or OS/runtime integration
- Implementing a safe abstraction over raw pointers, memory layout, or initialization
- Interacting with crates whose contract requires unsafe calls
- Measured low-level performance work after a safe design has proven insufficient

Do not use `unsafe` to bypass ownership, validation, constructors, privacy, serde conversion, tenant checks, or error handling.

## Contain Unsafe Behind Safe APIs

Keep `unsafe` blocks as small as possible and place them in adapter or infrastructure modules, not in core domain modules.

Expose a safe API that enforces every precondition before entering `unsafe`:

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

If the caller must uphold preconditions, make an `unsafe fn` and document the contract in a `# Safety` section. Prefer safe functions when the module can check the precondition itself.

## Safety Comments

Every `unsafe` block, `unsafe fn`, `unsafe trait`, and `unsafe impl` should explain:

- What invariant makes the operation sound
- Where that invariant is established
- Why aliases, lifetimes, initialization, alignment, and bounds are valid
- How the invariant is preserved after future mutation or refactoring

Avoid comments that merely restate the operation, such as "dereference pointer". The comment must justify soundness.

## Preserve Domain Boundaries

Unsafe code must not create domain values by bypassing constructors or validation. Convert raw data into DTOs/rows first, then use the same `TryFrom`, `FromStr`, or constructor path as safe code.

Unsafe code must not expose PII through `Debug`, logs, panic messages, FFI callbacks, metrics labels, or raw memory dumps. Wrap or redact sensitive data before it crosses the unsafe boundary.

## FFI Error Handling (`extern "C"`)

C APIs usually signal failure with integer codes and optional out-parameters. Map them to `Result` at the FFI boundary before domain code runs.

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

Rules:

- Never propagate raw C strings into domain types without `TryFrom`.
- Free resources in the safe wrapper according to the C API contract.
- Map unknown status codes to a dedicated variant; do not `unwrap` on `0`.

## `MaybeUninit` Safe Wrappers

Use `MaybeUninit` when safe Rust cannot prove initialization to the compiler but your API establishes it before read.

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

Do not expose `&[MaybeUninit<u8>]` to callers. Initialize or drop partially built values in `Drop` when abandoning a partial write.

## `Pin` and Self-Referential Structs

Some safe abstractions (async futures, certain C callbacks) require pinned storage. Keep pinning inside the adapter module.

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

Document why the type must not be moved after pinning. Prefer `Pin<Box<T>>` over manual self-referential structs unless profiling proves otherwise.

## Review and Testing

For unsafe boundary changes, add focused tests around the safe wrapper:

- Normal and boundary inputs
- Constructor rejection paths
- Mutation paths that preserve the safety invariant
- FFI error paths and null/invalid handles where applicable

When possible, run Miri, sanitizer builds, fuzz/property tests, or crate-specific safety tests for unsafe-heavy code. Do not require these tools for every domain change, but recommend them when the unsafe block owns memory, pointer aliasing, initialization, or FFI lifetime contracts.

## Miri and Sanitizers — Commands and Typical Findings

### Miri (undefined behavior detection)

From the crate or workspace root:

```bash
cargo +nightly miri test -p my_adapter_crate
```

Miri commonly catches:

- Use-after-free when FFI returns a pointer freed twice or used after `free`
- Uninitialized reads from `MaybeUninit` promoted to safe slice too early
- Invalid `unsafe` `from_raw_parts` length
- Data races when `Send`/`Sync` impls are wrong on FFI handles

Miri is slow; run it on the adapter crate that owns `unsafe`, not the whole workspace, in CI nightly or pre-release.

### AddressSanitizer (ASan)

```bash
RUSTFLAGS="-Zsanitizer=address" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

Typical detections: heap buffer overflow in C library interop, stack overflow on large copied buffers.

### ThreadSanitizer (TSan)

```bash
RUSTFLAGS="-Zsanitizer=thread" cargo +nightly test -p my_adapter_crate -Zbuild-std --target $(rustc -vV | sed -n 's|host: ||p')
```

Typical detections: races when a `Send` FFI handle is shared across threads without synchronization.

Adjust package name and target for the repository. Document the exact command in the adapter crate README when unsafe is non-trivial. Safe domain crates rarely need sanitizer runs unless they contain `unsafe` themselves.

## Review Signals

Flag when:

- `unsafe` appears in domain, use-case, or transition modules.
- FFI returns are converted to domain types without `TryFrom`.
- `MaybeUninit` values are read before `assume_init` or proven `write`.
- Self-referential structs are moved after taking their address.
- PII or secrets cross FFI as plain `*const c_char` without redaction policy.
