import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/recent-files-list.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(module, module.exports);
const { recentEntries, recentGroup, fullStamp, shortStamp } = module.exports;

const now = new Date(2026, 10, 25, 15, 0).getTime();
const hour = 3600_000;
const day = 24 * hour;
const file = (path, mtime, ctime = mtime) => ({ path, stat: { mtime, ctime } });

test('one timeline sorts by latest activity, whether edited or added', () => {
  const entries = recentEntries([
    file('old-edit.md', now - 3 * hour, now - 10 * day),
    file('just-added.png', now - hour, now - hour),
    file('copied.md', now - 30 * day, now - 2 * hour),
    file('fresh-edit.md', now - 5 * 60_000, now - 2 * day),
  ], now, 10);
  assert.deepEqual(entries.map(entry => entry.file.path), ['fresh-edit.md', 'just-added.png', 'copied.md', 'old-edit.md']);
  assert.equal(entries[2].time, now - 2 * hour);
});

test('files without any time are skipped', () => {
  assert.deepEqual(recentEntries([file('empty.md', 0, 0)], now, 5), []);
  const [synced] = recentEntries([file('synced.md', now - hour, 0)], now, 1);
  assert.equal(synced.time, now - hour);
});

test('limits the list and keeps ties in a stable path order', () => {
  const entries = recentEntries([file('b.md', now - hour), file('a.md', now - hour), file('c.md', now - 2 * hour)], now, 2);
  assert.deepEqual(entries.map(entry => entry.file.path), ['a.md', 'b.md']);
  assert.deepEqual(recentEntries([file('a.md', now)], now, 0), []);
});

test('groups follow calendar days in local time', () => {
  const midnight = new Date(2026, 10, 25).getTime();
  assert.equal(recentGroup(midnight, now), 'today');
  assert.equal(recentGroup(midnight - 1, now), 'yesterday');
  assert.equal(recentGroup(midnight - day, now), 'yesterday');
  assert.equal(recentGroup(midnight - day - 1, now), 'week');
  assert.equal(recentGroup(midnight - 7 * day, now), 'week');
  assert.equal(recentGroup(midnight - 8 * day, now), 'month');
  assert.equal(recentGroup(midnight - 31 * day, now), 'earlier');
});

test('the filter runs on the newest files only and skips what it hides', () => {
  const seen = [];
  const entries = recentEntries([
    file('hidden.md', now - hour), file('a.md', now - 2 * hour), file('b.md', now - 3 * hour), file('c.md', now - 4 * hour),
  ], now, 2, entry => { seen.push(entry.path); return entry.path !== 'hidden.md'; });
  assert.deepEqual(entries.map(entry => entry.file.path), ['a.md', 'b.md']);
  assert.deepEqual(seen, ['hidden.md', 'a.md', 'b.md']);
});

test('stamps use fixed local formats', () => {
  const at = new Date(2026, 2, 5, 9, 7).getTime();
  assert.equal(fullStamp(at), '2026-03-05 09:07');
  assert.equal(shortStamp(at, 'today', now), '09:07');
  assert.equal(shortStamp(at, 'month', now), '03-05');
  assert.equal(shortStamp(new Date(2025, 11, 31).getTime(), 'earlier', now), '2025-12-31');
});
