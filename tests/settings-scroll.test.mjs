import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/settings-scroll.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
const { preserveSettingsScroll } = mod.exports;
function element({ top = 0, left = 0, height = 2000, viewport = 700, parent = null } = {}) {
  return { scrollTop: top, scrollLeft: left, scrollHeight: height, clientHeight: viewport, parentElement: parent, querySelector: () => null };
}
test('settings rebuild restores its original scroll position', () => {
  const container = element({ top: 900, left: 12 });
  const restore = preserveSettingsScroll(container);
  container.scrollTop = 0; container.scrollLeft = 0;
  restore();
  assert.equal(container.scrollTop, 900); assert.equal(container.scrollLeft, 12);
});
test('scrolling ancestors are preserved when the settings content does not own scrolling', () => {
  const parent = element({ top: 1100 });
  const container = element({ height: 1800, viewport: 1800, parent });
  const restore = preserveSettingsScroll(container);
  parent.scrollTop = 0;
  restore(); assert.equal(parent.scrollTop, 1100);
});
test('AI toggle stays anchored when the settings below it change height', () => {
  const container = element({ top: 850, height: 2600 });
  container.querySelector = selector => selector === '.ai-toggle' ? { getBoundingClientRect: () => ({ top: 1000 - container.scrollTop }) } : null;
  const restore = preserveSettingsScroll(container, '.ai-toggle');
  container.scrollHeight = 1800; container.scrollTop = 0;
  restore();
  assert.equal(container.scrollTop, 850);
  assert.equal(container.querySelector('.ai-toggle').getBoundingClientRect().top, 150);
});
test('Reset all stays visible when restored defaults expand controls above it', () => {
  const parent = element({ top: 1200, height: 2400 });
  const container = element({ height: 2400, viewport: 2400, parent });
  let rowOffset = 1700;
  container.querySelector = () => ({ getBoundingClientRect: () => ({ top: rowOffset - parent.scrollTop }) });
  const restore = preserveSettingsScroll(container, '.reset');
  rowOffset += 650; parent.scrollHeight += 650; parent.scrollTop = 0;
  restore();
  assert.equal(parent.scrollTop, 1850);
  assert.equal(container.querySelector('.reset').getBoundingClientRect().top, 500);
});
test('missing anchors fall back to restoring the scroll offset', () => {
  const container = element({ top: 600 });
  const restore = preserveSettingsScroll(container, '.missing');
  container.scrollTop = 0; restore(); assert.equal(container.scrollTop, 600);
});
