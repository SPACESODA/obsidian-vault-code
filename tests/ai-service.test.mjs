import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const compiled = await build({
  entryPoints: ['src/ai-service.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'obsidian-test', setup(b) {
    b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export const Platform = { isDesktop: true, isWin: false, isMacOS: true };
      export class App {} export class TFile {} export class FileSystemAdapter {}
      export const getLanguage = () => 'en'; export const requireApiVersion = () => true;
    ` }));
  } }],
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(mod, mod.exports, require);
const { AIService, AGENT_INSTALL_CONFIGS } = mod.exports;

function harness({ bins = {}, execute, output = 'Hello\n', stderr = '', code = 0, filesystem } = {}) {
  const calls = [];
  const spawned = [];
  const cp = {
    execFile(file, args, options, callback) {
      calls.push({ file, args, options });
      if (args[0] === '-ilc') return callback(null, '\nVAULT_CODE_PATH=/custom/node/bin:/usr/bin\n', '');
      if (file === 'which') return callback(bins[args[0]] ? null : new Error('missing'), bins[args[0]] || '', '');
      if (execute) {
        const answer = execute(file, args, options);
        if (answer) return callback(answer.error || null, answer.stdout || '', answer.stderr || '');
      }
      callback(null, '1.2.3\n', '');
    },
    spawn(file, args, options) {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.stdin = { end() { child.ended = true; }, write() {} };
      child.kill = () => true;
      spawned.push({ file, args, options, child });
      setImmediate(() => {
        child.stdout.emit('data', output); child.stderr.emit('data', stderr);
        child.emit('close', code);
      });
      return child;
    },
  };
  globalThis.window = {
    process: { env: { HOME: '/nonexistent-vault-code-test', PATH: '/usr/bin', SHELL: '/bin/zsh' } },
    require: name => name === 'child_process' ? cp : name === 'fs' ? filesystem || { existsSync: () => false } : require(name),
    setTimeout,
  };
  const app = { vault: { adapter: { getBasePath: () => '/tmp/test vault', exists: async () => false }, configDir: '.obsidian' } };
  const service = new AIService(app);
  function send(provider, extra = {}) {
    return new Promise(resolve => {
      const outcomes = [];
      service.sendMessage({ provider, model: 'default', prompt: 'hello', scope: 'active-note', mode: 'safe',
        onDone: text => { outcomes.push('done'); resolve({ text, outcomes }); },
        onError: error => { outcomes.push('error'); resolve({ error, outcomes }); }, ...extra });
    });
  }
  return { service, calls, spawned, send };
}

test('Cursor detection and execution use agent instead of the editor launcher', async () => {
  const h = harness({ bins: { cursor: '/fake/cursor', agent: '/fake/agent' }, output: '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}\n' });
  assert.equal((await h.service.detectAllAgents()).find(a => a.id === 'cursor').path, '/fake/agent');
  const result = await h.send('cursor');
  assert.equal(result.text, 'Hi');
  assert.equal(h.spawned[0].file, '/fake/agent');
  assert.ok(h.spawned[0].child.ended);
  assert.ok(!h.spawned[0].args.includes('--model'));
});

test('Cursor accepts cursor-agent fallback without detecting the editor', async () => {
  const h = harness({ bins: { cursor: '/fake/cursor', 'cursor-agent': '/fake/cursor-agent' } });
  assert.equal((await h.service.detectAllAgents()).find(a => a.id === 'cursor').path, '/fake/cursor-agent');
});

test('failed version checks retain executable presence with a diagnostic', async () => {
  const h = harness({ bins: { claude: '/fake/claude' }, execute: (f,a) => a[0] === '--version' ? { error: new Error('bad runtime'), stderr: 'node missing' } : null });
  const agent = (await h.service.detectAllAgents()).find(a => a.id === 'claude');
  assert.equal(agent.isInstalled, true);
  assert.equal(agent.diagnostic, 'node missing');
  assert.equal(agent.version, 'Version check failed');
});

test('CLI discovery recovers login shell PATH and does not hard-code a Node version', async () => {
  const h = harness({ bins: { claude: '/fake/claude' } });
  await h.service.detectBinaryPath('claude');
  const path = h.calls.find(c => c.file === 'which').options.env.PATH;
  assert.ok(path.startsWith('/custom/node/bin:'));
  assert.ok(!path.includes('v24.13.0'));
});

test('nonzero exits remain failures even after stdout', async () => {
  const h = harness({ bins: { claude: '/fake/claude' }, output: 'partial reply\n', stderr: 'Authentication required', code: 1 });
  const r = await h.send('claude');
  assert.match(r.error.message, /Authentication required/);
  assert.deepEqual(r.outcomes, ['error']);
});

test('Codex plain error events are surfaced even with exit code zero', async () => {
  const h = harness({ bins: { codex: '/fake/codex' }, output: '{"type":"error","message":"Model is unavailable"}\n' });
  assert.match((await h.send('codex')).error.message, /Model is unavailable/);
});

test('Codex turn.failed errors cannot be hidden by partial assistant output', async () => {
  const output = [ {type:'item.completed',item:{type:'agent_message',text:'partial'}}, {type:'turn.failed',error:{message:'Quota exceeded'}} ].map(JSON.stringify).join('\n');
  const h = harness({ bins: { codex: '/fake/codex' }, output });
  assert.match((await h.send('codex')).error.message, /Quota exceeded/);
});

test('Codex resume puts global cwd and sandbox options before exec', async () => {
  const h = harness({ bins: { codex: '/fake/codex' }, output: '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' });
  await h.send('codex', { conversationId: '12345678-1234-1234-1234-123456789012' });
  const args = h.spawned[0].args;
  assert.ok(args.indexOf('-C') < args.indexOf('exec'));
  assert.ok(args.indexOf('-s') < args.indexOf('exec'));
  assert.ok(args.includes('resume'));
  assert.ok(!args.includes('-m'));
});

test('Cursor result does not duplicate assistant text or display tool output', async () => {
  const output = [{type:'tool_call',message:{content:[{type:'text',text:'secret tool output'}]}}, {type:'assistant',session_id:'cursor-id',message:{content:[{type:'text',text:'Answer'}]}}, {type:'result',result:'Answer'}].map(JSON.stringify).join('\n');
  const h = harness({ bins: { agent: '/fake/agent' }, output });
  assert.equal((await h.send('cursor')).text, 'Answer');
});

test('OpenCode edit does not pass unsupported --auto', async () => {
  const h = harness({ bins: { opencode: '/fake/opencode' } });
  await h.send('opencode', { mode: 'edit' });
  assert.ok(!h.spawned[0].args.includes('--auto'));
});

test('Ollama uses an installed model rather than assuming llama3.3', async () => {
  const h = harness({ bins: { ollama: '/fake/ollama' }, execute: (f,a) => a[0] === 'list' ? { stdout: 'NAME ID SIZE MODIFIED\nqwen:small abc123def456 1 GB today\n' } : null });
  await h.send('ollama');
  assert.equal(h.spawned[0].args[1], 'qwen:small');
});

test('Ollama reports missing local models without launching a request', async () => {
  const h = harness({ bins: { ollama: '/fake/ollama' }, execute: (f,a) => a[0] === 'list' ? { stdout: 'NAME ID SIZE MODIFIED\n' } : null });
  assert.match((await h.send('ollama')).error.message, /pull/);
  assert.equal(h.spawned.length, 0);
});

test('OpenCode discovers provider-qualified IDs', async () => {
  const h = harness({ bins: { opencode: '/fake/opencode' }, execute: (f,a) => a[0] === 'models' ? { stdout: 'openai/example\nanthropic/another\n' } : null });
  assert.deepEqual((await h.service.getModelsForProvider('opencode')).map(m => m.id), ['default', 'openai/example', 'anthropic/another']);
});

test('Pi discovery preserves provider qualification', async () => {
  const h = harness({ bins: { pi: '/fake/pi' }, execute: (f,a) => a[0] === '--list-models' ? { stdout: 'provider model context\nopenai sample-model 128k\n' } : null });
  assert.deepEqual((await h.service.getModelsForProvider('pi')).map(m => m.id), ['default', 'openai/sample-model']);
});

test('install success requires a discoverable executable', async () => {
  const h = harness({ bins: { npm: '/fake/npm' } });
  const r = await h.service.installAgent('copilot');
  assert.equal(r.success, false);
  assert.match(r.message, /executable was not found/);
  assert.ok(h.calls.some(c => c.args.includes('@github/copilot@latest')));
});

test('shell installers run with pipefail so failed downloads cannot count as success', async () => {
  const h = harness({ execute: f => f === '/bin/bash' ? { error: new Error('curl failed'), stderr: 'TLS error' } : null });
  const r = await h.service.installAgent('cursor');
  assert.equal(r.success, false);
  assert.match(r.message, /TLS error/);
  assert.deepEqual(h.calls.find(c => c.file === '/bin/bash').args.slice(0,3), ['-o', 'pipefail', '-c']);
});

test('update queue is serial and accounts for every installed provider', async () => {
  const h = harness();
  h.service.detectAllAgents = async () => [{id:'claude',name:'Claude'}, {id:'codex',name:'Codex'}, {id:'ollama',name:'Ollama'}].map(a=>({...a,isInstalled:true}));
  const order = []; let active = 0;
  h.service.updateAgent = async id => {
    assert.equal(active++, 0); order.push(id);
    await new Promise(r => setImmediate(r)); active--;
    return { success: id !== 'ollama', message: 'manual update required' };
  };
  const starts = [];
  const r = await h.service.updateAllConnectedAgents(undefined, a => starts.push(a.id));
  assert.deepEqual(order, ['claude','codex','ollama']);
  assert.deepEqual(starts, order);
  assert.equal(r.total, 3); assert.equal(r.updated, 2); assert.equal(r.failed, 1); assert.equal(r.results.length, 3);
});

test('sign-in checks distinguish installed from authenticated', async () => {
  const h = harness({ bins: { claude:'/fake/claude', codex:'/fake/codex', agent:'/fake/agent' }, execute: (f,a) => {
    if (a[0] === 'auth') return { stdout:'{"loggedIn":true}' };
    if (a[0] === 'login') return { stdout:'Logged in using ChatGPT' };
    if (a[0] === 'models') return { error:new Error('auth'), stderr:'Authentication required' };
  } });
  const agents = await h.service.detectAllAgents();
  assert.equal(agents.find(a=>a.id==='claude').connectionStatus, 'Signed in');
  assert.equal(agents.find(a=>a.id==='codex').connectionStatus, 'Signed in');
  assert.equal(agents.find(a=>a.id==='cursor').connectionStatus, 'Sign-in required');
});

test('an installer is successful only after executable version verification', async () => {
  const h = harness({ bins: { copilot:'/fake/copilot', npm:'/fake/npm' } });
  const r = await h.service.installAgent('copilot');
  assert.equal(r.success, true);
  assert.ok(h.calls.some(c=>c.file==='/fake/copilot' && c.args[0]==='version'));
});

test('a broken executable after installation is reported as failure', async () => {
  const h = harness({ bins:{copilot:'/fake/copilot',npm:'/fake/npm'}, execute:(f,a)=> a[0]==='version' ? {error:new Error('bad runtime'),stderr:'incompatible Node runtime'}:null });
  const r = await h.service.installAgent('copilot');
  assert.equal(r.success, false);
  assert.match(r.message, /incompatible Node/);
});

test('native Claude update targets its detected executable', async () => {
  const h = harness({ bins:{claude:process.execPath} });
  const r = await h.service.updateAgent('claude');
  assert.equal(r.success,true);
  assert.ok(h.calls.some(c=>c.file===process.execPath && c.args[0]==='update'));
});

test('cancelling during asynchronous setup never launches a process', async () => {
  const h = harness({ bins:{claude:'/fake/claude'} });
  h.service.sendMessage({provider:'claude',prompt:'hi',scope:'active-note',mode:'safe'}).kill();
  await new Promise(r=>setImmediate(r));
  assert.equal(h.spawned.length,0);
});

test('zero exit with empty output is actionable failure', async () => {
  const h = harness({ bins:{claude:'/fake/claude'},output:'' });
  assert.match((await h.send('claude')).error.message,/returned no response/);
});

test('an updater rejection does not abort the remaining queue', async () => {
  const h = harness();
  h.service.detectAllAgents = async()=>[{id:'claude',name:'Claude',isInstalled:true},{id:'copilot',name:'Copilot',isInstalled:true}];
  h.service.updateAgent = async id => { if(id==='claude') throw new Error('failed to launch'); return {success:true,message:'ok'}; };
  const r=await h.service.updateAllConnectedAgents();
  assert.equal(r.failed,1); assert.equal(r.updated,1); assert.equal(r.results.length,2);
});

test('Copilot edit mode permits headless tools and safe mode denies writes and shell', async () => {
  const h=harness({bins:{copilot:'/fake/copilot'}});
  await h.send('copilot',{mode:'edit'}); await h.send('copilot',{mode:'safe'});
  assert.ok(h.spawned[0].args.includes('--allow-all-tools'));
  assert.ok(h.spawned[1].args.includes('--deny-tool=write'));
  assert.ok(h.spawned[1].args.includes('--deny-tool=shell'));
});


test('desktop updates use Obsidian window.require for filesystem access', async () => {
  const h = harness({ bins: {claude:'/fake/claude'}, filesystem: {
    existsSync: () => false, realpathSync: () => '/native/claude',
  } });
  assert.equal((await h.service.updateAgent('claude')).success, true);
  assert.ok(h.calls.some(c => c.file === '/fake/claude' && c.args[0] === 'update'));
});

test('Cursor prefers its unique binary when another provider owns agent', async () => {
  const h = harness({ bins: {agent:'/fake/grok/agent','cursor-agent':'/fake/cursor-agent'} });
  assert.equal((await h.service.detectAllAgents()).find(a => a.id === 'cursor').path, '/fake/cursor-agent');
});


test('providers without an authentication check have no connection subtitle', async () => {
  const h = harness({bins:{pi:'/fake/pi',agy:'/fake/agy',opencode:'/fake/opencode'}});
  const agents = await h.service.detectAllAgents();
  for (const id of ['pi','antigravity','opencode']) assert.equal(agents.find(a=>a.id===id).connectionStatus,undefined);
});

test('failed sign-in checks do not produce unverified status text', async () => {
  const h = harness({bins:{claude:'/fake/claude'},execute:(f,a)=>a[0]==='auth'?{error:new Error('timeout'),stderr:'request timed out'}:null});
  assert.equal((await h.service.detectAllAgents()).find(a=>a.id==='claude').connectionStatus,undefined);
});

test('Ollama status only shows confirmed service or model information', async () => {
  for (const [answer, expected] of [
    [{stdout:'NAME ID SIZE MODIFIED\n'},'Download a model'],
    [{error:new Error('unavailable'),stderr:'connection refused'},'Start Ollama'],
    [{error:new Error('denied'),stderr:'operation not permitted'},undefined],
  ]) {
    const h = harness({bins:{ollama:'/fake/ollama'},execute:(f,a)=>a[0]==='list'?answer:null});
    assert.equal((await h.service.detectAllAgents()).find(a=>a.id==='ollama').connectionStatus,expected);
  }
});
