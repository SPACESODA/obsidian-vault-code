import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
const {load:yaml,dump}=require('js-yaml');
const compiled=await build({stdin:{contents:'export * from "./src/ai-storage"; export * from "./src/ai-chat-properties"; export { AIChatHistoryModal } from "./src/ai-history-modal";',resolveDir:process.cwd(),sourcefile:'chat-storage-test.ts'},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'obsidian',setup(b){
  b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({resolveDir:process.cwd(),contents:`
    export {load as parseYaml,dump as stringifyYaml} from 'js-yaml';
    export class App {} export class FileSystemAdapter {} export class TFile {} export class TFolder {} export class Modal {} export class Menu {}
    export const Platform={isDesktop:true,isWin:false};export const normalizePath=s=>s;
    export const getLanguage=()=> 'en';export const requireApiVersion=()=>true;export const requestUrl=()=>{};export const setIcon=()=>{};export class Notice {}
  `}));
}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,require);
const {AIStorage,CHAT_PROPERTIES,migrateChatProperties,AIChatHistoryModal}=mod.exports;
const metadata={title:'Chat "quotes" \\ path 漢字',created:'2026-10-24 10:00:00',last_chat:'2026-10-25 11:00:00',scope:'vault',mode:'edit',provider:'codex',model:'test-model',conversationId:'thread-123',reasoning_effort:'high'};
const messages=[{id:'1',role:'user',content:'Question',timestamp:1},{id:'2',role:'assistant',content:'Answer',timestamp:2}];
function split(source){const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);return {properties:yaml(match[1]),body:match[2]};}
function harness(source=''){
  let content=source;let processed=0;
  const app={vault:{async process(_file,update){content=update(content);processed++;},async modify(){throw Error('Updates must use vault.process');}},fileManager:{async processFrontMatter(_file,update){const {properties,body}=split(content);update(properties);content='---\n'+dump(properties)+'---\n'+body;}}};
  return {storage:new AIStorage(app),get content(){return content;},get processed(){return processed;}};
}
function legacyNote(extra={}){return '---\n'+dump({type:'Agent Chat',title:'Old chat',created:metadata.created,last_chat:metadata.last_chat,scope:'vault',mode:'edit',provider:'codex',model:'old-model',conversation_id:'old-thread',reasoning_effort:'high',...extra})+'---\n\n##### You\n\nExisting question\n\n##### Agent\n\nExisting answer\n';}

