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
  const owner={ready:false,initializeIgnoreFiltering:()=>new Promise(resolve=>{finish=()=>{owner.ready=true;resolve();};}),registerView:(type,create)=>{opened.push(type);create({});}};
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
