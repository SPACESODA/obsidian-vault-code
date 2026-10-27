import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
const {load:yamlLoad,dump:yamlDump,JSON_SCHEMA}=require('js-yaml');
// Obsidian keeps date-time scalars as strings rather than coercing them to UTC Date objects.
const yaml=source=>yamlLoad(source,{schema:JSON_SCHEMA});
const dump=value=>yamlDump(value,{schema:JSON_SCHEMA});
const compiled=await build({stdin:{contents:'export * from "./src/ai-chat-dates"; export * from "./src/ai-storage"; export * from "./src/ai-chat-properties"; export { AIChatHistoryModal } from "./src/ai-history-modal"; export { TFile, TFolder } from "obsidian";',resolveDir:process.cwd(),sourcefile:'chat-storage-test.ts'},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'obsidian',setup(b){
  b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},()=>({resolveDir:process.cwd(),contents:`
    import {load,dump,JSON_SCHEMA} from 'js-yaml';
    export const parseYaml=source=>load(source,{schema:JSON_SCHEMA});
    export const stringifyYaml=value=>dump(value,{schema:JSON_SCHEMA});
    export class App {} export class FileSystemAdapter {} export class TFile {} export class TFolder {} export class Modal {} export class Menu {}
    export const Platform={isDesktop:true,isWin:false};export const normalizePath=s=>s;
    export const getLanguage=()=> 'en';export const requireApiVersion=()=>true;export const requestUrl=()=>{};export const setIcon=()=>{};export class Notice {}
  `}));
}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,require);
const {AIStorage,CHAT_PROPERTIES,migrateChatProperties,AIChatHistoryModal,parseChatTimestamp}=mod.exports;
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
  assert.deepEqual(Object.keys(properties),['type','title','chat_created','chat_last','chat_scope','chat_mode','chat_provider','chat_model','chat_id','chat_effort']);
  assert.deepEqual(storage.parseChat(source).metadata,{...metadata,created:'2026-10-24T10:00:00',last_chat:'2026-10-25T11:00:00'});
  assert.match(source,/^chat_last: 2026-10-25T11:00:00$/m);
  assert.match(source,/^chat_created: 2026-10-24T10:00:00$/m);
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
  assert.equal(fm.chat_model,'preferred');assert.deepEqual(fm.tags,['demo']);assert.deepEqual(fm.custom,{a:1});assert.equal(fm.chat_created,metadata.created);
});
test('all immediate chat metadata updates migrate legacy names without touching the transcript',async()=>{
  for(const [method,args,key,value] of [
    ['updateChatTitle',['Renamed'],'title','Renamed'],['updateChatScope',['active-note'],'chat_scope','active-note'],['updateChatMode',['safe'],'chat_mode','safe'],
    ['updateChatProvider',['claude','other-model'],'chat_provider','claude'],['updateChatModel',['next-model'],'chat_model','next-model'],['updateChatEffort',['low'],'chat_effort','low'],
  ]){
    const original=legacyNote({tags:['keep']});const h=harness(original);await h.storage[method]({},...args);const next=split(h.content);
    assert.equal(next.properties[key],value,method);assert.equal(next.body,split(original).body,method);
    for(const old of Object.keys(CHAT_PROPERTIES))assert.ok(!(old in next.properties),method+': '+old);
    assert.deepEqual(next.properties.tags,['keep']);assert.equal(next.properties.chat_created,metadata.created);
  }
});
test('transcript saves migrate properties, retain original creation time and custom fields, and clear stale session/effort',async()=>{
  const h=harness(legacyNote({tags:['keep'],custom:{a:1}}));
  await h.storage.updateChatNote({}, {...metadata,created:'2099-01-01 00:00:00',conversationId:undefined,reasoning_effort:undefined},messages);
  const {properties,body}=split(h.content);assert.equal(h.processed,1);
  assert.equal(properties.chat_created,'2026-10-24T10:00:00');assert.deepEqual(properties.tags,['keep']);assert.deepEqual(properties.custom,{a:1});
  assert.equal(properties.chat_model,'test-model');assert.ok(!('chat_id' in properties));assert.ok(!('chat_effort' in properties));assert.match(body,/Question/);assert.match(body,/Answer/);
  for(const old of Object.keys(CHAT_PROPERTIES))assert.ok(!(old in properties));
});
test('invalid existing frontmatter cannot be silently overwritten by a transcript save',async()=>{
  const source='---\ninvalid: [unclosed\n---\nImportant text';const h=harness(source);
  await assert.rejects(h.storage.updateChatNote({},metadata,messages));assert.equal(h.content,source);
});
test('history timestamps prefer chat_last and still accept legacy last_chat',()=>{
  const file={stat:{mtime:0}};
  const date=fm=>AIChatHistoryModal.prototype.formatDate.call({plugin:{aiStorage:new AIStorage({metadataCache:{getFileCache:()=>({frontmatter:fm})}})}},file);
  assert.equal(date({chat_last:'2026-10-25 12:00:00',last_chat:'2020-01-01 00:00:00'}),'2026-10-25  12:00:00');
  assert.equal(date({last_chat:'2026-10-24 10:00:00'}),'2026-10-24  10:00:00');
  assert.equal(date({chat_last:'2026-10-26T19:19:31'}),'2026-10-26  19:19:31');
});

