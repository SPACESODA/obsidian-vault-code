import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/ai-selection-position.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(mod,mod.exports);
const {selectionActionPosition:position}=mod.exports;
const pane={left:0,right:800,top:0,bottom:600},viewport={width:1000,height:800};
const rect=(left,right,top=100,bottom=120)=>({left,right,top,bottom});
test('action sits beside the first selected line rather than the pane edge',()=>{
 assert.deepEqual(position([rect(100,300)],pane,viewport),{left:308,top:95});
 assert.deepEqual(position([rect(100,150),rect(150,300)],pane,viewport),{left:308,top:95});
});
test('text at the right edge moves the action above, or below when no space is available above',()=>{
 assert.deepEqual(position([rect(100,790)],pane,viewport),{left:760,top:62});
 assert.deepEqual(position([rect(100,790,12,32)],pane,viewport),{left:760,top:40});
 assert.deepEqual(position([rect(100,790,12,32),rect(100,400,36,56)],pane,viewport),{left:370,top:64});
});
test('wrapped lines do not get covered when the next selected line extends farther right',()=>{
 assert.deepEqual(position([rect(100,250),rect(50,400,124,144)],pane,viewport),{left:220,top:62});
});
test('a left margin can hold the action when the selection spans the entire visible height',()=>{
 assert.deepEqual(position([rect(80,790,-10,610)],pane,viewport),{left:42,top:285});
 assert.equal(position([rect(0,800,-10,610)],pane,viewport),null);
});
test('pane boundaries, offscreen fragments, invalid geometry and very narrow panes are respected',()=>{
 const shifted={left:400,right:700,top:150,bottom:450};
 assert.deepEqual(position([rect(450,600,200,220)],shifted,viewport),{left:608,top:195});
 assert.deepEqual(position([rect(100,300,-100,-80),rect(100,300,100,120)],pane,viewport),{left:308,top:95});
 assert.equal(position([],pane,viewport),null);assert.equal(position([rect(NaN,300)],pane,viewport),null);
 assert.equal(position([rect(2,10)],{...pane,right:40},viewport),null);
});
test('returned positions never cover selected text or escape the pane and viewport',()=>{
 for(let x=0;x<800;x+=37)for(let y=-20;y<620;y+=41){
  const r=rect(x,Math.min(820,x+160),y,y+24),p=position([r],pane,viewport);if(!p)continue;
  assert.ok(p.left>=8&&p.left+30<=792&&p.top>=8&&p.top+30<=592);
  assert.ok(p.left+30<=r.left||p.left>=r.right||p.top+30<=r.top||p.top>=r.bottom);
 }
});
