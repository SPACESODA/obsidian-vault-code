import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/external-folders.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {ExternalFolders}=mod.exports;
async function fixture(t,ignore=()=>false,override={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'vault-code-external-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const vault=path.join(root,'vault'),target=path.join(root,'outside');await fs.mkdir(vault);await fs.mkdir(target);await fs.writeFile(path.join(target,'original.txt'),'Original');
  return {root,vault,target,service:new ExternalFolders({...fs,...override},path,vault,'.obsidian',false,ignore)};
}
const code=expected=>error=>error.code===expected;

test('adding creates only a directory shortcut; removing it preserves originals',async t=>{
  const f=await fixture(t);const added=await f.service.add('','External',f.target);
  assert.deepEqual(added,{path:'External',target:f.target});
  assert.equal((await fs.lstat(path.join(f.vault,'External'))).isSymbolicLink(),true);
  assert.equal(await fs.readFile(path.join(f.vault,'External','original.txt'),'utf8'),'Original');
  await f.service.remove('External');
  assert.equal(await fs.readFile(path.join(f.target,'original.txt'),'utf8'),'Original');
  await assert.rejects(fs.lstat(path.join(f.vault,'External')),error=>error.code==='ENOENT');
});
test('existing entries, including broken shortcuts, are never overwritten',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.vault,'Existing'),'Keep');
  await fs.symlink(path.join(f.root,'missing'),path.join(f.vault,'Broken'),'dir');
  for(const name of ['Existing','Broken'])await assert.rejects(f.service.add('',name,f.target),code('exists'));
  assert.equal(await fs.readFile(path.join(f.vault,'Existing'),'utf8'),'Keep');
  await f.service.remove('Broken');assert.equal(await fs.readFile(path.join(f.target,'original.txt'),'utf8'),'Original');
});
test('invalid names and locations cannot escape the vault or reach settings',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.vault,'.obsidian'));await fs.symlink(f.target,path.join(f.vault,'Parent'),'dir');
  for(const name of ['', '..', 'a/b','a\\b','CON','NUL.txt','space ','bad:'])await assert.rejects(f.service.add('',name,f.target),code('name'));
  for(const parent of ['../','/tmp','.obsidian','Parent'])await assert.rejects(f.service.add(parent,'Child',f.target),code('location'));
  await assert.rejects(f.service.add('','.obsidian',f.target),code('location'));
});
test('duplicate, aliased, parent and child targets are allowed while actual vault loops are rejected',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.vault,'Inside'));await fs.mkdir(path.join(f.target,'Child'));
  for(const target of [f.vault,f.root])await assert.rejects(f.service.add('','Bad',target),code('loop'));
  await f.service.add('','Internal',path.join(f.vault,'Inside'));
  await f.service.add('','First',f.target);
  await fs.symlink(f.target,path.join(f.root,'Alias'),'dir');
  let i=0;for(const target of [f.target,path.join(f.root,'Alias'),path.join(f.target,'Child')])await f.service.add('','Second'+i++,target);
  const group=path.join(f.root,'Group');await fs.mkdir(group);await fs.mkdir(path.join(group,'Project'));
  await f.service.add('','Project',path.join(group,'Project'));await f.service.add('','Group',group);
  assert.equal(await fs.readFile(path.join(f.target,'original.txt'),'utf8'),'Original');
});
test('nested shortcuts reject actual cycles while ignored dependency trees are pruned',async t=>{
  const f=await fixture(t,p=>p.includes('node_modules'));
  await fs.symlink(f.vault,path.join(f.target,'BackToVault'),'dir');
  await assert.rejects(f.service.add('','External',f.target),code('loop'));
  await fs.unlink(path.join(f.target,'BackToVault'));await fs.mkdir(path.join(f.target,'node_modules'));
  await fs.symlink(f.vault,path.join(f.target,'node_modules','BackToVault'),'dir');
  await f.service.add('','External',f.target);assert.equal(await f.service.isShortcut('External'),true);
});
test('removal refuses real folders, files and nested items inside an external target',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.vault,'Real'));await fs.writeFile(path.join(f.vault,'File'),'Keep');
  for(const entry of ['Real','File'])await assert.rejects(f.service.remove(entry),code('shortcut'));
  await f.service.add('','External',f.target);await fs.mkdir(path.join(f.target,'Sub'));
  await assert.rejects(f.service.remove('External/Sub'),code('location'));
  assert.equal(await fs.readFile(path.join(f.vault,'File'),'utf8'),'Keep');
});
test('cancellation during validation never creates a shortcut and releases the operation lock',async t=>{
  const controller=new AbortController();
  const f=await fixture(t,()=>false,{opendir:async p=>{if(p.endsWith('outside'))controller.abort();return fs.opendir(p);}});
  await assert.rejects(f.service.add('','Cancelled',f.target,controller.signal),code('cancelled'));
  await assert.rejects(fs.lstat(path.join(f.vault,'Cancelled')),e=>e.code==='ENOENT');
  await f.service.add('','Valid',f.target);
});
test('ordinary folders swapped in place of shortcuts are never removed',async t=>{
  let counter=0;let destination;
  const f=await fixture(t,()=>false,{lstat:async p=>{
    const stat=await fs.lstat(p);
    if(p===destination&&++counter===1){await fs.unlink(p);await fs.mkdir(p);await fs.writeFile(path.join(p,'keep.txt'),'Keep');}
    return stat;
  }});
  await f.service.add('','External',f.target);destination=path.join(f.vault,'External');
  await assert.rejects(f.service.remove('External'),code('shortcut'));
  assert.equal(await fs.readFile(path.join(destination,'keep.txt'),'utf8'),'Keep');
});
test('Windows folders use junctions with an absolute target',async t=>{
  const f=await fixture(t);let type;
  const service=new ExternalFolders({...fs,symlink:async(target,destination,kind)=>{type=kind;assert.equal(path.isAbsolute(target),true);await fs.symlink(target,destination,'dir');}},path,f.vault,'.obsidian',true);
  await service.add('','External',f.target);assert.equal(type,'junction');
});

