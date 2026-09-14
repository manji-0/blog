/** @typedef {string | { label?: string; slug: string }} SidebarSlugItem */
/** @typedef {{ label: string; collapsed?: boolean; items: SidebarSlugItem[] }} SidebarGroup */

/** @param {'kamae-rs' | 'kamae-py' | 'kamae-scala'} root @param {string} path @returns {string} */
function slug(root, path) {
	return `projects/${root}/${path.replace(/^\//, '')}`;
}

/**
 * @param {'kamae-rs' | 'kamae-py' | 'kamae-scala'} root
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
export function getKamaePythonSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-py/' },
		group('kamae-py', '実装', ['domain-modeling', 'state-transitions', 'boundary-defense'], false),
		group('kamae-py', 'リファレンス', ['usage', 'library-guides', 'quality-gates'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getKamaeRustSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-rs/' },
		group('kamae-rs', '実装', ['domain-modeling', 'state-transitions', 'boundary-defense'], false),
		group('kamae-rs', 'リファレンス', ['usage', 'crate-guides', 'quality-gates'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getKamaeScalaSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-scala/' },
		group(
			'kamae-scala',
			'実装',
			['domain-modeling', 'state-transitions', 'boundary-defense'],
			false,
		),
		group('kamae-scala', 'リファレンス', ['usage', 'library-guides', 'quality-gates'], false),
	];
}
