import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/ai-web-context.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class View{};export class Notice{};export class Component{};export const App=class{};export const Platform={isDesktop:true};export const setIcon=()=>{};export const getLanguage=()=>"en";export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
const {webUrl,webPage,pageTarget,snapshotPage,WebViewerChat}=mod.exports;
function viewer(){
 const v={url:'http://127.0.0.1:53176/lesson',title:'Lesson',getViewType:()=> 'webviewer'};
 const calls=[];const browser={win:{setTimeout,clearTimeout},getURL:()=>v.url,executeJavaScript:async script=>{calls.push(script);return {url:v.url,title:v.title,text:'Visible lesson text'};}};
 v.containerEl={isConnected:true,querySelector:selector=>selector==='webview'?browser:null};
 return {v,browser,calls};
}
test('only HTTP and HTTPS pages can become web context',()=>{
 assert.equal(webUrl('http://127.0.0.1:53176/lesson'),'http://127.0.0.1:53176/lesson');
 for(const value of ['javascript:alert(1)','file:///private/test','data:text/plain,x','obsidian://open',null,{}])assert.equal(webUrl(value),null);
});
test('web extraction checks the returned URL and bounds text and title',()=>{
 const url='https://example.com/';assert.equal(webPage({url:'https://other.test/',text:'x'},url),null);
 assert.equal(webPage({url,text:'  '},url),null);
 const page=webPage({url,title:'x'.repeat(700),text:'a'.repeat(90000)},url);
 assert.equal(page.text.length,60000);assert.equal(page.title.length,500);
});
test('page text is read only on request, with navigation and closed-view guards',async()=>{
 const h=viewer(),target=pageTarget(h.v);assert.equal(h.calls.length,0);
 assert.equal((await target.read()).text,'Visible lesson text');assert.equal(h.calls.length,1);
 h.v.url='https://other.test/';await assert.rejects(target.read(),/Could not read/);assert.equal(h.calls.length,1);
 h.v.url=target.url;h.browser.executeJavaScript=async()=>({url:'https://navigated.test/',text:'wrong page'});
 await assert.rejects(target.read(),/Could not read/);
 h.v.containerEl.isConnected=false;await assert.rejects(target.read(),/Could not read/);
});
test('Reader view uses rendered reader text rather than reading the browser again',async()=>{
 const h=viewer(),reader={getClientRects:()=>[{}],innerText:'Reader article'};
 h.v.containerEl.querySelector=selector=>selector==='.reader-mode-content'?reader:h.browser;
 assert.equal((await pageTarget(h.v).read()).text,'Reader article');assert.equal(h.calls.length,0);
 const snapshot=snapshotPage(await pageTarget(h.v).read());h.v.url='https://other.test/';reader.innerText='Different';
 assert.equal((await snapshot.read()).text,'Reader article');
});
test('missing or disabled Web Viewer remains dormant without browser calls',async()=>{
 const app={workspace:{getLeavesOfType:()=>[],getActiveViewOfType:()=>null}},h=viewer();
 const feature=new WebViewerChat(app,()=>false,()=>{throw Error('No quote expected');},()=>{});
 feature.leaf={view:h.v};assert.equal(feature.target,null);assert.equal(feature.hasPage,false);
 await feature.tick();assert.equal(h.calls.length,0);
 feature.leaf=null;assert.equal(feature.target,null);await feature.tick();
 assert.equal(pageTarget({...h.v,getViewType:()=> 'markdown'}),null);
});

test('web selections wait for release and stability, cite their URL, and disappear on tab changes',async()=>{
 const h=viewer(),sent=[],listeners={};
 const button={hidden:true,events:{},setAttribute(){},setCssProps(p){this.styles=p;},addEventListener(n,fn){this.events[n]=fn;},remove(){this.removed=true;}};
 const doc={body:{createEl:()=>button},defaultView:{innerWidth:1000,innerHeight:800,addEventListener(){},removeEventListener(){}},addEventListener(n,fn){listeners[n]=fn;},removeEventListener(n){delete listeners[n];}};button.doc=doc;
 const box={left:0,top:0,bottom:700,right:800,width:800,height:700};h.v.containerEl.doc=doc;h.v.containerEl.getClientRects=()=>[{}];h.v.containerEl.getBoundingClientRect=()=>box;
 h.browser.getBoundingClientRect=()=>box;
 let data={text:'Selected words',rects:[{left:100,right:280,top:50,bottom:70}],moving:true,scroll:0};h.browser.executeJavaScript=async script=>script.includes('__vaultCodeSelectionState')?data:data.text;
 const leaf={view:h.v};let active=leaf;
 const app={workspace:{getLeavesOfType:()=>[leaf],getActiveViewOfType:()=>active?{leaf:active}:null}};
 const feature=new WebViewerChat(app,()=>true,q=>sent.push(q),()=>{});feature.leaf=leaf;
 const original=Date.now;let now=0;Date.now=()=>now;
 try{
  await feature.tick();assert.equal(button.hidden,true);
  data={...data,moving:false};await feature.tick();now=299;await feature.tick();assert.equal(button.hidden,true);
  now=300;await feature.tick();assert.equal(button.hidden,false);assert.equal(feature.quote.web.url,h.v.url);
  button.events.pointerdown({button:0,preventDefault(){}});
  h.browser.executeJavaScript=async()=>{throw Error('Guest focus cleared the selection; clicking must use the captured quote');};
  feature.hide();assert.equal(button.hidden,false);
  button.events.click();assert.equal(sent.length,1);assert.equal(sent[0].text,'Selected words');assert.equal(sent[0].web.title,'Lesson');assert.equal(button.hidden,true);
  h.browser.executeJavaScript=async()=>data;
  await feature.tick();now+=300;await feature.tick();assert.equal(button.hidden,false);
  assert.equal(button.styles['--selection-agent-left'],'288px');
  data={...data,viewportWidth:400,viewportHeight:350,contentWidth:400};
  await feature.tick();now+=300;await feature.tick();
  assert.equal(button.styles['--selection-agent-left'],'568px');assert.equal(button.styles['--selection-agent-top'],'105px');
  data={...data,scroll:100};await feature.tick();assert.equal(button.hidden,true);
  active=null;await feature.tick();assert.equal(feature.quote,null);
  feature.onunload();assert.equal(button.removed,true);assert.deepEqual(listeners,{});
 }finally{Date.now=original;}
});

test('turning off the floating icon preserves Web Viewer page context and skips selection reads',async()=>{
 const h=viewer(),leaf={view:h.v};
 const app={workspace:{getLeavesOfType:()=>[leaf],getActiveViewOfType:()=>({leaf})}};
 const feature=new WebViewerChat(app,()=>true,()=>{throw Error('Icon is disabled');},()=>{},()=>false);feature.leaf=leaf;
 await feature.tick();assert.equal(h.calls.length,0);assert.equal(feature.hasPage,true);assert.equal(feature.target.url,h.v.url);
 assert.equal((await feature.target.read()).text,'Visible lesson text');assert.equal(h.calls.length,1);
 feature.quote={web:{url:h.v.url,title:'Lesson'},text:'old selection'};feature.sendSelection();assert.equal(feature.quote,null);
});
