import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['src/file-view-memory.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
const {FileViewMemory,newFileViewPosition}=mod.exports;
test('file views keep separate code and preview scroll positions for the current session',()=>{
 const memory=new FileViewMemory();const a=newFileViewPosition();a.preview=true;a.code.top=230;a.frame.top=870;
 memory.set('a.html',a);assert.equal(memory.get('a.html').frame.top,870);assert.equal(memory.get('a.html').code.top,230);
 assert.deepEqual(memory.get('b.html'),newFileViewPosition());assert.deepEqual(new FileViewMemory().get('a.html'),newFileViewPosition());
});
test('duplicate tabs receive independent snapshots, without changing another tab or cached values',()=>{
 const memory=new FileViewMemory();const first=newFileViewPosition();first.code.top=300;memory.set('a.md',first);
 const second=memory.get('a.md');second.code.top=900;first.code.top=20;
 assert.equal(memory.get('a.md').code.top,300);memory.set('a.md',second);second.code.top=0;
 assert.equal(memory.get('a.md').code.top,900);
});
test('renaming files and folders carries preferences, while deletion forgets only that subtree',()=>{
 const memory=new FileViewMemory();const state=newFileViewPosition();state.preview=true;
 for(const path of ['dir/a.html','dir/sub/b.svg','directory/c.html'])memory.set(path,state);
 memory.rename('dir','new');assert.equal(memory.get('new/sub/b.svg').preview,true);assert.equal(memory.get('dir/a.html').preview,false);
 memory.rename('new/a.html','new/a.htm');assert.equal(memory.get('new/a.htm').preview,true);
 memory.forget('new');assert.equal(memory.get('new/a.htm').preview,false);assert.equal(memory.get('directory/c.html').preview,true);
});
test('session memory stays bounded and retains the most recently saved preferences',()=>{
 const memory=new FileViewMemory(2);const state=newFileViewPosition();state.code.top=7;
 memory.set('a',state);memory.set('b',state);memory.set('a',state);memory.set('c',state);
 assert.equal(memory.get('b').code.top,0);assert.equal(memory.get('a').code.top,7);assert.equal(memory.get('c').code.top,7);
});

// Exercise the actual view-mode path: code-only files used to return before restoration.
const {readFileSync}=await import('node:fs');
const {default:ts}=await import('typescript');
const source=readFileSync('src/main.ts','utf8');
const ast=ts.createSourceFile('src/main.ts',source,ts.ScriptTarget.Latest,true);
const view=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='DotfileView');
const methods=['updateViewModeUI','restoreFileScroll','cancelScrollRestore','rememberFileView','capturePreviewScroll','updateGitStatus'].map(name=>view.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name).getText(ast));
const output=ts.transpileModule(`class Subject {${methods.join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText;
const Subject=new Function('t',`${output};return Subject;`)(key=>key);
test('ordinary code files restore both scroll axes through the actual mode update, without edits',()=>{
 for(const extension of ['js','css','txt','md','py','']){
  const subject=new Subject();const file={path:'test.'+extension,extension};let frame;
  const scroll={top:0,left:0};
  Object.assign(subject,{file,positionFile:file,isPreviewMode:false,isCompiledMode:false,previewGeneration:0,scrollRestoreFrame:null,
   viewPosition:{...newFileViewPosition(),code:{top:600,left:35}},
   contentEl:{win:{requestAnimationFrame:callback=>{frame=callback;return 1;},cancelAnimationFrame(){}}},
   editor:{scrollDOM:{scrollTo:point=>Object.assign(scroll,point)}},
   isPreviewable:()=>false,updateDirtyUI(){},getLanguageLabel:()=>extension,
  });
  subject.updateViewModeUI();assert.equal(typeof frame,'function',extension);frame();
  assert.equal(scroll.top,600,extension);assert.equal(scroll.left,35,extension);
 }
});

test('closing a detached editor preserves its last live scroll snapshot instead of saving zero',()=>{
 const subject=new Subject();const file={path:'test.js'};const memory=new FileViewMemory();
 const scroller={scrollTop:650,scrollLeft:35,clientHeight:500};const dom={isConnected:true};
 Object.assign(subject,{file,positionFile:file,viewWasActive:true,isPreviewMode:false,isCompiledMode:false,scrollRestoreFrame:null,
  viewPosition:newFileViewPosition(),editor:{dom,scrollDOM:scroller},
  plugin:{fileViewMemory:memory},app:{vault:{getAbstractFileByPath:()=>file}},
 });
 subject.rememberFileView();assert.equal(memory.get(file.path).code.top,650);
 dom.isConnected=false;scroller.clientHeight=0;scroller.scrollTop=0;scroller.scrollLeft=0;
 subject.rememberFileView();assert.equal(memory.get(file.path).code.top,650);assert.equal(memory.get(file.path).code.left,35);
});

test('closing a file while its Git status is loading cannot access a cleared file',async()=>{
 const subject=new Subject();let finish;let queried=0;
 Object.assign(subject,{file:{path:'test.js'},isDiffMode:false,plugin:{isGitAvailable:()=>true,isFileSupportedForGitDiff:()=>true,
  gitService:{isGitRepo:()=>new Promise(resolve=>{finish=resolve;}),getFileDiffStats:()=>{queried++;}},
 }});
 const pending=subject.updateGitStatus();subject.file=null;finish(true);await pending;assert.equal(queried,0);
});
