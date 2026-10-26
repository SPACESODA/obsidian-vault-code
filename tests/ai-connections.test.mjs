import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const platform = {isDesktop:true,isWin:false,isMacOS:true};
globalThis.__aiPlatform=platform;
async function load(entry) {
  const compiled=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian-test',setup(b){
    b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
      export const Platform=globalThis.__aiPlatform;
      export class App {} export class TFile {} export class FileSystemAdapter {}
      export const getLanguage=()=> 'en'; export const requireApiVersion=()=>true;
      export const requestUrl=(options)=>globalThis.__mobileRequest(options);
    `}));
  }}]});
  const mod={exports:{}}; new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,require);return mod.exports;
}
const core=await load('src/ai-connections.ts');
const {AIService}=await load('src/ai-service.ts');
const connection={id:'test-provider',name:'Test provider',kind:'api',baseUrl:'https://example.test/v1',format:'chat-completions',models:['test-model']};
const local={...connection,id:'local-model',kind:'local',baseUrl:'http://127.0.0.1:1337/v1'};
function harness({config=connection,chunks=['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'],status=200,contentType='text/event-stream',key='test-secret',hold=false}={}) {
  const requests=[];const secrets=new Map(key?[[core.connectionSecretId(config.id),key]]:[]);
  const networking={request(url,options,callback){
    const req=new EventEmitter();
    req.end=body=>{requests.push({url,options,body:body?JSON.parse(body):undefined});
      const respond=()=>callback({statusCode:status,headers:{'content-type':contentType},async *[Symbol.asyncIterator](){for(const text of chunks){await new Promise(r=>setImmediate(r));yield new TextEncoder().encode(text)}}});
      if(!hold)queueMicrotask(respond);else req.respond=respond;
    };
    options.signal.addEventListener('abort',()=>req.emit('error',new Error('aborted')),{once:true});
    return req;
  }};
  globalThis.window={setTimeout,clearTimeout,process:{env:{HOME:'/fake',PATH:'/usr/bin'}},require(name){if(name==='http'||name==='https')return networking;throw new Error('CLI runtime must not be used for direct models')}};
  const app={secretStorage:{getSecret:id=>secrets.get(id)||null},vault:{configDir:'.obsidian',adapter:{exists:async()=>false}}};
  const plugin={settings:{enableAIChat:true,aiConnections:[config],aiProvider:core.connectionProvider(config.id)},saveSettings:async()=>{}};
  const service=new AIService(app,plugin);
  const send=(extra={})=>new Promise(resolve=>service.sendMessage({provider:core.connectionProvider(config.id),model:'test-model',prompt:'Question',scope:'active-note',mode:'safe',onDone:text=>resolve({text}),onError:error=>resolve({error}),...extra}));
  return {service,send,requests,app,plugin};
}

test('presets include Atomic Chat, CC Switch, Chinese providers, and unrestricted custom entries',()=>{
  assert.equal(core.CONNECTION_PRESETS.find(p=>p.id==='atomic').baseUrl,'http://127.0.0.1:1337/v1');
  assert.equal(core.CONNECTION_PRESETS.find(p=>p.id==='ccswitch').baseUrl,'http://127.0.0.1:15721/v1');
  for(const id of ['deepseek','qwen','kimi','glm','minimax','siliconflow','ccswitch','custom-api','custom-local']) assert.ok(core.CONNECTION_PRESETS.some(p=>p.id===id));
});
test('manual model IDs preserve provider-qualified names and remove duplicates',()=>assert.deepEqual(core.parseModelIds('org/model\ncustom-model,org/model'),['org/model','custom-model']));
test('endpoint construction preserves custom paths and query parameters',()=>assert.equal(core.endpointUrl('https://host.test/custom/v1/?api-version=test','models'),'https://host.test/custom/v1/models?api-version=test'));
test('invalid URLs, embedded credentials, and credential headers are rejected',()=>{
  for(const patch of [{baseUrl:'file:///tmp/model'},{baseUrl:'https://key:secret@host.test/v1'},{headers:{Authorization:'secret'}},{headers:{'x-subscription-key':'secret'}},{baseUrl:'https://host.test/v1?api_key=secret'},{headers:{Host:'evil'}},{headers:{'x-test':'a\r\nb'}}])assert.throws(()=>core.validateConnection({...connection,...patch}));
});
test('three API formats build the correct endpoints and authentication',()=>{
  for(const [format,path,header] of [['chat-completions','chat/completions','Authorization'],['responses','responses','Authorization'],['anthropic','messages','x-api-key']]){
    const r=core.buildDirectRequest({...connection,format},'test-model','secret',[{role:'user',content:'Hello'}],'System',true);
    assert.equal(r.url,`https://example.test/v1/${path}`);assert.ok(r.headers[header]);assert.equal(r.body.stream,true);
  }
});
test('local servers omit authorization when no key is configured',()=>{
  const r=core.buildDirectRequest(local,'test-model',null,[{role:'user',content:'Hi'}],'System',true);assert.equal(r.headers.Authorization,undefined);
});
test('SSE parsing handles split chunks, CRLF, and multiline data',()=>{
  const parts=[];const p=new core.ModelEventParser(t=>parts.push(t));
  const data='data: {"choices":\r\ndata: [{"delta":{"content":"Hello"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  for(const ch of data)p.push(ch);p.finish();assert.deepEqual(parts,['Hello']);
});
test('Responses and Anthropic text events are supported without final-text duplication',()=>{
  const parts=[];const p=new core.ModelEventParser(t=>parts.push(t));
  for(const event of [{type:'response.output_text.delta',delta:'A'},{type:'response.completed',response:{output_text:'A'}},{type:'content_block_delta',delta:{type:'text_delta',text:'B'}}])p.push(`data: ${JSON.stringify(event)}\n\n`);
  assert.deepEqual(parts,['A','B']);
});
test('streamed provider errors are failures rather than successful partial responses',()=>{
  const p=new core.ModelEventParser(()=>{});assert.throws(()=>p.push('data: {"type":"error","error":{"message":"quota exceeded"}}\n\n'),/quota exceeded/);
});
test('reviewed edits reject concurrent note changes',()=>{
  assert.equal(core.reviewedContent('original','original','proposal'),'proposal');
  assert.throws(()=>core.reviewedContent('changed','original','proposal'),/note changed/);
});
test('edit proposals require valid structured text and preserve empty replacements',()=>{
  assert.deepEqual(core.extractEditProposal('Explanation\n```vault-code-edit\n{"content":""}\n```'),{content:'',explanation:'Explanation'});
  assert.equal(core.extractEditProposal('```vault-code-edit\n{"content":1}\n```'),null);
});
test('direct requests stream without launching any CLI',async()=>{
  const h=harness();assert.equal((await h.send()).text,'Hello');assert.equal(h.requests.length,1);
});
test('multi-turn history and attached context are sent once without empty placeholder messages',async()=>{
  const h=harness();await h.send({history:[{role:'user',content:'Earlier'},{role:'assistant',content:'Previous reply'}],activeFile:{path:'Note.md'},activeContent:'Note content'});
  const m=h.requests[0].body.messages;assert.equal(m.length,4);assert.equal(m[1].content,'Earlier');assert.equal(m[2].content,'Previous reply');assert.match(m[3].content,/Note content/);
});
test('API keys never enter provider metadata, history, or request bodies',async()=>{
  const h=harness();await h.send();assert.equal(h.requests[0].options.headers.Authorization,'Bearer test-secret');
  assert.ok(!JSON.stringify(h.plugin.settings).includes('test-secret'));assert.ok(!JSON.stringify(h.requests[0].body).includes('test-secret'));
});
test('HTTP failures redact a server echo of the API key',async()=>{
  const h=harness({status:401,contentType:'application/json',chunks:['{"error":{"message":"invalid test-secret"}}']});
  const r=await h.send();assert.match(r.error.message,/\[redacted\]/);assert.ok(!r.error.message.includes('test-secret'));
});
test('non-streaming responses from compatible servers still work',async()=>{
  const h=harness({config:local,key:null,contentType:'application/json',chunks:['{"choices":[{"message":{"content":"Local reply"}}]}']});assert.equal((await h.send()).text,'Local reply');
});
test('direct models refuse unsupported vault scope',async()=>{
  const h=harness();assert.match((await h.send({scope:'vault'})).error.message,/attached-note/);assert.equal(h.requests.length,0);
});
test('keyless compatible endpoints are supported, while removed connections fail before sending',async()=>{
  const h=harness({key:null});assert.equal((await h.send()).text,'Hello');assert.equal(h.requests[0].options.headers.Authorization,undefined);
  h.plugin.settings.aiConnections=[];assert.match((await h.send()).error.message,/removed/);assert.equal(h.requests.length,1);
});

