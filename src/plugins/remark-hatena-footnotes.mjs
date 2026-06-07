import { visit } from 'unist-util-visit';

const FOOTNOTE_RE = /\(\(([\s\S]+?)\)\)/g;

/**
 * Convert Hatena-style inline footnotes, `((note))`, into numbered references.
 *
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkHatenaFootnotes() {
	return (tree) => {
		/** @type {string[]} */
		const footnotes = [];
		/** @type {{ parent: import('mdast').Parent; index: number; children: import('mdast').PhrasingContent[] }[]} */
		const replacements = [];

		visit(tree, 'text', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			const children = replaceFootnotes(node.value, footnotes);
			if (!children) return;
			replacements.push({ parent, index, children });
		});

		for (const replacement of replacements.reverse()) {
			replacement.parent.children.splice(replacement.index, 1, ...replacement.children);
		}

		if (footnotes.length === 0) return;

		tree.children.push({
			type: 'html',
			value: toFootnotesHtml(footnotes),
		});
	};
}

/**
 * @param {string} value
 * @param {string[]} footnotes
 * @returns {import('mdast').PhrasingContent[] | null}
 */
function replaceFootnotes(value, footnotes) {
	FOOTNOTE_RE.lastIndex = 0;

	/** @type {import('mdast').PhrasingContent[]} */
	const children = [];
	let lastIndex = 0;
	let matched = false;
	let match = FOOTNOTE_RE.exec(value);

	while (match) {
		matched = true;
		if (match.index > lastIndex) {
			children.push({ type: 'text', value: value.slice(lastIndex, match.index) });
		}

		const number = footnotes.push(match[1]);
		children.push({
			type: 'html',
			value: toReferenceHtml(number),
		});

		lastIndex = FOOTNOTE_RE.lastIndex;
		match = FOOTNOTE_RE.exec(value);
	}

	if (!matched) return null;
	if (lastIndex < value.length) {
		children.push({ type: 'text', value: value.slice(lastIndex) });
	}

	return children;
}

/**
 * @param {number} number
 * @returns {string}
 */
function toReferenceHtml(number) {
	return `<sup class="manj-footnote-ref" id="fnref-${number}"><a href="#fn-${number}" aria-label="Footnote ${number}">*${number}</a></sup>`;
}

/**
 * @param {string[]} footnotes
 * @returns {string}
 */
function toFootnotesHtml(footnotes) {
	const items = footnotes
		.map((text, index) => {
			const number = index + 1;
			return `<li id="fn-${number}"><span class="manj-footnote-number">*${number}</span> <span class="manj-footnote-text">${escapeHtml(text)}</span> <a class="manj-footnote-backref" href="#fnref-${number}" aria-label="Back to footnote ${number}">↩</a></li>`;
		})
		.join('');

	return `<section class="manj-footnotes" aria-label="Footnotes"><ol>${items}</ol></section>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
