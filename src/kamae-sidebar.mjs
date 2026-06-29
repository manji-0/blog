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
		group(
			'kamae-py',
			'ドメイン設計',
			[
				'domain-modeling',
				'state-transitions',
				'boundary-defense',
				'error-handling',
				'persistence-events',
			],
			false,
		),
		group('kamae-py', 'アプリとインフラ', [
			'application-wiring',
			'migration-strategy',
			'orm-adapters',
			'concurrency',
			'infrastructure-resilience',
			'unsafe-boundaries',
		]),
		group('kamae-py', '観測可能性', ['pii-protection', 'logging-metrics']),
		group('kamae-py', 'テスト', ['test-data']),
		group('kamae-py', '品質と公開 API', [
			'pydantic-performance',
			'api-contracts',
			'quality-gates',
		]),
		group('kamae-py', '開発環境', ['development-setup', 'ci-setup']),
		group('kamae-py', '実践例', ['examples/taxi-request'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getKamaeRustSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-rs/' },
		{ label: 'クレートガイド（参照）', link: '/projects/kamae-rs/crate-guides/' },
		group(
			'kamae-rs',
			'ドメイン設計',
			[
				'domain-modeling',
				'state-transitions',
				'boundary-defense',
				'error-handling',
				'persistence-events',
			],
			false,
		),
		group('kamae-rs', 'アプリとインフラ', [
			'application-wiring',
			'adoption',
			'service-boundaries',
			'stream-continuous-queries',
			'domain-macros',
			'unsafe-boundaries',
		]),
		group('kamae-rs', '観測可能性', ['pii-protection', 'logging-metrics']),
		group('kamae-rs', 'テスト', ['test-data', 'property-based-tests']),
		group('kamae-rs', '品質と公開 API', ['quality-gates', 'rustdoc']),
		group('kamae-rs', '開発環境', ['dev-environment', 'development-setup', 'ci-setup']),
		group('kamae-rs', '実践例', ['examples/taxi-request'], false),
	];
}

/** @returns {Array<{ label: string; link: string } | SidebarGroup>} */
export function getKamaeScalaSidebarItems() {
	return [
		{ label: 'はじめに', link: '/projects/kamae-scala/' },
		{ label: 'ライブラリガイド（参照）', link: '/projects/kamae-scala/library-guides/' },
		group(
			'kamae-scala',
			'ドメイン設計',
			[
				'domain-modeling',
				'state-transitions',
				'boundary-defense',
				'error-handling',
				'persistence-events',
			],
			false,
		),
		group('kamae-scala', 'アプリとインフラ', [
			'application-wiring',
			'adoption',
			'effect-systems',
			'orm-adapters',
			'service-boundaries',
			'stream-continuous-queries',
			'domain-macros',
			'jni-native-boundaries',
		]),
		group('kamae-scala', '観測可能性', ['pii-protection', 'logging-metrics']),
		group('kamae-scala', 'テスト', ['test-data', 'property-based-tests']),
		group('kamae-scala', '品質と公開 API', ['quality-gates', 'scaladoc']),
		group('kamae-scala', '開発環境', ['dev-environment', 'development-setup', 'ci-setup']),
		group('kamae-scala', '実践例', ['examples/taxi-request'], false),
	];
}
