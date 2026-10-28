import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const result = await build({entryPoints:['src/mjml-compile.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['mjml-browser'],plugins:[{name:'messages',setup(b){b.onResolve({filter:/^\.\/i18n$/},()=>({path:'messages',namespace:'messages'}));b.onLoad({filter:/.*/,namespace:'messages'},()=>({contents:'export const t = key => key;'}));}}]});
const mod={exports:{}};
new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {compileMjmlHtml}=mod.exports;
globalThis.window=globalThis;
test('MJML compilation produces complete HTML, preserves links and leaves source unchanged',async()=>{
 const source='<mjml><mj-body><mj-section><mj-column><mj-text>Hello &amp; welcome</mj-text><mj-image src="https://example.com/logo.png" /></mj-column></mj-section></mj-body></mjml>';
 const html=await compileMjmlHtml(source);
 assert.match(html,/<!doctype html>/i);
 assert.match(html,/<html/i);
 assert.match(html,/Hello &amp; welcome/);
 assert.match(html,/https:\/\/example.com\/logo.png/);
 assert.ok(source.startsWith('<mjml>'));
});
test('empty or invalid MJML produces an error instead of copyable stale HTML',async()=>{
 await assert.rejects(compileMjmlHtml('   '),/previewEmpty/);
 await assert.rejects(compileMjmlHtml('<mjml><mj-body><mj-invalid>broken</mj-invalid></mj-body></mjml>'));
});
