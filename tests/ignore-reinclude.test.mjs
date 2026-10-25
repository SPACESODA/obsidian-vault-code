import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/ignore-rules.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',outputFiles[0].text)(mod,mod.exports);
const {IgnoreMatcher,parseGitignore}=mod.exports;
const source=readFileSync('src/main.ts','utf8');const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const plugin=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='VaultCodePlugin');
const method=plugin.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)==='patchAdapter');
const code=ts.transpileModule('class TestPlugin {'+method.getText(ast)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText;
const patch=new Function('isDotPath',code+';return TestPlugin.prototype.patchAdapter;')(path=>path.split('/').some(part=>part.startsWith('.')));
const rules='.obsidian/*\n!.obsidian/snippets/\n!.obsidian/snippets/**\n!.obsidian/types.json\n.git/';
function harness(){
  const matcher=new IgnoreMatcher();matcher.configure([],parseGitignore(rules));
  const shown=[],hidden=[],statReads=[];const indexed=new Set(['.obsidian']);
  const disk=new Map([['.obsidian/snippets','folder'],['.obsidian/snippets/theme.css','file'],['.obsidian/plugins','folder'],['.obsidian/types.json','file']]);
  const adapter={reconcileDeletion:async(_real,path)=>{hidden.push(path);},getFullPath:p=>p,_exists:async p=>disk.has(p),
    fsPromises:{stat:async path=>{statReads.push(path);const type=disk.get(path);if(!type)throw Object.assign(Error('missing'),{code:'ENOENT'});return {isDirectory:()=>type==='folder'};}}};
  const owner={settings:{showHiddenFiles:true},adapter:()=>adapter,hiddenPaths:new Set(),
    app:{vault:{adapter:{stat:()=>{throw Error('Queued adapter.stat must not be called during reconciliation');}}}},
    isPathIgnored:(path,directory)=>matcher.ignored(path,directory??indexed.has(path)),
    showFile:async path=>{shown.push(path);if(disk.get(path)==='folder')indexed.add(path);},
  };
  patch.call(owner);return {adapter,shown,hidden,statReads,indexed,disk};
}
test('folder-only exceptions reveal previously unindexed snippets on the first scan',async()=>{
  const h=harness();
  await h.adapter.reconcileDeletion('.obsidian/snippets','.obsidian/snippets');
  await h.adapter.reconcileDeletion('.obsidian/snippets/theme.css','.obsidian/snippets/theme.css');
  await h.adapter.reconcileDeletion('.obsidian/types.json','.obsidian/types.json');
  assert.deepEqual(h.shown,['.obsidian/snippets','.obsidian/snippets/theme.css','.obsidian/types.json']);
  assert.deepEqual(h.hidden,[]);assert.deepEqual(h.statReads,['.obsidian/snippets']);
});
test('ignored siblings stay excluded and indexed exceptions do not repeat disk type checks',async()=>{
  const h=harness();
  await h.adapter.reconcileDeletion('.obsidian/plugins','.obsidian/plugins');
  assert.deepEqual(h.hidden,['.obsidian/plugins']);assert.deepEqual(h.statReads,[]);
  await h.adapter.reconcileDeletion('.obsidian/snippets','.obsidian/snippets');
  await h.adapter.reconcileDeletion('.obsidian/snippets','.obsidian/snippets');
  assert.deepEqual(h.statReads,['.obsidian/snippets']);
  h.disk.delete('.obsidian/snippets');
  await h.adapter.reconcileDeletion('.obsidian/snippets','.obsidian/snippets');
  assert.deepEqual(h.hidden,['.obsidian/plugins','.obsidian/snippets']);
});

test('re-inclusion never waits on a queued adapter stat during a scan',async()=>{
  const h=harness();let queuedReads=0;
  h.adapter.stat=()=>{queuedReads++;return new Promise(()=>{});};
  await h.adapter.reconcileDeletion('.obsidian/snippets','.obsidian/snippets');
  assert.equal(queuedReads,0);assert.deepEqual(h.shown,['.obsidian/snippets']);
});
