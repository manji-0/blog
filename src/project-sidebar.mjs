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
		group('dagayn', '実装', ['architecture', 'graph-model', 'review-analysis'], false),
		group('dagayn', 'リファレンス', ['usage', 'mcp-tools', 'cli-reference'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getRdraIshSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/rdra-ish/' },
		group(
			'rdra-ish',
			'実装',
			['incremental-modeling', 'formal-verification', 'examples/store-restock'],
			false,
		),
		group('rdra-ish', 'リファレンス', ['usage', 'language-reference', 'cli-reference'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getTrackSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/track/' },
		group('track', '実装', ['workspace', 'agents'], false),
		group('track', 'リファレンス', ['usage', 'cli-reference', 'webui'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getBmdSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/bmd/' },
		group('bmd', '実装', ['rendering'], false),
		group('bmd', 'リファレンス', ['usage', 'keybindings', 'configuration'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getKamaeModelTranslatorSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-model-translator/' },
		group('kamae-model-translator', '実装', ['port', 'bridge'], false),
		group('kamae-model-translator', 'リファレンス', ['usage'], false),
	];
}
