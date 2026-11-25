import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/kanban-file.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
});
const module = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(module, module.exports);
const { boardRelativePath, readKanbanFile, readKanbanUnsorted, relativeKanbanOrder, writeKanbanFile, writeKanbanUnsorted } = module.exports;

test('legacy order becomes portable and keeps root cards under the empty column key', () => {
  const order = relativeKanbanOrder('Projects/Launch', {
    columns: ['Projects/Launch/Done', 'Projects/Launch/Todo'],
    cards: {
      'Projects/Launch': ['Projects/Launch/Read me.md'],
      'Projects/Launch/Todo': ['Projects/Launch/Todo/Write.md', 'Other/Write.md'],
    },
  });
  assert.deepEqual(order, {
    columns: ['Done', 'Todo'], cards: { '': ['Read me.md'], Todo: ['Todo/Write.md'] },
  });
  assert.equal(boardRelativePath('Archive/Launch', 'Archive/Launch/Todo/Write.md'), order.cards.Todo[0]);
  assert.equal(boardRelativePath('/', 'Todo'), 'Todo');
});

test('writes preserve other board fields while rejecting malformed or unsupported files', () => {
  assert.equal(readKanbanFile('{'), null);
  assert.equal(readKanbanFile('{"version":2,"columns":[],"cards":{}}'), null);
  const board = readKanbanFile('{"version":1,"columns":[],"cards":{},"color":"blue"}');
  const saved = readKanbanFile(writeKanbanFile({ columns: ['Done'], cards: {} }, board));
  assert.equal(saved.color, 'blue');
  assert.deepEqual(saved.columns, ['Done']);
});

test('Unsorted defaults to last and preserves board order and metadata through edits', () => {
  assert.equal(readKanbanUnsorted(undefined).position, 'last');
  assert.equal(readKanbanUnsorted({ position: 'middle', name: '  ' }).name, undefined);
  assert.equal(readKanbanUnsorted({ position: 'middle' }).position, 'last');

  const source = readKanbanFile('{"version":1,"columns":["Todo"],"cards":{"":["Loose.md"]},"color":"blue","unsorted":{"name":"Inbox","extra":true}}');
  const hidden = readKanbanFile(writeKanbanUnsorted(source, { position: 'hidden' }));
  assert.deepEqual(readKanbanUnsorted(hidden.unsorted), { position: 'hidden', name: 'Inbox' });
  assert.equal(hidden.unsorted.extra, true);
  assert.deepEqual(hidden.columns, ['Todo']);
  assert.deepEqual(hidden.cards[''], ['Loose.md']);
  assert.equal(hidden.color, 'blue');

  const restored = readKanbanFile(writeKanbanUnsorted(hidden, { position: 'first', name: undefined }));
  assert.equal(restored.unsorted.position, 'first');
  assert.equal(Object.hasOwn(restored.unsorted, 'name'), false);
  assert.equal(restored.unsorted.extra, true);
  const reordered = readKanbanFile(writeKanbanFile({ columns: ['Later', 'Todo'], cards: restored.cards }, restored));
  assert.deepEqual(reordered.unsorted, restored.unsorted);
});

test('cards are saved by file name under their column and read back as board paths, old full paths included', () => {
  const order = { columns: ['Todo', 'Done'], cards: { '': ['Loose.md'], Todo: ['Todo/Write.md', 'Todo/Ship.md'], Done: [] } };
  const source = writeKanbanFile(order);
  assert.deepEqual(JSON.parse(source).cards, { '': ['Loose.md'], Todo: ['Write.md', 'Ship.md'], Done: [] });
  assert.deepEqual({ ...readKanbanFile(source).cards }, order.cards);

  const old = readKanbanFile('{"version":1,"columns":["Todo"],"cards":{"Todo":["Todo/Write.md","Ship.md"],"":["Loose.md"]}}');
  assert.deepEqual({ ...old.cards }, { Todo: ['Todo/Write.md', 'Todo/Ship.md'], '': ['Loose.md'] });
  assert.deepEqual(JSON.parse(writeKanbanFile(old, old)).cards, { Todo: ['Write.md', 'Ship.md'], '': ['Loose.md'] });
});

test('a damaged order file keeps the board working: bad entries are skipped, names compared in NFC', () => {
  const board = readKanbanFile('{"version":1,"columns":["Todo",5,"Todo",null],"cards":{"Todo":[5,"Write.md","Write.md",{}],"Done":"Ship.md","Caf\u0065\u0301":["Cafe\u0301 note.md"]}}');
  assert.deepEqual(board.columns, ['Todo']);
  assert.deepEqual({ ...board.cards }, { Todo: ['Todo/Write.md'], Done: [], 'Caf\u00e9': ['Caf\u00e9/Caf\u00e9 note.md'] });
  assert.deepEqual(readKanbanFile('{"version":1}').columns, []);
  assert.deepEqual({ ...readKanbanFile('{"version":1,"columns":"x","cards":[]}').cards }, {});
  assert.equal(readKanbanFile('not json'), null);
  assert.equal(readKanbanFile('[]'), null);
});
