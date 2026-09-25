import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 840;
const CONTENT_HEIGHT = 630;
const CONTENT_TOP = Math.floor((HEIGHT - CONTENT_HEIGHT) / 2);
const TITLE_MAX_LINES = 3;
const DESCRIPTION_MAX_LINES = 3;
const TEXT_LEFT = 88;
const TEXT_MAX_WIDTH = WIDTH - TEXT_LEFT - 60;
// Pango font sizes are in points; at 72 dpi one point equals one pixel.
const TEXT_DPI = 72;
// Transparent glyphs appended to every line so each rendered line has the same
// ink height regardless of its content, which keeps baselines aligned.
const LINE_STRUT_MARKUP = '<span alpha="1">|Åg</span>';
const TITLE_LINE_GAP = 78;
const DESCRIPTION_LINE_GAP = 48;
const FONT_DOWNLOAD_URL =
	'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf';
const FONT_CACHE_PATH = path.join(process.cwd(), '.astro', 'og-fonts', 'NotoSansCJKjp-Regular.otf');

/**
 * Generate OGP PNG files for blog articles at build time.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function ogImageBuildIntegration() {
	return {
		name: 'astro-og-image-build',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const outDir = fileURLToPath(dir);
				const blogRoot = path.join(outDir, 'blog');
				const articlePages = await collectArticlePages(blogRoot);
				const japaneseFontFile = await ensureJapaneseFontFile(logger);
				let generated = 0;

				for (const pagePath of articlePages) {
					const html = await fs.readFile(pagePath, 'utf8');
					const slug = toSlugFromPagePath(pagePath, outDir);
					const title = extractMetaContent(html, 'property', 'og:title') || 'manj.io';
					const description = extractMetaContent(html, 'property', 'og:description') || '';
					const png = await renderPng({ title, description, slug, japaneseFontFile });
					const outputPath = path.join(outDir, 'og', `${slug}.png`);

					await fs.mkdir(path.dirname(outputPath), { recursive: true });
					await fs.writeFile(outputPath, png);
					generated += 1;
				}

				logger.info(`Generated ${generated} OGP images in /og/.`);
			},
		},
	};
}

/**
 * @param {import('astro').AstroIntegrationLogger} logger
 * @returns {Promise<string>}
 */
