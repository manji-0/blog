#!/usr/bin/env node
/**
 * Sync Kamae skill documentation from source repositories into Starlight content.
 *
 * Usage:
 *   node scripts/sync-kamae-docs.mjs
 *
 * Source repos (override with env vars):
 *   KAMAE_RS_SRC  default: ~/src/kamae-rs
 *   KAMAE_PY_SRC  default: ~/src/kamae-py
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const blogRoot = resolve(__dirname, '..');
const docsRoot = join(blogRoot, 'src/content/docs/docs');

const SOURCES = {
	'kamae-rs': resolve(process.env.KAMAE_RS_SRC ?? join(homedir(), 'src/kamae-rs')),
	'kamae-py': resolve(process.env.KAMAE_PY_SRC ?? join(homedir(), 'src/kamae-py')),
};

/** @typedef {{ slug: string, sidebarOrder?: number, sidebarLabel?: string }} DocSpec */

/** @type {Record<string, DocSpec[]>} */
const PACKAGE_SPECS = {
	'kamae-rs': [
		{ slug: 'index', sidebarOrder: 0, sidebarLabel: 'Overview' },
		{ slug: 'guide', sidebarOrder: 1, sidebarLabel: 'Guide' },
		{ slug: 'rules', sidebarOrder: 2, sidebarLabel: 'Rules' },
		{ slug: 'review/index', sidebarOrder: 3, sidebarLabel: 'Review' },
		{ slug: 'review/checklist', sidebarOrder: 4, sidebarLabel: 'Checklists' },
		{ slug: 'references', sidebarOrder: 10 },
		{ slug: 'references/crate-guides', sidebarOrder: 11, sidebarLabel: 'Crate Guides' },
		{ slug: 'examples/taxi-request', sidebarOrder: 20, sidebarLabel: 'Taxi Request Example' },
	],
	'kamae-py': [
		{ slug: 'index', sidebarOrder: 0, sidebarLabel: 'Overview' },
		{ slug: 'guide', sidebarOrder: 1, sidebarLabel: 'Guide' },
		{ slug: 'rules', sidebarOrder: 2, sidebarLabel: 'Rules' },
		{ slug: 'review/index', sidebarOrder: 3, sidebarLabel: 'Review' },
		{ slug: 'review/checklist', sidebarOrder: 4, sidebarLabel: 'Checklists' },
		{ slug: 'references', sidebarOrder: 10 },
		{ slug: 'examples/taxi-request', sidebarOrder: 20, sidebarLabel: 'Taxi Request Example' },
	],
};

/** @type {Record<string, Record<string, string>>} */
const FILE_MAPPINGS = {
	'kamae-rs': {
		index: 'README.md',
		guide: 'skills/kamae-rs/SKILL.md',
		rules: 'rules/README.md',
		'review/index': 'skills/kamae-rs-review/SKILL.md',
	},
	'kamae-py': {
		index: 'README.md',
		guide: 'skills/kamae-py/SKILL.md',
		rules: 'rules/README.md',
		'review/index': 'skills/kamae-py-review/SKILL.md',
	},
};

/**
 * @param {string} packageSlug
 * @param {string} relativePath
 */