test('an ignored shortcut name is rejected before scanning or writing',async t=>{
  const f=await fixture(t,p=>p==='Hidden');
  await assert.rejects(f.service.add('','Hidden',f.target),code('ignored'));
  await assert.rejects(fs.lstat(path.join(f.vault,'Hidden')),e=>e.code==='ENOENT');
});

test('creation installs its indexing guard before the filesystem link is visible',async t=>{
  let guarded=false;
  const f=await fixture(t,()=>false,{symlink:async(...args)=>{assert.equal(guarded,true);await fs.symlink(...args);}});
  await f.service.add('','External',f.target,undefined,(logical,target)=>{assert.equal(logical,'External');assert.equal(target,f.target);guarded=true;});
});

test('shortcut discovery resolves aliases and rejects externally-created vault loops',async t=>{
  const f=await fixture(t);await fs.symlink(f.target,path.join(f.root,'Alias'),'dir');
  await fs.symlink(path.join(f.root,'Alias'),path.join(f.vault,'External'),'dir');
  assert.equal(await f.service.shortcutTarget('External'),f.target);
  await fs.symlink(f.vault,path.join(f.vault,'Loop'),'dir');
  await assert.rejects(f.service.shortcutTarget('Loop'),code('loop'));
});

test('broken shortcuts do not prevent choosing overlapping external targets',async t=>{
  const f=await fixture(t);
  await fs.symlink(path.join(f.target,'not-created-yet'),path.join(f.vault,'Existing'),'dir');
  await f.service.add('','External',f.target);
  assert.equal((await fs.lstat(path.join(f.vault,'Existing'))).isSymbolicLink(),true);
});


test('non-cyclic nested shortcuts and repeated references remain valid',async t=>{
  const f=await fixture(t);const shared=path.join(f.root,'Shared');await fs.mkdir(shared);await fs.writeFile(path.join(shared,'kept.txt'),'Keep');
  await fs.symlink(shared,path.join(f.target,'One'),'dir');await fs.symlink(shared,path.join(f.target,'Two'),'dir');
  await f.service.add('','External',f.target);
  assert.equal(await fs.readFile(path.join(f.vault,'External','Two','kept.txt'),'utf8'),'Keep');
  await fs.symlink(f.target,path.join(shared,'Cycle'),'dir');
  await assert.rejects(f.service.add('','Cycle',f.target),code('loop'));
});

test('aliases are validated separately when their logical ignore rules differ',async t=>{
  const f=await fixture(t,p=>p==='External/One/Loop');
  const shared=path.join(f.root,'Shared');await fs.mkdir(shared);
  await fs.symlink(shared,path.join(f.target,'One'),'dir');
  await fs.symlink(shared,path.join(f.target,'Two'),'dir');
  await fs.symlink(shared,path.join(shared,'Loop'),'dir');
  await assert.rejects(f.service.add('','External',f.target),code('loop'));
  await assert.rejects(fs.lstat(path.join(f.vault,'External')),error=>error.code==='ENOENT');
});

test('an internal destination alias cannot conceal a folder loop or protected location',async t=>{
  const f=await fixture(t);const inside=path.join(f.vault,'Inside');await fs.mkdir(inside);
  await fs.symlink(inside,path.join(f.vault,'Alias'),'dir');
  await assert.rejects(f.service.add('Alias','Loop',inside),code('loop'));
  await assert.rejects(fs.lstat(path.join(inside,'Loop')),error=>error.code==='ENOENT');
  await fs.mkdir(path.join(f.vault,'.obsidian'));
  await fs.symlink(path.join(f.vault,'.obsidian'),path.join(f.vault,'SettingsAlias'),'dir');
  await assert.rejects(f.service.add('SettingsAlias','External',f.target),code('location'));
  await f.service.add('Alias','External',f.target);
  assert.equal(await fs.readFile(path.join(inside,'External','original.txt'),'utf8'),'Original');
});
