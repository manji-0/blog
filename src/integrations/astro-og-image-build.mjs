import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const TITLE_MAX_LINES = 3;
const DESCRIPTION_MAX_LINES = 3;
const TITLE_LINE_CHARS = 25;
const DESCRIPTION_LINE_CHARS = 40;

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
				let generated = 0;

				for (const pagePath of articlePages) {
					const html = await fs.readFile(pagePath, 'utf8');
					const slug = toSlugFromPagePath(pagePath, outDir);
					const title = extractMetaContent(html, 'property', 'og:title') || 'manj.io';
					const description = extractMetaContent(html, 'property', 'og:description') || '';
					const png = await renderPng({ title, description, slug });
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
 * @param {{ title: string; description: string; slug: string }} metadata
 * @returns {Promise<Buffer>}
 */
async function renderPng(metadata) {
	const svg = renderSvg(metadata);
	return sharp(Buffer.from(svg))
		.png({
			compressionLevel: 9,
			quality: 90,
		})
		.toBuffer();
}

/**
 * @param {{ title: string; description: string; slug: string }} metadata
 * @returns {string}
 */
function renderSvg({ title, description, slug }) {
	const safeTitle = normalizeText(title);
	const safeDescription = normalizeText(description);
	const safeSlug = normalizeText(slug);

	const titleLines = wrapLines(safeTitle, TITLE_LINE_CHARS, TITLE_MAX_LINES);
	const descriptionLines = safeDescription
		? wrapLines(safeDescription, DESCRIPTION_LINE_CHARS, DESCRIPTION_MAX_LINES)
		: [];

	const titleTspans = titleLines
		.map((line, index) => `<tspan x="88" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
		.join('');

	const descriptionTspans = descriptionLines
		.map((line, index) => `<tspan x="88" dy="${index === 0 ? 0 : 48}">${escapeXml(line)}</tspan>`)
		.join('');

	const descriptionBlock = descriptionLines.length
		? `<text x="88" y="430" fill="#a9c2f6" font-family="Noto Sans JP, 'Yu Gothic UI', 'Hiragino Sans', sans-serif" font-size="36" font-weight="500">${descriptionTspans}</text>`
		: '';

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
  <rect x="88" y="76" width="220" height="10" rx="5" fill="url(#line)" />
  <text x="88" y="130" fill="#9ab6f2" font-family="Noto Sans JP, 'Yu Gothic UI', 'Hiragino Sans', sans-serif" font-size="28" font-weight="700">manj.io / blog</text>
  <text x="88" y="250" fill="#ffffff" font-family="Noto Sans JP, 'Yu Gothic UI', 'Hiragino Sans', sans-serif" font-size="62" font-weight="700">${titleTspans}</text>
  ${descriptionBlock}
  <text x="88" y="575" fill="#c7dafb" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace" font-size="24">${escapeXml(safeSlug)}</text>
</svg>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
	return value.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapLines(text, maxCharsPerLine, maxLines) {
	const chars = [...text];
	const lines = [];
	let current = '';

	for (const char of chars) {
		if (current.length >= maxCharsPerLine) {
			lines.push(current);
			current = '';
		}
		current += char;
		if (lines.length >= maxLines) break;
	}

	if (lines.length < maxLines && current) lines.push(current);

	if (lines.length > maxLines) lines.length = maxLines;
	if (lines.length === maxLines && chars.length > lines.join('').length) {
		lines[maxLines - 1] = trimWithEllipsis(lines[maxLines - 1], maxCharsPerLine);
	}

	return lines;
}

/**
 * @param {string} value
 * @param {number} maxChars
 * @returns {string}
 */
function trimWithEllipsis(value, maxChars) {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}…`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeXml(value) {
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
