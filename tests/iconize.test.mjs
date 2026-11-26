import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/iconize.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian'],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, () => ({}));
const { iconShortcodes } = module.exports;

test('finds Iconize shortcodes with their positions', () => {
  assert.deepEqual(iconShortcodes(':LiCopy: :LiFiles:'), [
    { index: 0, length: 8, name: 'LiCopy' },
    { index: 9, length: 9, name: 'LiFiles' },
  ]);
});

test('ignores text that is not a shortcode', () => {
  assert.deepEqual(iconShortcodes('at 10:30 or : spaced : or ::'), []);
});

test('honours a custom identifier', () => {
  assert.deepEqual(iconShortcodes('a $$LiBlend$$ b', '$$'), [{ index: 2, length: 11, name: 'LiBlend' }]);
  assert.deepEqual(iconShortcodes(':LiBlend:', '$$'), []);
});

test('custom rules match like Iconize: regex or plain text, on the name or the full path', () => {
  const { iconRuleMatches } = module.exports;
  assert.equal(iconRuleMatches({ rule: '^Test' }, 'Board/Testing.md'), true);
  assert.equal(iconRuleMatches({ rule: '^Board' }, 'Board/Testing.md'), false);
  assert.equal(iconRuleMatches({ rule: '^Board', useFilePath: true }, 'Board/Testing.md'), true);
  assert.equal(iconRuleMatches({ rule: '[draft' }, 'notes/[draft] plan.md'), true);
});
