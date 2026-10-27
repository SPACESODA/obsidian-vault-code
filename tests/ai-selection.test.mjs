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
const {captureSelection,captureReadingSelection,selectionLabel,quoteMessage} = await load('src/ai-selection.ts');
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

test('quoteMessage wraps snippets in code fences with language detection for dotfiles and extensionless files', () => {
  const qDot = { path: '.gitignore', startLine: 1, endLine: 2, text: 'node_modules/\n.obsidian/' };
  const mDot = quoteMessage('What is this?', qDot);
  assert.ok(mDot.includes('> ```gitignore\n> node_modules/\n> .obsidian/\n> ```'));

  const qDocker = { path: 'Dockerfile', startLine: 1, endLine: 1, text: 'FROM node:20' };
  const mDocker = quoteMessage('Explain', qDocker);
  assert.ok(mDocker.includes('> ```dockerfile\n> FROM node:20\n> ```'));

  const qEnv = { path: '.env.local', startLine: 1, endLine: 1, text: 'API_KEY=xyz' };
  const mEnv = quoteMessage('Check env', qEnv);
  assert.ok(mEnv.includes('> ```bash\n> API_KEY=xyz\n> ```'));

  const qPlain = { path: 'LICENSE', startLine: 1, endLine: 1, text: 'MIT License' };
  const mPlain = quoteMessage('License', qPlain);
  assert.ok(mPlain.includes('> ```\n> MIT License\n> ```'));

  const qNested = { path: 'demo.md', startLine: 1, endLine: 3, text: '```js\nconst a = 1;\n```' };
  const mNested = quoteMessage('Code inside code', qNested);
  assert.ok(mNested.includes('> ````markdown\n> ```js\n> const a = 1;\n> ```\n> ````'));
});

const {agentSelectionExtension}=await load('src/ai-selection-extension.ts',{
  'obsidian':'export const setIcon = () => {};',
  '@codemirror/view':'export const ViewPlugin = { fromClass: klass => klass };',
});
function toolbar(settled=true) {
  const events={}, windowEvents={}, scrollEvents={}, editorEvents={}, documentEvents={}, sent=[];
  let clock=0, timerId=0;const timers=new Map();
  const advance=(ms=300)=>{clock+=ms;for(const [id,t] of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}};
  const button={hidden:false,attributes:{},addEventListener:(name,fn)=>events[name]=fn,setAttribute(name,value){this.attributes[name]=value;},setCssProps(values){this.styles=values;},remove(){this.removed=true;}};
  let source='first\nselected text\nlast';
  const doc={body:{createEl:()=>button},addEventListener:(n,fn)=>documentEvents[n]=fn,removeEventListener:n=>delete documentEvents[n]};
  const view={hasFocus:true,dom:{doc,addEventListener:(n,fn)=>editorEvents[n]=fn,removeEventListener:n=>delete editorEvents[n],win:{setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),innerWidth:1000,innerHeight:800,addEventListener:(n,fn)=>windowEvents[n]=fn,removeEventListener:n=>delete windowEvents[n]},getBoundingClientRect:()=>({top:0,bottom:700,right:600,width:600})},
    scrollDOM:{addEventListener:(n,fn)=>scrollEvents[n]=fn,removeEventListener:n=>delete scrollEvents[n]},
    state:{doc:{toString:()=>source},selection:{main:{empty:false,from:6,to:19,head:19}}},
    coordsAtPos:()=>({top:50,bottom:70}),requestMeasure(spec){spec.write(spec.read(this));}};
  let enabled=true;
  const Extension=agentSelectionExtension({enabled:()=>enabled,filePath:()=> 'Note/test.md',label:()=> 'Quote selection',onQuote:q=>sent.push(q)});
  const plugin=new Extension(view);
  if(settled)advance();
  return {view,plugin,button,events,sent,windowEvents,scrollEvents,editorEvents,documentEvents,advance,timers,disable:()=>enabled=false,enable:()=>enabled=true,setSource:value=>source=value};
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
  h.plugin.update({selectionSet:true});h.advance();
  assert.equal(h.button.styles['--selection-agent-top'],'95px');
  assert.equal(h.button.styles['--selection-agent-left'],'544px');
  h.view.state.selection.main.head=6;
  h.plugin.update({selectionSet:true});h.advance();
  assert.equal(h.button.styles['--selection-agent-top'],'95px');
});
test('disabled chat cannot receive a quote from an already displayed action',()=>{
  const h=toolbar(); h.disable(); h.events.click(); assert.equal(h.sent.length,0);
});

