// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import remarkBeautifulMermaid from './src/plugins/remark-beautiful-mermaid.mjs';
import remarkHatenaFootnotes from './src/plugins/remark-hatena-footnotes.mjs';
import remarkLinkCard from './src/plugins/remark-link-card.mjs';
import remarkProjectList from './src/plugins/remark-project-list.mjs';
import ogImageBuildIntegration from './src/integrations/astro-og-image-build.mjs';
import cloudflareStatusIntegration from './src/integrations/cloudflare-status.mjs';
import cloudflarePlatformUptimeIntegration from './src/integrations/cloudflare-platform-uptime.mjs';
import { getSiteSidebarConfig } from './src/sidebar-config.mjs';

const fontFaceCss = readFileSync(new URL('./public/fonts/fonts.css', import.meta.url), 'utf8');

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
		resolve: {
			alias: {
				'@starlight/navigation': fileURLToPath(
					new URL('./node_modules/@astrojs/starlight/utils/navigation.ts', import.meta.url),
				),
			},
		},
	},
	markdown: {
		processor: unified({
			remarkPlugins: [
				remarkBeautifulMermaid,
				remarkHatenaFootnotes,
				remarkLinkCard,
				remarkProjectList,
			],
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
			sidebar: getSiteSidebarConfig(),
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
				'./src/starlight/sidebar-middleware.mjs',
				'./src/starlight/og-image-middleware.mjs',
				'./src/starlight/blog-pagination-middleware.mjs',
			],
		}),
	],
});
