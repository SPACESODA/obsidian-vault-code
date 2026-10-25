import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
async function load(entry) {
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs'});
 const mod={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require);return mod.exports;
}
const {IgnoreMatcher,parseGitignore,EMPTY_IGNORE_RULES}=await load('src/ignore-rules.ts');
const {scanFolderTree,guardIgnoredTraversal,CoalescedScan}=await load('src/vault-scan.ts');
function matcher(git='',obsidian='') {const m=new IgnoreMatcher();m.configure(parseGitignore(git),parseGitignore(obsidian));return m;}
test('ignore matching preserves directory rules, nested patterns, case sensitivity, and root configuration files',()=>{
 const m=matcher('node_modules/\n*.log\n/root-only/\n**/.cache/','docs/private/');
 assert.equal(m.ignored('project/node_modules',true),true);
 assert.equal(m.ignored('project/node_modules/a/index.js',false),true);
 assert.equal(m.ignored('node_modules',false),false);
 assert.equal(m.ignored('project/debug.log',false),true);
 assert.equal(m.ignored('root-only/file.md',false),true);
 assert.equal(m.ignored('project/root-only/file.md',false),false);
 assert.equal(m.ignored('project/.cache/x',false),true);
 assert.equal(m.ignored('docs/private/x.md',false),true);
 assert.equal(m.ignored('NODE_MODULES',true),false);
 const all=matcher('*');assert.equal(all.ignored('.gitignore',false),false);assert.equal(all.ignored('.obsidianignore',false),false);
});
test('Obsidian ignore rules take precedence and cache invalidation follows rule reloads and toggles',()=>{
 const m=matcher('docs/','!docs/guide.md');assert.equal(m.ignored('docs/guide.md',false),false);
 const rules=parseGitignore('node_modules/');m.configure(rules,EMPTY_IGNORE_RULES);
 assert.equal(m.ignored('node_modules/a.js',false),true);
 m.configure(EMPTY_IGNORE_RULES,EMPTY_IGNORE_RULES);assert.equal(m.ignored('node_modules/a.js',false),false);
 m.configure(rules,EMPTY_IGNORE_RULES);assert.equal(m.ignored('node_modules/a.js',false),true);
 m.configure(parseGitignore('node_modules/\n!node_modules/a.js'),EMPTY_IGNORE_RULES);
 assert.equal(m.ignored('node_modules/a.js',false),false);
});
test('repeated explorer checks reuse cached matching results',()=>{
 const rules=parseGitignore('node_modules/');let calls=0;
 const original=rules[0].childRegex.test.bind(rules[0].childRegex);
 rules[0].childRegex.test=value=>{calls++;return original(value);};
 const m=new IgnoreMatcher();m.configure(rules,EMPTY_IGNORE_RULES);
 for(let i=0;i<1000;i++)assert.equal(m.ignored('node_modules/a.js',false),true);
 assert.equal(calls,1);
});
test('pruning retains possible re-inclusions but ignores unrelated rooted exceptions',()=>{
 assert.equal(matcher('node_modules/').canPrune('node_modules'),true);
 assert.equal(matcher('node_modules/\n!docs/keep.md').canPrune('node_modules'),true);
 for(const exception of ['!node_modules/keep.md','!**/keep.md','!keep.md','!node_*/keep.md']) {
  assert.equal(matcher('node_modules/\n'+exception).canPrune('node_modules'),false,exception);
 }
});
test('malformed glob classes cannot abort startup or suppress subsequent valid rules',()=>{
 const rules=parseGitignore('[z-a]\nnode_modules/');assert.equal(rules.length,1);
 const m=new IgnoreMatcher();m.configure(rules,EMPTY_IGNORE_RULES);assert.equal(m.canPrune('node_modules'),true);
});
test('native recursive scans cannot enter ignored subtrees while guarded; read and write methods are untouched',async()=>{
 const visited=[];const m=matcher('node_modules/\n.git/');
 const tree={'':['project','.git'],project:['project/src','project/node_modules'],'project/src':[]};
 const adapter={read(){},write(){},reconcileDeletion(){},async listRecursive(path){visited.push(path);for(const child of tree[path]||[])await this.listRecursive(child);}};
 const original=adapter.listRecursive,read=adapter.read,write=adapter.write,remove=adapter.reconcileDeletion;
 const restore=guardIgnoredTraversal(adapter,path=>m.canPrune(path));await adapter.listRecursive('');
 assert.deepEqual(visited,['','project','project/src']);
 assert.equal(adapter.read,read);assert.equal(adapter.write,write);assert.equal(adapter.reconcileDeletion,remove);
 restore();assert.equal(adapter.listRecursive,original);
});
test('traversal cleanup does not overwrite a later wrapper installed by another plugin',()=>{
 const adapter={async listRecursive(){}};const restore=guardIgnoredTraversal(adapter,()=>false);
 const later=async()=>{};adapter.listRecursive=later;restore();assert.equal(adapter.listRecursive,later);
});
test('folder scans prune a synthetic 50000-folder dependency tree and yield between batches',async()=>{
 const visited=[];let yields=0;
 await scanFolderTree({scan:async path=>visited.push(path),children:path=>{
  if(path==='')return ['project',...Array.from({length:16},(_,i)=>'notes'+i)];
  if(path==='project')return ['project/src','project/node_modules'];
  if(path==='project/node_modules')return Array.from({length:50000},(_,i)=>'project/node_modules/pkg'+i);
  return [];
 },shouldPrune:path=>path.includes('node_modules'),active:()=>true,yield:async()=>{yields++;}});
 assert.equal(visited.length,19);assert.ok(!visited.includes('project/node_modules'));assert.equal(yields,2);
});
test('newly discovered folders are visited once, unreadable folders do not abort, and disabled scans stop',async()=>{
 const tree={'':['docs','unreadable'],docs:['docs/.hidden','docs/.hidden'],'docs/.hidden':[]};const visited=[];
 await scanFolderTree({scan:async path=>{visited.push(path);if(path==='unreadable')throw Error('no access');},children:path=>tree[path]||[],shouldPrune:()=>false,active:()=>true,yield:async()=>{}});
 assert.deepEqual(visited,['','docs','unreadable','docs/.hidden']);
 let active=true;const cancelled=[];
 await scanFolderTree({scan:async path=>{cancelled.push(path);active=false;},children:()=>{throw Error('Must stop before loading more children');},shouldPrune:()=>false,active:()=>active,yield:async()=>{}});
 assert.deepEqual(cancelled,['']);
});
test('concurrent rescan requests share one task and queue only one follow-up',async()=>{
 let release;const gate=new Promise(r=>release=r);let calls=0,active=0,maxActive=0;
 const runner=new CoalescedScan(async()=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1)await gate;active--;});
 const first=runner.run();for(let i=0;i<100;i++)assert.equal(runner.run(),first);
 release();await first;assert.equal(calls,2);assert.equal(maxActive,1);
 await runner.run();assert.equal(calls,3);
});
test('scan failures release the single-flight state so a later scan can retry',async()=>{
 let calls=0;const runner=new CoalescedScan(async()=>{if(++calls===1)throw Error('failed');});
 await assert.rejects(runner.run(),/failed/);await runner.run();assert.equal(calls,2);
});

