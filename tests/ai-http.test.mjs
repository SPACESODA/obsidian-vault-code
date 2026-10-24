import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/ai-http.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'obsidian-test', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const Platform = { isDesktop: true }; export const requestUrl = () => { throw new Error('Unexpected mobile request'); };` }));
} }] });
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(mod, mod.exports, require);
const { aiHttpRequest } = mod.exports;
function setup(chunks, { error, status = 200 } = {}) {
  const calls = [];
  const runtime = { request(url, options, callback) {
    const req = new EventEmitter();
    req.end = body => {
      calls.push({ url, options, body });
      queueMicrotask(() => {
        if (error) { req.emit('error', error); return; }
        callback({ statusCode: status, headers: { 'content-type': 'text/event-stream' }, async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; } });
      });
    };
    return req;
  } };
  globalThis.window = { require(name) { calls.push(name); return runtime; } };
  return calls;
}
async function collect(response) {
  let result = ''; for await (const chunk of response.chunks) result += chunk; return result;
}
test('desktop HTTP preserves Unicode split across binary chunks', async () => {
  const data = new TextEncoder().encode('Hello 世界 👋');
  const calls = setup([data.slice(0, 8), data.slice(8, 14), data.slice(14)]);
  const controller = new AbortController();
  const response = await aiHttpRequest('https://example.test/v1', { 'X-Test': 'value' }, '{}', controller.signal);
  assert.equal(await collect(response), 'Hello 世界 👋');
  assert.equal(calls[0], 'https');
  assert.equal(calls[1].options.signal, controller.signal);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].body, '{}');
});
test('desktop HTTP handles text chunks and GET model discovery', async () => {
  const calls = setup(['{"data":', '[]}']);
  const response = await aiHttpRequest('http://localhost/v1/models', {}, undefined, new AbortController().signal);
  assert.equal(await collect(response), '{"data":[]}');
  assert.equal(calls[0], 'http'); assert.equal(calls[1].options.method, 'GET');
});
test('invalid desktop networking modules fail with a clear error', async () => {
  for (const candidate of [null, {}, { request: false }]) {
    globalThis.window = { require: () => candidate };
    await assert.rejects(aiHttpRequest('https://example.test', {}, undefined, new AbortController().signal), /HTTP runtime not available/);
  }
});
test('unsupported protocols are rejected before loading a runtime', async () => {
  globalThis.window = { require: () => { throw new Error('Must not load a module'); } };
  await assert.rejects(aiHttpRequest('file:///tmp/test', {}, undefined, new AbortController().signal), /HTTP or HTTPS endpoint/);
});
test('invalid response chunks fail rather than coercing arbitrary objects', async () => {
  setup([{ secret: 'unexpected payload' }]);
  const response = await aiHttpRequest('https://example.test', {}, undefined, new AbortController().signal);
  await assert.rejects(collect(response), /Unsupported HTTP response chunk/);
});
test('request errors propagate and cancellation stops response consumption', async () => {
  setup([], { error: new Error('Connection refused') });
  await assert.rejects(aiHttpRequest('https://example.test', {}, undefined, new AbortController().signal), /Connection refused/);
  setup([new TextEncoder().encode('Late chunk')]);
  const controller = new AbortController();
  const response = await aiHttpRequest('https://example.test', {}, undefined, controller.signal);
  controller.abort();
  await assert.rejects(collect(response), /Request cancelled/);
});
