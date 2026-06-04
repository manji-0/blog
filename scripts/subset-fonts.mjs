import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';

const sourceRoot = process.cwd();
const publicFontsDir = join(sourceRoot, 'public', 'fonts');
const tempDir = join(tmpdir(), `manjio-font-subset-${process.pid}`);

const fontSources = [
	{
		name: 'Fira Code 400',
		url: 'https://fonts.gstatic.com/s/firacode/v27/uU9eCBsR6Z2vfE9aq3bL0fxyUs4tcw4W_D1sFVc.ttf',
		input: 'fira-code-400.ttf',
		outputBase: join(publicFontsDir, 'fira-code', 'fira-code-400'),
		text: () => asciiText(),
	},
	{
		name: 'LINE Seed JP 400',
		url: 'https://fonts.gstatic.com/s/lineseedjp/v3/MwQxbh7r89it6QsEXfZb-jMfjQ.ttf',
		input: 'line-seed-jp-400.ttf',
		outputBase: join(publicFontsDir, 'line-seed-jp', 'line-seed-jp-400'),
		text: collectSiteText,
	},
	{
		name: 'LINE Seed JP 700',
		url: 'https://fonts.gstatic.com/s/lineseedjp/v3/MwQubh7r89it6QsEXfZb-jMnMbRurQ.ttf',
		input: 'line-seed-jp-700.ttf',
		outputBase: join(publicFontsDir, 'line-seed-jp', 'line-seed-jp-700'),
		text: collectBoldSiteText,
	},
];

const textExtensions = new Set([
	'.astro',
	'.css',
	'.html',
	'.js',
	'.json',
	'.md',
	'.mjs',
	'.svg',
	'.ts',
	'.tsx',
	'.txt',
	'.yml',
]);

const extraInterfaceText = [
	'Skip to content',
	'Table of contents',
	'Search',
	'Overview',
	'Next',
	'Previous',
	'Edit page',
	'Last updated',
	'Back to top',
	'コンテンツにスキップ',
	'目次',
	'検索',
	'概要',
	'次へ',
	'前へ',
	'ページを編集',
	'最終更新',
	'トップへ戻る',
	'ブログ',
	'ホーム',
	'タグ',
	'カテゴリ',
	'記事',
];

function extensionOf(filePath) {
	const match = filePath.match(/\.[^.]+$/);
	return match ? match[0].toLowerCase() : '';
}

function listTextFiles(dir) {
	if (!existsSync(dir)) return [];

	let files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'fonts') {
				continue;
			}
			files = files.concat(listTextFiles(path));
			continue;
		}

		if (entry.isFile() && textExtensions.has(extensionOf(path))) {
			files.push(path);
		}
	}

	return files;
}

function charsFromRange(start, end) {
	let value = '';
	for (let code = start; code <= end; code += 1) {
		value += String.fromCharCode(code);
	}
	return value;
}

function asciiText() {
	return charsFromRange(0x20, 0x7e);
}

function japanesePunctuationAndKanaText() {
	return [
		charsFromRange(0x3000, 0x303f),
		charsFromRange(0x3040, 0x309f),
		charsFromRange(0x30a0, 0x30ff),
		charsFromRange(0x31f0, 0x31ff),
		charsFromRange(0xff01, 0xff5e),
		charsFromRange(0xff65, 0xff9f),
	].join('');
}

function isAllowedSiteChar(char) {
	const code = char.codePointAt(0);

	return (
		(code >= 0x20 && code <= 0x7e) ||
		(code >= 0x3000 && code <= 0x303f) ||
		(code >= 0x3040 && code <= 0x309f) ||
		(code >= 0x30a0 && code <= 0x30ff) ||
		(code >= 0x31f0 && code <= 0x31ff) ||
		(code >= 0x3400 && code <= 0x4dbf) ||
		(code >= 0x4e00 && code <= 0x9fff) ||
		(code >= 0xf900 && code <= 0xfaff) ||
		(code >= 0xff01 && code <= 0xff5e) ||
		(code >= 0xff65 && code <= 0xff9f)
	);
}

