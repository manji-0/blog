import { visit } from 'unist-util-visit';
import { getProjectSummaries } from '../lib/projects.mjs';

const PROJECT_LIST_MARKER = '<!-- project-list -->';

/**
 * Replace `<!-- project-list -->` with a project card grid sourced from each index.md.
 *
 * @returns {import('unified').Transformer<import('mdast').Root>}
 */
export default function remarkProjectList() {
	const projects = getProjectSummaries();

	return (tree) => {
		visit(tree, 'html', (node, index, parent) => {
			if (!parent || typeof index !== 'number') return;
			if (node.value?.trim() !== PROJECT_LIST_MARKER) return;

			parent.children[index] = {
				type: 'html',
				value: toProjectListHtml(projects),
			};
		});
	};
}

/**
 * @param {ReturnType<typeof getProjectSummaries>} projects
 * @returns {string}
 */
function toProjectListHtml(projects) {
	const cards = projects
		.map((project) => {
			const description = project.description
				? `<p class="project-card__description">${escapeHtml(project.description)}</p>`
				: '';

			return `<article class="project-card">
  <a href="${escapeHtml(project.link)}" class="project-card__title">${escapeHtml(project.label)}</a>
  ${description}
</article>`;
		})
		.join('\n');

	return `<div class="project-list">\n${cards}\n</div>`;
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
		.replaceAll('"', '&quot;');
}
