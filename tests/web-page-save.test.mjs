import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const compiled=await build({entryPoints:['src/web-page-save.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){
 b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
  export const Platform={isDesktop:true};globalThis.__savePlatform=Platform;
  export class Component {registerEvent(){} }
  export class Modal {constructor(app){this.app=app;}open(){this.opened=true;}close(){this.onClose?.();}}
  export class FuzzySuggestModal extends Modal {setPlaceholder(){} }
  export class View{};export class TFolder {constructor(path=''){this.path=path;}isRoot(){return !this.path;}}
  export class App{};export class Menu{
   constructor(){this.items=[];globalThis.__webSaveMenu=this;}
   setUseNativeMenu(value){this.native=value;return this;}
   addItem(fn){const item={setTitle(value){this.title=value;return this;},setIcon(value){this.icon=value;return this;},setSection(){return this;},setDisabled(value){this.disabled=value;return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);return this;}
   onHide(fn){this.onHidden=fn;}hide(){this.onHidden?.();}showAtPosition(position,doc){this.position=position;this.doc=doc;}
  };export const setIcon=()=>{};export class Notice{};
  export const getLanguage=()=> 'en';export const requireApiVersion=()=>true;
 `}));}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,require);
const {WebPageSave,SaveWebPageModal}=mod.exports;
const core=await build({entryPoints:['src/web-page-export.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const coreMod={exports:{}};new Function('module','exports',core.outputFiles[0].text)(coreMod,coreMod.exports);
const {captureWebPage,pageHtmlFilename,DOM_EXPORT_SCRIPT,MAX_PAGE_HTML}=coreMod.exports;
globalThis.window={setTimeout,clearTimeout};
function guest(){let url='https://example.test/path/page#part';const scripts=[];return{scripts,getURL:()=>url,navigate(value){url=value;},executeJavaScript:async script=>{scripts.push(script);return {url,title:'Example page',html:'<!DOCTYPE html><html><head></head><body>Rendered content</body></html>'};}};}
function inspector(){let attached=false;const calls=[];return{calls,isAttached:()=>attached,attach(){attached=true;calls.push(['attach']);},detach(){attached=false;calls.push(['detach']);},async sendCommand(method,params){calls.push([method,params]);if(method==='Page.getResourceTree')return{frameTree:{frame:{id:'frame',url:'https://example.test/path/page',mimeType:'text/html'}}};if(method==='Page.getResourceContent')return{content:'<!doctype html><p>Original source</p>',base64Encoded:false};return{};}};}
const signal=()=>new AbortController().signal;
test('DOM saves current rendered content as UTF-8 and does not request the original source',async()=>{
 const g=guest(),d=inspector(),page=await captureWebPage(g,'dom',signal(),d);
 assert.equal(page.html,'\uFEFF<!DOCTYPE html><html><head></head><body>Rendered content</body></html>');
 assert.equal(g.scripts[0],DOM_EXPORT_SCRIPT);assert.equal(d.calls.length,0);
});
test('source export reads the loaded document resource and always detaches its own inspector',async()=>{
 const g=guest(),d=inspector(),page=await captureWebPage(g,'source',signal(),d);
 assert.equal(page.html,'\uFEFF<!doctype html><p>Original source</p>');
 assert.deepEqual(d.calls.map(c=>c[0]),['attach','Page.enable','Page.getResourceTree','Page.getResourceContent','detach']);
 assert.equal(g.scripts.length,1);assert.ok(!g.scripts[0].includes('fetch'));
 assert.deepEqual(d.calls[3][1],{frameId:'frame',url:'https://example.test/path/page'});
});
test('missing source never falls back to a download or a DOM snapshot',async()=>{
 const g=guest(),d=inspector();d.sendCommand=async()=>{throw Error('resource evicted');};
 await assert.rejects(captureWebPage(g,'source',signal(),d),e=>e.code==='source');
 assert.equal(d.isAttached(),false);assert.equal(g.scripts.length,1);
 await assert.rejects(captureWebPage(g,'source',signal()),e=>e.code==='source');
});
test('existing inspector sessions are left untouched',async()=>{
 const d=inspector();d.attach();d.calls.length=0;
 await assert.rejects(captureWebPage(guest(),'source',signal(),d),e=>e.code==='source');
 assert.equal(d.isAttached(),true);assert.equal(d.calls.length,0);
});
test('navigation and loading cannot silently save the wrong page',async()=>{
 const g=guest();g.executeJavaScript=async()=>{g.navigate('https://other.test/');return{url:'https://other.test/',html:'wrong'};};
 await assert.rejects(captureWebPage(g,'dom',signal()),e=>e.code==='changed');
 const loading=guest();loading.isLoading=()=>true;
 await assert.rejects(captureWebPage(loading,'dom',signal()),e=>e.code==='unavailable');assert.equal(loading.scripts.length,0);
 const source=guest(),d=inspector(),send=d.sendCommand.bind(d);d.sendCommand=async(m,p)=>{const result=await send(m,p);if(m==='Page.getResourceContent')source.navigate('https://other.test/');return result;};
 await assert.rejects(captureWebPage(source,'source',signal(),d),e=>e.code==='changed');assert.equal(d.isAttached(),false);
});
test('source does not save a frame from a different navigation or a non-HTML document',async()=>{
 for(const frame of [{id:'frame',url:'https://wrong.test/',mimeType:'text/html'},{id:'frame',url:'https://example.test/path/page',mimeType:'application/pdf'}]){
  const d=inspector();d.sendCommand=async()=>({frameTree:{frame}});
  await assert.rejects(captureWebPage(guest(),'source',signal(),d),e=>e.code==='source');assert.equal(d.isAttached(),false);
 }
});
test('cancellation interrupts pending captures and releases inspection sessions',async()=>{
 const controller=new AbortController(),d=inspector();let began;
 const started=new Promise(resolve=>began=resolve);d.sendCommand=()=>{began();return new Promise(()=>{});};
 const pending=captureWebPage(guest(),'source',controller.signal,d);await started;controller.abort();
 await assert.rejects(pending,e=>e.code==='cancelled');assert.equal(d.isAttached(),false);
 const already=new AbortController();already.abort();const g=guest();await assert.rejects(captureWebPage(g,'dom',already.signal),e=>e.code==='cancelled');assert.equal(g.scripts.length,0);
});
test('unsupported pages, empty results and oversized documents are rejected',async()=>{
 const g=guest();g.navigate('file:///private/test.html');await assert.rejects(captureWebPage(g,'dom',signal()),e=>e.code==='unavailable');assert.equal(g.scripts.length,0);
 for(const value of [{large:true},{url:'https://example.test/path/page#part',html:''},{url:'https://example.test/path/page#part',html:'a'.repeat(MAX_PAGE_HTML+1)}]){
  const g=guest();g.executeJavaScript=async()=>value;await assert.rejects(captureWebPage(g,'dom',signal()));
 }
});
test('page titles become safe HTML filenames without altering ordinary Unicode names',()=>{
 assert.equal(pageHtmlFilename('記事 / A:B?'),'記事 A B.html');assert.equal(pageHtmlFilename('Example.HTML'),'Example.html');
 assert.equal(pageHtmlFilename('CON'),'_CON.html');assert.equal(pageHtmlFilename('..'),'page.html');assert.equal(pageHtmlFilename('你好 😀'),'你好 😀.html');
});
function menu(){return{items:[],addItem(fn){const item={setTitle(value){this.title=value;return this;},setIcon(){return this;},setSection(){return this;},setDisabled(value){this.disabled=value;return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);return this;}};}
function featureHarness(){const g=guest();const inherited=function(menu){menu.original=true;};const view=Object.assign(Object.create({onPaneMenu:inherited}),{getViewType:()=> 'webviewer',containerEl:{isConnected:true,querySelector:()=>g}});let leaves=[{view}];const app={workspace:{getLeavesOfType:()=>leaves,on:()=>{}},vault:{getRoot:()=>({path:''})}};return{view,g,app,feature:new WebPageSave(app),setLeaves:value=>leaves=value,inherited};}
test('Web Viewer menu preserves core items, puts DOM first, and stays independent of AI',()=>{
 const h=featureHarness();h.feature.onload();const m=menu();h.view.onPaneMenu(m,'more-options');
 assert.equal(m.original,true);assert.deepEqual(m.items.map(i=>i.title),['Save page as HTML (DOM)','Save page source as HTML']);
 h.feature.refresh();const again=menu();h.view.onPaneMenu(again,'more-options');assert.equal(again.items.length,2);
 h.feature.onunload();assert.equal(h.view.onPaneMenu,h.inherited);assert.equal(Object.hasOwn(h.view,'onPaneMenu'),false);
});
test('mobile and absent Web Viewer remain dormant; closed views release hooks',()=>{
 const h=featureHarness();globalThis.__savePlatform.isDesktop=false;
 try{h.feature.onload();assert.equal(h.feature.hooks.size,0);}finally{globalThis.__savePlatform.isDesktop=true;}
 const other=featureHarness();other.feature.onload();other.setLeaves([]);other.feature.refresh();assert.equal(other.feature.hooks.size,0);assert.equal(other.view.onPaneMenu,other.inherited);other.feature.onunload();
});
test('a later plugin wrapper is preserved and our unloaded wrapper adds no items',()=>{
 const h=featureHarness();h.feature.onload();const ours=h.view.onPaneMenu;
 const later=function(...args){ours.apply(this,args);};h.view.onPaneMenu=later;h.feature.onunload();
 assert.equal(h.view.onPaneMenu,later);const m=menu();h.view.onPaneMenu(m,'more-options');assert.equal(m.original,true);assert.equal(m.items.length,0);
});
test('closing a save dialog cancels its capture and closing the feature closes open dialogs',()=>{
 const modal=new SaveWebPageModal({},'dom','Title',{},async()=>{},()=>{});modal.contentEl={empty(){}};modal.onClose();assert.equal(modal.controller.signal.aborted,true);
 const h=featureHarness();let closed=0;h.feature.dialogs.add({close(){closed++;}});h.feature.onload();h.feature.onunload();assert.equal(closed,1);
});

test('long Unicode titles fit filesystem byte limits without splitting emoji',()=>{
 for(const title of ['日'.repeat(300),'😀'.repeat(300)]){
  const name=pageHtmlFilename(title);assert.ok(new TextEncoder().encode(name).length<=205);assert.ok(!name.includes('\uFFFD'));assert.equal(name.endsWith('.html'),true);
 }
});
function formHarness({exists=async()=>false,save=async path=>({path}),kind='dom'}={}){
 const elements=[];
 function element(tag='div',options={}){
  const node={tag,text:options.text||'',value:options.value||'',win:{setTimeout,clearTimeout},children:[],handlers:{},hidden:false,disabled:false,
   addClass(){},setText(value){this.text=value;},hide(){this.hidden=true;},show(){this.hidden=false;},focus(){},setSelectionRange(){},
   empty(){this.children=[];},addEventListener(name,fn){this.handlers[name]=fn;},
   createEl(tag,opts){const child=element(tag,opts);this.children.push(child);return child;},createDiv(opts){return this.createEl('div',opts);},createSpan(opts){return this.createEl('span',opts);}};
  elements.push(node);return node;
 }
 const app={vault:{adapter:{exists},getName:()=> 'Test vault'}};let finished=0;
 const modal=new SaveWebPageModal(app,kind,'Title',{path:'Notes',isRoot:()=>false},save,()=>{finished++;});
 modal.containerEl=element();modal.modalEl=element();modal.contentEl=element();modal.onOpen();
 return{modal,elements,input:elements.find(e=>e.tag==='input'),button:elements.find(e=>e.tag==='button'&&e.text==='Save'),get finished(){return finished;}};
}
test('the save form refuses existing destinations and invalid filenames',async()=>{
 let writes=0;const h=formHarness({exists:async()=>true,save:async()=>{writes++;}});
 h.button.handlers.click();await new Promise(r=>setImmediate(r));assert.equal(writes,0);assert.equal(h.modal.busy,false);assert.equal(h.button.disabled,false);
 h.input.value='../escape.html';h.button.handlers.click();await new Promise(r=>setImmediate(r));assert.equal(writes,0);h.modal.close();
});
test('the save form appends HTML, honors the chosen folder and prevents duplicate submissions',async()=>{
 let writes=0,finish,captured;
 const h=formHarness({save:(path,signal)=>{writes++;captured={path,signal};return new Promise(resolve=>{finish=resolve;});}});
 h.input.value='My page';h.button.handlers.click();await new Promise(r=>setImmediate(r));h.button.handlers.click();
 assert.equal(writes,1);assert.equal(captured.path,'Notes/My page.html');assert.equal(h.button.disabled,true);
 finish({path:captured.path});await new Promise(r=>setImmediate(r));assert.equal(h.finished,1);assert.equal(captured.signal.aborted,true);
});
test('cancelling during destination validation cannot start an export',async()=>{
 let finish,writes=0;const h=formHarness({exists:()=>new Promise(resolve=>{finish=resolve;}),save:async()=>{writes++;}});
 h.button.handlers.click();h.modal.close();finish(false);await new Promise(r=>setImmediate(r));assert.equal(writes,0);
});


test('the save icon opens exactly three options in a non-native menu and removes itself on unload',async()=>{
 const h=featureHarness(),created=[],opened=[];let nativeSaves=0;
 const file={path:'Saved note.md'};
 h.view.saveAsMarkdown=async()=>{nativeSaves++;return file;};
 h.app.workspace.getLeaf=type=>{assert.equal(type,'tab');return{openFile:async note=>opened.push(note)};};
 h.view.addAction=(icon,title,click)=>{const button={icon,title,click,isConnected:true,doc:{},addClass(){},setAttribute(){},remove(){this.isConnected=false;},getBoundingClientRect:()=>({left:20,bottom:40})};created.push(button);return button;};
 h.feature.onload();h.feature.refresh();assert.equal(created.length,1);assert.equal(created[0].icon,'arrow-down-to-line');assert.equal(created[0].title,'Save');
 created[0].click({preventDefault(){},stopPropagation(){}});
 const m=globalThis.__webSaveMenu;
 assert.equal(m.native,false);assert.equal(m.useNativeMenu,false);
 assert.deepEqual(m.items.map(i=>i.title),['Save page as HTML (DOM)','Save page source as HTML','Save to vault']);
 assert.deepEqual(m.items.map(i=>i.icon),['file-down','file-code','file-text']);
 assert.deepEqual(m.position,{x:20,y:44});assert.equal(m.items[2].disabled,false);
 m.items[2].click();await new Promise(r=>setImmediate(r));assert.equal(nativeSaves,1);assert.deepEqual(opened,[file]);
 h.feature.onunload();assert.equal(created[0].isConnected,false);assert.equal(h.feature.headerButtons.size,0);
});
test('the native note action is disabled when Web Viewer does not expose its save method',()=>{
 const h=featureHarness(),m=menu();h.feature.addMenu(m,h.view,true);assert.equal(m.items.length,3);assert.equal(m.items[2].disabled,true);
 // Invoking the guarded native path without a method is a no-op.
 assert.doesNotThrow(()=>{void h.feature.saveNote(h.view);});
});
test('HTML dialogs have concise descriptions and titles without ellipses',()=>{
 for(const [kind,description]of [['dom','Save the page’s current content and structure as HTML.'],['source','Save the page’s original source code.']]){
  const h=formHarness({kind});assert.equal(h.elements.find(e=>e.tag==='p').text,description);assert.ok(!h.elements.find(e=>e.tag==='h3').text.endsWith('...'));h.modal.close();
 }
});
