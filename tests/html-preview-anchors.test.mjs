import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=readFileSync('src/main.ts','utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
let script;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='shimScript')script=new Function('return '+node.initializer.getText(ast))();
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(script);
function harness(initialHash=''){
  let click;let prevented=0;let top=0;let scrolled=0;
  const target={scrollIntoView(){scrolled++;}};
  const location={hash:initialHash};
  const document={addEventListener(type,callback){if(type==='click')click=callback;},getElementById:name=>name==='section one'?target:null,getElementsByName:name=>name==='legacy'?[target]:[]};
  const window={location,scrollTo(){top++;}};
  runInNewContext(script.replace(/^<script>\s*|\s*<\/script>$/g,''),{window,document,XMLHttpRequest:class {}});
  return {location,get prevented(){return prevented;},get top(){return top;},get scrolled(){return scrolled;},click(href,attrs={},event={}){
    const link={getAttribute:name=>name==='href'?href:attrs[name]??null,hasAttribute:name=>Object.hasOwn(attrs,name)};
    click({button:0,target:{closest:()=>link},preventDefault(){prevented++;},...event});
  }};
}

test('fragment links navigate inside the preview and preserve encoded IDs',()=>{
  const h=harness();h.click('#section%20one');assert.equal(h.location.hash,'#section%20one');assert.equal(h.prevented,1);
  h.click('#section%20one');assert.equal(h.scrolled,1);
  h.click('#legacy');h.click('#legacy');assert.equal(h.scrolled,2);
});
test('top links and missing or malformed fragments remain safe',()=>{
  const h=harness('#');h.click('#');assert.equal(h.top,1);
  h.click('#missing');h.click('#missing');assert.equal(h.scrolled,0);
  h.click('#%bad');h.click('#%bad');assert.equal(h.scrolled,0);
  h.click('#top');h.click('#top');assert.equal(h.top,2);
});
test('normal links, explicit targets, downloads, modified clicks and page handlers keep their behavior',()=>{
  const h=harness();
  for(const href of ['https://example.test/#section','other.html#section','mailto:user@example.test',''])h.click(href);
  for(const target of ['_blank','_parent','_top','named-frame'])h.click('#section',{target});
  h.click('#section',{download:''});
  for(const event of [{button:1},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{defaultPrevented:true}])h.click('#section',{},event);
  assert.equal(h.prevented,0);assert.equal(h.location.hash,'');
  h.click(' #section ',{target:'_SELF'});assert.equal(h.location.hash,'#section');
});
