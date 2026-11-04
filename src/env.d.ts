// Bindings and runtime APIs that the generated types do not cover.
declare global {
	namespace Cloudflare {
		interface Env {
			// Declared under `cloudflare.r2_buckets` in void.config.ts.
			R2_ASSETS: R2Bucket;
		}
	}

	// workerd extension, absent from the DOM lib that Astro's tsconfig loads.
	interface SubtleCrypto {
		timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
	}
}

export {};