function filterSupportedSiteText(text) {
	return [...text].filter(isAllowedSiteChar).join('');
}

function uniqueText(text) {
	return [...new Set([...text])].join('');
}

function sourceTextFiles() {
	const sourceDirs = ['src', 'public'].map((dir) => join(sourceRoot, dir));

	return [
		'astro.config.mjs',
		'package.json',
		...sourceDirs.flatMap(listTextFiles),
	].filter((file) => existsSync(file));
}

function collectSiteText() {
	const sourceFiles = sourceTextFiles();
	const siteText = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

	return uniqueText([
		asciiText(),
		japanesePunctuationAndKanaText(),
		filterSupportedSiteText(extraInterfaceText.join('\n')),
		filterSupportedSiteText(siteText),
	].join('\n'));
}

function stripMarkdownSyntax(text) {
	return text
		.replaceAll(/`{1,3}[^`]*`{1,3}/g, ' ')
		.replaceAll(/!\[[^\]]*]\([^)]*\)/g, ' ')
		.replaceAll(/\[[^\]]*]\([^)]*\)/g, (match) => match.replaceAll(/^\[|\]\([^)]*\)$/g, ''))
		.replaceAll(/[*_~#>\-[\]()`]/g, ' ');
}

function collectMatches(text, patterns) {
	const matches = [];
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			matches.push(match[1] || '');
		}
	}
	return matches.join('\n');
}

function collectBoldTextFromMarkdown(filePath) {
	const markdown = readFileSync(filePath, 'utf8');

	return collectMatches(markdown, [
		/^#{1,6}\s+(.+)$/gm,
		/^\s*title:\s*(.+)$/gm,
		/^\s*description:\s*(.+)$/gm,
		/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g,
		/__([^_\n][\s\S]*?[^_\n])__/g,
		/style="[^"]*font-weight:\s*(?:bold|[6-9]00)[^"]*"[^>]*>([^<]+)/gi,
	]);
}

function collectBoldSiteText() {
	const boldText = sourceTextFiles()
		.filter((file) => extensionOf(file) === '.md')
		.map(collectBoldTextFromMarkdown)
		.join('\n');

	return uniqueText([
		asciiText(),
		japanesePunctuationAndKanaText(),
		filterSupportedSiteText(extraInterfaceText.join('\n')),
		filterSupportedSiteText(stripMarkdownSyntax(boldText)),
	].join('\n'));
}

function formatBytes(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
}

function findSubsetCommand() {
	const pyftsubset = spawnSync('pyftsubset', ['--version'], { stdio: 'ignore' });
	if (pyftsubset.status === 0) {
		return { command: 'pyftsubset', prefixArgs: [] };
	}

	for (const pythonCommand of ['python3', 'python']) {
		const fontToolsModule = spawnSync(pythonCommand, ['-c', 'import fontTools.subset'], { stdio: 'ignore' });
		if (fontToolsModule.status === 0) {
			return { command: pythonCommand, prefixArgs: ['-m', 'fontTools.subset'] };
		}
	}

	const uvx = spawnSync('uvx', ['--version'], { stdio: 'ignore' });
	if (uvx.status === 0) {
		return { command: 'uvx', prefixArgs: ['--from', 'fonttools[woff]', 'pyftsubset'] };
	}

	throw new Error('pyftsubset is required. Install it with: python -m pip install "fonttools[woff]"');
}

async function downloadFont(font) {
	const output = join(tempDir, font.input);
	const response = await fetch(font.url);

	if (!response.ok) {
		throw new Error(`Failed to download ${font.name}: HTTP ${response.status}`);
	}

	writeFileSync(output, Buffer.from(await response.arrayBuffer()));
	return output;
}

