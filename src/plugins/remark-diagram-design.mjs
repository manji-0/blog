import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const diagramsDir = join(dirname(fileURLToPath(import.meta.url)), '../assets/diagrams');

/**
 * Inline ```diagram-design <slug>``` fences from src/assets/diagrams/<slug>.html.
 *
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkDiagramDesign() {
	return (tree, file) => {
		visit(tree, 'code', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			if (typeof node.lang !== 'string' || node.lang.toLowerCase() !== 'diagram-design') return;

			const fromMeta = typeof node.meta === 'string' ? node.meta.trim() : '';
			const fromBody = typeof node.value === 'string' ? node.value.trim() : '';
			const slug = fromMeta || fromBody;
			if (!SLUG_RE.test(slug)) {
				file.message(`Invalid diagram-design slug: ${slug || '(empty)'}`, node);
				return;
			}

			let html;
			try {
				html = readFileSync(join(diagramsDir, `${slug}.html`), 'utf8');
			} catch {
				file.message(`Missing diagram: ${slug}.html`, node);
				return;
			}

			const svgMatch = html.match(/<svg[\s\S]*<\/svg>/i);
			if (!svgMatch) {
				file.message(`No SVG in diagram ${slug}`, node);
				return;
			}

			parent.children[index] = {
				type: 'html',
				value: `<figure class="diagram-design">${svgMatch[0]}</figure>`,
			};
		});
	};
}
