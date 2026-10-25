import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/editor-extensions.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',outputFiles[0].text)(mod,mod.exports);
const {BUILTIN_EXTENSION_COUNT,additionalEditorExtensions,editableEditorExtensions}=mod.exports;
test('built-in support stays available when additions are empty, cleared or invalid',()=>{
  for(const value of ['',null,undefined,42]){
    const extensions=editableEditorExtensions(value);
    assert.equal(extensions.size,BUILTIN_EXTENSION_COUNT);
    for(const ext of ['html','css','js','py','csv','mjml'])assert.ok(extensions.has(ext));
  }
  assert.equal(BUILTIN_EXTENSION_COUNT,172);
});
test('old full lists migrate to additions and preserve custom extensions',()=>{
  const old=[...editableEditorExtensions(''),'CustomA','.customB','CUSTOMA'].join(', ');
  assert.equal(additionalEditorExtensions(old),'customa, customb');
  const migrated=editableEditorExtensions(additionalEditorExtensions(old));
  assert.ok(migrated.has('customa'));assert.ok(migrated.has('customb'));assert.ok(migrated.has('html'));
});
test('dots, case, separators, and overlaps are normalized without duplicates',()=>{
  const input='HTML, .css; js\nFoo foo .BAR\tbar';
  assert.equal(additionalEditorExtensions(input),'foo, bar');
  const set=editableEditorExtensions(input);
  assert.equal(set.size,BUILTIN_EXTENSION_COUNT+2);
  assert.equal(additionalEditorExtensions(additionalEditorExtensions(input)),'foo, bar');
});
