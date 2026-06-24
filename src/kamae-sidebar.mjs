/** @typedef {string | { label?: string; slug: string }} SidebarSlugItem */
/** @typedef {{ label: string; collapsed?: boolean; items: SidebarSlugItem[] }} SidebarGroup */

/** @param {string} path @returns {string} */
function slug(path) {
	return `docs/kamae/${path.replace(/^\//, '')}`;
}

/**
 * @param {string} label
 * @param {string[]} paths
 * @param {boolean} [collapsed]
 * @returns {SidebarGroup}
 */
function group(label, paths, collapsed = true) {
	return {
		label,
		collapsed,
		items: paths.map((path) => slug(path)),
	};
}

/** @returns {{ label: string; items: Array<{ label: string; link: string } | SidebarGroup> }} */
export function getKamaePythonSidebar() {
	return {
		label: 'Python',
		items: [
			{ label: 'はじめに', link: '/docs/kamae/python/' },
			group(
				'ドメイン設計',
				[
					'python/domain-modeling',
					'python/state-transitions',
					'python/boundary-defense',
					'python/error-handling',
					'python/persistence-events',
				],
				false,
			),
			group('アプリとインフラ', [
				'python/application-wiring',
				'python/migration-strategy',
				'python/orm-adapters',
				'python/concurrency',
				'python/infrastructure-resilience',
				'python/unsafe-boundaries',
			]),
			group('観測可能性', ['python/pii-protection', 'python/logging-metrics']),
			group('テスト', ['python/test-data']),
			group('品質と公開 API', [
				'python/pydantic-performance',
				'python/api-contracts',
				'python/quality-gates',
			]),
			group('開発環境', ['python/development-setup', 'python/ci-setup']),
			group('実践例', ['python/examples/taxi-request'], false),
		],
	};
}

/** @returns {{ label: string; items: Array<{ label: string; link: string } | SidebarGroup> }} */
export function getKamaeRustSidebar() {
	return {
		label: 'Rust',
		items: [
			{ label: 'はじめに', link: '/docs/kamae/rust/' },
			group(
				'ドメイン設計',
				[
					'rust/domain-modeling',
					'rust/state-transitions',
					'rust/boundary-defense',
					'rust/error-handling',
					'rust/persistence-events',
				],
				false,
			),
			group('アプリとインフラ', [
				'rust/application-wiring',
				'rust/adoption',
				'rust/service-boundaries',
				'rust/stream-continuous-queries',
				'rust/domain-macros',
				'rust/unsafe-boundaries',
			]),
			group('観測可能性', ['rust/pii-protection', 'rust/logging-metrics']),
			group('テスト', ['rust/test-data', 'rust/property-based-tests']),
			group('品質と公開 API', ['rust/quality-gates', 'rust/rustdoc']),
			group('開発環境', [
				'rust/dev-environment',
				'rust/development-setup',
				'rust/ci-setup',
			]),
			group('実践例', ['rust/examples/taxi-request'], false),
			group('クレートガイド', [
				'rust/crate-guides/thiserror',
				'rust/crate-guides/anyhow',
				'rust/crate-guides/serde',
				'rust/crate-guides/validator',
				'rust/crate-guides/garde',
				'rust/crate-guides/nutype',
				'rust/crate-guides/secrecy',
				'rust/crate-guides/proptest',
			]),
		],
	};
}