async function ensureJapaneseFontFile(logger) {
	try {
		await fs.access(FONT_CACHE_PATH);
		return FONT_CACHE_PATH;
	} catch {
		// Download below.
	}

	try {
		const response = await fetch(FONT_DOWNLOAD_URL, {
			headers: {
				'User-Agent': 'manj.io-og-image-builder/1.0',
			},
		});
		if (!response.ok) {
			throw new Error(`status ${response.status}`);
		}

		const bytes = Buffer.from(await response.arrayBuffer());
		await fs.mkdir(path.dirname(FONT_CACHE_PATH), { recursive: true });
		await fs.writeFile(FONT_CACHE_PATH, bytes);
		logger.info('Downloaded Japanese OGP font.');
		return FONT_CACHE_PATH;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Could not download Japanese OGP font (${message}). Falling back to system fonts.`);
		return '';
	}
}

/**
 * @param {string} blogRoot
 * @returns {Promise<string[]>}
 */
async function collectArticlePages(blogRoot) {
	/** @type {string[]} */
	const pages = [];

	const walk = async (directory) => {
		let entries;
		try {
			entries = await fs.readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}
			if (entry.isFile() && entry.name === 'index.html') pages.push(fullPath);
		}
	};

	await walk(blogRoot);
	return pages;
}

/**
 * @param {string} pagePath
 * @param {string} outDir
 * @returns {string}
 */
function toSlugFromPagePath(pagePath, outDir) {
	const relative = path.relative(outDir, pagePath);
	const slug = relative.replace(/index\.html$/i, '').replace(/[\\/]+$/, '');
	return slug.replaceAll(path.sep, '/');
}

/**
 * @param {string} html
 * @param {'name' | 'property'} key
 * @param {string} target
 * @returns {string}
 */
function extractMetaContent(html, key, target) {
	const metaTagRe = /<meta\s+[^>]*>/gi;
	const tags = html.match(metaTagRe) || [];

	for (const tag of tags) {
		const attrs = parseAttributes(tag);
		if (attrs[key] !== target) continue;
		if (typeof attrs.content === 'string') return decodeEntities(attrs.content);
	}

	return '';
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
		attrs[key] = raw.replace(/^['"]|['"]$/g, '');
		match = attrRe.exec(tag);
	}

	return attrs;
}

/**
 * @param {{ title: string; description: string; slug: string; japaneseFontFile: string }} metadata
 * @returns {Promise<Buffer>}
 */
async function renderPng(metadata) {
	const { title, description, slug, japaneseFontFile } = metadata;
	const safeTitle = normalizeText(title);
	const safeDescription = normalizeText(description);
	const safeSlug = normalizeText(slug);

	const titleFont = { fontSize: 62, weight: 700, fontFamily: 'OGPJP', fontfile: japaneseFontFile };
	const descriptionFont = { fontSize: 36, weight: 500, fontFamily: 'OGPJP', fontfile: japaneseFontFile };
	const titleLines = await wrapLines(safeTitle, titleFont, TEXT_MAX_WIDTH, TITLE_MAX_LINES);
	const descriptionLines = safeDescription
		? await wrapLines(safeDescription, descriptionFont, TEXT_MAX_WIDTH, DESCRIPTION_MAX_LINES)
		: [];

	/** @type {import('sharp').OverlayOptions[]} */
	const overlays = [];

	overlays.push(
		createTextOverlay({
			text: 'manj.io / blog',
			left: TEXT_LEFT,
			baseline: yInContent(130),
			fontSize: 28,
			color: '#9ab6f2',
			weight: 700,
			fontFamily: 'OGPJP',
			fontfile: japaneseFontFile,
		}),
	);

	for (const [index, line] of titleLines.entries()) {
		overlays.push(
			createTextOverlay({
				...titleFont,
				text: line,
				left: TEXT_LEFT,
				baseline: yInContent(250 + index * TITLE_LINE_GAP),
				color: '#ffffff',
			}),
		);
	}

	for (const [index, line] of descriptionLines.entries()) {
		overlays.push(
			createTextOverlay({
				...descriptionFont,
				text: line,
				left: TEXT_LEFT,
				baseline: yInContent(430 + index * DESCRIPTION_LINE_GAP),
				color: '#a9c2f6',
			}),
		);
	}

	overlays.push(
		createTextOverlay({
			text: safeSlug,
			left: TEXT_LEFT,
			baseline: yInContent(575),
			fontSize: 24,
			color: '#c7dafb',
			weight: 500,
			fontFamily: 'monospace',
			fontfile: '',
		}),
	);

	return sharp(Buffer.from(renderBackgroundSvg()))
		.png()
		.composite(overlays)
		.png({
			compressionLevel: 9,
			quality: 90,
		})
		.toBuffer();
}

/**
 * @param {{
 *   text: string;
 *   left: number;
 *   baseline: number;
 *   fontSize: number;
 *   color: string;
 *   weight: number;
 *   fontFamily: string;
 *   fontfile: string;
 * }} opts
 * @returns {import('sharp').OverlayOptions}
 */
function createTextOverlay(opts) {
	const { text, left, baseline, fontSize, color, weight, fontFamily, fontfile } = opts;
	const markup = `<span foreground="${color}" weight="${weight}">${escapePango(text)}</span>${LINE_STRUT_MARKUP}`;

	return {
		input: { text: createTextInput(markup, { fontSize, fontFamily, fontfile }) },
		left,
		top: Math.max(0, Math.round(baseline - fontSize)),
	};
}

/**
 * Build a fixed-size text input. `height` is deliberately omitted: when both
 * width and height are set, libvips auto-fits each line to the box, which makes
 * short lines larger than long ones.
 *
 * @param {string} markup
 * @param {{ fontSize: number; fontFamily: string; fontfile: string }} font
 * @returns {import('sharp').CreateText}
 */
function createTextInput(markup, font) {
	/** @type {import('sharp').CreateText} */
	const textInput = {
		text: markup,
		font: `${font.fontFamily} ${font.fontSize}`,
		dpi: TEXT_DPI,
		rgba: true,
		align: 'left',
		wrap: 'none',
	};
	if (font.fontfile) textInput.fontfile = font.fontfile;
	return textInput;
}

/**
 * @typedef {{ fontSize: number; weight: number; fontFamily: string; fontfile: string }} TextFont
 */

/** @type {Map<string, number>} */
const textWidthCache = new Map();

/**
 * @param {string} text
 * @param {TextFont} font
 * @returns {Promise<number>}
 */
async function measureTextWidth(text, font) {
	if (!text) return 0;
	const key = `${font.fontFamily}|${font.fontSize}|${font.weight}|${font.fontfile}|${text}`;
	const cached = textWidthCache.get(key);
	if (cached !== undefined) return cached;

	const markup = `<span weight="${font.weight}">${escapePango(text)}</span>`;
	const { info } = await sharp({ text: createTextInput(markup, font) }).raw().toBuffer({ resolveWithObject: true });
	textWidthCache.set(key, info.width);
	return info.width;
}

/**
 * @returns {string}
 */
function renderBackgroundSvg() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Open Graph image">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020" />
      <stop offset="50%" stop-color="#152445" />
      <stop offset="100%" stop-color="#1f4f7f" />
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7dd3fc" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="88" y="${yInContent(76)}" width="220" height="10" rx="5" fill="url(#line)" />
</svg>`;
}

/**
 * @param {number} y
 * @returns {number}
 */
function yInContent(y) {
	return CONTENT_TOP + y;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
	return value.replace(/\s+/g, ' ').trim();
}

/**
 * Wrap text into lines that fit `maxWidth` when rendered with `font`.
 *
 * @param {string} text
 * @param {TextFont} font
 * @param {number} maxWidth
 * @param {number} maxLines
 * @returns {Promise<string[]>}
 */
async function wrapLines(text, font, maxWidth, maxLines) {
	/** @type {string[]} */
	const lines = [];
	let rest = [...text];

	while (rest.length > 0 && lines.length < maxLines) {
		const isLastLine = lines.length === maxLines - 1;
		const fitCount = await countFittingChars(rest, font, maxWidth);

		if (fitCount >= rest.length) {
			lines.push(rest.join(''));
			rest = [];
			break;
		}

		if (isLastLine) {
			lines.push(await fitWithEllipsis(rest, font, maxWidth));
			rest = [];
			break;
		}

		const breakAt = findBreakIndex(rest, fitCount);
		lines.push(rest.slice(0, breakAt).join('').trimEnd());
		rest = [...rest.slice(breakAt).join('').trimStart()];
	}

	return lines;
}

/**
 * Largest prefix length of `chars` whose rendered width fits `maxWidth`.
 *
 * @param {string[]} chars
 * @param {TextFont} font
 * @param {number} maxWidth
 * @param {string} [suffix]
 * @returns {Promise<number>}
 */
async function countFittingChars(chars, font, maxWidth, suffix = '') {
	let low = 0;
	let high = chars.length;

	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		const width = await measureTextWidth(chars.slice(0, mid).join('') + suffix, font);
		if (width <= maxWidth) low = mid;
		else high = mid - 1;
	}

	return Math.max(low, 1);
}

/**
 * @param {string[]} chars
 * @param {TextFont} font
 * @param {number} maxWidth
 * @returns {Promise<string>}
 */
async function fitWithEllipsis(chars, font, maxWidth) {
	const count = await countFittingChars(chars, font, maxWidth, '…');
	return `${chars.slice(0, count).join('').trimEnd()}…`;
}

/**
 * Avoid splitting a Latin word across lines by moving the break back to the
 * preceding space, as long as that keeps the line reasonably full.
 *
 * @param {string[]} chars
 * @param {number} fitCount
 * @returns {number}
 */
function findBreakIndex(chars, fitCount) {
	const isWordChar = (char) => /[A-Za-z0-9]/.test(char ?? '');
	if (!isWordChar(chars[fitCount - 1]) || !isWordChar(chars[fitCount])) return fitCount;

	for (let index = fitCount - 1; index > fitCount / 2; index -= 1) {
		if (!isWordChar(chars[index - 1])) return index;
	}

	return fitCount;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapePango(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
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