test('connection tests contain only a short synthetic prompt, no vault data',async()=>{
  const h=harness();await h.service.testConnection(connection);assert.match(JSON.stringify(h.requests[0].body),/exactly OK/);assert.ok(!JSON.stringify(h.requests[0].body).includes('Context:'));
});
test('model discovery merges no guessed model IDs',async()=>{
  const h=harness({contentType:'application/json',chunks:['{"data":[{"id":"loaded-model"},{"id":"org/another-model"}]}']});
  assert.deepEqual((await h.service.discoverConnectionModels(connection)).map(m=>m.id),['loaded-model','org/another-model']);assert.equal(h.requests[0].body,undefined);
});
test('model discovery parses both data and models arrays from local routers',async()=>{
  const h=harness({contentType:'application/json',chunks:['{"models":[{"id":"model-a"},{"model":"model-b"},"model-c"]}']});
  assert.deepEqual((await h.service.discoverConnectionModels(connection)).map(m=>m.id),['model-a','model-b','model-c']);
});
test('cancelling a direct request suppresses error and completion callbacks',async()=>{
  const h=harness({hold:true});let callbacks=0;
  const handle=h.service.sendMessage({provider:'connection:test-provider',prompt:'Hi',scope:'active-note',mode:'safe',onDone:()=>callbacks++,onError:()=>callbacks++});
  await new Promise(r=>setImmediate(r));handle.kill();await new Promise(r=>setImmediate(r));assert.equal(callbacks,0);
});
test('mobile uses non-streaming Obsidian networking with no Node dependency',async()=>{
  platform.isDesktop=false;
  try{
    const h=harness({config:local,key:null});let mobileBody;
    globalThis.__mobileRequest=async o=>{mobileBody=JSON.parse(o.body);return {status:200,headers:{'content-type':'application/json'},text:'{"choices":[{"message":{"content":"Mobile reply"}}]}'};};
    assert.equal((await h.send()).text,'Mobile reply');assert.equal(mobileBody.stream,false);assert.equal(h.requests.length,0);
  }finally{platform.isDesktop=true;}
});

