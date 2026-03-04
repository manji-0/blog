import { visit } from 'unist-util-visit';

const STANDALONE_URL_RE = /^https?:\/\/[^\s<>"`]+$/i;

const DEFAULT_OPTIONS = {
	timeoutMs: 7000,
	maxDescriptionLength: 180,
	userAgent: 'manj.io-link-card-bot/1.0 (+https://manj.io)',
};

/**
 * Convert URL-only paragraphs into rich link cards.
 *
 * @param {{
 *   timeoutMs?: number;
 *   maxDescriptionLength?: number;
 *   userAgent?: string;
 * }} [options]
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkLinkCard(options = {}) {
	const settings = { ...DEFAULT_OPTIONS, ...options };
	const metadataCache = new Map();

	return async (tree) => {
		/** @type {{ parent: import('mdast').Parent; index: number; url: string }[]} */
		const targets = [];

		visit(tree, 'paragraph', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const url = getStandaloneUrl(node);
			if (!url) return;

			targets.push({ parent, index, url });
		});

		for (const target of targets) {
			const metadata = await getMetadata(target.url, settings, metadataCache);
			target.parent.children[target.index] = {
				type: 'html',
				value: toCardHtml(metadata),
			};
		}
	};
}

/**
 * @param {import('mdast').Paragraph} paragraph
 * @returns {string | null}
 */
function getStandaloneUrl(paragraph) {
	if (!Array.isArray(paragraph.children) || paragraph.children.length !== 1) return null;
	const child = paragraph.children[0];

	if (child.type === 'text') {
		const value = normalizeWhitespace(child.value);
		return STANDALONE_URL_RE.test(value) ? value : null;
	}

	if (child.type === 'link' && typeof child.url === 'string') {
		const url = normalizeWhitespace(child.url);
		const label = normalizeWhitespace(toPlainText(child));
		if (label === url && STANDALONE_URL_RE.test(url)) return url;
	}

	return null;
}

/**
 * @param {import('mdast').Node} node
 * @returns {string}
 */
function toPlainText(node) {
	if (!node || typeof node !== 'object') return '';
	if ('value' in node && typeof node.value === 'string') return node.value;
	if ('children' in node && Array.isArray(node.children)) {
		return node.children.map(toPlainText).join('');
	}
	return '';
}

/**
 * @param {string} url
 * @param {{ timeoutMs: number; maxDescriptionLength: number; userAgent: string }} settings
 * @param {Map<string, Promise<LinkCardMetadata>>} cache
 * @returns {Promise<LinkCardMetadata>}
 */
function getMetadata(url, settings, cache) {
	const cached = cache.get(url);
	if (cached) return cached;

	const pending = loadMetadata(url, settings).catch(() => fallbackMetadata(url));
	cache.set(url, pending);
	return pending;
}

/**
 * @param {string} url
 * @param {{ timeoutMs: number; maxDescriptionLength: number; userAgent: string }} settings
 * @returns {Promise<LinkCardMetadata>}
 */
async function loadMetadata(url, settings) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'text/html,application/xhtml+xml',
				'User-Agent': settings.userAgent,
			},
			signal: controller.signal,
		});

		const finalUrl = response.url || url;
		const contentType = response.headers.get('content-type') ?? '';
		if (!response.ok || !contentType.toLowerCase().includes('text/html')) {
			return fallbackMetadata(finalUrl);
		}

		const html = await response.text();
		const meta = collectMetadata(html);
		const title = cleanupText(meta.get('og:title') || meta.get('twitter:title') || extractTitle(html));
		const description = clipText(
			cleanupText(meta.get('og:description') || meta.get('description') || meta.get('twitter:description')),
			settings.maxDescriptionLength,
		);
		const siteName = cleanupText(meta.get('og:site_name'));
		const image = toAbsoluteUrl(meta.get('og:image') || meta.get('twitter:image'), finalUrl);

		return {
			url: finalUrl,
			title: title || hostnameOf(finalUrl),
			description,
			siteName: siteName || hostnameOf(finalUrl),
			image,
		};
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * @param {string} html
 * @returns {Map<string, string>}
 */
function collectMetadata(html) {
	const map = new Map();
	const metaTagRe = /<meta\s+[^>]*>/gi;
	const tags = html.match(metaTagRe) || [];

	for (const tag of tags) {
		const attrs = parseAttributes(tag);
		const content = cleanupText(attrs.content);
		if (!content) continue;
		if (attrs.property) map.set(attrs.property.toLowerCase(), content);
		if (attrs.name) map.set(attrs.name.toLowerCase(), content);
	}

	return map;
}

/**
 * @param {string} tag
 * @returns {Record<string, string>}
 */
function parseAttributes(tag) {
	/** @type {Record<string, string>} */
	const attrs = {};
	const attrRe = /([^\s=/>]+)\s*=\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s>]+)/g;
	let match = attrRe.exec(tag);

	while (match) {
		const key = match[1].toLowerCase();
		const raw = match[2] || '';
		const value = raw.replace(/^['"]|['"]$/g, '');
		attrs[key] = decodeEntities(value);
		match = attrRe.exec(tag);
	}

	return attrs;
}

/**
 * @param {string} html
 * @returns {string}
 */
function extractTitle(html) {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return '';
	return cleanupText(match[1].replace(/<[^>]+>/g, ' '));
}

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function cleanupText(value) {
	return normalizeWhitespace(decodeEntities(value || ''));
}

/**
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function clipText(value, maxLength) {
	if (!value || value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * @param {string | undefined} value
 * @param {string} base
 * @returns {string}
 */
function toAbsoluteUrl(value, base) {
	if (!value) return '';
	try {
		return new URL(value, base).href;
	} catch {
		return '';
	}
}

/**
 * @param {string} url
 * @returns {LinkCardMetadata}
 */
function fallbackMetadata(url) {
	return {
		url,
		title: hostnameOf(url),
		description: '',
		siteName: hostnameOf(url),
		image: '',
	};
}

/**
 * @param {string} url
 * @returns {string}
 */
function hostnameOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./i, '');
	} catch {
		return url;
	}
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeWhitespace(value) {
	return value.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
	return value
		.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => fromCodePointSafe(match, Number.parseInt(code, 16)))
		.replace(/&#([0-9]+);/g, (match, code) => fromCodePointSafe(match, Number.parseInt(code, 10)))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

/**
 * @param {string} fallback
 * @param {number} codePoint
 * @returns {string}
 */
function fromCodePointSafe(fallback, codePoint) {
	if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback;
	try {
		return String.fromCodePoint(codePoint);
	} catch {
		return fallback;
	}
}

/**
 * @param {LinkCardMetadata} metadata
 * @returns {string}
 */
function toCardHtml(metadata) {
	const href = escapeHtmlAttr(metadata.url);
	const title = escapeHtml(metadata.title);
	const description = metadata.description
		? `<p class="link-card__description">${escapeHtml(metadata.description)}</p>`
		: '';
	const image = metadata.image
		? `<span class="link-card__image-wrap"><img class="link-card__image" src="${escapeHtmlAttr(metadata.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>`
		: '';

	return `<a class="link-card" href="${href}" target="_blank" rel="noopener noreferrer"><span class="link-card__body"><span class="link-card__title">${title}</span>${description}<span class="link-card__meta">${escapeHtml(metadata.siteName)}</span></span>${image}</a>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlAttr(value) {
	return escapeHtml(value);
}

/**
 * @typedef {object} LinkCardMetadata
 * @property {string} url
 * @property {string} title
 * @property {string} description
 * @property {string} siteName
 * @property {string} image
 */
