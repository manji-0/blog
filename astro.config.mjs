// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import remarkBeautifulMermaid from './src/plugins/remark-beautiful-mermaid.mjs';
import remarkLinkCard from './src/plugins/remark-link-card.mjs';
import ogImageBuildIntegration from './src/integrations/astro-og-image-build.mjs';
import cloudflareStatusIntegration from './src/integrations/cloudflare-status.mjs';
import githubPagesUptimeIntegration from './src/integrations/github-pages-uptime.mjs';
import fediverseStatusesIntegration from './src/integrations/fediverse-statuses.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.manj.io',
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'viewport',
	},
	markdown: {
		processor: unified({
			remarkPlugins: [remarkBeautifulMermaid, remarkLinkCard],
		}),
	},
	integrations: [
		ogImageBuildIntegration(),
		cloudflareStatusIntegration(),
		githubPagesUptimeIntegration(),
		fediverseStatusesIntegration(),
		starlight({
			title: 'manj.io',
			locales: {
				root: {
					label: '日本語',
					lang: 'ja',
				},
			},
			head: [
				{
					tag: 'script',
					content: `try{if(!localStorage.getItem('starlight-theme'))localStorage.setItem('starlight-theme','dark')}catch{}`,
				},
				{
					tag: 'script',
					attrs: { src: '/manj-github-pages-uptime.js', defer: true },
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
						{
							label: '2026',
							items: [{ autogenerate: { directory: 'blog/2026' } }],
						},
						{
							label: '2023',
							items: [{ autogenerate: { directory: 'blog/2023' } }],
						},
						{
							label: '2022',
							items: [{ autogenerate: { directory: 'blog/2022' } }],
						},
						{
							label: '2021',
							items: [{ autogenerate: { directory: 'blog/2021' } }],
						},
					],
				},
				{
					label: 'Coding',
					items: [{ autogenerate: { directory: 'coding' } }],
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
				TwoColumnContent: './src/starlight/TwoColumnContent.astro',
			},
			routeMiddleware: [
				'./src/starlight/og-image-middleware.mjs',
				'./src/starlight/blog-pagination-middleware.mjs',
			],
		}),
	],
});
