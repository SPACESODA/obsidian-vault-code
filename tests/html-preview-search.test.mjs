import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/html-preview-search.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const setIcon=()=>{};export const getLanguage=()=>"en";export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(mod,mod.exports);
const {findPreviewText,previewText,HtmlPreviewSearch}=mod.exports;

test('rendered-page find is literal, case-insensitive, and Unicode-safe',()=>{
  assert.deepEqual(findPreviewText('Sync sync SYNC','sync').map(m=>m.start),[0,5,10]);
  assert.deepEqual(findPreviewText('cost (a+b)? [x] $5','(a+b)?'),[{start:5,end:11}]);
  assert.deepEqual(findPreviewText('before \n Vault\n  Code after','Vault Code'),[{start:9,end:21}]);
  assert.deepEqual(findPreviewText('日本語と日本語','日本語'),[{start:0,end:3},{start:4,end:7}]);
  assert.deepEqual(findPreviewText('😀x 😀x','😀x'),[{start:0,end:3},{start:4,end:7}]);
  assert.deepEqual(findPreviewText('sample','   '),[]);
  assert.equal(findPreviewText('x '.repeat(6000),'x').length,5001);
});
class Element {
  constructor(tag='div',options={}){this.tag=tag;this.cls=options.cls;this.children=[];this.events=new Map();this.attrs=options.attr||{};this.hidden=Object.hasOwn(this.attrs,'hidden');this.value='';this.textContent=options.text||'';this.win={setTimeout,clearTimeout,createEl:tag=>new Element(tag)};this.css={display:tag==='span'?'inline':'block',visibility:'visible',overflowY:'visible'};this.clientHeight=30;this.scrollHeight=30;}
  createEl(tag,options={}){const e=new Element(tag,options);this.append(e);return e;}
  createDiv(options){return this.createEl('div',options);}
  createSpan(options){return this.createEl('span',options);}
  append(e){this.children.push(e);e.parentElement=this;}
  before(e){this.beforeElement=e;}
  remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
  addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
  emit(name,event={}){for(const fn of [...this.events.get(name)||[]])fn({preventDefault(){},stopPropagation(){},...event});}
  empty(){this.children=[];}
  setCssProps(props){this.props=props;}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  getClientRects(){return this.invisible?[]:[{}];}
  getBoundingClientRect(){return {top:0,left:0,height:30};}
  closest(){return this.blocked?this:null;}
}
function page(customHighlights=true){
  const body=new Element('body'),head=new Element('head');const nodes=[];
  const doc=new Element('document');Object.assign(doc,{body,head,documentElement:body,nodes,selection:null,createElement:tag=>new Element(tag),createRange(){return {setStart(node,offset){this.startContainer=node;this.startOffset=offset;},setEnd(node,offset){this.endContainer=node;this.endOffset=offset;},getBoundingClientRect(){return {top:500};}};},getSelection(){return {rangeCount:doc.selection?1:0,getRangeAt:()=>doc.selection,removeAllRanges(){doc.selection=null;},addRange(range){doc.selection=range;}};},createTreeWalker(_body,_show,filter){let index=0;return {nextNode(){while(index<nodes.length){const n=nodes[index++];if(filter.acceptNode(n)===1)return n;}return null;}};}});
  const win={scrollY:0,addEventListener(){},removeEventListener(){},getComputedStyle:e=>e.css,innerHeight:200,scrollBy(_x,y){this.scroll=y;},focus(){this.focused=true;},MutationObserver:class {constructor(callback){this.callback=callback;win.observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},observers:[]};
  if(customHighlights){win.CSS={highlights:new Map()};win.Highlight=class {constructor(...ranges){this.ranges=ranges;}};}
  doc.defaultView=win;
  doc.addText=(text,tag='p',options={})=>{const element=new Element(tag);Object.assign(element,options);body.append(element);const node={textContent:text,parentElement:element};nodes.push(node);return node;};
  return doc;
}
function harness(customHighlights=true){const container=new Element(),before=container.createDiv();const find=new HtmlPreviewSearch(container,before);const doc=page(customHighlights);const frame=before.createEl('iframe');frame.contentDocument=doc;frame.contentWindow=doc.defaultView;find.setFrame(frame);return {find,doc,frame,bar:before.beforeElement,input:before.beforeElement.children[0],query(value){this.input.value=value;this.input.emit('input');this.input.emit('keydown',{key:'Enter'});}};}

test('text indexing excludes hidden content and controls and preserves original text nodes',()=>{
  const doc=page();doc.addText('Visible ');doc.addText('hidden','p',{invisible:true});doc.addText('source','script',{blocked:true});doc.addText('value','textarea',{blocked:true});doc.addText('tail');
  const index=previewText(doc);assert.equal(index.text,'Visible \ntail');assert.equal(index.segments.length,2);assert.equal(doc.nodes.length,5);
});
test('find opens in Preview, counts matches, wraps navigation, and clears without editing content',()=>{
  const h=harness();h.doc.addText('Sync then sync');h.find.open();h.query('sync');
  assert.equal(h.find.isOpen,true);assert.equal(h.input.focused,true);assert.equal(h.bar.children[1].textContent,'1 of 2');
  assert.equal(h.doc.defaultView.CSS.highlights.get('vault-code-page-find').ranges.length,2);
  h.input.emit('keydown',{key:'Enter'});assert.equal(h.bar.children[1].textContent,'2 of 2');
  h.input.emit('keydown',{key:'Enter'});assert.equal(h.bar.children[1].textContent,'1 of 2');
  h.input.emit('keydown',{key:'Enter',shiftKey:true});assert.equal(h.bar.children[1].textContent,'2 of 2');
  h.input.emit('keydown',{key:'Escape'});assert.equal(h.find.isOpen,false);assert.equal(h.doc.defaultView.CSS.highlights.size,0);assert.equal(h.doc.nodes[0].textContent,'Sync then sync');assert.ok(h.doc.defaultView.observers.every(o=>!o.active));
});
test('inline text matches can span elements; empty and unmatched queries disable navigation',()=>{
  const h=harness();const first=h.doc.addText('Vault ');const second=h.doc.addText('Code','span');second.parentElement.parentElement=first.parentElement;
  h.find.open();h.query('Vault Code');const range=h.doc.defaultView.CSS.highlights.get('vault-code-page-find').ranges[0];assert.equal(range.startContainer,first);assert.equal(range.endContainer,second);
  h.query('absent');assert.equal(h.bar.children[1].textContent,'No results');assert.equal(h.bar.children[2].disabled,true);
  h.query('');assert.equal(h.bar.children[1].textContent,'');
});
test('frame keyboard shortcuts work while IME Enter does not navigate',()=>{
  const h=harness();h.doc.addText('x x');h.doc.emit('keydown',{key:'f',metaKey:true});assert.ok(h.find.isOpen);h.query('x');h.input.emit('keydown',{key:'Enter',isComposing:true});assert.equal(h.bar.children[1].textContent,'1 of 2');h.doc.emit('keydown',{key:'Escape'});assert.ok(!h.find.isOpen);
});
test('older webviews use a current-match selection and remove it on close',()=>{
  const h=harness(false);h.doc.addText('match');h.find.open();h.query('match');assert.ok(h.doc.selection);h.find.close();assert.equal(h.doc.selection,null);
});
test('reloaded previews are searched afresh and old documents lose observers and key handlers',()=>{
  const h=harness();h.doc.addText('old old');h.find.open();h.query('old');const old=h.doc;
  const fresh=page();fresh.addText('old');h.frame.contentDocument=fresh;h.frame.emit('load');assert.equal(h.bar.children[1].textContent,'1 of 1');assert.equal(old.events.get('keydown').size,0);assert.equal(old.defaultView.CSS.highlights.size,0);
  h.find.reset();assert.equal(h.find.isOpen,false);assert.equal(h.input.value,'');assert.equal(h.frame.events.get('load').size,0);
  h.find.dispose();assert.ok(h.bar.removed);
});

test('dynamic page updates retain the current match without moving the page',async()=>{
  const h=harness();h.doc.addText('x x');h.find.open();h.query('x');h.input.emit('keydown',{key:'Enter'});
  h.doc.defaultView.scroll=123;h.doc.addText('new content');h.doc.defaultView.observers.find(o=>o.active).callback();
  await new Promise(resolve=>setTimeout(resolve,180));
  assert.equal(h.bar.children[1].textContent,'2 of 2');assert.equal(h.doc.defaultView.scroll,123);
  h.find.dispose();
});
test('line breaks separate text while markup is left unchanged',()=>{
  const doc=page();const first=doc.addText('first');const br=new Element('br');br.nodeType=1;br.nodeName='BR';doc.nodes.push(br);const last=doc.addText('second','span');last.parentElement.parentElement=first.parentElement;
  assert.equal(previewText(doc).text,'first\nsecond');assert.equal(findPreviewText(previewText(doc).text,'first second').length,1);
});

test('Enter still advances while a dynamic-page refresh is pending',()=>{
  const h=harness();h.doc.addText('match match');h.find.open();h.query('match');
  h.doc.defaultView.observers.find(o=>o.active).callback();h.input.emit('keydown',{key:'Enter'});
  assert.equal(h.bar.children[1].textContent,'2 of 2');h.find.dispose();
});

test('navigation to an inaccessible frame clears search without errors',()=>{
  const h=harness();h.doc.addText('match');h.find.open();h.query('match');
  Object.defineProperty(h.doc.defaultView,'CSS',{get(){throw Error('Cross-origin window');}});
  Object.defineProperty(h.frame,'contentDocument',{get(){throw Error('Cross-origin document');}});
  assert.doesNotThrow(()=>h.frame.emit('load'));assert.equal(h.bar.children[2].disabled,true);assert.doesNotThrow(()=>h.find.dispose());
});

test('match rail shows document positions, merges nearby matches, and clears on close',()=>{
  const h=harness();h.doc.body.scrollHeight=2000;h.doc.addText('match match match');h.find.open();h.query('match');
  const rail=h.frame.parentElement.children.find(e=>e.cls==='vault-code-preview-find-rail');
  assert.equal(rail.children.length,2);assert.equal(rail.children[0].props.top,'25%');
  assert.equal(rail.children[1].cls,'vault-code-preview-find-tick is-current');
  h.find.close();assert.equal(rail.children.length,0);h.find.reset();assert.equal(rail.removed,true);
});
