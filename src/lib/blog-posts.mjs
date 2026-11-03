import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

const rootDir = process.cwd();
const blogContentDir = join(rootDir, 'src/content/docs/blog');

/**
 * @typedef {object} BlogPost
 * @property {string} year
 * @property {string} slug
 * @property {string} link `/blog/{year}/{slug}/`
 * @property {Record<string, any>} data Frontmatter.
 * @property {number} createdTimestamp Unix seconds the file was first committed.
 */

/** Seconds since the epoch of the commit that added the file, following renames. */
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

/** Uncommitted drafts fall back to the file's birth time. */
function getCreatedTimestamp(pathname) {
	const createdAt = Math.trunc(statSync(pathname).birthtimeMs / 1000);
	return getGitCreatedTimestamp(pathname) ?? (Number.isFinite(createdAt) ? createdAt : 0);
}

/** @returns {BlogPost[]} Posts of every year, newest first. */
export function listBlogPosts() {
	return readdirSync(blogContentDir)
		.filter((year) => statSync(join(blogContentDir, year)).isDirectory())
		.flatMap((year) =>
			readdirSync(join(blogContentDir, year))
				.filter((filename) => /\.mdx?$/.test(filename))
				.map((filename) => {
					const filePath = join(blogContentDir, year, filename);
					const slug = filename.replace(/\.mdx?$/, '');
					return {
						year,
						slug,
						link: `/blog/${year}/${slug}/`,
						data: matter(readFileSync(filePath, 'utf8')).data,
						createdTimestamp: getCreatedTimestamp(filePath),
					};
				}),
		)
		.sort((a, b) => b.createdTimestamp - a.createdTimestamp || a.link.localeCompare(b.link));
}
