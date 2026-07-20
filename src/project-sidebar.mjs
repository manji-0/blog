/** @typedef {string | { label?: string; slug: string }} SidebarSlugItem */
/** @typedef {{ label: string; collapsed?: boolean; items: SidebarSlugItem[] }} SidebarGroup */

/** @param {string} root @param {string} path @returns {string} */
function slug(root, path) {
	return `projects/${root}/${path.replace(/^\//, '')}`;
}

/**
 * @param {string} root
 * @param {string} label
 * @param {string[]} paths
 * @param {boolean} [collapsed]
 * @returns {SidebarGroup}
 */
function group(root, label, paths, collapsed = true) {
	return {
		label,
		collapsed,
		items: paths.map((path) => slug(root, path)),
	};
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getDagaynSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/dagayn/' },
		group(
			'dagayn',
			'ガイド',
			['installation', 'quickstart', 'cli-reference', 'mcp-tools'],
			false,
		),
		group('dagayn', 'リファレンス', [
			'graph-model',
			'integrations',
			'semantic-search',
		]),
		group('dagayn', '技術ノート', [
			'architecture',
			'storage',
			'metrics',
			'review-analysis',
			'development',
			'troubleshooting',
		]),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getRdraIshSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/rdra-ish/' },
		group(
			'rdra-ish',
			'ガイド',
			['installation', 'quickstart', 'incremental-modeling', 'diagram-and-export', 'formal-verification'],
			false,
		),
		group('rdra-ish', '実践例', ['examples/store-restock'], false),
		group('rdra-ish', 'リファレンス', [
			'cli-reference',
			'language-reference',
			'vscode-lsp',
		]),
		group('rdra-ish', '開発', ['development']),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getTrackSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/track/' },
		group(
			'track',
			'ガイド',
			['installation', 'quickstart', 'cli-reference', 'jj-integration', 'webui'],
			false,
		),
		group('track', '開発', ['development']),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getBmdSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/bmd/' },
		group(
			'bmd',
			'ガイド',
			['installation', 'quickstart', 'keybindings', 'configuration'],
			false,
		),
		group('bmd', '開発', ['development']),
	];
}
