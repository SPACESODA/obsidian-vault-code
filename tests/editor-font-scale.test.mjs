import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/editor-font-scale.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',outputFiles[0].text)(mod,mod.exports);
const {normalizeEditorFontScale}=mod.exports;
test('font scale preserves the current baseline, never shrinks, and caps enlargement',()=>{
  for(const value of [undefined,null,'125',NaN,Infinity,-100,0,75,100])assert.equal(normalizeEditorFontScale(value),100);
  assert.equal(normalizeEditorFontScale(125),125);
  assert.equal(normalizeEditorFontScale(123),125);
  assert.equal(normalizeEditorFontScale(150),150);
  assert.equal(normalizeEditorFontScale(200),150);
});
