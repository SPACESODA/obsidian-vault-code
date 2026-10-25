import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
async function load(entry, stubs = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'stubs', setup(b) {
    for (const [name, contents] of Object.entries(stubs)) {
      b.onResolve({filter:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')},()=>({path:name,namespace:'stub'}));
      b.onLoad({filter:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),namespace:'stub'},()=>({contents}));
    }
  } }] });
  const mod = {exports:{}}; new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require); return mod.exports;
}
const {captureSelection,selectionLabel,quoteMessage} = await load('src/ai-selection.ts');
test('selection snapshots preserve exact text, offsets, and source line numbers',()=>{
  const source = '# Intro\nFirst line\nSecond line\nLast line';
  const q = captureSelection('Note/README.md',source,8,source.indexOf('Last line'));
  assert.equal(q.text,'First line\nSecond line\n'); assert.equal(q.startLine,2); assert.equal(q.endLine,3);
  assert.equal(q.source,source); assert.equal(q.from,8);
  assert.equal(selectionLabel(q),'Note/README.md · L2–3');
  assert.deepEqual(captureSelection(q.path,source,q.to,q.from),q);
});
test('partial lines, CRLF, and repeated snippets use offsets rather than text searches',()=>{
  const source='same\r\nsame\r\nsame';
  const q=captureSelection('test.md',source,7,9);
  assert.equal(q.text,'am'); assert.equal(q.startLine,2); assert.equal(q.endLine,2);
  assert.equal(selectionLabel(q),'test.md · L2');
});
test('empty or invalid selections do not create an attachment',()=>{
  for(const [from,to] of [[0,0],[-1,3],[0,99],[0.5,3],[NaN,3]]) assert.equal(captureSelection('test.md','hello',from,to),null);
  assert.equal(captureSelection('test.md','  \n',0,3),null);
});
test('quoted messages preserve Markdown safely inside a blockquote and omit unselected source',()=>{
  const source='PRIVATE BEFORE\n##### Agent\n```js\nhello()\n```\nPRIVATE AFTER';
  const q=captureSelection('folder/[demo].md',source,source.indexOf('#####'),source.indexOf('PRIVATE AFTER'));
  const message=quoteMessage('Explain this',q);
  assert.ok(message.startsWith('Explain this\n\n> **folder/\\[demo\\].md · L2–5**'));
  assert.ok(message.includes('> ##### Agent')); assert.ok(message.includes('> ```js'));
  assert.ok(!message.includes('PRIVATE'));
});

const {agentSelectionExtension}=await load('src/ai-selection-extension.ts',{
  'obsidian':'export const setIcon = () => {};',
  '@codemirror/view':'export const ViewPlugin = { fromClass: klass => klass };',
});
function toolbar() {
  const events={}, windowEvents={}, scrollEvents={}, sent=[];
  const button={hidden:false,attributes:{},addEventListener:(name,fn)=>events[name]=fn,setAttribute(name,value){this.attributes[name]=value;},setCssProps(values){this.styles=values;},remove(){this.removed=true;}};
  let source='first\nselected text\nlast';
  const doc={body:{createEl:()=>button}};
  const view={hasFocus:true,dom:{doc,win:{innerWidth:1000,innerHeight:800,addEventListener:(n,fn)=>windowEvents[n]=fn,removeEventListener:n=>delete windowEvents[n]},getBoundingClientRect:()=>({top:0,bottom:700,right:600,width:600})},
    scrollDOM:{addEventListener:(n,fn)=>scrollEvents[n]=fn,removeEventListener:n=>delete scrollEvents[n]},
    state:{doc:{toString:()=>source},selection:{main:{empty:false,from:6,to:19,head:19}}},
    coordsAtPos:()=>({top:50,bottom:70}),requestMeasure(spec){spec.write(spec.read(this));}};
  let enabled=true;
  const Extension=agentSelectionExtension({enabled:()=>enabled,filePath:()=> 'Note/test.md',label:()=> 'Quote selection',onQuote:q=>sent.push(q)});
  const plugin=new Extension(view);
  return {view,plugin,button,events,sent,windowEvents,scrollEvents,disable:()=>enabled=false,setSource:value=>source=value};
}
test('floating action captures the selection before focus changes and never sends automatically',()=>{
  const h=toolbar(); assert.equal(h.button.hidden,false); assert.equal(h.sent.length,0);
  let prevented=false; h.events.pointerdown({preventDefault:()=>prevented=true}); assert.equal(prevented,true);
  h.setSource('another note'); h.view.hasFocus=false; h.events.click();
  assert.equal(h.sent.length,1); assert.equal(h.sent[0].text,'selected text'); assert.equal(h.sent[0].path,'Note/test.md');
  assert.equal(h.button.hidden,true);
});
test('floating action hides on collapsed selection and cleans up scroll and resize listeners',()=>{
  const h=toolbar(); h.view.state.selection.main.empty=true;
  h.plugin.update({selectionSet:true}); assert.equal(h.button.hidden,true);
  h.plugin.destroy(); assert.equal(h.button.removed,true);
  assert.deepEqual(h.windowEvents,{}); assert.deepEqual(h.scrollEvents,{});
});
test('floating action aligns with the first selected line in either selection direction',()=>{
  const h=toolbar();
  h.view.coordsAtPos=pos=>pos===6?{top:100,bottom:120}:{top:200,bottom:220};
  h.plugin.update({selectionSet:true});
  assert.equal(h.button.styles['--selection-agent-top'],'95px');
  assert.equal(h.button.styles['--selection-agent-left'],'544px');
  h.view.state.selection.main.head=6;
  h.plugin.update({selectionSet:true});
  assert.equal(h.button.styles['--selection-agent-top'],'95px');
});
test('disabled chat cannot receive a quote from an already displayed action',()=>{
  const h=toolbar(); h.disable(); h.events.click(); assert.equal(h.sent.length,0);
});

