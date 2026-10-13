import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');
const i18nIndexPath = join(srcDir, 'i18n', 'index.ts');
const referenceLanguage = 'en';

const translations = {
	en: JSON.parse(readFileSync(join(srcDir, 'i18n', 'en.json'), 'utf8')),
	es: JSON.parse(readFileSync(join(srcDir, 'i18n', 'es.json'), 'utf8')),
};

const languages = Object.keys(translations);

function flatten(object, prefix = '') {
	const entries = [];
	for (const [key, value] of Object.entries(object)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			entries.push(...flatten(value, path));
		} else {
			entries.push([path, value]);
		}
	}
	return entries;
}

function walk(dir) {
	const files = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			files.push(...walk(full));
		} else if (full.endsWith('.ts')) {
			files.push(full);
		}
	}
	return files;
}

function placeholders(text) {
	return [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const sourceFiles = walk(srcDir);
const hardcodingFiles = sourceFiles.filter((file) => file !== i18nIndexPath);

function collectUsedKeys() {
	const literalKeys = new Set();
	const dynamicPrefixes = [];
	for (const file of sourceFiles) {
		const content = readFileSync(file, 'utf8');
		for (const match of content.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
			literalKeys.add(match[2]);
		}
		for (const match of content.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
			dynamicPrefixes.push(match[1]);
		}
	}
	return { literalKeys, dynamicPrefixes };
}

test('every language defines the same keys as the reference language', () => {
	const referenceKeys = flatten(translations[referenceLanguage]).map(([key]) => key).sort();
	for (const language of languages) {
		const keys = flatten(translations[language]).map(([key]) => key).sort();
		const missing = referenceKeys.filter((key) => !keys.includes(key));
		const extra = keys.filter((key) => !referenceKeys.includes(key));
		assert.deepEqual(missing, [], `[${language}] keys missing: ${missing.join(', ')}`);
		assert.deepEqual(extra, [], `[${language}] keys not present in ${referenceLanguage}: ${extra.join(', ')}`);
	}
});

test('no translation value is empty', () => {
	for (const language of languages) {
		for (const [key, value] of flatten(translations[language])) {
			assert.equal(typeof value, 'string', `[${language}] ${key} must be a string`);
			assert.ok(String(value).trim().length > 0, `[${language}] ${key} is empty`);
		}
	}
});

test('placeholders match across languages', () => {
	const reference = new Map(flatten(translations[referenceLanguage]));
	for (const language of languages) {
		for (const [key, value] of flatten(translations[language])) {
			const referenceValue = reference.get(key);
			if (referenceValue === undefined) {
				continue;
			}
			assert.deepEqual(
				placeholders(value),
				placeholders(referenceValue),
				`[${language}] placeholder mismatch for ${key}`,
			);
		}
	}
});

test('every literal key used with t() exists in all languages', () => {
	const { literalKeys } = collectUsedKeys();
	const missing = [];
	for (const key of literalKeys) {
		for (const language of languages) {
			if (!flatten(translations[language]).some(([path]) => path === key)) {
				missing.push(`${language}:${key}`);
			}
		}
	}
	assert.deepEqual(missing.sort(), [], `Keys used in code but missing from translations: ${missing.join(', ')}`);
});

test('no translation key is unused', () => {
	const { literalKeys, dynamicPrefixes } = collectUsedKeys();
	const unused = flatten(translations[referenceLanguage])
		.map(([key]) => key)
		.filter((key) => !literalKeys.has(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix)));
	assert.deepEqual(unused.sort(), [], `Unused translation keys: ${unused.join(', ')}`);
});

const UI_STRING_PATTERNS = [
	{ label: 'Notice', pattern: /\bnew Notice\(\s*['"`]/ },
	{ label: 'element text', pattern: /\btext:\s*['"`]/ },
	{
		label: 'Setting text',
		pattern: /\.(?:setName|setDesc|setButtonText|setPlaceholder|setTitle|setText)\(\s*['"`]/,
	},
];

test('no hardcoded user-facing strings outside t()', () => {
	const offenders = [];
	for (const file of hardcodingFiles) {
		const lines = readFileSync(file, 'utf8').split(/\r?\n/);
		lines.forEach((line, index) => {
			if (UI_STRING_PATTERNS.some(({ pattern }) => pattern.test(line))) {
				offenders.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
			}
		});
	}
	assert.deepEqual(offenders, [], `Hardcoded UI strings, wrap them in t():\n${offenders.join('\n')}`);
});
