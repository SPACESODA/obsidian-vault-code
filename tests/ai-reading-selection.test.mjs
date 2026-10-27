import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:'export * from "./src/ai-reading-selection";export * from "./src/ai-selection";',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class View{};export class Component{};export class App{};export const Platform={isDesktop:true};export const setIcon=()=>{};export const getLanguage=()=>"en";export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
const {ReadingSelectionChat,captureReadingSelection,selectionLabel,quoteMessage}=mod.exports;
function events(target={}){const handlers=new Map();return Object.assign(target,{handlers,addEventListener(n,fn){if(!handlers.has(n))handlers.set(n,new Set());handlers.get(n).add(fn);},removeEventListener(n,fn){handlers.get(n)?.delete(fn);},emit(n,event={}){for(const fn of [...handlers.get(n)||[]])fn({type:n,preventDefault(){},composedPath:()=>[],...event});}});}
function harness(){
 let text='Selected text',source='# Title\n\nSelected text\nMore',mode='preview',enabled=true,clock=0,id=0;const timers=new Map(),sent=[];
 const win=events({innerWidth:1000,innerHeight:800,setTimeout(fn,ms){timers.set(++id,{fn,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}});
 const button=events({hidden:false,setCssProps(p){this.styles=p;},remove(){this.removed=true;}});
 const node={parentElement:{closest:()=>null}},selection={rangeCount:1,isCollapsed:false,anchorNode:node,focusNode:node,toString:()=>text,getRangeAt:()=>({getClientRects:()=>[{top:100,bottom:120}]})};
 const doc=events({getSelection:()=>selection,body:{createEl:()=>button}});
 const root={contains:n=>n===node,getClientRects:()=>[{}],getBoundingClientRect:()=>({top:0,bottom:700,right:800})};
 const view={getViewType:()=> 'markdown',getMode:()=>mode,file:{path:'Note/test.md'},containerEl:events({doc,win,isConnected:true,querySelector:()=>root})};
 const leaf={view};view.leaf=leaf;
 const app={workspace:{getActiveViewOfType:()=>view},vault:{cachedRead:async()=>source}};
 const feature=new ReadingSelectionChat(app,()=>enabled,q=>sent.push(q));feature.bind();
 const advance=async(ms=300)=>{clock+=ms;for(const [key,t]of [...timers])if(t.at<=clock){timers.delete(key);t.fn();}await Promise.resolve();};
 return {feature,view,doc,button,root,selection,sent,app,advance,timers,setText:t=>text=t,setSource:s=>source=s,setMode:m=>mode=m,disable:()=>enabled=false};
}
test('Reading view mapping adds exact source lines only for unique literal matches',()=>{
 const exact=captureReadingSelection('Note.md','# Title\n\nSelected text','Selected text');assert.equal(exact.startLine,3);assert.equal(exact.rendered,true);
 for(const source of ['**Selected** text','Selected text\nSelected text']){
  const quote=captureReadingSelection('Note.md',source,'Selected text');assert.equal(quote.rendered,true);assert.equal(selectionLabel(quote),'Note.md');assert.ok(!quoteMessage('Explain',quote).includes('L0'));
 }
 assert.equal(captureReadingSelection('Note.md','text','   '),null);
});
test('Reading view waits for pointer release and stability and preserves the quote through focus changes',async()=>{
 const h=harness();h.doc.emit('pointerdown',{pointerId:1});await h.advance(1000);assert.equal(h.button.hidden,true);
 h.doc.emit('pointerup',{pointerId:1});await h.advance(299);assert.equal(h.button.hidden,true);await h.advance(1);assert.equal(h.button.hidden,false);
 h.button.emit('pointerdown',{button:0});h.setText('');h.selection.isCollapsed=true;h.doc.emit('selectionchange');
 assert.equal(h.button.hidden,false);h.button.emit('click');assert.equal(h.sent.length,1);assert.equal(h.sent[0].text,'Selected text');assert.equal(h.sent[0].startLine,3);
 h.feature.onunload();assert.equal(h.button.removed,true);assert.equal(h.timers.size,0);
});
test('keyboard selection, scrolling, mode changes and disabling cannot expose stale actions',async()=>{
 const h=harness();await h.advance();assert.equal(h.button.hidden,false);
 h.doc.emit('selectionchange');assert.equal(h.button.hidden,true);await h.advance();assert.equal(h.button.hidden,false);
 h.view.containerEl.emit('scroll');assert.equal(h.button.hidden,true);
 h.setMode('source');h.feature.bind();await h.advance();assert.equal(h.feature.button,null);
 const disabled=harness();disabled.disable();disabled.feature.bind();await disabled.advance();assert.equal(disabled.feature.button,null);
});
test('late note reads cannot revive a selection after it changes or the feature unloads',async()=>{
 const h=harness();let resolve;h.app.vault.cachedRead=()=>new Promise(r=>resolve=r);await h.advance();
 h.setText('Different');h.doc.emit('selectionchange');h.feature.onunload();resolve('Selected text');await Promise.resolve();
 assert.equal(h.button.hidden,true);assert.equal(h.button.removed,true);assert.equal(h.sent.length,0);
});
