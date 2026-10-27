import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync('src/main.ts','utf8');
const ast=ts.createSourceFile('src/main.ts',source,ts.ScriptTarget.Latest,true);
const plugin=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='VaultCodePlugin');
const onload=plugin.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)==='onload');
const statements=[];
for(const statement of onload.body.statements){if(ts.isIfStatement(statement)&&statement.getText(ast).includes("this.statusBarGitEl"))break;statements.push(statement.getText(ast));}
const start=new Function('Platform','AIService','AIStorage','VIEW_TYPE_DOTFILE','VIEW_TYPE_AI_CHAT','DotfileView','AIChatView',`return async function(){${statements.join('\n')}};`)({isDesktop:false},class{},class{},'code','chat',class{constructor(_leaf,plugin){assert.equal(plugin.ready,true);}},class{constructor(_leaf,plugin){assert.equal(plugin.ready,true);}});

test('settings and ignore initialization finish before restored views can open',async()=>{
  let finish;
  const opened=[];
  const owner={ready:false,syncAIChatFeatures(){},initializeIgnoreFiltering:()=>new Promise(resolve=>{finish=()=>{owner.ready=true;resolve();};}),registerView:(type,create)=>{opened.push(type);create({});}};
  const pending=start.call(owner);
  assert.deepEqual(opened,[]);
  finish();await pending;
  assert.deepEqual(opened,['code','chat']);
});

test('chat Enter confirms IME composition without sending a message',()=>{
  const text=readFileSync('src/ai-chat-view.ts','utf8');
  const chat=ts.createSourceFile('src/ai-chat-view.ts',text,ts.ScriptTarget.Latest,true);
  let handler;
  function visit(node){
    if(ts.isCallExpression(node)&&node.expression.getText(chat)==='this.inputEl.addEventListener'&&node.arguments[0]?.text==='keydown')handler=node.arguments[1];
    ts.forEachChild(node,visit);
  }
  visit(chat);assert.ok(handler);
  const output=ts.transpileModule(`const handler=${handler.getText(chat)};`,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText;
  let sends=0,prevented=0;const view={handleSubmit:()=>{sends++;}};
  const callback=new Function(`${output};return handler;`).call(view);
  callback.call(view,{key:'Enter',shiftKey:false,isComposing:true,preventDefault:()=>{prevented++;}});
  assert.equal(sends,0);assert.equal(prevented,0);
  callback.call(view,{key:'Enter',shiftKey:false,isComposing:false,preventDefault:()=>{prevented++;}});
  assert.equal(sends,1);assert.equal(prevented,1);
  callback.call(view,{key:'Enter',shiftKey:true,isComposing:false});assert.equal(sends,1);
});

test('ready layouts restore code editors once, and delayed callbacks stop after unload',async()=>{
  const layoutStatements=onload.body.statements.filter(statement=>{
    const text=statement.getText(ast);
    return text.startsWith('this.app.workspace.onLayoutReady(')||text.startsWith('if (this.app.workspace.layoutReady)');
  });
  const setup=new Function('Platform','VIEW_TYPE_AI_CHAT',`return function(){${layoutStatements.map(statement=>statement.getText(ast)).join('\n')}};`)({isDesktop:false},'chat');
  for(const ready of [true,false]){
    let callback;let restores=0;
    const owner={unloading:false,settings:{showHiddenFiles:false},app:{workspace:{layoutReady:ready,detachLeavesOfType(){},onLayoutReady(fn){if(ready)void fn();else callback=fn;}}},patchFileExplorer(){},updateAllLeafHeaderActions(){},async reloadCodeEditorLeaves(){restores++;}};
    setup.call(owner);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(restores,ready?1:0);
    if(!ready){owner.unloading=true;await callback();assert.equal(restores,0);}
  }
});

test('a failed file creation never falls back to overwriting the destination',async()=>{
  const method=plugin.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)==='createFileWithFolders');
  const output=ts.transpileModule(`class Subject {${method.getText(ast)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText;
  const Subject=new Function('normalizePath','isDotPath','TFile','t',`${output};return Subject;`)(path=>path,()=>false,class{},key=>key);
  const subject=new Subject();let writes=0;
  subject.app={vault:{adapter:{exists:async()=>false,write:async()=>{writes++;}},create:async()=>{throw Error('Another process created this file');}}};
  await assert.rejects(subject.createFileWithFolders('example.txt'),/Another process/);
  assert.equal(writes,0);
});

test('failed editor saves retain the unsaved indicator and leave a different file alone',async()=>{
  const editor=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='DotfileView');
  const methods=['saveExplicitly','save'].map(name=>editor.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)===name).getText(ast));
  const output=ts.transpileModule(`class Subject extends Base {${methods.join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText;
  class Base {async save(){await this.performSave();}}
  const Subject=new Function('Base',`${output};return Subject;`)(Base);
  for(const method of ['saveExplicitly','save'])for(const switchFile of [false,true]){
    const subject=new Subject();let updates=0;
    Object.assign(subject,{file:{path:'draft.txt'},isModified:true,discardOnClose:false,plugin:{settings:{disableAutoSave:true}},isBinaryOrNonEditable:()=>false,getViewData:()=>'Unsaved draft',updateDirtyUI(){updates++;},async performSave(){if(switchFile){this.file={path:'other.txt'};this.isModified=false;}throw Error('Disk full');}});
    await assert.rejects(subject[method](),/Disk full/);
    assert.equal(subject.isModified,!switchFile);
    assert.equal(updates,switchFile?0:1);
  }
});


test('AI lifecycle unloads helpers while disabled or mobile, and re-enables without duplicates', () => {
  const method = plugin.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'syncAIChatFeatures');
  const output = ts.transpileModule(`class Subject {${method.getText(ast)}}`, { compilerOptions: { target: ts.ScriptTarget.ES2021 } }).outputText;
  const platform = { isDesktop: true };
  class Chat { deactivate() { this.stopped = true; } }
  class Helper {}
  const Subject = new Function('Platform', 'ReadingSelectionChat', 'WebViewerChat', 'AIChatView', 'VIEW_TYPE_AI_CHAT', `${output};return Subject;`)(platform, Helper, Helper, Chat, 'chat');
  const subject = new Subject();
  let additions = 0, removals = 0, suspends = 0, resumes = 0, detached = 0, refreshed = 0;
  const chat = new Chat();
  Object.assign(subject, { settings: { enableAIChat: true }, app: { workspace: { getLeavesOfType: () => [{ view: chat }], detachLeavesOfType() { detached++; } } },
    aiService: { resume() { resumes++; }, suspend() { suspends++; } }, addChild(child) { additions++; return child; }, removeChild() { removals++; },
    addAIChatRibbon() {}, removeAIChatRibbon() {}, refreshSendToChatIcons() { refreshed++; }, updateAllLeafHeaderActions() {} });
  subject.syncAIChatFeatures(); subject.syncAIChatFeatures();
  assert.equal(additions, 2);
  subject.settings.enableAIChat = false; subject.syncAIChatFeatures();
  assert.equal(removals, 2); assert.equal(chat.stopped, true); assert.equal(detached, 1);
  assert.equal(subject.readingSelection, undefined); assert.equal(subject.webViewerChat, undefined);
  subject.settings.enableAIChat = true; platform.isDesktop = false; subject.syncAIChatFeatures();
  assert.equal(additions, 2); assert.equal(suspends, 2);
  platform.isDesktop = true; subject.syncAIChatFeatures();
  assert.equal(additions, 4); assert.equal(resumes, 3); assert.equal(refreshed, 5);
});
