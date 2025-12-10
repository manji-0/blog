// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'manj.io',
			social: [
				{ label: 'Twitter', href: 'https://twitter.com/_manji0', icon: 'twitter' },
				{ label: 'Mastodon', href: 'https://misskey.io/@manji0', icon: 'mastodon' },
				{ label: 'Discord', href: 'https://discordapp.com/users/335975911478394881', icon: 'discord' },
				{ label: 'GitHub', href: 'https://github.com/manji-0/mkdoc-blog', icon: 'github' },
			],
			sidebar: [
				{ label: 'Top', link: '/' },
				{ label: 'Resume', link: '/resume' },
				{
					label: 'Blog',
					items: [
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
			customCss: [
				// './src/styles/custom.css', // Will add this later
			],
		}),
	],
});
