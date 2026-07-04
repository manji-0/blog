import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteWorkerRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(siteWorkerRoot, '..');
const distDir = join(repoRoot, 'dist');
const publicDir = join(siteWorkerRoot, 'public');
const redirectsPath = join(publicDir, '_redirects');

const legacyRedirects = [
	'/docs/kamae-rs/*  /projects/kamae-rs/:splat  308',
	'/docs/kamae-py/*  /projects/kamae-py/:splat  308',
	'/docs/kamae-scala/*  /projects/kamae-scala/:splat  308',
];

if (!existsSync(distDir)) {
	throw new Error(`Missing Astro build output at ${distDir}. Run "pnpm run build" first.`);
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(distDir, publicDir, { recursive: true });

const existingRedirects = existsSync(redirectsPath)
	? readFileSync(redirectsPath, 'utf8').trimEnd()
	: '';
const redirectLines = [
	...(existingRedirects ? [existingRedirects] : []),
	...legacyRedirects,
].filter(Boolean);

writeFileSync(redirectsPath, `${redirectLines.join('\n')}\n`);
console.log(`[site-worker] assembled ${publicDir} from ${distDir}`);