function subsetFont(command, inputPath, textPath, outputPath) {
	mkdirSync(dirname(outputPath), { recursive: true });

	const args = [
		...command.prefixArgs,
		inputPath,
		`--output-file=${outputPath}`,
		'--flavor=woff2',
		'--layout-features=*',
		`--text-file=${textPath}`,
		'--drop-tables+=DSIG',
		'--passthrough-tables',
	];
	const result = spawnSync(command.command, args, { stdio: 'inherit' });

	if (result.status !== 0) {
		throw new Error(`Failed to subset ${basename(inputPath)}`);
	}
}

function hashFile(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 10);
}

function removeOldSubsetFiles(outputBase, keepPath) {
	const dir = dirname(outputBase);
	const prefix = `${basename(outputBase)}.`;

	if (!existsSync(dir)) return;

	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (path === keepPath) continue;
		if (entry === `${basename(outputBase)}.woff2` || (entry.startsWith(prefix) && extname(entry) === '.woff2')) {
			rmSync(path);
		}
	}
}

function fingerprintSubsetFile(outputBase, tempOutputPath) {
	const outputPath = `${outputBase}.${hashFile(tempOutputPath)}.woff2`;
	removeOldSubsetFiles(outputBase, outputPath);
	rmSync(outputPath, { force: true });
	writeFileSync(outputPath, readFileSync(tempOutputPath));
	rmSync(tempOutputPath, { force: true });
	return outputPath;
}

function publicFontPath(filePath) {
	const publicDir = join(sourceRoot, 'public');
	return `/${filePath.slice(publicDir.length + 1).replaceAll('\\', '/')}`;
}

function writeFontCss(generatedFonts) {
	const firaCode = generatedFonts.get('Fira Code 400');
	const lineSeed400 = generatedFonts.get('LINE Seed JP 400');
	const lineSeed700 = generatedFonts.get('LINE Seed JP 700');

	writeFileSync(
		join(publicFontsDir, 'fonts.css'),
		`@font-face {
  font-family: 'Fira Code';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${publicFontPath(firaCode)}') format('woff2');
}

@font-face {
  font-family: 'LINE Seed JP';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${publicFontPath(lineSeed400)}') format('woff2');
}

@font-face {
  font-family: 'LINE Seed JP';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('${publicFontPath(lineSeed700)}') format('woff2');
}
`,
	);
}

function removeLegacyTtfFiles() {
	for (const file of [
		join(publicFontsDir, 'fira-code', 'fira-code-400.ttf'),
		join(publicFontsDir, 'line-seed-jp', 'line-seed-jp-400.ttf'),
		join(publicFontsDir, 'line-seed-jp', 'line-seed-jp-700.ttf'),
	]) {
		if (existsSync(file)) {
			rmSync(file);
		}
	}
}

mkdirSync(tempDir, { recursive: true });

try {
	const subsetCommand = findSubsetCommand();
	const generatedFonts = new Map();

	for (const font of fontSources) {
		const inputPath = await downloadFont(font);
		const textPath = join(tempDir, `${font.input}.txt`);
		const tempOutputPath = join(tempDir, `${font.input}.woff2`);
		const text = uniqueText(font.text());

		writeFileSync(textPath, text);
		subsetFont(subsetCommand, inputPath, textPath, tempOutputPath);

		const inputSize = statSync(inputPath).size;
		const outputPath = fingerprintSubsetFile(font.outputBase, tempOutputPath);
		const outputSize = statSync(outputPath).size;

		generatedFonts.set(font.name, outputPath);
		console.log(
			`[fonts] ${font.name}: ${formatBytes(inputSize)} -> ${formatBytes(outputSize)} (${text.length} glyph candidates, ${basename(outputPath)})`,
		);
	}

	writeFontCss(generatedFonts);
	removeLegacyTtfFiles();
} finally {
	rmSync(tempDir, { recursive: true, force: true });
}
