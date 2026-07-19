import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const rootDir = process.cwd();
export const projectsContentDir = join(rootDir, 'src/content/docs/projects');

/** @type {readonly string[]} */
export const PROJECT_ORDER = [
	'dagayn',
	'rdra-ish',
	'track',
	'bmd',
	'kamae-model-translator',
	'kamae-rs',
	'kamae-py',
	'kamae-scala',
];

/** @returns {string[]} */
export function listProjectSlugs() {
	const discovered = readdirSync(projectsContentDir).filter((name) => {
		return statSync(join(projectsContentDir, name)).isDirectory();
	});
	const order = new Map(PROJECT_ORDER.map((slug, index) => [slug, index]));
	return discovered.sort((a, b) => {
		const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
		const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
		return aOrder - bOrder || a.localeCompare(b);
	});
}

/**
 * @param {string} content
 * @returns {string}
 */
function stripMarkdown(text) {
	return text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^_[^_]+_\s*[—–-]\s*/, '')
		.trim();
}

/**
 * @param {string} content
 * @returns {string}
 */
function extractFirstParagraph(content) {
	for (const block of content.split(/\n\s*\n/)) {
		const trimmed = block.trim();
		if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#')) continue;
		if (/^_[^_]+_$/.test(trimmed)) continue;
		return stripMarkdown(trimmed);
	}
	return '';
}

/**
 * @returns {Array<{ slug: string; label: string; link: string; description: string }>}
 */
export function getProjectSummaries() {
	return listProjectSlugs().map((slug) => {
		const indexPath = join(projectsContentDir, slug, 'index.md');
		const { data, content } = matter(readFileSync(indexPath, 'utf8'));
		const description = data.description ?? extractFirstParagraph(content);

		return {
			slug,
			label: data.project?.label ?? slug,
			link: `/projects/${slug}/`,
			description,
		};
	});
}