test('history order uses last chat time rather than file modifications or creation date',async()=>{
  const file=(name,mtime)=>({path:'agent-chats/'+name+'.md',stat:{mtime}});
  const files=[file('renamed-old',9999999999999),file('latest',0),file('middle',1),file('legacy',2)];
  const timestamps=['2026-10-24T12:00:00','2026-10-26T19:19:31','2026-10-25T20:00:00','2026-10-25 09:00:00'];
  const properties=new Map(files.map((file,i)=>[file,{frontmatter:i===3?{last_chat:timestamps[i]}:{chat_last:timestamps[i],created:'2099-01-01T00:00:00'}}]));
  const storage=new AIStorage({vault:{getMarkdownFiles:()=>files},metadataCache:{getFileCache:file=>properties.get(file)}});
  assert.deepEqual((await storage.listChatNotes('agent-chats')).map(file=>file.path),['latest','middle','legacy','renamed-old'].map(name=>'agent-chats/'+name+'.md'));
});
test('missing or invalid chat dates fall back to modification time and equal dates sort consistently',async()=>{
  const files=['b','a','fallback'].map(name=>({path:'agent-chats/'+name+'.md',stat:{mtime:Date.parse('2026-10-25T00:00:00')}}));
  const storage=new AIStorage({vault:{getMarkdownFiles:()=>files},metadataCache:{getFileCache:file=>({frontmatter:{chat_last:file.path.includes('fallback')?'invalid':'2026-10-26T10:00:00'}})}});
  assert.equal(storage.getLastChatTime(files[2]),files[2].stat.mtime);
  assert.deepEqual((await storage.listChatNotes('agent-chats')).map(file=>file.path),['a','b','fallback'].map(name=>'agent-chats/'+name+'.md'));
});
test('transcript updates save chat_last as an unquoted local ISO date-time',async()=>{
  const h=harness(legacyNote());await h.storage.updateChatNote({},metadata,messages);
  assert.match(h.content,/^chat_last: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/m);
});

test('date parsing preserves local wall time, respects explicit offsets, and rejects invalid dates',()=>{
  assert.equal(parseChatTimestamp('2026-10-26T19:19:31'),new Date(2026,9,26,19,19,31).getTime());
  assert.equal(parseChatTimestamp('2026-10-26T19:19:31+09:00'),Date.parse('2026-10-26T10:19:31Z'));
  assert.equal(parseChatTimestamp(new Date('2026-10-26T10:19:31Z')),Date.parse('2026-10-26T10:19:31Z'));
  for(const value of ['2026-02-30T12:00:00','2026-10-26T25:00:00','2026-13-01','42',null,new Date(NaN)])assert.equal(parseChatTimestamp(value),null);
});

