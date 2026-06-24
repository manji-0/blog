// @ts-check
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import matter from 'gray-matter';
import remarkBeautifulMermaid from './src/plugins/remark-beautiful-mermaid.mjs';
import remarkHatenaFootnotes from './src/plugins/remark-hatena-footnotes.mjs';
import remarkLinkCard from './src/plugins/remark-link-card.mjs';
import ogImageBuildIntegration from './src/integrations/astro-og-image-build.mjs';
import cloudflareStatusIntegration from './src/integrations/cloudflare-status.mjs';
import cloudflarePlatformUptimeIntegration from './src/integrations/cloudflare-platform-uptime.mjs';
import { getKamaePythonSidebar, getKamaeRustSidebar } from './src/kamae-sidebar.mjs';

const fontFaceCss = readFileSync(new URL('./public/fonts/fonts.css', import.meta.url), 'utf8');
const blogContentDir = new URL('./src/content/docs/blog/', import.meta.url);

function getGitCreatedTimestamp(pathname) {
	try {
		const output = execFileSync(
			'git',
			['log', '--follow', '--diff-filter=A', '--format=%ct', '--', pathname],
			{ cwd: new URL('.', import.meta.url), encoding: 'utf8' },
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
	const fileUrl = new URL(`./${year}/${filename}`, blogContentDir);
	const pathname = new URL(fileUrl).pathname;
	const { data } = matter(readFileSync(fileUrl, 'utf8'));
	const slug = filename.replace(/\.mdx?$/, '');

	return {
		label: data.sidebar?.label ?? data.title ?? slug,
		link: `/blog/${year}/${slug}`,
		_sidebarOrder: data.sidebar?.order,
		_createdTimestamp: getFileCreatedTimestamp(fileUrl, pathname),
	};
}

function getBlogSidebarSortKey(item) {
	return item._sidebarOrder ?? -item._createdTimestamp;
}

function getBlogYearSidebar(year) {
	const items = readdirSync(new URL(`./${year}/`, blogContentDir))
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

// https://astro.build/config
export default defineConfig({
	site: 'https://www.manj.io',
	build: {
		inlineStylesheets: 'always',
	},
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'viewport',
	},
	vite: {
		optimizeDeps: {
			exclude: ['@sqlite.org/sqlite-wasm'],
		},
	},
	markdown: {
		processor: unified({
			remarkPlugins: [remarkBeautifulMermaid, remarkHatenaFootnotes, remarkLinkCard],
		}),
	},
	integrations: [
		ogImageBuildIntegration(),
		cloudflareStatusIntegration(),
		cloudflarePlatformUptimeIntegration(),
		starlight({
			title: 'manj.io',
			pagefind: false,
			locales: {
				root: {
					label: '日本語',
					lang: 'ja',
				},
			},
			head: [
				{
					tag: 'style',
					content: fontFaceCss,
				},
				{
					tag: 'script',
					content: `try{if(!localStorage.getItem('starlight-theme'))localStorage.setItem('starlight-theme','dark')}catch{}`,
				},
				{
					tag: 'script',
					attrs: { src: '/manj-cloudflare-platform-status.js', defer: true },
				},
				{
					tag: 'script',
					attrs: { src: '/manj-fediverse-statuses.js', defer: true },
				},
			],
			social: [
				{ label: 'Twitter', href: 'https://twitter.com/_manji0', icon: 'twitter' },
				{ label: 'Mastodon', href: 'https://fedi.manji.app/users/manji0', icon: 'mastodon' },
				{ label: 'Bluesky', href: 'https://bsky.app/profile/manj.io', icon: 'blueSky' },
				{ label: 'GitHub', href: 'https://github.com/manji-0', icon: 'github' },
			],
			sidebar: [
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
					label: 'Coding',
					items: [{ autogenerate: { directory: 'coding' } }],
				},
				{
					label: 'Docs',
					items: [
						{ label: 'Kamae', link: '/docs/kamae/' },
						getKamaeRustSidebar(),
						getKamaePythonSidebar(),
					],
				},
			],
			expressiveCode: {
				themes: ['starlight-dark', 'starlight-light'],
				useStarlightDarkModeSwitch: true,
				useStarlightUiThemeColors: true,
				minSyntaxHighlightingColorContrast: 6,
				defaultProps: {
					wrap: true,
					preserveIndent: true,
					hangingIndent: 2,
					overridesByLang: {
						'bash,sh,zsh,shell,console': {
							wrap: false,
							preserveIndent: false,
							hangingIndent: 0,
						},
					},
				},
				shiki: {
					langAlias: {
						yml: 'yaml',
						shell: 'bash',
						md: 'markdown',
					},
				},
				frames: {
					showCopyToClipboardButton: true,
					removeCommentsWhenCopyingTerminalFrames: true,
					extractFileNameFromCode: true,
				},
				styleOverrides: {
					borderRadius: '0.5rem',
					borderWidth: '1px',
					codeFontSize: '0.92rem',
					codeLineHeight: '1.7',
					codePaddingBlock: '0.9rem',
					codePaddingInline: '1.05rem',
					uiFontSize: '0.8rem',
					uiLineHeight: '1.45',
					frames: {
						frameBoxShadowCssValue: 'none',
						inlineButtonBackgroundIdleOpacity: '0.06',
						inlineButtonBackgroundHoverOrFocusOpacity: '0.16',
					},
				},
			},
			customCss: [
				'./src/styles/custom.css',
			],
			components: {
				Footer: './src/components/starlight/BlogFooter.astro',
				Pagination: './src/components/starlight/BlogPagination.astro',
				Search: './src/components/starlight/Search.astro',
				TwoColumnContent: './src/starlight/TwoColumnContent.astro',
			},
			routeMiddleware: [
				'./src/starlight/og-image-middleware.mjs',
				'./src/starlight/blog-pagination-middleware.mjs',
			],
		}),
	],
});