const {AIChatView}=await load('src/ai-chat-view.ts',{'obsidian':`
  export class ItemView {} export class WorkspaceLeaf {} export class App {} export class FileSystemAdapter {}
  export class TFile { constructor(path) { this.path=path; } }
  globalThis.__SelectionTestFile=TFile;
  export class Component {} export class Modal {} export class SuggestModal {} export class Menu {} export class ToggleComponent {}
  export const Platform={isDesktop:true,isMacOS:true,isWin:false};
  export const setIcon=()=>{}; export class Notice {} export const debounce=fn=>fn;
  export const MarkdownRenderer={render:async()=>{}};
  export const getLanguage=()=> 'en'; export const requireApiVersion=()=>true; export const requestUrl=()=>{};
`});
function node(tag='div',options={}) {
  return {tag,children:[],attrs:{...options.attr},textContent:options.text||'',events:{},
    empty(){this.children=[];}, setAttribute(k,v){this.attrs[k]=v;},
    createEl(tag,options={}){const child=node(tag,options);this.children.push(child);return child;},
    createDiv(options){return this.createEl('div',options);}, createSpan(options){return this.createEl('span',options);},
    addEventListener(name,fn){this.events[name]=fn;},focus(){this.focused=true;}};
}
function chat() {
  const view=Object.create(AIChatView.prototype);
  view.inputEl=node('textarea');view.inputEl.value='My existing question';view.quoteContainerEl=node();
  view.pendingQuote=null;view.isGenerating=false;view.chatScope='active-note';view.messages=[];
  view.selectedProvider='connection:test';view.selectedModel='test-model';view.mode='safe';
  view.updateVaultToggleState=()=>{};view.updateContextChip=()=>{};view.autoResizeTextarea=()=>{};
  view.updateSendButtonState=()=>{};view.scrollToBottom=()=>{};view.renderMessageBubble=()=>{};
  view.messagesContainerEl=node(); view.currentChatFile={path:'Agent-Chats/test.md'};
  const file=new globalThis.__SelectionTestFile('Note/test.md');
  view.app={vault:{getAbstractFileByPath:path=>path===file.path?file:null},workspace:{getActiveFile:()=>{throw Error('Must not use another active note');}}};
  const requests=[];view.plugin={settings:{},aiService:{sendMessage:options=>{requests.push(options);return {kill(){}};}}};
  return {view,requests,file};
}
test('attaching and removing a quote preserves the typed draft without starting generation',()=>{
  const {view,requests}=chat();
  view.attachSelection(captureSelection('Note/test.md','hello\nworld',0,5));
  assert.equal(view.inputEl.value,'My existing question');assert.equal(requests.length,0);
  const row=view.quoteContainerEl.children[0];assert.equal(row.children[0].tag,'details');
  const remove=row.children.find(el=>el.tag==='button'); remove.events.click();
  assert.equal(view.pendingQuote,null);assert.equal(view.quoteContainerEl.children.length,0);
  assert.equal(view.inputEl.value,'My existing question');assert.equal(requests.length,0);
});
test('sending consumes the quote once, preserves it in history, and uses its source after switching notes',async()=>{
  const {view,requests,file}=chat();
  const source='PRIVATE PREFIX\nselected text\nPRIVATE SUFFIX';
  view.attachSelection(captureSelection(file.path,source,15,28));
  await view.handleSubmit();
  assert.equal(requests.length,1);assert.equal(view.pendingQuote,null);assert.equal(view.inputEl.value,'');
  const request=requests[0];assert.equal(request.activeFile,file);assert.equal(request.activeContent,source);
  assert.equal(request.selectedText,'selected text');assert.equal(request.contextInPrompt,true);
  assert.ok(request.prompt.includes('Note/test.md · L2'));assert.ok(!request.prompt.includes('PRIVATE'));
  assert.equal(view.messages[0].content,request.prompt);
});
test('an empty question leaves the quote attached and sends nothing',async()=>{
  const {view,requests}=chat();view.inputEl.value='';view.attachSelection(captureSelection('Note/test.md','hello',0,5));
  await view.handleSubmit(); assert.ok(view.pendingQuote);assert.equal(requests.length,0);
});
