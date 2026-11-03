import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import {
	getKamaePythonSidebarItems,
	getKamaeRustSidebarItems,
	getKamaeScalaSidebarItems,
} from './kamae-sidebar.mjs';
import {
	getBmdSidebarItems,
	getDagaynSidebarItems,
	getKamaeModelTranslatorSidebarItems,
	getRdraIshSidebarItems,
	getTrackSidebarItems,
} from './project-sidebar.mjs';
import { listBlogPosts } from './lib/blog-posts.mjs';
import { listProjectSlugs, projectsContentDir } from './lib/projects.mjs';

/** @type {Record<string, () => import('./kamae-sidebar.mjs').SidebarGroup[]>} */
const PROJECT_TREES = {
	dagayn: getDagaynSidebarItems,
	'rdra-ish': getRdraIshSidebarItems,
	track: getTrackSidebarItems,
	bmd: getBmdSidebarItems,
	'kamae-rs': getKamaeRustSidebarItems,
	'kamae-py': getKamaePythonSidebarItems,
	'kamae-scala': getKamaeScalaSidebarItems,
	'kamae-model-translator': getKamaeModelTranslatorSidebarItems,
};

function getBlogSidebarSortKey(post) {
	return post.data.sidebar?.order ?? -post.createdTimestamp;
}

function getBlogYearSidebar(year) {
	const items = listBlogPosts()
		.filter((post) => post.year === year)
		.map((post) => ({ post, label: post.data.sidebar?.label ?? post.data.title ?? post.slug }))
		.filter(({ label }) => label)
		.sort(
			(a, b) =>
				getBlogSidebarSortKey(a.post) - getBlogSidebarSortKey(b.post) ||
				a.post.link.localeCompare(b.post.link),
		)
		.map(({ post, label }) => ({ label, link: `/blog/${post.year}/${post.slug}` }));

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
