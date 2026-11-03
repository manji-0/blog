// Bindings declared under `cloudflare` in void.config.ts. Void types the
// bindings it infers; these are configured by hand.
declare global {
	interface VoidGeneratedEnvBindings {
		R2_ASSETS: R2Bucket;
	}
}

export {};