const {observeExplorerIgnore,filterExplorerRows}=await load('src/explorer-ignore.ts');
function explorer() {
 let callback,disconnected=false,observed;
 const container={win:{MutationObserver:class{constructor(fn){callback=fn;}observe(el,options){observed=options;}disconnect(){disconnected=true;}}}};
 const calls=[];const cleanup=observeExplorerIgnore(container,(path,directory)=>{calls.push({path,directory});return path.includes('node_modules');});
 return {notify:records=>callback(records),calls,cleanup,get disconnected(){return disconnected;},get observed(){return observed;}};
}
function row(path,folder=false) {
 const classes=new Set(folder?['nav-folder']:['nav-file']);
 const item={nodeType:1,path,querySelector:()=>({getAttribute:()=>item.path}),closest:()=>item,querySelectorAll:()=>[],classList:{contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},classes};
 return item;
}
test('new and reused explorer rows are filtered before waiting for a layout event',()=>{
 const e=explorer();const item=row('project/node_modules',true);
 e.notify([{type:'childList',addedNodes:[item]}]);assert.equal(item.classes.has('is-ignored-hidden'),true);
 item.path='project/src';e.notify([{type:'attributes',target:item}]);assert.equal(item.classes.has('is-ignored-hidden'),false);
 assert.equal(e.calls.length,2);assert.equal(e.calls[0].directory,true);
 assert.deepEqual(e.observed.attributeFilter,['data-path']);
 e.cleanup();assert.equal(e.disconnected,true);
});
test('explorer filtering batches duplicated rows and handles newly inserted title nodes',()=>{
 const e=explorer();const item=row('project/node_modules/a.js');
 const title={nodeType:1,closest:()=>item,querySelectorAll:()=>[]};
 e.notify([{type:'childList',addedNodes:[item,title,{nodeType:3}]}]);
 assert.equal(e.calls.length,1);assert.equal(item.classes.has('is-ignored-hidden'),true);
});
test('cleanup deactivates pruning even when a later wrapper retains the guarded function',async()=>{
 let calls=0;const adapter={async listRecursive(){calls++;}};
 const restore=guardIgnoredTraversal(adapter,()=>true);const guarded=adapter.listRecursive;
 adapter.listRecursive=path=>guarded.call(adapter,path);restore();await adapter.listRecursive('node_modules');
 assert.equal(calls,1);
});

test('rule changes re-filter the rendered rows without enumerating the vault or offscreen file items',()=>{
 const item=row('project/node_modules',true);let exclude=true;
 const container={querySelectorAll:()=>[item]};
 filterExplorerRows(container,()=>exclude);assert.equal(item.classes.has('is-ignored-hidden'),true);
 exclude=false;filterExplorerRows(container,()=>exclude);assert.equal(item.classes.has('is-ignored-hidden'),false);
});
