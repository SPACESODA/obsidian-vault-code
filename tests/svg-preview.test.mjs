import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled=await build({entryPoints:['src/svg-preview.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',compiled.outputFiles[0].text)(mod,mod.exports);
const {sizeSvgPreview}=mod.exports;
function size(attributes){const copy={...attributes};sizeSvgPreview({getAttribute:n=>copy[n]??null,setAttribute:(n,v)=>copy[n]=v});return copy;}
test('percentage-sized SVG previews receive intrinsic viewBox dimensions without changing the source',()=>{
  const source={viewBox:'0 0 1200 680',width:'100%',height:'100%'};
  assert.deepEqual(size(source),{viewBox:source.viewBox,width:'1200',height:'680'});
  assert.equal(source.width,'100%');assert.equal(source.height,'100%');
});
test('viewBox-only and auto-sized SVGs receive fallback dimensions; fixed sizes remain intact',()=>{
  assert.deepEqual(size({viewBox:'-10, -20, 600, 360',height:'auto'}),{viewBox:'-10, -20, 600, 360',width:'600',height:'360'});
  const fixed={viewBox:'0 0 48 48',width:'24px',height:'24'};assert.deepEqual(size(fixed),fixed);
  assert.equal(size({viewBox:'0 0 48 48',width:'0',height:'0'}).width,'0');
});
test('invalid or absent viewBoxes are left alone',()=>{
  for(const viewBox of [undefined,'','0 0 0 10','0 0 -1 10','0 0 10 NaN','0 0 10 Infinity','0 0 10','0 0 10 20 30']){
    const source={width:'100%',height:'100%',...(viewBox===undefined?{}:{viewBox})};assert.deepEqual(size(source),source);
  }
});