test('chat_created takes precedence and a separate user-created property is preserved',async()=>{
  const source=legacyNote({created:'User-owned date',chat_created:'2026-10-24T10:00:00'});
  const h=harness(source);
  assert.equal(h.storage.parseChat(source).metadata.created,'2026-10-24T10:00:00');
  await h.storage.updateChatTitle({},'Renamed');
  assert.equal(split(h.content).properties.created,'User-owned date');
  await h.storage.updateChatNote({}, {...metadata,created:'2099-01-01T00:00:00'},messages);
  const {properties}=split(h.content);
  assert.equal(properties.created,'User-owned date');
  assert.equal(properties.chat_created,'2026-10-24T10:00:00');
});

test('listChatNotes ignores instructions.md so it is never listed or deleted as a chat',async()=>{
  const created=new Date('2026-10-24T10:00:00').getTime();
  const files=[{path:'agent-chats/chat-1.md',name:'chat-1.md',stat:{mtime:created}},{path:'agent-chats/instructions.md',name:'instructions.md',stat:{mtime:created}}];
  const storage=new AIStorage({vault:{getMarkdownFiles:()=>files},metadataCache:{getFileCache:()=>({frontmatter:{type:'Agent Chat'}})}});
  const result=await storage.listChatNotes('agent-chats');
  assert.equal(result.length,1);
  assert.equal(result[0].name,'chat-1.md');
});

test('ensureInstructionsFile creates default note if missing and loadInstructions strips frontmatter',async()=>{
  let createdPath='',createdContent='';
  const mockFile={path:'agent-chats/instructions.md',name:'instructions.md'};
  let existing=null;
  const storage=new AIStorage({
    vault:{
      getAbstractFileByPath:p=>p==='agent-chats/instructions.md'?existing:null,
      create:async(path,content)=>{createdPath=path;createdContent=content;existing=mockFile;return mockFile;},
      createFolder:async()=>{},
      read:async()=>'---\ntype: Note\n---\n<!-- Internal note -->\n# Custom Rules\n- Be concise.'
    }
  });
  const file=await storage.ensureInstructionsFile('agent-chats');
  assert.equal(file,mockFile);
  assert.equal(createdPath,'agent-chats/instructions.md');
  assert.ok(createdContent.includes('Keep a helpful, professional, and concise tone.'));
  assert.doesNotMatch(createdContent,/Safe mode|Edit mode/);

  const loaded=await storage.loadInstructions('agent-chats');
  assert.equal(loaded,'# Custom Rules\n- Be concise.');
});

test('instruction comments preserve text boundaries and cannot reassemble comment openers',async()=>{
  const cases=[
    ['Before<!-- hidden -->After','Before\nAfter'],
    ['Keep<!-- one --><!-- two --> this','Keep\n\n this'],
    ['<<!-- hidden -->!-- remaining -->','<\n!-- remaining -->'],
    ['Before<!-- outer <!-- inner -->After','Before\nAfter'],
    ['Before<!-- unfinished\nprivate text','Before'],
    ['---\ntype: Note\n---\n# Rules\n<!-- hidden -->\n- Keep [[Links]] and `code`.','# Rules\n\n\n- Keep [[Links]] and `code`.'],
  ];
  for(const [source,expected] of cases){
    const storage=new AIStorage({vault:{read:async()=>source}});
    storage.ensureInstructionsFile=async()=>({});
    const result=await storage.loadInstructions('agent-chats');
    assert.equal(result,expected,source);
    assert.ok(!result.includes('<!--'),source);
  }
});

