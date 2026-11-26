import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/file-search.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(module, module.exports);
const { fileSearchPattern, findMatches, looksBinary } = module.exports;

const plain = { caseSensitive: false, wholeWord: false, regex: false };
const find = (text, query, options = plain, limit = 100) => findMatches(text, fileSearchPattern(query, options), limit);

test('plain queries are literal and case-insensitive by default', () => {
  const matches = find('const a = 1;\nconst A.b = 2;', 'a.b');
  assert.equal(matches.length, 1);
  assert.deepEqual([matches[0].line, matches[0].from, matches[0].to], [1, 19, 22]);
  assert.equal(matches[0].text.slice(matches[0].start, matches[0].end), 'A.b');
});

test('case, whole word and regex options', () => {
  assert.equal(find('Todo todo TODO', 'todo', { ...plain, caseSensitive: true }).length, 1);
  assert.equal(find('cat concat cat_x cat.', 'cat', { ...plain, wholeWord: true }).length, 2);
  assert.equal(find('café cafés', 'café', { ...plain, wholeWord: true }).length, 1);
  assert.deepEqual(find('v1 v22 v', 'v\\d+', { ...plain, regex: true }).map(m => m.text.slice(m.start, m.end)), ['v1', 'v22']);
});

test('invalid regex reports an error, loose syntax still works', () => {
  assert.ok('error' in fileSearchPattern('(', { ...plain, regex: true }));
  assert.equal(find('a-b', 'a\\-b', { ...plain, regex: true }).length, 1);
  assert.equal(fileSearchPattern('', plain), undefined);
});

test('line numbers, empty matches and limits', () => {
  const text = 'one\ntwo\r\nthree two\n';
  assert.deepEqual(find(text, 'two').map(m => m.line), [1, 2]);
  assert.equal(find(text, 'two')[0].text, 'two');
  assert.equal(find(text, '^', { ...plain, regex: true }).length, 0);
  assert.equal(find('x x x x', 'x', plain, 2).length, 2);
});

test('long lines become a short excerpt around the match', () => {
  const line = 'a'.repeat(500) + 'needle' + 'b'.repeat(500);
  const [match] = find(line, 'needle');
  assert.ok(match.text.length < 220);
  assert.ok(match.text.startsWith('…') && match.text.endsWith('…'));
  assert.equal(match.text.slice(match.start, match.end), 'needle');
});

test('indentation is dropped from excerpts', () => {
  const [match] = find('\t\t  return value;', 'value');
  assert.equal(match.text, 'return value;');
  assert.equal(match.text.slice(match.start, match.end), 'value');
});

test('binary text is detected by NUL bytes', () => {
  assert.equal(looksBinary('abc\u0000def'), true);
  assert.equal(looksBinary('plain text'), false);
});
