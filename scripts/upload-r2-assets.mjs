import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const distDir = process.env.DIST_DIR || 'dist';
const astroAssetDir = join(distDir, '_astro');
const bucket = process.env.R2_ASSET_BUCKET || 'manjio-assets';
const keyPrefix = trimSlashes(process.env.R2_ASSET_PREFIX || 'astro');
const routePrefix = `/${trimSlashes(process.env.R2_ASSET_ROUTE_PREFIX || 'assets/r2')}`;
const uploadEnabled = process.env.R2_ASSET_UPLOAD !== '0';
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function trimSlashes(value) {
	return value.replace(/^\/+|\/+$/g, '');
}

function extensionOf(filePath) {
	const match = filePath.match(/\.[^.]+$/);
	return match ? match[0].toLowerCase() : '';
}

function contentTypeFor(filePath) {
	switch (extensionOf(filePath)) {
		case '.avif':
			return 'image/avif';
		case '.gif':
			return 'image/gif';
		case '.jpeg':
		case '.jpg':
			return 'image/jpeg';
		case '.png':
			return 'image/png';
		case '.svg':
			return 'image/svg+xml';
		case '.webp':
			return 'image/webp';
		default:
			return 'application/octet-stream';
	}
}

function listFiles(dir) {
	let files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files = files.concat(listFiles(path));
		} else {
			files.push(path);
		}
	}
	return files;
}

function uploadFile(filePath, key) {
	const args = [
		'wrangler',
		'r2',
		'object',
		'put',
		`${bucket}/${key}`,
		`--file=${filePath}`,
		`--content-type=${contentTypeFor(filePath)}`,
		'--cache-control=public, max-age=31536000, immutable',
		'--remote',
	];
	const result = spawnSync('npx', args, { stdio: 'inherit' });

	if (result.status !== 0) {
		throw new Error(`Failed to upload ${filePath} to R2 key ${key}`);
	}
}

function rewriteHtml(assetMappings) {
	const htmlFiles = listFiles(distDir).filter((file) => file.endsWith('.html'));
	let rewriteCount = 0;

	for (const file of htmlFiles) {
		let html = readFileSync(file, 'utf8');
		const originalHtml = html;

		for (const { localPath, routePath } of assetMappings) {
			html = html.split(localPath).join(routePath);
		}

		html = html
			.replaceAll(/^\s*@import url\('https:\/\/fonts\.googleapis\.com.*\n/gm, '')
			.replaceAll(
				/^\s*text \{ font-family: .*Hiragino Sans.*\}\n/gm,
				"  text { font-family: 'LINE Seed JP', system-ui, sans-serif; }\n",
			);

		if (html !== originalHtml) {
			writeFileSync(file, html);
			rewriteCount += 1;
		}
	}

	return rewriteCount;
}

if (!statSync(astroAssetDir, { throwIfNoEntry: false })) {
	console.log(`[r2-assets] No Astro asset directory found at ${astroAssetDir}.`);
	process.exit(0);
}

const assetMappings = listFiles(astroAssetDir)
	.filter((file) => imageExtensions.has(extensionOf(file)))
	.map((file) => {
		const relativePath = relative(astroAssetDir, file).replaceAll('\\', '/');
		const key = `${keyPrefix}/${relativePath}`;
		return {
			file,
			key,
			localPath: `/_astro/${relativePath}`,
			routePath: `${routePrefix}/${key}`,
		};
	});

if (assetMappings.length === 0) {
	console.log('[r2-assets] No image assets found to upload or rewrite.');
	process.exit(0);
}

if (uploadEnabled) {
	for (const asset of assetMappings) {
		uploadFile(asset.file, asset.key);
	}
} else {
	console.log('[r2-assets] Upload skipped because R2_ASSET_UPLOAD=0.');
}

const rewriteCount = rewriteHtml(assetMappings);
console.log(`[r2-assets] Prepared ${assetMappings.length} R2 asset(s); rewrote ${rewriteCount} HTML file(s).`);