test('instruction read failures return the built-in instructions',async()=>{
  for(const failAt of ['ensure','read']){
    const storage=new AIStorage({vault:{read:async()=>{throw Error('read failed');}}});
    storage.ensureInstructionsFile=async()=>{if(failAt==='ensure')throw Error('creation failed');return {};};
    assert.equal(await storage.loadInstructions('agent-chats'),mod.exports.DEFAULT_AGENT_INSTRUCTIONS.trim());
  }
});

test('concurrent instruction creation is shared and a deleted note can be recreated',async()=>{
  const {TFile,TFolder}=mod.exports;
  const files=new Map([['agent-chats',new TFolder()]]);
  let creates=0,release;
  const ready=new Promise(resolve=>{release=resolve;});
  const storage=new AIStorage({vault:{
    getAbstractFileByPath:path=>files.get(path),
    create:async(path,content)=>{creates++;await ready;assert.ok(!files.has(path));const file=new TFile();file.content=content;files.set(path,file);return file;},
  }});
  const pending=Array.from({length:5},()=>storage.ensureInstructionsFile('agent-chats'));
  release();
  const results=await Promise.all(pending);
  assert.equal(creates,1);assert.ok(results.every(file=>file===results[0]));
  files.delete('agent-chats/instructions.md');
  await storage.ensureInstructionsFile('agent-chats');assert.equal(creates,2);
});

test('instruction creation preserves existing notes and recovers from an external creation race',async()=>{
  const {TFile,TFolder}=mod.exports;
  let existing;const external=new TFile();external.content='Custom preferences';let creates=0;
  const storage=new AIStorage({vault:{
    getAbstractFileByPath:path=>path==='agent-chats'?new TFolder():existing,
    create:async()=>{creates++;existing=external;throw Error('File already exists');},
  }});
  assert.equal(await storage.ensureInstructionsFile('agent-chats'),external);
  assert.equal(await storage.ensureInstructionsFile('agent-chats'),external);
  assert.equal(creates,1);assert.equal(external.content,'Custom preferences');
});

test('failed instruction creation releases pending work so a later request can retry',async()=>{
  let attempts=0;const {TFile,TFolder}=mod.exports;
  const storage=new AIStorage({vault:{
    getAbstractFileByPath:path=>path==='agent-chats'?new TFolder():null,
    create:async()=>{attempts++;if(attempts===1)throw Error('Unavailable');return new TFile();},
  }});
  await assert.rejects(storage.ensureInstructionsFile('agent-chats'),/Unavailable/);
  assert.ok(await storage.ensureInstructionsFile('agent-chats') instanceof TFile);
  assert.equal(attempts,2);
});

test('folder creation tolerates another operation creating the folder but preserves other failures',async()=>{
  const {TFile,TFolder}=mod.exports;let existing;
  const storage=new AIStorage({vault:{
    getAbstractFileByPath:()=>existing,
    createFolder:async()=>{if(!existing)existing=new TFolder();throw Error('Already exists');},
  }});
  assert.ok(await storage.ensureFolder('agent-chats') instanceof TFolder);
  existing=new TFile();
  await assert.rejects(storage.ensureFolder('agent-chats'),/Already exists/);
});

test('instruction frontmatter accepts BOM, CRLF and empty mappings and requires full delimiter lines',async()=>{
  const cases=[
    ['\uFEFF---\r\ntags: [metadata]\r\n---\r\nRules','Rules'],
    ['---\n---\nRules','Rules'],
    ['--- \nname: rules\n--- \nRules','Rules'],
    ['---\nname: rules\n---',''],
    ['---\nname: rules\n----\nRules','---\nname: rules\n----\nRules'],
    ['---\nname: rules\n---not-a-delimiter\nRules','---\nname: rules\n---not-a-delimiter\nRules'],
    ['Text\n---\nname: rules\n---\nRules','Text\n---\nname: rules\n---\nRules'],
    ['\uFEFFPlain preferences','Plain preferences'],
  ];
  for(const [source,expected] of cases){
    const storage=new AIStorage({vault:{read:async()=>source}});storage.ensureInstructionsFile=async()=>({});
    assert.equal(await storage.loadInstructions('agent-chats'),expected);
  }
});

