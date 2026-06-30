import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import matter from 'gray-matter';
import {
	getKamaePythonSidebarItems,
	getKamaeRustSidebarItems,
	getKamaeScalaSidebarItems,
} from './kamae-sidebar.mjs';
import { getDagaynSidebarItems, getRdraIshSidebarItems } from './project-sidebar.mjs';
import { listProjectSlugs, projectsContentDir } from './lib/projects.mjs';

const rootDir = process.cwd();
const blogContentDir = join(rootDir, 'src/content/docs/blog');

/** @type {Record<string, () => import('./kamae-sidebar.mjs').SidebarGroup[]>} */
const PROJECT_TREES = {
	dagayn: getDagaynSidebarItems,
	'rdra-ish': getRdraIshSidebarItems,
	'kamae-rs': getKamaeRustSidebarItems,
	'kamae-py': getKamaePythonSidebarItems,
	'kamae-scala': getKamaeScalaSidebarItems,
};

function getGitCreatedTimestamp(pathname) {
	try {
		const output = execFileSync(
			'git',
			['log', '--follow', '--diff-filter=A', '--format=%ct', '--', pathname],
			{ cwd: rootDir, encoding: 'utf8' },
		).trim();
		const timestamp = Number(output.split('\n').filter(Boolean).at(-1));
		return Number.isFinite(timestamp) ? timestamp : undefined;
	} catch {
		return undefined;
	}
}

function getFileCreatedTimestamp(fileUrl, pathname) {
	const stats = statSync(fileUrl);
	const createdAt = Math.trunc(stats.birthtimeMs / 1000);
	return getGitCreatedTimestamp(pathname) ?? (Number.isFinite(createdAt) ? createdAt : 0);
}

function getBlogSidebarItem(year, filename) {
	const filePath = join(blogContentDir, year, filename);
	const { data } = matter(readFileSync(filePath, 'utf8'));
	const slug = filename.replace(/\.mdx?$/, '');

	return {
		label: data.sidebar?.label ?? data.title ?? slug,
		link: `/blog/${year}/${slug}`,
		_sidebarOrder: data.sidebar?.order,
		_createdTimestamp: getFileCreatedTimestamp(filePath, filePath),
	};
}

function getBlogSidebarSortKey(item) {
	return item._sidebarOrder ?? -item._createdTimestamp;
}

function getBlogYearSidebar(year) {
	const items = readdirSync(join(blogContentDir, year))
		.filter((filename) => /\.mdx?$/.test(filename))
		.map((filename) => getBlogSidebarItem(year, filename))
		.filter((item) => item.label)
		.sort(
			(a, b) =>
				getBlogSidebarSortKey(a) - getBlogSidebarSortKey(b) || a.link.localeCompare(b.link),
		)
		.map(({ _sidebarOrder, _createdTimestamp, ...item }) => item);

	return { label: year, items };
}

/** @returns {Array<{ label: string; link: string }>} */
function getProjectIndexLinks() {
	return listProjectSlugs().map((projectSlug) => ({
		label: projectSlug,
		link: `/projects/${projectSlug}/`,
	}));
}

/** @param {string | undefined} routeId */
export function getProjectSlugFromRouteId(routeId) {
	if (!routeId?.startsWith('projects/')) return undefined;
	const slug = routeId.split('/')[1];
	return slug || undefined;
}

/** Site-wide sidebar for top, blog, resume, and other non-project pages. */
export function getSiteSidebarConfig() {
	return [
		{ label: 'Top', link: '/' },
		{ label: 'Resume', link: '/resume' },
		{
			label: 'Blog',
			items: [
				getBlogYearSidebar('2026'),
				getBlogYearSidebar('2023'),
				getBlogYearSidebar('2022'),
				getBlogYearSidebar('2021'),
			],
		},
		{
			label: 'Projects',
			items: getProjectIndexLinks(),
		},
	];
}

/** Sidebar for a single project section: Top link + that project's tree. */
export function getProjectSidebarConfig(projectSlug) {
	const treeBuilder = PROJECT_TREES[projectSlug];
	const tree = treeBuilder ? treeBuilder() : getSimpleProjectTree(projectSlug);

	return [{ label: 'Top', link: '/' }, ...tree];
}

function getSimpleProjectTree(projectSlug) {
	const indexPath = join(projectsContentDir, projectSlug, 'index.md');
	const { data } = matter(readFileSync(indexPath, 'utf8'));
	return [{ label: data.sidebar?.label ?? 'はじめに', link: `/projects/${projectSlug}/` }];
}
