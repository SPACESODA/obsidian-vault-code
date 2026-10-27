import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/html-preview-selection.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const setIcon=()=>{};export const getLanguage=()=>"en";export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(mod,mod.exports);const {HtmlPreviewSelection}=mod.exports;
function events(o={}){const handlers=new Map();return Object.assign(o,{handlers,addEventListener(n,fn){if(!handlers.has(n))handlers.set(n,new Set());handlers.get(n).add(fn);},removeEventListener(n,fn){handlers.get(n)?.delete(fn);},emit(n,event={}){for(const fn of [...handlers.get(n)||[]])fn({type:n,preventDefault(){},composedPath:()=>[],...event});}});}
function harness(ext='html'){
 let now=0,id=0,text='Selected text',enabled=true,editable=false,source={path:`Note/test.${ext}`,text:'<p>Selected text</p>'};const timers=new Map(),sent=[];
 const win=events({innerWidth:1200,innerHeight:800,setTimeout(fn,ms){timers.set(++id,{at:now+ms,fn});return id;},clearTimeout(n){timers.delete(n);}});
 const button=events({hidden:false,setAttribute(){},setCssProps(p){this.styles=p;},remove(){this.removed=true;}});
 const hostDoc=events({body:{createEl:()=>button},activeElement:null}),host={doc:hostDoc,win};
 const node={parentElement:{closest:()=>editable?{}:null}},selection={isCollapsed:false,rangeCount:1,anchorNode:node,focusNode:node,toString:()=>text,getRangeAt:()=>({getClientRects:()=>[{left:100,right:280,top:100,bottom:120}]})};
 const doc=events({URL:'about:srcdoc',body:{contains:n=>n===node},hasFocus:()=>true,getSelection:()=>selection,documentElement:{clientWidth:780},defaultView:events({innerWidth:800,innerHeight:600})});
 const frame=events({isConnected:true,contentDocument:doc,getClientRects:()=>[{}],getBoundingClientRect:()=>({left:200,right:1000,top:80,bottom:680,width:800,height:600})});
 const feature=new HtmlPreviewSelection(host,{enabled:()=>enabled,source:()=>source,onQuote:q=>sent.push(q)});feature.setFrame(frame);
 const advance=(ms=300)=>{now+=ms;for(const [n,t]of [...timers])if(t.at<=now){timers.delete(n);t.fn();}};
 return {feature,frame,doc,hostDoc,button,sent,timers,selection,advance,setText:t=>text=t,setEditable:v=>editable=v,setEnabled:v=>enabled=v,setSource:s=>source=s};
}
test('HTML, HTM and MJML previews quote rendered text near the selection without editing source',()=>{
 for(const ext of ['html','htm','mjml']){
  const h=harness(ext);h.advance(299);assert.equal(h.button.hidden,true);h.advance(1);assert.equal(h.button.hidden,false);
  assert.equal(h.button.styles['--selection-agent-left'],'488px');assert.equal(h.button.styles['--selection-agent-top'],'175px');
  h.button.emit('pointerdown',{button:0});h.setText('');h.selection.isCollapsed=true;h.doc.emit('selectionchange');h.doc.defaultView.emit('blur');
  h.button.emit('click');assert.equal(h.sent.length,1);assert.equal(h.sent[0].text,'Selected text');assert.equal(h.sent[0].path,`Note/test.${ext}`);assert.equal(h.sent[0].rendered,true);assert.equal(h.sent[0].source,'<p>Selected text</p>');h.feature.dispose();
 }
});
test('dragging hides the action until release; scroll and selection changes restart the delay',()=>{
 const h=harness();h.doc.emit('pointerdown',{pointerId:1});h.advance(1000);assert.equal(h.button.hidden,true);
 h.doc.emit('pointerup',{pointerId:1});h.advance();assert.equal(h.button.hidden,false);
 h.doc.emit('scroll');assert.equal(h.button.hidden,true);h.advance();assert.equal(h.button.hidden,false);
 h.setText('Different');h.doc.emit('selectionchange');assert.equal(h.button.hidden,true);h.advance();h.button.emit('click');assert.equal(h.sent[0].text,'Different');h.feature.dispose();
});
test('the setting hides preview actions immediately; controls and empty selections are excluded',()=>{
 const h=harness();h.advance();h.setEnabled(false);h.hostDoc.emit('vault-code-selection-setting-change');assert.equal(h.button.hidden,true);h.advance();h.button.emit('click');assert.equal(h.sent.length,0);
 h.setEnabled(true);h.hostDoc.emit('vault-code-selection-setting-change');h.advance();assert.equal(h.button.hidden,false);
 h.setEditable(true);h.doc.emit('selectionchange');h.advance();assert.equal(h.button.hidden,true);
 h.setEditable(false);h.selection.isCollapsed=true;h.doc.emit('selectionchange');h.advance();assert.equal(h.button.hidden,true);h.feature.dispose();
});
test('iframe replacement, code mode, inaccessible navigation and disposal invalidate old selections',()=>{
 const h=harness();h.advance();h.feature.setFrame(null);assert.equal(h.button.hidden,true);assert.ok([...h.doc.handlers.values()].every(s=>s.size===0));h.doc.emit('selectionchange');h.advance();assert.equal(h.button.hidden,true);
 h.feature.setFrame(h.frame);h.advance();assert.equal(h.button.hidden,false);
 Object.defineProperty(h.frame,'contentDocument',{get(){throw Error('Cross-origin navigation');}});assert.doesNotThrow(()=>h.frame.emit('load'));assert.equal(h.button.hidden,true);
 h.feature.dispose();assert.equal(h.button.removed,true);assert.equal(h.timers.size,0);assert.ok([...h.hostDoc.handlers.values()].every(s=>s.size===0));assert.doesNotThrow(()=>h.feature.dispose());
});
test('changing source files before clicking cannot attach text to the wrong file',()=>{
 const h=harness();h.advance();h.setSource({path:'Other.html',text:'Other'});h.button.emit('click');assert.equal(h.sent.length,0);h.feature.dispose();
});


test('in-page anchors work but navigating away cannot mislabel another page as the original file',()=>{
 const h=harness();h.doc.URL='about:srcdoc#section';h.advance();assert.equal(h.button.hidden,false);
 h.doc.URL='app://obsidian.md/other.html';h.frame.emit('load');h.advance();assert.equal(h.button.hidden,true);h.button.emit('click');assert.equal(h.sent.length,0);h.feature.dispose();
});
