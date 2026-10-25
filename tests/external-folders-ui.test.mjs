import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const platform={isDesktop:true,isWin:false};globalThis.__externalPlatform=platform;
const compiled=await build({entryPoints:['src/external-folders-ui.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`
export const Platform=globalThis.__externalPlatform;
export class App {} export class FileSystemAdapter {} export class Modal {} export class Setting {}
globalThis.ExternalTestAdapter=FileSystemAdapter;
export class TFolder { constructor(path){this.path=path;} }
globalThis.ExternalTestFolder=TFolder;
export class Notice {} export const setIcon=()=>{};
export const getLanguage=()=> 'en'; export const requireApiVersion=()=>true;
`}));}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {indexedShortcutTarget,ExternalFolderFeature}=mod.exports;

test('external markers use the index and distinguish shortcut roots from ordinary descendants',()=>{
  const adapter={files:{Normal:{type:'folder',realpath:'Normal'},External:{type:'folder',realpath:'/outside'},'External/Sub':{type:'folder',realpath:'/outside/Sub'}},getRealPath:p=>p==='External'?'/outside':p};
  assert.equal(indexedShortcutTarget(adapter,'Normal'),null);
  assert.equal(indexedShortcutTarget(adapter,'External'),'/outside');
  assert.equal(indexedShortcutTarget(adapter,'External/Sub'),null);
  assert.equal(indexedShortcutTarget(adapter,'/'),null);
});
test('native Delete and Trash unlink shortcut roots without calling recursive deletion',async()=>{
  const calls=[];const vault={adapter:new globalThis.ExternalTestAdapter(),configDir:'.obsidian',delete:async file=>calls.push('delete:'+file.path),trash:async file=>calls.push('trash:'+file.path)};
  const feature=new ExternalFolderFeature({vault},()=>false,()=>{});
  feature.service=Promise.resolve({isShortcut:async path=>path==='External',remove:async path=>calls.push('unlink:'+path)});
  feature.refresh=async()=>true;
  const originalDelete=vault.delete,originalTrash=vault.trash;
  const restore=feature.guardDeletion();
  await vault.delete(new globalThis.ExternalTestFolder('External'));
  await vault.trash(new globalThis.ExternalTestFolder('External'),true);
  await vault.delete(new globalThis.ExternalTestFolder('Normal'));
  assert.deepEqual(calls,['unlink:External','unlink:External','delete:Normal']);
  restore();assert.equal(vault.delete,originalDelete);assert.equal(vault.trash,originalTrash);
});
test('a shortcut replaced by an ordinary folder never falls through to native recursive deletion',async()=>{
  let native=false;
  const vault={adapter:Object.assign(new globalThis.ExternalTestAdapter(),{files:{External:{type:'folder',realpath:'/outside'}},getRealPath:p=>p}),delete:async()=>{native=true;},trash:async()=>{native=true;}};
  const feature=new ExternalFolderFeature({vault},()=>false,()=>{});
  feature.service=Promise.resolve({isShortcut:async()=>false});
  const restore=feature.guardDeletion();
  await assert.rejects(vault.delete(new globalThis.ExternalTestFolder('External')),error=>error.code==='shortcut');
  assert.equal(native,false);restore();
});
test('indexing guards map external real paths to vault ignore rules and restore safely',async()=>{
  const scanned=[];const adapter={listRecursive:async path=>scanned.push(path)};
  const feature=new ExternalFolderFeature({vault:{adapter}},path=>path==='External/node_modules',()=>{});
  const original=adapter.listRecursive;const restore=feature.guardIndexing('External','/disk/project');
  await adapter.listRecursive('/disk/project/node_modules');
  await adapter.listRecursive('/disk/project/notes');
  assert.deepEqual(scanned,['/disk/project/notes']);restore();assert.equal(adapter.listRecursive,original);
});
test('mobile exposes no folder action and never resolves a desktop filesystem runtime',async()=>{
  platform.isDesktop=false;
  try {
    const feature=new ExternalFolderFeature({vault:{adapter:{}}},()=>false,()=>{});
    let items=0;feature.menu({addItem:()=>{items++;}},new globalThis.ExternalTestFolder('/'));
    assert.equal(items,0);await assert.rejects(feature.core(),error=>error.code==='unavailable');
  } finally {platform.isDesktop=true;}
});
test('cancelling the native folder picker performs no filesystem operation',async()=>{
  let writes=0;globalThis.window={require:()=>({dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})}})};
  const feature=new ExternalFolderFeature({vault:{adapter:{}}},()=>false,()=>{});
  feature.service=Promise.resolve({add:async()=>{writes++;}});
  await feature.choose('');assert.equal(writes,0);assert.equal(feature.pickerOpen,false);
});

test('desktop runtime uses Electron require rather than browser imports, and failed setup can retry',async()=>{
  const require=createRequire(import.meta.url);
  const adapter=Object.assign(new globalThis.ExternalTestAdapter(),{getBasePath:()=>'/tmp/test-vault'});
  const feature=new ExternalFolderFeature({vault:{adapter,configDir:'.obsidian'}},()=>false,()=>{});
  globalThis.window={require:()=>({})};
  await assert.rejects(feature.core(),error=>error.code==='unavailable');
  globalThis.window={require};
  const core=await feature.core();assert.equal(typeof core.add,'function');assert.equal(await feature.core(),core);
});

test('overlapping shortcuts remain a user choice; only actual loops are blocked',async()=>{
  const feature=new ExternalFolderFeature({vault:{adapter:new globalThis.ExternalTestAdapter()}},()=>false,()=>{});
  feature.scheduleDecorations=()=>{};
  feature.targets=new Map([['Original','/projects/work'],['Duplicate','/projects/work'],['Subfolder','/projects/work/docs'],['Other','/projects/workspace']]);
  feature.reconcileConflicts();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(feature.isBlocked('Original'),false);
  assert.equal(feature.isBlocked('Duplicate/file.md'),false);
  assert.equal(feature.isBlocked('Subfolder'),false);
  assert.equal(feature.isBlocked('Other'),false);
  feature.invalidTargets.add("Loop");feature.reconcileConflicts();assert.equal(feature.isBlocked("Loop/file.md"),true);
  // Removing one shortcut does not restrict another.
  feature.invalidate('Original');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(feature.isBlocked('Duplicate'),false);assert.equal(feature.isBlocked('Subfolder'),false);
});

test('visible-folder discovery caches results and runs at most four filesystem probes',async()=>{
  const feature=new ExternalFolderFeature({vault:{adapter:new globalThis.ExternalTestAdapter()}},()=>false,()=>{});
  const waiting=[];let running=0,maximum=0,calls=0;
  feature.service=Promise.resolve({shortcutTarget:()=>{calls++;running++;maximum=Math.max(maximum,running);return new Promise(resolve=>waiting.push(()=>{running--;resolve(null);}));}});
  for(let i=0;i<12;i++)feature.discover('Folder'+i);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,4);
  while(feature.probesRunning||feature.probeQueue.length){for(const finish of waiting.splice(0))finish();await new Promise(resolve=>setImmediate(resolve));}
  assert.equal(maximum,4);assert.equal(calls,12);
  for(let i=0;i<12;i++)feature.discover('Folder'+i);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,12);
});

test('a newly added duplicate target gets its own watcher and indexes without restart',async()=>{
  const calls=[];let watched=false,indexed=false;
  const adapter={
    reconcileInternalFile:async path=>{calls.push('reconcile:'+path);if(watched)indexed=true;},
    startWatchPath:async path=>{calls.push('watch:'+path);watched=true;},
    stopWatchPath:()=>{watched=false;},
  };
  const feature=new ExternalFolderFeature({vault:{adapter,getAbstractFileByPath:()=>indexed?{}:null}},()=>false,()=>{});
  assert.equal(await feature.refresh('Second link',true),true);
  assert.deepEqual(calls,['reconcile:Second link','watch:Second link','reconcile:Second link']);
  assert.equal(watched,true);
});
test('failed duplicate indexing cleans up its watcher and deletion never starts one',async()=>{
  let starts=0,stops=0;
  const adapter={reconcileInternalFile:async()=>{},startWatchPath:async()=>{starts++;},stopWatchPath:()=>{stops++;}};
  const feature=new ExternalFolderFeature({vault:{adapter,getAbstractFileByPath:()=>null}},()=>false,()=>{});
  assert.equal(await feature.refresh('Second link',true),false);
  assert.equal(starts,1);assert.equal(stops,1);
  assert.equal(await feature.refresh('Deleted link'),false);
  assert.equal(starts,1);
});
