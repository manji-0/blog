const HATENA_BOOKMARK_API_URL = 'https://b.hatena.ne.jp/entry/jsonlite/';
const HATENA_BOOKMARK_FETCH_TIMEOUT_MS = 2500;

const entryCache = new Map();

/**
 * @typedef {object} HatenaBookmarkComment
 * @property {string} user
 * @property {string} comment
 * @property {string[]} tags
 * @property {string} timestamp
 */

/**
 * @typedef {object} HatenaBookmarkEntry
 * @property {number} count
 * @property {string} entryUrl
 * @property {HatenaBookmarkComment[]} comments
 */

/**
 * @param {string} pageUrl
 * @returns {Promise<HatenaBookmarkEntry | null>}
 */
export function getHatenaBookmarkEntry(pageUrl) {
	if (!entryCache.has(pageUrl)) {
		entryCache.set(pageUrl, fetchHatenaBookmarkEntry(pageUrl));
	}
	return entryCache.get(pageUrl);
}

/** @param {string} pageUrl */
export function getHatenaBookmarkEntryUrl(pageUrl) {
	const url = new URL(pageUrl);
	const path = `${url.host}${url.pathname}${url.search}${url.hash}`;
	const protocolPrefix = url.protocol === 'https:' ? 's/' : '';
	return `https://b.hatena.ne.jp/entry/${protocolPrefix}${path}`;
}

/** @param {string} user */
export function getHatenaUserUrl(user) {
	return `https://b.hatena.ne.jp/${encodeURIComponent(user)}/`;
}

/** @param {string} tag */
export function getHatenaTagUrl(tag) {
	return `https://b.hatena.ne.jp/search/tag?q=${encodeURIComponent(tag)}`;
}

/** @param {string} pageUrl */
async function fetchHatenaBookmarkEntry(pageUrl) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), HATENA_BOOKMARK_FETCH_TIMEOUT_MS);
	const apiUrl = new URL(HATENA_BOOKMARK_API_URL);
	apiUrl.searchParams.set('url', pageUrl);

	try {
		const response = await fetch(apiUrl, {
			headers: { accept: 'application/json' },
			signal: controller.signal,
		});

		if (!response.ok) return null;

		const data = await response.json();
		return normalizeEntry(data, pageUrl);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * @param {unknown} data
 * @param {string} pageUrl
 * @returns {HatenaBookmarkEntry | null}
 */
function normalizeEntry(data, pageUrl) {
	if (!data || typeof data !== 'object') return null;

	const record = /** @type {Record<string, unknown>} */ (data);
	return {
		count: normalizeCount(record.count),
		entryUrl: typeof record.entry_url === 'string' ? record.entry_url : getHatenaBookmarkEntryUrl(pageUrl),
		comments: normalizeComments(record.bookmarks),
	};
}

/** @param {unknown} count */
function normalizeCount(count) {
	const value = typeof count === 'number' || typeof count === 'string' ? Number(count) : 0;
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/** @param {unknown} bookmarks */
function normalizeComments(bookmarks) {
	if (!Array.isArray(bookmarks)) return [];

	return bookmarks
		.map((bookmark) => {
			if (!bookmark || typeof bookmark !== 'object') return undefined;

			const record = /** @type {Record<string, unknown>} */ (bookmark);
			const user = typeof record.user === 'string' ? record.user.trim() : '';
			const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
			const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
			const tags = Array.isArray(record.tags)
				? record.tags.filter((tag) => typeof tag === 'string' && tag.length > 0)
				: [];

			if (!user || !comment) return undefined;

			return { user, comment, tags, timestamp };
		})
		.filter(Boolean)
		.slice(0, 5);
}