const {AIChatView}=await load('src/ai-chat-view.ts',{'obsidian':`
  export class View {} export class ItemView {} export class WorkspaceLeaf {} export class App {} export class FileSystemAdapter {}
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
    empty(){this.children=[];},remove(){this.removed=true;}, setAttribute(k,v){this.attrs[k]=v;},
    createEl(tag,options={}){const child=node(tag,options);this.children.push(child);return child;},
    createDiv(options){return this.createEl('div',options);}, createSpan(options){return this.createEl('span',options);},
    addEventListener(name,fn){this.events[name]=fn;},focus(){this.focused=true;}};
}
function chat() {
  const view=Object.create(AIChatView.prototype);
  view.inputEl=node('textarea');view.inputEl.value='My existing question';view.quoteContainerEl=node();
  view.renderRafId=null;view.submissionId=0;view.pendingQuote=null;view.isGenerating=false;view.chatScope='active-note';view.messages=[];
  view.chatSaveTask=Promise.resolve();view.pendingChatFiles=new WeakMap();
  view.selectedProvider='connection:test';view.selectedModel='test-model';view.mode='safe';
  view.updateVaultToggleState=()=>{};view.updateContextChip=()=>{};view.autoResizeTextarea=()=>{};
  view.updateSendButtonState=()=>{};view.scrollToBottom=()=>{};view.renderMessageBubble=()=>{};
  view.messagesContainerEl=node(); view.currentChatFile={path:'agent-chats/test.md'};
  const file=new globalThis.__SelectionTestFile('Note/test.md');
  view.app={vault:{getAbstractFileByPath:path=>path===file.path?file:null},workspace:{getActiveFile:()=>{throw Error('Must not use another active note');}}};
  const requests=[];view.plugin={settings:{},aiStorage:{formatDateTime:()=> '2026-10-27T12:00:00',updateChatNote:async()=>{}},aiService:{sendMessage:options=>{requests.push(options);return {kill(){}};}}};
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

test('switching conversations while a chat note is being created cannot send or attach a stale note',async()=>{
  const {view,requests,file}=chat();
  view.attachSelection(captureSelection(file.path,'selected text',0,13));
  view.currentChatFile=null;
  let resolveNote;
  view.plugin.aiStorage.createChatNote=()=>new Promise(resolve=>{resolveNote=resolve;});
  const submission=view.handleSubmit();
  assert.equal(view.isGenerating,true);
  view.submissionId++;
  view.isGenerating=false;
  view.messages=[];
  resolveNote({path:'agent-chats/cancelled.md'});
  await submission;
  assert.equal(requests.length,0);
  assert.equal(view.currentChatFile,null);
});

test('permission recovery opens the mode menu only on click and never resends',async()=>{
  const {view,requests,file}=chat();
  const question='am I excluding to ignore correctly';
  const selected='!docs/assets/vc-code-editing.webp\n!docs/assets/vc-code-editing-gh.jpg';
  view.inputEl.value=question;
  view.attachSelection(captureSelection(file.path,selected,0,selected.length));
  view.renderMessageBody=async()=>{};
  await view.handleSubmit();
  view.currentChatFile=null;
  const body=view.currentStreamingMsgEl.children[1];body.isConnected=true;
  view.currentTypingIndicatorEl.remove=()=>{};
  let opened=0;view.showModeMenu=()=>{opened++;};
  requests[0].onError(new Error('Headless chat cannot show the CLI approval prompt.'));
  await Promise.resolve();
  assert.equal(view.mode,'safe');assert.equal(opened,0);assert.equal(requests.length,1);
  const action=body.children.find(child=>child.children.some(button=>button.textContent==='Choose mode'));
  assert.ok(action);
  action.children[0].events.click({});
  assert.equal(opened,1);assert.equal(view.mode,'safe');assert.equal(requests.length,1);
  view.updateModeBtnLabel=()=>{};view.continueBtnEl={hidden:true};view.updateSendButtonState=()=>view.updateContinueAction();
  view.setMode('edit');
  assert.equal(action.children[0].textContent,'Continue');assert.equal(action.children[0].hidden,false);
  assert.equal(view.continueBtnEl.hidden,true);assert.equal(requests.length,1);
  view.inputEl.value='Keep my draft';view.updateContinueAction();
  assert.equal(action.children[0].disabled,true);action.children[0].events.click({});
  assert.equal(view.inputEl.value,'Keep my draft');
  view.inputEl.value='';view.updateContinueAction();
  view.setMode('safe');assert.equal(action.children[0].textContent,'Choose mode');
  view.setMode('edit');action.children[0].events.click({});
  assert.equal(view.inputEl.value,question);
  assert.equal(view.pendingQuote.text,selected);
  assert.equal(action.children[0].hidden,true);assert.equal(requests.length,1);
});

test('selection action repositions from measured glyphs when font geometry changes',()=>{
  const h=toolbar();
  h.view.coordsAtPos=()=>({top:120,bottom:150});
  h.plugin.update({geometryChanged:true});h.advance();
  assert.equal(h.button.styles['--selection-agent-top'],'120px');
  h.view.coordsAtPos=()=>({top:120,bottom:165});
  h.plugin.update({geometryChanged:true});h.advance();
  assert.equal(h.button.styles['--selection-agent-top'],'127.5px');
});


test('selection action waits until pointer selection is released and stable for 300 milliseconds',()=>{
  const h=toolbar(false);assert.equal(h.button.hidden,true);
  h.editorEvents.pointerdown({pointerId:1});h.plugin.update({selectionSet:true});h.advance(1000);
  assert.equal(h.button.hidden,true);
  h.documentEvents.pointerup({pointerId:1});h.advance(299);assert.equal(h.button.hidden,true);
  h.advance(1);assert.equal(h.button.hidden,false);h.plugin.destroy();
});
test('keyboard changes restart the delay; scrolling and cancellation hide immediately',()=>{
  const h=toolbar();h.plugin.update({selectionSet:true});assert.equal(h.button.hidden,true);
  h.advance(200);h.plugin.update({selectionSet:true});h.advance(299);assert.equal(h.button.hidden,true);
  h.advance(1);assert.equal(h.button.hidden,false);
  h.scrollEvents.scroll();assert.equal(h.button.hidden,true);h.advance();assert.equal(h.button.hidden,false);
  h.editorEvents.pointerdown({pointerId:2});h.documentEvents.pointercancel({pointerId:2});
  h.view.state.selection.main.empty=true;h.plugin.update({selectionSet:true});h.advance();assert.equal(h.button.hidden,true);
  h.plugin.destroy();assert.equal(h.timers.size,0);assert.deepEqual(h.editorEvents,{});assert.deepEqual(h.documentEvents,{});
});
test('queued measurements cannot reveal an outdated selection or a destroyed action',()=>{
  const h=toolbar(false), queued=[];h.view.requestMeasure=spec=>queued.push(spec);
  h.advance();assert.equal(queued.length,1);
  const old=queued[0], result=old.read(h.view);
  h.plugin.update({selectionSet:true});old.write(result);assert.equal(h.button.hidden,true);
  h.plugin.destroy();h.advance();old.write(result);assert.equal(h.button.hidden,true);assert.equal(h.button.removed,true);
});

test('leaving the window during a drag cannot leave the action stuck or visible',()=>{
  const h=toolbar();h.editorEvents.pointerdown({pointerId:3});h.windowEvents.blur();
  h.advance(1000);assert.equal(h.button.hidden,true);
  h.windowEvents.focus();h.advance();assert.equal(h.button.hidden,false);h.plugin.destroy();
});

test('mode and provider changes during chat creation apply only to the next submission',async()=>{
  const {view,requests,file}=chat();
  view.attachSelection(captureSelection(file.path,'selected text',0,13));
  view.currentChatFile=null;let resolveNote;
  view.plugin.aiStorage.createChatNote=()=>new Promise(resolve=>{resolveNote=resolve;});
  const submission=view.handleSubmit();
  view.mode='edit';view.selectedProvider='antigravity';view.selectedModel='different-model';view.chatScope='vault';
  resolveNote({path:'agent-chats/test.md'});await submission;
  assert.equal(requests.length,1);assert.equal(requests[0].mode,'safe');
  assert.equal(requests[0].provider,'connection:test');assert.equal(requests[0].model,'test-model');
  assert.equal(view.safeRequest.scope,'active-note');
});

test('new quotes disable inline Continue immediately, and removing the quote restores it',()=>{
  const {view}=chat();view.mode='edit';view.inputEl.value='';
  view.messages=[{id:'original',role:'user',content:'Explain'}];
  view.safeRequest={userId:'original',text:'Explain',file:null,quote:null,scope:'active-note'};
  const button={hidden:true};view.permissionAction={button,userId:'original'};
  view.updateContinueAction();assert.equal(button.disabled,false);
  view.attachSelection(captureSelection('Note/test.md','new quote',0,9));
  assert.equal(button.disabled,true);
  const remove=view.quoteContainerEl.children[0].children.find(el=>el.tag==='button');remove.events.click();
  assert.equal(button.disabled,false);
  view.messages.push({id:'new',role:'user',content:'Another question'});view.updateContinueAction();
  assert.equal(button.hidden,true);assert.equal(view.permissionAction,null);
});

test('whole Web Viewer pages replace stale note context and record the source URL in history',async()=>{
  const {view,requests}=chat();const page={url:'https://example.com/lesson',title:'Lesson',text:'Visible lesson text'};
  view.plugin.webViewerChat={hasPage:true,target:{...page,read:async()=>page}};
  view.app.vault.getAbstractFileByPath=()=>{throw Error('A web URL is not a vault path');};
  await view.handleSubmit();
  assert.equal(requests.length,1);assert.deepEqual(requests[0].webPage,page);assert.equal(requests[0].activeFile,null);
  assert.equal(requests[0].activeContent,'');assert.ok(view.messages[0].content.includes(page.url));
  assert.ok(!view.messages[0].content.includes(page.text));
  view.isGenerating=false;view.mode='edit';view.prepareContinuation();
  view.plugin.webViewerChat.target={url:'https://different.test/',title:'Other',read:async()=>{throw Error('Wrong page');}};
  assert.equal(view.inputEl.value,'My existing question');assert.deepEqual(await view.webTarget().read(),page);
});
test('web selection quotes use the URL without line numbers and never look up a vault file',async()=>{
  const {view,requests}=chat();const web={url:'http://127.0.0.1:51370/lesson/1',title:'Lesson'};
  view.app.vault.getAbstractFileByPath=()=>{throw Error('A web URL is not a vault file');};
  view.attachSelection({path:web.url,web,text:'Selected lesson text',source:'Selected lesson text',from:0,to:20,startLine:0,endLine:0});
  await view.handleSubmit();assert.equal(requests.length,1);assert.equal(requests[0].activeFile,null);
  assert.equal(requests[0].webPage.text,'Selected lesson text');assert.ok(requests[0].prompt.includes(web.url));assert.ok(!requests[0].prompt.includes('L0'));
});
test('unreadable or unsupported Web Viewer pages fail clearly instead of attaching the last note',async()=>{
  for(const target of [null,{url:'https://example.test/',title:'Unavailable',read:async()=>{throw Error('Navigation changed');}}]){
    const {view,requests}=chat();view.plugin.webViewerChat={hasPage:true,target};view.renderMessageBody=async()=>{};
    await view.handleSubmit();assert.equal(requests.length,0);assert.equal(view.isGenerating,false);
    assert.ok(view.messages.at(-1).content.includes('Could not read this page'));
  }
});


test('Reading view quotations remain reference text rather than raw editable Markdown ranges',async()=>{
  const {view,requests,file}=chat();view.mode='edit';
  view.attachSelection(captureReadingSelection(file.path,'# Heading\n\n**Selected** text','Selected text'));
  await view.handleSubmit();assert.equal(requests.length,1);assert.equal(requests[0].activeFile,null);
  assert.ok(requests[0].prompt.includes('Selected text'));assert.ok(requests[0].prompt.includes(file.path));assert.ok(!requests[0].prompt.includes('L0'));
});


test('changing the selection icon setting hides and restores the editor action without recreating the editor',()=>{
  const h=toolbar();assert.equal(h.button.hidden,false);h.disable();h.documentEvents['vault-code-selection-setting-change']();assert.equal(h.button.hidden,true);h.advance();assert.equal(h.button.hidden,true);
  h.enable();h.documentEvents['vault-code-selection-setting-change']();h.advance();assert.equal(h.button.hidden,false);h.plugin.destroy();
});
