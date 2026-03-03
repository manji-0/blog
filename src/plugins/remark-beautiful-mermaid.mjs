import { renderMermaidSVG } from 'beautiful-mermaid';
import { visit } from 'unist-util-visit';

const DEFAULT_THEME = {
	bg: 'var(--sl-color-bg)',
	fg: 'var(--sl-color-text)',
	line: 'var(--sl-color-gray-3)',
	accent: 'var(--sl-color-accent-high)',
	muted: 'var(--sl-color-gray-4)',
	surface: 'var(--sl-color-bg-nav)',
	border: 'var(--sl-color-hairline)',
	font: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Yu Gothic', Meiryo, 'Segoe UI', system-ui, sans-serif",
	transparent: true,
};

/**
 * Render ```mermaid``` code fences as inline SVG using beautiful-mermaid.
 *
 * @param {import('beautiful-mermaid').RenderOptions} [options]
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkBeautifulMermaid(options = {}) {
	const renderOptions = { ...DEFAULT_THEME, ...options };

	return (tree, file) => {
		visit(tree, 'code', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			if (typeof node.lang !== 'string' || node.lang.toLowerCase() !== 'mermaid') return;

			try {
				const svg = renderMermaidSVG(node.value, renderOptions);
				parent.children[index] = {
					type: 'html',
					value: `<div class="beautiful-mermaid">${svg}</div>`,
				};
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				file.message(`Failed to render Mermaid with beautiful-mermaid: ${reason}`, node);
			}
		});
	};
}
