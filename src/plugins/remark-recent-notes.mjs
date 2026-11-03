import { visit } from 'unist-util-visit';
import { listBlogPosts } from '../lib/blog-posts.mjs';

const RECENT_NOTES_MARKER = '<!-- recent-notes -->';
const RECENT_NOTES_COUNT = 3;

/**
 * Replace `<!-- recent-notes -->` with the newest blog posts: a linked heading,
 * the frontmatter `summary` (falling back to `description`), and `tags`.
 *
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkRecentNotes() {
	const posts = listBlogPosts().slice(0, RECENT_NOTES_COUNT);

	return (tree) => {
		visit(tree, 'html', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			if (node.value?.trim() !== RECENT_NOTES_MARKER) return;

			parent.children.splice(index, 1, ...posts.flatMap(toNoteNodes));
			return index + 1;
		});
	};
}

/**
 * @param {import('../lib/blog-posts.mjs').BlogPost} post
 * @returns {import('mdast').RootContent[]}
 */
function toNoteNodes(post) {
	const title = post.data.title ?? post.slug;
	const summary = post.data.summary ?? post.data.description;
	/** @type {string[]} */
	const tags = post.data.tags ?? [];

	/** @type {import('mdast').RootContent[]} */
	const nodes = [
		{
			type: 'heading',
			depth: 3,
			children: [{ type: 'link', url: post.link, children: [{ type: 'text', value: title }] }],
		},
	];
	if (summary) {
		nodes.push({ type: 'paragraph', children: inlineCodeSpans(summary) });
	}
	if (tags.length > 0) {
		nodes.push({
			type: 'paragraph',
			children: tags.flatMap((tag, i) => [
				...(i > 0 ? [{ type: 'text', value: ' ' }] : []),
				{ type: 'inlineCode', value: tag },
			]),
		});
	}
	return nodes;
}

/**
 * Summaries use backticks for code and no other Markdown.
 *
 * @param {string} text
 * @returns {import('mdast').PhrasingContent[]}
 */
function inlineCodeSpans(text) {
	return text
		.split(/(`[^`]+`)/)
		.filter(Boolean)
		.map((part) =>
			part.startsWith('`') && part.endsWith('`') && part.length > 1
				? { type: 'inlineCode', value: part.slice(1, -1) }
				: { type: 'text', value: part },
		);
}
