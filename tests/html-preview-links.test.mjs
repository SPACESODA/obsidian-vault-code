import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled=await build({entryPoints:['src/html-preview-links.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};
new Function('module','exports',compiled.outputFiles[0].text)(mod,mod.exports);
const {forwardPreviewAppLink}=mod.exports;
function click(href,options={},attributes={}){
  const opened=[];let prevented=false;
  const link={getAttribute:name=>name==='href'?href:attributes[name]??null,hasAttribute:name=>Object.hasOwn(attributes,name)};
  const event={isTrusted:true,button:0,target:{closest:()=>link},preventDefault(){prevented=true;},...options};
  forwardPreviewAppLink(event,url=>opened.push(url));
  return {opened,prevented};
}
test('user-clicked Obsidian links are forwarded to the host, including target blank',()=>{
  const url='obsidian://show-plugin?id=vault-code';
  for(const attributes of [{},{target:'_blank'}]) assert.deepEqual(click(url,{},attributes),{opened:[url],prevented:true});
  assert.equal(click('  OBSIDIAN://open?vault=Test&file=Note%20One  ').opened[0],'obsidian://open?vault=Test&file=Note%20One');
});
test('preview scripts and handled or modified clicks cannot trigger app-link forwarding',()=>{
  for(const options of [{isTrusted:false},{defaultPrevented:true},{button:1},{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{target:null}]) {
    assert.deepEqual(click('obsidian://show-plugin?id=vault-code',options),{opened:[],prevented:false});
  }
  assert.deepEqual(click('obsidian://open',{}, {download:''}),{opened:[],prevented:false});
});
test('other protocols, fragments, relative links, and malformed app links are untouched',()=>{
  for(const href of [null,'','#editor','other.html','https://obsidian.md','mailto:test@example.test','file:///tmp/file','javascript:alert(1)','custom://open','obsidian-not://open','obsidian://[bad']) {
    assert.deepEqual(click(href),{opened:[],prevented:false},String(href));
  }
});
