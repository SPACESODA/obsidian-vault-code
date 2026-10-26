import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const compiled = await build({entryPoints:['src/ai-chat-leaf.ts'], bundle:true, write:false, platform:'node', format:'cjs'});
const mod = {exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const { ChatLeafManager } = mod.exports;
const type = 'agent-chat';
function leaf(chatPath = null, extra = {}) { return {state:{type,state:{chatPath}},current:false,active:false,...extra}; }
function harness(initial = []) {
  const leaves = [...initial]; const calls = []; let enabled = true; let created = 0;
  const manager = new ChatLeafManager();
  const options = {
    type, enabled:()=>enabled, leaves:()=>leaves.filter(l=>l.state.type===type),
    create:()=>{ created++; const l=leaf(); leaves.push(l); return l; },
    state:l=>l.state, current:l=>l.current, active:l=>l.active, keep:l=>Boolean(l.draft),
    async setState(l,state) {
      calls.push(state); l.state=state;
      await new Promise(resolve=>setImmediate(resolve));
      l.current=state.type===type;
    },
    detach:l=>leaves.splice(leaves.indexOf(l),1),
  };
  return {manager,options,leaves,calls,get created(){return created;},disable(){enabled=false;}};
}
test('simultaneous startup and open actions create only one chat leaf', async()=>{
  const h=harness();
  const results=await Promise.all(Array.from({length:20},()=>h.manager.ensure(h.options)));
  assert.equal(h.created,1); assert.equal(h.leaves.length,1);
  assert.ok(results.every(l=>l===results[0]));
});
test('opening during restoration reuses the temporarily empty leaf and preserves the chat',async()=>{
  const original=leaf('agent-chats/saved.md'); const h=harness([original]);
  const reload=h.manager.ensure(h.options);
  assert.equal(original.state.type,'empty');
  const open=h.manager.ensure(h.options);
  assert.equal(await reload, original); assert.equal(await open, original);
  assert.equal(h.created,0); assert.equal(original.state.state.chatPath,'agent-chats/saved.md');
});
test('duplicate blank leaves are removed, preferring the active healthy leaf',async()=>{
  const active=leaf(null,{current:true,active:true});const h=harness([leaf(),active,leaf()]);
  assert.equal(await h.manager.ensure(h.options),active);
  assert.deepEqual(h.leaves,[active]);assert.equal(h.calls.length,0);
});
test('saved conversations and unsent drafts are preserved during duplicate cleanup',async()=>{
  const a=leaf('a.md');const b=leaf('b.md');const draft=leaf(null,{draft:true,current:true});
  const h=harness([a,b,draft,leaf(),leaf()]);
  await h.manager.ensure(h.options);
  assert.equal(h.leaves.length,4);assert.ok([a,b,draft].every(l=>h.leaves.includes(l)));
});
test('disabling while restoring does not recreate the chat view',async()=>{
  const h=harness([leaf()]);const pending=h.manager.ensure(h.options);h.disable();
  assert.equal(await pending,null);assert.equal(h.calls.length,1);assert.equal(h.created,0);
});
test('failed restoration releases the task for a later retry',async()=>{
  const h=harness();const setState=h.options.setState;h.options.setState=async()=>{throw new Error('failed');};
  await assert.rejects(h.manager.ensure(h.options),/failed/);
  h.options.setState=setState;
  assert.ok(await h.manager.ensure(h.options));
});
