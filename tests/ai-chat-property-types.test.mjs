import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/ai-chat-property-types.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',outputFiles[0].text)(mod,mod.exports);
const {ensureChatPropertyTypes}=mod.exports;
function harness(initial={},loaded=true){
  const types={...initial};const writes=[];
  return {types,writes,app:{metadataTypeManager:{_loaded:loaded,getAssignedWidget:name=>types[name]??null,setType:async(name,type)=>{types[name]=type;writes.push(name);}}}};
}
test('registers only the two chat dates, preserving every other property type',async()=>{
  const h=harness({created:'text',tags:'tags',custom:'number'});
  await ensureChatPropertyTypes(h.app);
  assert.deepEqual(h.types,{created:'text',tags:'tags',custom:'number',chat_last:'datetime',chat_created:'datetime'});
  assert.deepEqual(h.writes,['chat_last','chat_created']);
});
test('correct types cause no writes and repeated initialization is idempotent',async()=>{
  const h=harness({chat_last:'datetime',chat_created:'text'});
  await ensureChatPropertyTypes(h.app);await ensureChatPropertyTypes(h.app);
  assert.deepEqual(h.writes,['chat_created']);
});
test('unloaded property settings are left alone and can be retried after loading',async()=>{
  const h=harness({},false);await ensureChatPropertyTypes(h.app);assert.deepEqual(h.writes,[]);
  h.app.metadataTypeManager._loaded=true;await ensureChatPropertyTypes(h.app);assert.equal(h.writes.length,2);
});
test('missing or unsupported property APIs do not prevent chat initialization',async()=>{
  for(const app of [null,{}, {metadataTypeManager:null},{metadataTypeManager:{setType:42}}])await ensureChatPropertyTypes(app);
});
test('a persistence failure can be retried without overwriting successful assignments',async()=>{
  const h=harness();const set=h.app.metadataTypeManager.setType;let fails=true;
  h.app.metadataTypeManager.setType=async(name,type)=>{if(name==='chat_created'&&fails){fails=false;throw Error('write failed');}await set(name,type);};
  await assert.rejects(ensureChatPropertyTypes(h.app),/write failed/);
  await ensureChatPropertyTypes(h.app);assert.deepEqual(h.writes,['chat_last','chat_created']);
});
