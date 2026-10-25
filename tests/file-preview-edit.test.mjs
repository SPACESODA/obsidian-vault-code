import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { EditorState } from '@codemirror/state';
import { history, undo, redo, isolateHistory } from '@codemirror/commands';
const compiled=await build({entryPoints:['src/file-preview-edit.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {tableEditModel,changeTableCell,editableToken,PreviewSaveGuard,previewLineEnding,previewDocumentBytes,decodePreviewBytes}=mod.exports;
function apply(source,change){return change?source.slice(0,change.from)+change.insert+source.slice(change.to):source;}

test('CSV edits preserve BOM, CRLF, quote style, multiline content, and every other byte',()=>{
  const source='\uFEFFName,Notes,Count\r\n"Alice","one\r\ntwo",001\r\nBob,"untouched ""quote""",2\r\n';
  const model=tableEditModel(source,'csv');assert.ok(model);
  const change=changeTableCell(model,0,0,'Ana, "Hello"');
  const next=apply(source,change);
  assert.equal(next,'\uFEFFName,Notes,Count\r\n"Ana, ""Hello""","one\r\ntwo",001\r\nBob,"untouched ""quote""",2\r\n');
  assert.equal(changeTableCell(model,0,1,'one\ntwo'),null);
  assert.equal(apply(source,changeTableCell(model,1,2,'')),source.replace('quote""",2','quote""",'));
});
test('TSV rejects record-breaking characters and preserves quotes and literal backslashes',()=>{
  const source='A\tB\nleft\tright';const model=tableEditModel(source,'tsv');
  for(const value of ['a\tb','a\nb','a\rb','a\r\nb','a\u2028b']) assert.throws(()=>changeTableCell(model,0,1,value),/tabs or line breaks/);
  const value='"literal" \\n \\t';
  const next=apply(source,changeTableCell(model,0,1,value));
  assert.equal(next,'A\tB\nleft\t'+value);
  assert.equal(tableEditModel(next,'tsv').cells[0][1].value,value);
});
test('CSV final empty fields, no trailing newline, and Unicode offsets are exact',()=>{
  for(const source of ['A,B\n😀,','\uFEFFA,B\r\n漢字,']){
    const model=tableEditModel(source,'csv');assert.ok(model);
    const next=apply(source,changeTableCell(model,0,1,'tail'));
    assert.equal(next,source+'tail');
  }
});
test('malformed, ragged, duplicate-header, and incomplete tables are read-only',()=>{
  for(const source of ['A,B\n1','A,A\n1,2',',B\n1,2','A\n"open','A\n"closed"oops','A\nx\n'+Array(501).fill('x').join('\n')]) assert.equal(tableEditModel(source,'csv'),null,source.slice(0,30));
});
test('JSONL edits only one value token and preserve types, whitespace, key order, escapes, and numeric precision elsewhere',()=>{
  const source=' { "s" : "hello", "n":12, "big":900719925474099312345, "flag":true, "nil":null }\r\n{"s":"bye","n":2,"flag":false}\r\n';
  const model=tableEditModel(source,'jsonl');assert.ok(model);
  const next=apply(source,changeTableCell(model,0,0,'"\n世界'));
  assert.equal(next,source.replace('"hello"','"\\"\\n世界"'));
  assert.equal(JSON.parse(next.split('\r\n')[0]).s,'"\n世界');
  assert.equal(editableToken(model.cells[0][2]),false);
  assert.equal(editableToken(model.cells[0][4]),false);
  assert.equal(model.cells[1][2],null);
  assert.equal(apply(source,changeTableCell(model,0,3,'false')),source.replace('"flag":true','"flag":false'));
  assert.equal(apply(source,changeTableCell(model,0,1,'0.5')),source.replace('"n":12','"n":0.5'));
});
test('JSONL duplicate decoded keys, nested objects, arrays and malformed tail records are read-only',()=>{
  for(const source of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"a":{}}','{"a":[]}','[1,2]','{"a":1}\nBAD','{"a":1,}','{"a":1}junk']) assert.equal(tableEditModel(source+'\n','ndjson'),null,source);
});
test('numeric edits reject type changes, invalid syntax, overflow and precision loss',()=>{
  const model=tableEditModel('{"n":12,"b":true,"s":"true"}','jsonl');
  for(const value of ['NaN','Infinity','1e999','9007199254740993','1.234567890123456789','"12"','null','true','','01','0x10','1,2']) assert.throws(()=>changeTableCell(model,0,0,value));
  assert.throws(()=>changeTableCell(model,0,1,'yes'));
  assert.equal(apply(model.source,changeTableCell(model,0,2,'false')),'{"n":12,"b":true,"s":"false"}');
});
test('prototype-looking and numeric property names map to the correct lexical tokens',()=>{
  const source='{"2":"two","1":"one","__proto__":"literal"}';const model=tableEditModel(source,'jsonl');
  assert.deepEqual(model.headers,['2','1','__proto__']);
  assert.equal(apply(source,changeTableCell(model,0,2,'safe')),source.replace('literal','safe'));
});
test('oversized values and missing properties are never editable',()=>{
  const model=tableEditModel('{"s":"'+ 'a'.repeat(2001)+'"}\n{"other":1}','jsonl');
  assert.equal(editableToken(model.cells[0][0]),false);
  assert.equal(editableToken(model.cells[0][1]),false);
  assert.throws(()=>changeTableCell(model,0,1,'new'));
});
test('source patches retain native undo and redo without rewriting unrelated tokens',()=>{
  let state=EditorState.create({doc:'A,B\nleft,right\n',extensions:[history()]});
  const model=tableEditModel(state.doc.toString(),'csv');const change=changeTableCell(model,0,1,'new,value');
  state=state.update({changes:change,annotations:isolateHistory.of('full')}).state;
  const view={get state(){return state;},dispatch(tr){state=tr.state;}};
  assert.equal(state.doc.toString(),'A,B\nleft,"new,value"\n');
  assert.ok(undo(view));assert.equal(state.doc.toString(),model.source);
  assert.ok(redo(view));assert.equal(state.doc.toString(),'A,B\nleft,"new,value"\n');
});
test('guarded saves compare inside the write transaction and leave external contents untouched',async()=>{
  const guard=new PreviewSaveGuard('original');let disk='external';let writes=0;
  await assert.rejects(guard.save(()=> 'edited',async update=>{const next=update(disk);writes++;disk=next;}),/File changed/);
  assert.equal(disk,'external');assert.equal(writes,0);assert.equal(guard.expected,'original');
});
test('guarded saves serialize and use the last successful disk state',async()=>{
  const guard=new PreviewSaveGuard('old');let disk='old';let active=0;
  const process=async update=>{assert.equal(active++,0);await new Promise(r=>setImmediate(r));disk=update(disk);active--;};
  await Promise.all([guard.save(()=> 'first',process),guard.save(()=> 'second',process)]);
  assert.equal(disk,'second');assert.equal(guard.expected,'second');
});
test('failed writes do not advance baseline, and a later retry can succeed',async()=>{
  const guard=new PreviewSaveGuard('old');
  await assert.rejects(guard.save(()=> 'new',async()=>{throw new Error('disk full');}),/disk full/);
  assert.equal(guard.expected,'old');assert.equal(guard.writing,undefined);
  let disk='old';await guard.save(()=> 'new',async update=>{disk=update(disk);});
  assert.equal(disk,'new');
});
test('own write notifications never replace newer drafts; external changes preserve pending drafts',async()=>{
  const guard=new PreviewSaveGuard('old');let allowWrite;
  const saving=guard.save(()=> 'saved',async update=>{
    assert.equal(update('old'),'saved');
    assert.equal(guard.acceptReload('saved','newer draft'),false);
    assert.equal(guard.conflicted,false);
    await new Promise(resolve=>{allowWrite=resolve;});
  });
  await new Promise(r=>setImmediate(r));allowWrite();await saving;
  assert.equal(guard.acceptReload('external','newer draft'),false);assert.equal(guard.conflicted,true);
});
test('external reloads are accepted only with no pending local changes',()=>{
  const guard=new PreviewSaveGuard('old');assert.equal(guard.acceptReload('external','old'),true);assert.equal(guard.expected,'external');
});

test('external changes during an in-flight write conflict even after a local undo',async()=>{
  const guard=new PreviewSaveGuard('old');
  await assert.rejects(guard.save(()=> 'edited',async update=>{
    assert.equal(guard.acceptReload('external','old'),false);
    update('external');
  }),/File changed/);
  assert.equal(guard.expected,'old');
});


test('CodeMirror newline normalization round-trips uniform CRLF and refuses mixed separators',()=>{
  const source='\ufeffA,B\r\none,two\r\n';
  const state=EditorState.create({doc:source});
  assert.equal(previewLineEnding(source),'\r\n');
  assert.equal(previewDocumentBytes(state.doc.toString(),previewLineEnding(source)),source);
  assert.equal(previewLineEnding('a\r\nb\nc'),null);
  assert.equal(previewLineEnding('a\rb'),null);
  assert.equal(previewLineEnding('a\nb'),'\n');
});


test('raw-byte validation preserves UTF-8 BOM and refuses other encodings',()=>{
  const source='\ufeffA,B\r\none,two\r\n';
  const bytes=new TextEncoder().encode(source);
  assert.equal(decodePreviewBytes(bytes.buffer),source);
  const normalized=source.slice(1).replace(/\r\n/g,'\n');
  assert.equal(previewDocumentBytes(normalized,'\r\n','\ufeff'),source);
  assert.throws(()=>decodePreviewBytes(new Uint8Array([0xff,0xfe,65,0]).buffer),/UTF-8/);
  assert.throws(()=>decodePreviewBytes(new Uint8Array([65,0,66,0]).buffer),/UTF-8/);
});


test('CSV rejects unpaired surrogates rather than silently replacing characters on save',()=>{
  const model=tableEditModel('A\nvalue\n','csv');
  assert.throws(()=>changeTableCell(model,0,0,'\ud800'),/Unicode/);
  assert.equal(apply(model.source,changeTableCell(model,0,0,'漢字 😀')),'A\n漢字 😀\n');
});


test('CSV multiline replacements use correct quoting and the existing LF or CRLF convention',()=>{
  for(const eol of ['\n','\r\n']){
    const source='A,B'+eol+'one,unchanged'+eol;
    const model=tableEditModel(source,'csv');
    const next=apply(source,changeTableCell(model,0,0,'first, "quote"\nsecond'));
    assert.equal(next,'A,B'+eol+'"first, ""quote""'+eol+'second",unchanged'+eol);
    assert.equal(tableEditModel(next,'csv').cells.length,1);
    assert.throws(()=>changeTableCell(model,0,0,'first\rsecond'),/line breaks/);
  }
});
test('legacy quoted multiline TSV and mismatched records stay read-only',()=>{
  const source='A\tB\nleft\t"first\nsecond"\n';
  assert.equal(tableEditModel(source,'tsv'),null);
  const plain='A\tB\nleft\t"literal"\n';
  const model=tableEditModel(plain,'tsv');assert.equal(model.cells[0][1].value,'"literal"');
  assert.equal(apply(plain,changeTableCell(model,0,1,'new "quote"')),plain.replace('"literal"','new "quote"'));
});
test('JSONL and NDJSON multiline strings serialize as escapes without adding physical records',()=>{
  for(const extension of ['jsonl','ndjson'])for(const eol of ['\n','\r\n']){
    const source='{ "text" : "before", "keep":1 }'+eol+'{"text":"untouched","keep":2}'+eol;
    const model=tableEditModel(source,extension);assert.ok(model);
    const value='first\nsecond\t"quoted"\n\\n literal\u2028next';
    const change=changeTableCell(model,0,0,value);const next=apply(source,change);
    assert.ok(!change.insert.includes('\n'));assert.ok(!change.insert.includes('\r'));assert.ok(!change.insert.includes('\t'));
    assert.ok(change.insert.includes('\\n'));assert.ok(change.insert.includes('\\t'));assert.ok(change.insert.includes('\\\\n'));
    assert.ok(change.insert.includes('\\u2028'));
    assert.equal(next.split(eol).length,source.split(eol).length);
    assert.equal(JSON.parse(next.split(eol)[0]).text,value);
    assert.equal(next.slice(change.from+change.insert.length),source.slice(change.to));
    assert.throws(()=>changeTableCell(model,0,0,'first\rsecond'),/Carriage-return/);
  }
});
test('JSON line formats reject nonconforming source instead of silently normalizing it',()=>{
  for(const extension of ['jsonl','ndjson']){
    for(const source of ['\ufeff{"a":1}\n','{"a":1}\n\n','{"a":1}\n   \n','{"a":"raw\nnewline"}\n','{"a":1}\r{"a":2}\n']) assert.equal(tableEditModel(source,extension),null);
  }
  assert.ok(tableEditModel('{"a":1}','jsonl'));
  assert.equal(tableEditModel('{"a":1}','ndjson'),null);
  const source='{"a":"keep\\r\\nexact","b":"editable"}\n';const model=tableEditModel(source,'ndjson');
  assert.equal(editableToken(model.cells[0][0]),false);
  const next=apply(source,changeTableCell(model,0,1,'new\nline'));
  assert.equal(JSON.parse(next).a,'keep\r\nexact');
});
