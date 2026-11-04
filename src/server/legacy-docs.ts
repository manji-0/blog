const LEGACY_PREFIXES = [
	['/docs/kamae-rs', '/projects/kamae-rs'],
	['/docs/kamae-py', '/projects/kamae-py'],
	['/docs/kamae-scala', '/projects/kamae-scala'],
] as const;

/** Where a pre-`/projects/` URL moved to, keeping the rest of the path and the query. */
export function legacyDocsLocation(url: URL): string | null {
	for (const [from, to] of LEGACY_PREFIXES) {
		if (url.pathname === from || url.pathname.startsWith(`${from}/`)) {
			return `${to}${url.pathname.slice(from.length)}${url.search}`;
		}
	}
	return null;
}
