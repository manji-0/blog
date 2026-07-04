import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const slidesRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksRoot = join(slidesRoot, 'decks');
const outputRoot = join(slidesRoot, '..', 'site-worker', 'public', 'slides');

const deckSetupSource = `import { defineRootSetup } from '@slidev/types'
import '../../../styles/manjio.css'

export default defineRootSetup(() => {
\t// Shared layout CSS is imported above.
})
`;

function ensureDeckSetup(deckDir) {
	const setupDir = join(deckDir, 'setup');
	const setupFile = join(setupDir, 'main.ts');
	if (existsSync(setupFile)) {
		return;
	}

	mkdirSync(setupDir, { recursive: true });
	writeFileSync(setupFile, deckSetupSource);
	console.log(`[slides] wrote default setup for ${deckDir}`);
}

function listDecks() {
	return readdirSync(decksRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((deckId) => statSync(join(decksRoot, deckId, 'slides.md')).isFile());
}

function runSlidevBuild(deckId) {
	const deckDir = join(decksRoot, deckId);
	ensureDeckSetup(deckDir);
	const base = `/slides/${deckId}/`;
	const outDir = join(outputRoot, deckId);

	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });

	const entry = join(deckDir, 'slides.md');
	const result = spawnSync(
		'pnpm',
		['exec', 'slidev', 'build', entry, '--base', base, '--out', outDir, '--router-mode', 'history'],
		{
			cwd: slidesRoot,
			stdio: 'inherit',
			env: {
				...process.env,
				// Resolve slidev from the slides workspace package.
				PATH: `${join(slidesRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`,
			},
		},
	);

	if (result.status !== 0) {
		throw new Error(`slidev build failed for deck "${deckId}"`);
	}
}

function writeManifest(deckIds) {
	const manifest = {
		generatedAt: new Date().toISOString(),
		decks: deckIds.map((id) => ({
			id,
			path: `/slides/${id}/`,
		})),
	};

	writeFileSync(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

mkdirSync(outputRoot, { recursive: true });

const deckIds = listDecks();
if (deckIds.length === 0) {
	throw new Error(`No decks found under ${decksRoot}`);
}

for (const deckId of deckIds) {
	console.log(`[slides] building deck: ${deckId}`);
	runSlidevBuild(deckId);
}

writeManifest(deckIds);
console.log(`[slides] built ${deckIds.length} deck(s) into ${outputRoot}`);