function toDocUrl(packageSlug, relativePath) {
	if (/\.(py|rs|toml|yml|yaml|json|sh|lock)$/.test(relativePath) && !/taxi-request\.(py|rs)$/.test(relativePath)) {
		return null;
	}

	let path = relativePath.replace(/^\.\//, '').replace(/\/$/, '');
	let targetPackage = packageSlug;

	if (path.includes('kamae-rs')) {
		targetPackage = 'kamae-rs';
	} else if (path.includes('kamae-py')) {
		targetPackage = 'kamae-py';
	}

	path = path
		.replace(/^\.\.\/kamae-rs\//, '')
		.replace(/^\.\.\/kamae-py\//, '')
		.replace(/^skills\/kamae-rs\//, '')
		.replace(/^skills\/kamae-py\//, '')
		.replace(/^skills\/kamae-rs-review\//, 'review/')
		.replace(/^skills\/kamae-py-review\//, 'review/')
		.replace(/\/SKILL\.md$/, '/guide')
		.replace(/^SKILL\.md$/, 'guide')
		.replace(/\.md$/, '');

	if (/taxi-request\.rs$/.test(relativePath) || path.endsWith('examples/taxi-request')) {
		return '/docs/kamae-rs/examples/taxi-request/';
	}
	if (/taxi-request\.py$/.test(relativePath) || (targetPackage === 'kamae-py' && path === 'references/taxi-request')) {
		return '/docs/kamae-py/examples/taxi-request/';
	}

	if (path.startsWith('checklist/')) {
		path = `review/${path}`;
	}

	if (path === 'crate-guides' || path.startsWith('crate-guides/')) {
		path = `references/${path}`;
	}

	if (path === 'references' || path.startsWith('references/')) {
		// already qualified
	} else if (!path.includes('/')) {
		path = `references/${path}`;
	}

	return `/docs/${targetPackage}/${path}/`;
}

/**
 * @param {string} body
 * @param {string} packageSlug
 */
function rewriteLinks(body, packageSlug) {
	const repoUrl =
		packageSlug === 'kamae-rs'
			? 'https://github.com/manji-0/kamae-rs'
			: 'https://github.com/manji-0/kamae-py';

	return body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, href) => {
		if (/^(https?:|mailto:|#)/.test(href)) {
			return match;
		}

		if (href.startsWith('/docs/')) {
			return match;
		}

		const [pathPart, hash = ''] = href.split('#');
		const url = toDocUrl(packageSlug, pathPart);
		if (!url) {
			if (/^(scripts|assets)\//.test(pathPart) || pathPart.includes('/scripts/')) {
				const githubHref = `${repoUrl}/blob/main/${pathPart.replace(/^\.\//, '')}`;
				return `[${text}](${githubHref}${hash ? `#${hash}` : ''})`;
			}
			return match;
		}

		return `[${text}](${url}${hash ? `#${hash}` : ''})`;
	});
}

/**
 * @param {string} content
 */
function stripAgentFrontmatter(content) {
	if (!content.startsWith('---\n')) {
		return content;
	}

	const end = content.indexOf('\n---\n', 4);
	if (end === -1) {
		return content;
	}

	const frontmatter = content.slice(4, end);
	if (!/^name:\s/m.test(frontmatter)) {
		return content;
	}

	return content.slice(end + 5);
}

/**
 * @param {string} body
 */
function extractTitle(body) {
	const match = body.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim() ?? 'Untitled';
}

/**
 * @param {string} body
 */
function stripLeadingH1(body) {
	return body.replace(/^\s*#\s+.+\n+/, '');
}

/**
 * @param {{ title: string, body: string, sidebarOrder?: number, sidebarLabel?: string }} input
 */
function wrapFrontmatter({ title, body, sidebarOrder, sidebarLabel }) {
	const lines = ['---', `title: ${JSON.stringify(title)}`];
	if (sidebarOrder !== undefined) {
		lines.push('sidebar:');
		lines.push(`  order: ${sidebarOrder}`);
		if (sidebarLabel) {
			lines.push(`  label: ${JSON.stringify(sidebarLabel)}`);
		}
	}
	lines.push('---', '', body.trimEnd(), '');
	return lines.join('\n');
}

/**
 * @param {string} packageSlug
 * @param {string} sourcePath
 * @param {string} destSlug
 * @param {DocSpec} spec
 */
function writeMarkdownDoc(packageSlug, sourcePath, destSlug, spec) {
	const raw = readFileSync(sourcePath, 'utf8');
	let body = stripAgentFrontmatter(raw);
	const title = extractTitle(body);
	body = stripLeadingH1(body);
	body = rewriteLinks(body, packageSlug);

	if (destSlug === 'index') {
		const repoUrl =
			packageSlug === 'kamae-rs'
				? 'https://github.com/manji-0/kamae-rs'
				: 'https://github.com/manji-0/kamae-py';
		body = `> Source: [${repoUrl}](${repoUrl})\n\n${body}`;
	}

	const output = wrapFrontmatter({
		title,
		body,
		sidebarOrder: spec.sidebarOrder,
		sidebarLabel: spec.sidebarLabel,
	});

	const destPath = join(docsRoot, packageSlug, `${destSlug}.md`);
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, output, 'utf8');
}

/**
 * @param {string} packageSlug
 * @param {string} sourceDir
 * @param {string} destPrefix
 * @param {number} baseOrder
 */
function syncDirectory(packageSlug, sourceDir, destPrefix, baseOrder) {
	if (!existsSync(sourceDir)) {
		return;
	}

	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = join(sourceDir, entry.name);
		if (entry.isDirectory()) {
			syncDirectory(packageSlug, sourcePath, `${destPrefix}/${entry.name}`, baseOrder);
			continue;
		}

		if (!entry.name.endsWith('.md')) {
			continue;
		}

		const slug = `${destPrefix}/${entry.name.replace(/\.md$/, '')}`;
		writeMarkdownDoc(packageSlug, sourcePath, slug, { slug, sidebarOrder: baseOrder });
	}
}

/**
 * @param {string} packageSlug
 * @param {string} sourcePath
 * @param {string} destSlug
 * @param {string} language
 * @param {DocSpec} spec
 */
function writeExampleDoc(packageSlug, sourcePath, destSlug, language, spec) {
	const code = readFileSync(sourcePath, 'utf8').trimEnd();
	const title = 'Taxi Request Example';
	const body = rewriteLinks(
		`End-to-end example from the Kamae ${packageSlug === 'kamae-rs' ? 'Rust' : 'Python'} skill package.\n\n\`\`\`${language}\n${code}\n\`\`\``,
		packageSlug,
	);
	const output = wrapFrontmatter({
		title,
		body,
		sidebarOrder: spec.sidebarOrder,
		sidebarLabel: spec.sidebarLabel,
	});
	const destPath = join(docsRoot, packageSlug, `${destSlug}.md`);
	mkdirSync(dirname(destPath), { recursive: true });
	writeFileSync(destPath, output, 'utf8');
}

/**
 * @param {string} packageSlug
 */
function syncPackage(packageSlug) {
	const sourceRoot = SOURCES[packageSlug];
	if (!existsSync(sourceRoot)) {
		throw new Error(`Source repository not found: ${sourceRoot}`);
	}

	const outputDir = join(docsRoot, packageSlug);
	rmSync(outputDir, { recursive: true, force: true });
	mkdirSync(outputDir, { recursive: true });

	const mappings = FILE_MAPPINGS[packageSlug];
	for (const [destSlug, relativeSource] of Object.entries(mappings)) {
		const sourcePath = join(sourceRoot, relativeSource);
		const spec = PACKAGE_SPECS[packageSlug].find((item) => item.slug === destSlug) ?? { slug: destSlug };
		writeMarkdownDoc(packageSlug, sourcePath, destSlug, spec);
	}

	syncDirectory(
		packageSlug,
		join(sourceRoot, 'skills', packageSlug, 'references'),
		'references',
		10,
	);

	syncDirectory(
		packageSlug,
		join(sourceRoot, 'skills', `${packageSlug}-review`, 'checklist'),
		'review/checklist',
		5,
	);

	if (packageSlug === 'kamae-rs') {
		const examplePath = join(sourceRoot, 'skills/kamae-rs/examples/taxi-request.rs');
		const spec = PACKAGE_SPECS[packageSlug].find((item) => item.slug === 'examples/taxi-request') ?? {
			slug: 'examples/taxi-request',
		};
		writeExampleDoc(packageSlug, examplePath, 'examples/taxi-request', 'rust', spec);
	} else {
		const examplePath = join(sourceRoot, 'skills/kamae-py/references/taxi-request.py');
		const spec = PACKAGE_SPECS[packageSlug].find((item) => item.slug === 'examples/taxi-request') ?? {
			slug: 'examples/taxi-request',
		};
		writeExampleDoc(packageSlug, examplePath, 'examples/taxi-request', 'python', spec);
	}

	console.log(`Synced ${packageSlug} from ${sourceRoot}`);
}

function main() {
	for (const packageSlug of Object.keys(SOURCES)) {
		syncPackage(packageSlug);
	}
}

main();