test('loaded metadata strips unexpected secret fields and ignores invalid configurations',()=>{
  const result=core.normalizeConnections([{...connection,apiKey:'do-not-save',models:['custom','custom',123]},null,{id:'bad',models:[]},{...connection,id:'bad-headers',headers:{Authorization:'do-not-save'}}]);
  assert.equal(result.length,1);assert.deepEqual(result[0].models,['custom']);assert.ok(!JSON.stringify(result).includes('do-not-save'));
});
test('truncated model responses are surfaced instead of presenting a completed edit',()=>{
  const p=new core.ModelEventParser(()=>{});assert.throws(()=>p.push('data: {"choices":[{"finish_reason":"length","delta":{}}]}\n\n'),/output limit/);
});


test('local Ollama servers are excluded from the CLI update queue',async()=>{
  const h=harness();h.service.detectAllAgents=async()=>[{id:'ollama',name:'Ollama',isInstalled:true}];
  h.service.updateAgent=async()=>{throw new Error('Local servers should not be updated from CLI settings')};
  assert.equal((await h.service.updateAllConnectedAgents()).total,0);
});

test('quoted selection context is sent once without exposing the rest of the source',async()=>{
  const h=harness();
  const prompt='Explain this\n\n> **Note/test.md · L2**\n>\n> selected snippet';
  await h.send({prompt,contextInPrompt:true,activeFile:{path:'Note/test.md'},activeContent:'PRIVATE BEFORE\nselected snippet\nPRIVATE AFTER',selectedText:'selected snippet',mode:'edit'});
  const messages=h.requests[0].body.messages;
  assert.equal(messages.at(-1).content,prompt);
  assert.equal((JSON.stringify(messages).match(/selected snippet/g)||[]).length,1);
  assert.ok(!JSON.stringify(messages).includes('PRIVATE'));
  assert.match(messages[0].content,/replace only that snippet/);
});