test('only the designated instruction note is excluded from chat history',async()=>{
  const files=['agent-chats/instructions.md','other/instructions.md','agent-chats/nested/instructions.md'].map(path=>({path,name:'instructions.md',stat:{mtime:0}}));
  const storage=new AIStorage({vault:{getMarkdownFiles:()=>files},metadataCache:{getFileCache:()=>({frontmatter:{type:'Agent Chat'}})}});
  assert.deepEqual((await storage.listChatNotes('agent-chats')).map(file=>file.path),['agent-chats/nested/instructions.md','other/instructions.md']);
});

test('changing the chat folder to a parent never lists or cleans up older instruction notes',async()=>{
  const oldInstructions={path:'agent-chats/old/instructions.md',name:'instructions.md',stat:{mtime:0}};
  const currentInstructions={path:'agent-chats/instructions.md',name:'instructions.md',stat:{mtime:0}};
  const chat={path:'agent-chats/chat.md',name:'chat.md',stat:{mtime:0}};
  const trashed=[];
  const storage=new AIStorage({
    vault:{getMarkdownFiles:()=>[currentInstructions,oldInstructions,chat],read:async file=>file===chat?'---\ntype: Agent Chat\n---\n##### You\nQuestion':'Preferences'},
    metadataCache:{getFileCache:file=>({frontmatter:file===chat?{type:'Agent Chat'}:{}})},
    fileManager:{trashFile:async file=>{trashed.push(file.path);}},
  });
  assert.deepEqual((await storage.listChatNotes('agent-chats')).map(file=>file.path),[chat.path]);
  await storage.cleanupOldChats('agent-chats','all');
  assert.deepEqual(trashed,[chat.path]);
});

test('cleanup checks actual chat contents and preserves unrelated, malformed and unreadable notes',async()=>{
  const contents=new Map([
    ['agent-chats/README.md','---\ntype: Project documentation\n---\n##### You\nExample question\n##### Agent\nExample response'],
    ['agent-chats/tagged.md','---\ntype: Agent Chat\n---\n##### You\nQuestion'],
    ['agent-chats/legacy.md','##### You\nQuestion\n\n##### Agent\nAnswer'],
    ['agent-chats/invalid.md','---\ntype: [unclosed\n---\nImportant text'],
    ['agent-chats/missing.md',null],
  ]);
  const files=[...contents.keys()].map(path=>({path,name:path.split('/').at(-1),stat:{mtime:0}}));const trashed=[];
  const storage=new AIStorage({vault:{getMarkdownFiles:()=>files,read:async file=>{const text=contents.get(file.path);if(text===null)throw Error('Unavailable');return text;}},
    metadataCache:{getFileCache:()=>({frontmatter:{type:'Agent Chat'}})},fileManager:{trashFile:async file=>{trashed.push(file.path);}}});
  assert.equal(await storage.cleanupOldChats('agent-chats','all'),2);
  assert.deepEqual(trashed,['agent-chats/legacy.md','agent-chats/tagged.md']);
});

test('age-based cleanup uses last chat time consistently with history sorting',async()=>{
  const files=[{path:'agent-chats/recent.md',stat:{mtime:0}},{path:'agent-chats/old.md',stat:{mtime:Date.now()}}];
  const trashed=[];const storage=new AIStorage({vault:{getMarkdownFiles:()=>files,read:async file=>'---\ntype: Agent Chat\nchat_last: '+new Date(file===files[0]?Date.now():0).toISOString()+'\n---\n'},
    metadataCache:{getFileCache:file=>({frontmatter:{chat_last:new Date(file===files[0]?0:Date.now()).toISOString()}})},fileManager:{trashFile:async file=>{trashed.push(file.path);}}});
  assert.equal(await storage.cleanupOldChats('agent-chats','7d'),1);assert.deepEqual(trashed,['agent-chats/old.md']);
});
