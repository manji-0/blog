// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import remarkBeautifulMermaid from './src/plugins/remark-beautiful-mermaid.mjs';

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkBeautifulMermaid],
	},
	integrations: [
		starlight({
			title: 'manj.io',
			social: [
				{ label: 'Twitter', href: 'https://twitter.com/manj10', icon: 'twitter' },
				{ label: 'Mastodon', href: 'https://fed.manji.dev/@manji0', icon: 'mastodon' },
				{ label: 'Discord', href: 'https://discordapp.com/users/335975911478394881', icon: 'discord' },
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
							autogenerate: { directory: 'blog/2026' },
						},
						{
							label: '2023',
							autogenerate: { directory: 'blog/2023' },
						},
						{
							label: '2022',
							autogenerate: { directory: 'blog/2022' },
						},
						{
							label: '2021',
							autogenerate: { directory: 'blog/2021' },
						},
					],
				},
				{
					label: 'Coding',
					autogenerate: { directory: 'coding' },
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
		}),
	],
});