test('new chats serialize exactly the requested YAML property names and retain internal metadata',()=>{
  const storage=new AIStorage({});const source=storage.serializeChat(metadata,messages);const {properties}=split(source);
  assert.deepEqual(Object.keys(properties),['type','title','created','chat_last','chat_scope','chat_mode','chat_provider','chat_model','chat_id','chat_effort']);
  assert.deepEqual(storage.parseChat(source).metadata,metadata);
  assert.deepEqual(storage.parseChat(source).messages.map(m=>m.content),['Question','Answer']);
});
test('legacy properties remain readable, including conversation ID and reasoning effort',()=>{
  const parsed=new AIStorage({}).parseChat(legacyNote());
  assert.equal(parsed.metadata.provider,'codex');assert.equal(parsed.metadata.scope,'vault');assert.equal(parsed.metadata.mode,'edit');
  assert.equal(parsed.metadata.model,'old-model');assert.equal(parsed.metadata.conversationId,'old-thread');assert.equal(parsed.metadata.reasoning_effort,'high');assert.equal(parsed.metadata.last_chat,metadata.last_chat);
});
test('new names take precedence even when legacy keys occur first',()=>{
  const source=legacyNote({chat_provider:'connection:custom',chat_model:'new-model',chat_id:'new-thread',chat_effort:'medium',chat_scope:'active-note',chat_mode:'safe',chat_last:'2026-10-25 12:00:00'});
  const meta=new AIStorage({}).parseChat(source).metadata;
  assert.equal(meta.provider,'connection:custom');assert.equal(meta.model,'new-model');assert.equal(meta.conversationId,'new-thread');assert.equal(meta.reasoning_effort,'medium');assert.equal(meta.scope,'active-note');assert.equal(meta.mode,'safe');assert.equal(meta.last_chat,'2026-10-25 12:00:00');
});
test('YAML parsing uses exact keys and ignores similarly named nested/custom properties',()=>{
  const storage=new AIStorage({});
  const meta=storage.parseChat('---\ncustom_chat_model: wrong\ncustom:\n  chat_provider: wrong\nchat_model: "correct"\ntitle: "A \\"quote\\""\n---\n').metadata;
  assert.equal(meta.model,'correct');assert.equal(meta.provider,undefined);assert.equal(meta.title,'A "quote"');
});
test('property migration is idempotent and preserves unrelated custom data',()=>{
  const fm=split(legacyNote({tags:['demo'],custom:{a:1},chat_model:'preferred'})).properties;
  migrateChatProperties(fm);const once=structuredClone(fm);migrateChatProperties(fm);assert.deepEqual(fm,once);
  for(const key of Object.keys(CHAT_PROPERTIES))assert.ok(!(key in fm));
  assert.equal(fm.chat_model,'preferred');assert.deepEqual(fm.tags,['demo']);assert.deepEqual(fm.custom,{a:1});assert.equal(fm.created,metadata.created);
});
test('all immediate chat metadata updates migrate legacy names without touching the transcript',async()=>{
  for(const [method,args,key,value] of [
    ['updateChatTitle',['Renamed'],'title','Renamed'],['updateChatScope',['active-note'],'chat_scope','active-note'],['updateChatMode',['safe'],'chat_mode','safe'],
    ['updateChatProvider',['claude','other-model'],'chat_provider','claude'],['updateChatModel',['next-model'],'chat_model','next-model'],['updateChatEffort',['low'],'chat_effort','low'],
  ]){
    const original=legacyNote({tags:['keep']});const h=harness(original);await h.storage[method]({},...args);const next=split(h.content);
    assert.equal(next.properties[key],value,method);assert.equal(next.body,split(original).body,method);
    for(const old of Object.keys(CHAT_PROPERTIES))assert.ok(!(old in next.properties),method+': '+old);
    assert.deepEqual(next.properties.tags,['keep']);assert.equal(next.properties.created,metadata.created);
  }
});
test('transcript saves migrate properties, retain original creation time and custom fields, and clear stale session/effort',async()=>{
  const h=harness(legacyNote({tags:['keep'],custom:{a:1}}));
  await h.storage.updateChatNote({}, {...metadata,created:'2099-01-01 00:00:00',conversationId:undefined,reasoning_effort:undefined},messages);
  const {properties,body}=split(h.content);assert.equal(h.processed,1);
  assert.equal(properties.created,metadata.created);assert.deepEqual(properties.tags,['keep']);assert.deepEqual(properties.custom,{a:1});
  assert.equal(properties.chat_model,'test-model');assert.ok(!('chat_id' in properties));assert.ok(!('chat_effort' in properties));assert.match(body,/Question/);assert.match(body,/Answer/);
  for(const old of Object.keys(CHAT_PROPERTIES))assert.ok(!(old in properties));
});
test('invalid existing frontmatter cannot be silently overwritten by a transcript save',async()=>{
  const source='---\ninvalid: [unclosed\n---\nImportant text';const h=harness(source);
  await assert.rejects(h.storage.updateChatNote({},metadata,messages));assert.equal(h.content,source);
});
test('history timestamps prefer chat_last and still accept legacy last_chat',()=>{
  const file={stat:{mtime:0}};
  const date=fm=>AIChatHistoryModal.prototype.formatDate.call({app:{metadataCache:{getFileCache:()=>({frontmatter:fm})}}},file);
  assert.equal(date({chat_last:'2026-10-25 12:00:00',last_chat:'2020-01-01 00:00:00'}),'2026-10-25  12:00:00');
  assert.equal(date({last_chat:'2026-10-24 10:00:00'}),'2026-10-24  10:00:00');
});
