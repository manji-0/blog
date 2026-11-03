import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteWorkerRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(siteWorkerRoot, '..');
const distDir = join(repoRoot, 'dist');
const publicDir = join(siteWorkerRoot, 'public');
const redirectsPath = join(publicDir, '_redirects');
// Void serves files in public/ before routes run, so the key-gated card must
// not be there. src/card.ts bundles these files into the Worker instead.
const cardPublicDir = join(publicDir, 'card');
const cardPrivateDir = join(siteWorkerRoot, 'private', 'card');
const cardFiles = ['index.html', 'manji0.vcf'];

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

for (const file of cardFiles) {
	if (!existsSync(join(cardPublicDir, file))) {
		throw new Error(`Missing card build output ${join(cardPublicDir, file)}.`);
	}
}
rmSync(cardPrivateDir, { recursive: true, force: true });
mkdirSync(dirname(cardPrivateDir), { recursive: true });
renameSync(cardPublicDir, cardPrivateDir);

const existingRedirects = existsSync(redirectsPath)
	? readFileSync(redirectsPath, 'utf8').trimEnd()
	: '';
const redirectLines = [
	...(existingRedirects ? [existingRedirects] : []),
	...legacyRedirects,
].filter(Boolean);

writeFileSync(redirectsPath, `${redirectLines.join('\n')}\n`);
console.log(`[site-worker] assembled ${publicDir} from ${distDir}`);
