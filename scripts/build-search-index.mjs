import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import kuromoji from 'kuromoji';

const rootDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const docsDir = join(rootDir, 'src/content/docs');
const outputDir = join(rootDir, 'public/search');
const tempDbPath = join(outputDir, 'search.tmp.db');
const tempVocabPath = join(outputDir, 'vocab.tmp.json');
const manifestPath = join(outputDir, 'manifest.json');
const tokenizerPath = join(rootDir, 'node_modules/kuromoji/dict');

const searchablePartsOfSpeech = new Set(['名詞', '動詞', '形容詞', '副詞', '連体詞']);
const codeFencePattern = /```[\s\S]*?```/g;
const htmlPattern = /<[^>]+>/g;
const markdownLinkPattern = /\[([^\]]+)\]\([^)]+\)/g;
const inlineCodePattern = /`([^`]+)`/g;
const markdownSyntaxPattern = /[#*_~>|()[\]{}.!?,:;/"'\\-]+/g;

function buildTokenizer() {
	return new Promise((resolve, reject) => {
		kuromoji.builder({ dicPath: tokenizerPath }).build((error, tokenizer) => {
			if (error) reject(error);
			else resolve(tokenizer);
		});
	});
}

function listMarkdownFiles(dir) {
	const result = spawnSync('find', [dir, '-name', '*.md', '-type', 'f'], {
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || 'Failed to list markdown files');
	}
	return result.stdout.trim().split('\n').filter(Boolean).sort();
}

function slugFromFile(filePath) {
	const relativePath = relative(docsDir, filePath).replace(/\.md$/, '');
	const withoutIndex = relativePath.replace(/(^|\/)index$/, '$1').replace(/\/$/, '');
	const url = `/${withoutIndex}`.replace(/\/+/g, '/');
	return url === '/' ? url : `${url}/`;
}

function sectionFromUrl(url) {
	const [, section, year] = url.split('/');
	if (section === 'blog' && year) return `blog/${year}`;
	return section || 'top';
}

function yearFromUrl(url) {
	const match = url.match(/^\/blog\/(\d{4})(?:\/|$)/);
	return match ? match[1] : '';
}

function firstHeading(markdown) {
	return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
}

function extractHeadings(markdown) {
	return [...markdown.matchAll(/^#{2,6}\s+(.+)$/gm)].map((match) => match[1].trim()).join('\n');
}

function plainText(markdown) {
	return markdown
		.replace(codeFencePattern, ' ')
		.replace(markdownLinkPattern, '$1')
		.replace(inlineCodePattern, '$1')
		.replace(htmlPattern, ' ')
		.replace(markdownSyntaxPattern, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function excerptFrom(text) {
	return text.replace(/\s+/g, ' ').slice(0, 180);
}

function normalizeAscii(text) {
	return text.toLowerCase().match(/[a-z0-9][a-z0-9_]{1,}/g) || [];
}

function tokensFor(tokenizer, text) {
	const tokens = [];
	const seen = new Set();
	for (const token of tokenizer.tokenize(text.normalize('NFKC'))) {
		if (!searchablePartsOfSpeech.has(token.pos)) continue;
		const base = token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
		const normalized = base.toLowerCase().replace(/[^\p{Letter}\p{Number}_]/gu, '');
		if (normalized.length < 2) continue;
		if (!seen.has(normalized)) {
			seen.add(normalized);
			tokens.push(normalized);
		}
	}
	for (const ascii of normalizeAscii(text)) {
		if (!seen.has(ascii)) {
			seen.add(ascii);
			tokens.push(ascii);
		}
	}
	return tokens;
}

function sqlString(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function buildInsert(row) {
	return `INSERT INTO search_docs(title_tokens, heading_tokens, body_tokens, title, url, excerpt, section, year)
VALUES (${[
		sqlString(row.titleTokens.join(' ')),
		sqlString(row.headingTokens.join(' ')),
		sqlString(row.bodyTokens.join(' ')),
		sqlString(row.title),
		sqlString(row.url),
		sqlString(row.excerpt),
		sqlString(row.section),
		sqlString(row.year),
	].join(', ')});`;
}

function contentHash(bytes) {
	return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

const tokenizer = await buildTokenizer();
const markdownFiles = listMarkdownFiles(docsDir);
const vocab = new Set();
const rows = markdownFiles.map((filePath) => {
	const { data, content } = matter(readFileSync(filePath, 'utf8'));
	const title = data.title || firstHeading(content) || relative(docsDir, filePath).replace(/\.md$/, '');
	const headings = extractHeadings(content);
	const body = plainText(content);
	const titleTokens = tokensFor(tokenizer, title);
	const headingTokens = tokensFor(tokenizer, headings);
	const bodyTokens = tokensFor(tokenizer, `${data.description || ''}\n${body}`);
	const url = slugFromFile(filePath);
	for (const token of [...titleTokens, ...headingTokens, ...bodyTokens]) vocab.add(token);
	return {
		title,
		titleTokens,
		headingTokens,
		bodyTokens,
		url,
		excerpt: data.description || excerptFrom(body),
		section: sectionFromUrl(url),
		year: yearFromUrl(url),
	};
});

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const sql = [
	'PRAGMA journal_mode = OFF;',
	'PRAGMA synchronous = OFF;',
	'CREATE VIRTUAL TABLE search_docs USING fts5(',
	'  title_tokens,',
	'  heading_tokens,',
	'  body_tokens,',
	'  title UNINDEXED,',
	'  url UNINDEXED,',
	'  excerpt UNINDEXED,',
	'  section UNINDEXED,',
	'  year UNINDEXED,',
	"  tokenize = 'unicode61 remove_diacritics 0'",
	');',
	'BEGIN;',
	...rows.map(buildInsert),
	"INSERT INTO search_docs(search_docs) VALUES('optimize');",
	'COMMIT;',
	'CREATE TABLE search_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);',
	`INSERT INTO search_metadata VALUES ('document_count', ${sqlString(rows.length)});`,
].join('\n');

const sqlite = spawnSync('sqlite3', [tempDbPath], {
	input: sql,
	encoding: 'utf8',
});
if (sqlite.status !== 0) {
	throw new Error(sqlite.stderr || 'Failed to build SQLite search index');
}

const sortedVocab = [...vocab].sort((a, b) => b.length - a.length || a.localeCompare(b));
writeFileSync(tempVocabPath, JSON.stringify(sortedVocab, null, 0));

const dbBytes = readFileSync(tempDbPath);
const vocabBytes = readFileSync(tempVocabPath);
const dbFileName = `search.${contentHash(dbBytes)}.db`;
const vocabFileName = `vocab.${contentHash(vocabBytes)}.json`;
renameSync(tempDbPath, join(outputDir, dbFileName));
renameSync(tempVocabPath, join(outputDir, vocabFileName));

writeFileSync(
	manifestPath,
	JSON.stringify(
		{
			db: dbFileName,
			vocab: vocabFileName,
			documentCount: rows.length,
			tokenCount: sortedVocab.length,
			generatedAt: new Date().toISOString(),
		},
		null,
		2
	)
);

console.log(`Built search index: ${rows.length} documents, ${sortedVocab.length} tokens`);
console.log(`Search assets: ${dbFileName}, ${vocabFileName}`);
