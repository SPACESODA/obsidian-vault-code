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
      export const requestUrl = async () => { throw new Error('Unexpected HTTP request'); };
      export const getLanguage = () => 'en'; export const requireApiVersion = () => true;
    ` }));
  } }],
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(mod, mod.exports, require);
const { AIService, AGENT_INSTALL_CONFIGS } = mod.exports;

function harness({ bins = {}, execute, output = 'Hello\n', stderr = '', code = 0, filesystem, shellExecute } = {}) {
  const calls = [];
  const spawned = [];
  const cp = {
    execFile(file, args, options, callback) {
      calls.push({ file, args, options });
      if (args[0] === '-ilc') {
        const answer = shellExecute?.() || { stdout: '\nVAULT_CODE_PATH=/custom/node/bin:/usr/bin\n' };
        return callback(answer.error || null, answer.stdout || '', '');
      }
      if (file === 'which') return callback(bins[args[0]] ? null : new Error('missing'), bins[args[0]] || '', '');
      if (execute) {
        const answer = execute(file, args, options);
        if (answer?.then) { void answer.then(r => callback(r.error || null, r.stdout || '', r.stderr || '')); return; }
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
    setTimeout, clearTimeout,
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
  h.service.detectAllAgents = async () => [{id:'claude',name:'Claude'}, {id:'codex',name:'Codex'}, {id:'pi',name:'Pi'}].map(a=>({...a,isInstalled:true}));
  const order = []; let active = 0;
  h.service.updateAgent = async id => {
    assert.equal(active++, 0); order.push(id);
    await new Promise(r => setImmediate(r)); active--;
    return { success: id !== 'pi', message: 'manual update required' };
  };
  const starts = [];
  const r = await h.service.updateAllConnectedAgents(undefined, a => starts.push(a.id));
  assert.deepEqual(order, ['claude','codex','pi']);
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
  const installedPath='/fake/native/claude';
  const h = harness({ bins:{claude:installedPath}, filesystem:{existsSync:p=>p===installedPath,realpathSync:p=>p} });
  const r = await h.service.updateAgent('claude');
  assert.equal(r.success,true);
  assert.ok(h.calls.some(c=>c.file===installedPath && c.args[0]==='update'));
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

test('Ollama background checks do not spawn child process when server is not listening', async () => {
  let listExecuted = false;
  const h = harness({
    bins: { ollama: '/usr/local/bin/ollama' },
    filesystem: { existsSync: (p) => p === '/usr/local/bin/ollama', realpathSync: p => p },
    execute: (f, a) => {
      if (a[0] === 'list') {
        listExecuted = true;
        return { stdout: 'NAME ID SIZE MODIFIED\n' };
      }
      return null;
    },
  });
  // Do not depend on whether Ollama or its socket exists on the host/CI runner.
  h.service.resolveNet = async () => ({ createConnection() {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    queueMicrotask(() => socket.emit('error', new Error('connection refused')));
    return socket;
  } });
  const agents = await h.service.detectAllAgents();
  const ollama = agents.find(a => a.id === 'ollama');
  assert.equal(ollama.connectionStatus, 'Start Ollama');
  assert.equal(listExecuted, false, 'ollama list should not be spawned when server is not listening');
});

test('filesystem lookup falls back when the renderer module is missing or malformed', async () => {
  for (const value of [null, {}, { existsSync: true }, { existsSync: () => false }]) {
    const h = harness();
    const originalRequire = window.require;
    window.require = name => name === 'fs' ? value : originalRequire(name);
    const fs = await h.service.resolveFileSystem();
    assert.equal(fs.existsSync(process.execPath), true);
    assert.equal(typeof fs.realpathSync(process.execPath), 'string');
  }
  const h = harness();
  const originalRequire = window.require;
  window.require = name => { if (name === 'fs') throw new Error('Renderer loader unavailable'); return originalRequire(name); };
  assert.equal((await h.service.resolveFileSystem()).existsSync(process.execPath), true);
});

test('socket lookup falls back when the renderer module is malformed', async () => {
  for (const value of [null, {}, { createConnection: false }]) {
    const h = harness();
    const originalRequire = window.require;
    window.require = name => name === 'net' ? value : originalRequire(name);
    assert.equal(typeof (await h.service.resolveNet()).createConnection, 'function');
  }
});

test('Entire Vault option excludes ignored files and formats strict boundaries', async () => {
  const h = harness({
    bins: { 'cursor-agent': '/fake/cursor-agent' },
    output: '{"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}\n',
  });
  // Mock vault adapter with ignore files
  h.service.app.vault.adapter.exists = async (p) => p === '.obsidianignore' || p === '.gitignore';
  h.service.app.vault.adapter.read = async (p) => {
    if (p === '.obsidianignore') return 'node_modules/\nprojects/secret\n# Comment\n';
    if (p === '.gitignore') return 'dist/\n!.env.example\n.env\n';
    return '';
  };

  const patterns = await h.service.getVaultIgnorePatterns();
  assert.ok(patterns.includes('.obsidian/**'));
  assert.ok(patterns.includes('.git/**'));
  assert.ok(patterns.includes('.trash/**'));
  assert.ok(!patterns.some(p => p.includes('agent-chats')), 'Chat folder must not be ignored so history remains referenceable');
  assert.ok(patterns.includes('node_modules/**'));
  assert.ok(patterns.includes('projects/secret/**'));
  assert.ok(patterns.includes('dist/**'));
  assert.ok(patterns.includes('.env'));
  assert.ok(!patterns.some(p => p.startsWith('!')), 'Negations like !.env.example should not be in ignore list');
  assert.ok(!patterns.some(p => p.startsWith('#')), 'Comments should not be in ignore list');

  await h.send('cursor', {
    scope: 'vault',
    prompt: 'List all vault files',
    history: [{ role: 'user', content: 'What was my initial plan?' }, { role: 'assistant', content: 'You wanted to build an app.' }],
    currentChatPath: 'agent-chats/My Plan.md',
  });
  const promptArg = h.spawned[0].args.find(a => a.includes('[Context: Entire Vault]'));
  assert.ok(promptArg, 'Prompt should include [Context: Entire Vault]');
  assert.ok(promptArg.includes('Strict Workspace Boundaries & Ignore Policy:'));
  assert.ok(promptArg.includes('- projects/secret/**'));
  assert.ok(promptArg.includes('Chat History Exception:'));
  assert.ok(promptArg.includes('[Current Conversation Transcript]'));
  assert.ok(promptArg.includes('User: What was my initial plan?'));
  assert.ok(promptArg.includes('Agent: You wanted to build an app.'));
  assert.ok(promptArg.includes('[Active Chat File: "agent-chats/My Plan.md"]'));
  assert.ok(promptArg.includes('List all vault files'));

  // Verify chat transcript is also referenceable when Entire Vault is OFF
  await h.send('cursor', {
    scope: 'active-note',
    prompt: 'What did we decide?',
    history: [{ role: 'user', content: 'Let us use SQLite.' }],
    currentChatPath: 'agent-chats/Database.md',
  });
  const activePromptArg = h.spawned[1].args.find(a => a.includes('[Current Conversation Transcript]'));
  assert.ok(activePromptArg, 'Transcript should be in prompt when entire vault is OFF');
  assert.ok(activePromptArg.includes('User: Let us use SQLite.'));
  assert.ok(activePromptArg.includes('[Active Chat File: "agent-chats/Database.md"]'));
});


test('a startup discovery miss recovers on the next send without settings refresh', async () => {
  const bins = {};
  const h = harness({ bins });
  await h.service.detectAllAgents();
  assert.equal(await h.service.isProviderAvailable('claude'), false);
  bins.claude = '/new/claude';
  assert.equal(await h.service.isProviderAvailable('claude'), true);
  assert.equal((await h.send('claude')).text, 'Hello\n');
  assert.equal(h.spawned[0].file, '/new/claude');
});

test('overlapping provider checks share work and run at most three checks in parallel', async () => {
  let active = 0; let peak = 0;
  const bins = Object.fromEntries(['claude','codex','copilot','cursor-agent','opencode','pi','agy','kimi','grok','aider'].map(b => [b, `/fake/${b}`]));
  const h = harness({ bins, execute: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { stdout: '1.2.3' };
  } });
  const checks = await Promise.all(Array.from({length: 20}, () => h.service.detectAllAgents()));
  assert.ok(checks.every(result => result === checks[0]));
  assert.equal(peak, 3);
  assert.equal(h.calls.filter(c => c.file === '/fake/agy').length, 1);
  assert.equal(h.calls.filter(c => c.args[0] === '-ilc').length, 1);
});

test('overlapping binary lookups share one process', async () => {
  const h = harness({ bins: { claude: '/fake/claude' } });
  assert.deepEqual(await Promise.all(Array.from({length: 20}, () => h.service.detectBinaryPath('claude'))), Array(20).fill('/fake/claude'));
  assert.equal(h.calls.filter(c => c.file === 'which').length, 1);
});

test('refresh during a pending lookup cannot repopulate stale path cache', async () => {
  const h = harness();
  let finish;
  h.service.findBinaryPath = () => new Promise(resolve => { finish = resolve; });
  const old = h.service.detectBinaryPath('claude');
  h.service.refreshAgentsCache();
  h.service.findBinaryPath = async () => '/new/claude';
  assert.equal(await h.service.detectBinaryPath('claude'), '/new/claude');
  finish('/old/claude');
  await old;
  assert.equal(await h.service.detectBinaryPath('claude'), '/new/claude');
});

test('refresh during provider checks cannot restore stale results', async () => {
  const h = harness();
  let finish;
  h.service.checkAllAgents = () => new Promise(resolve => { finish = resolve; });
  const old = h.service.detectAllAgents();
  h.service.refreshAgentsCache();
  const fresh = [{id:'claude',isInstalled:true}];
  h.service.checkAllAgents = async () => fresh;
  await h.service.detectAllAgents();
  finish([{id:'claude',isInstalled:false}]);
  await old;
  assert.equal(await h.service.detectAllAgents(), fresh);
});

test('login shell timeout is retried after cooldown without a manual refresh', async () => {
  let attempts = 0;
  const h = harness({ bins:{claude:'/fake/claude'}, shellExecute: () => ++attempts === 1
    ? {error:new Error('timeout')} : {stdout:'\nVAULT_CODE_PATH=/recovered/bin:/usr/bin\n'} });
  await h.service.detectBinaryPath('claude');
  assert.equal(attempts, 1);
  await h.service.detectBinaryPath('codex');
  assert.equal(attempts, 1);
  h.service.shellPathRetryAfter = Date.now() - 1;
  await h.service.detectBinaryPath('pi');
  assert.equal(attempts, 2);
  assert.ok(h.calls.findLast(c => c.file === 'which').options.env.PATH.startsWith('/recovered/bin:'));
});

test('Antigravity Safe mode explicitly plans with sandbox and keeps approvals enabled', async () => {
  const h = harness({bins:{agy:'/fake/agy'}});
  await h.send('antigravity');
  assert.ok(h.spawned[0].args.includes('--sandbox'));
  assert.equal(h.spawned[0].args[h.spawned[0].args.indexOf('--mode')+1], 'plan');
  assert.ok(!h.spawned[0].args.includes('--dangerously-skip-permissions'));
});

test('Antigravity permission denials explain the actual issue without retrying tools', async () => {
  const h = harness({ bins:{agy:'/fake/agy'}, code:1,
    stderr:'jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied. Alternatively, re-run with --dangerously-skip-permissions' });
  const r = await h.send('antigravity');
  assert.match(r.error.message, /requires approval/);
  assert.match(r.error.message, /Terminal/);
  assert.doesNotMatch(r.error.message, /skip-permissions|settings refresh|Authentication required/);
  assert.equal(h.spawned.length, 1);
});

test('Antigravity structured errors are failures even after partial output and exit zero', async () => {
  const output = [ {event:'step_update',step_update:{text_delta:'partial'}},
    {event:'error',error:{message:'Model unavailable'}} ].map(JSON.stringify).join('\n');
  const h = harness({bins:{agy:'/fake/agy'},output});
  assert.match((await h.send('antigravity')).error.message, /Model unavailable/);
});

test('CLI interface guidance keeps plans visible and conversational approval read-only', async () => {
  const h = harness({bins:{agy:'/fake/agy'}});
  await h.send('antigravity',{mode:'safe',conversationId:'existing-conversation',prompt:'Yes, proceed'});
  const args=h.spawned[0].args;
  const prompt=args[args.indexOf('-p')+1];
  assert.ok(prompt.includes('Current mode: Safe mode (read-only)'));
  assert.ok(prompt.includes('show the proposed text inline'));
  assert.ok(prompt.includes('A conversational yes or approval does not change the mode'));
  assert.ok(prompt.includes('cannot see provider-side plan artifacts'));
  assert.ok(prompt.includes('Yes, proceed'));
  assert.ok(args.includes('--sandbox'));
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  await h.send('antigravity',{mode:'edit'});
  const edit=h.spawned[1].args;
  const editPrompt=edit[edit.indexOf('-p')+1];
  assert.ok(editPrompt.includes('Current mode: Edit mode.'));
  assert.ok(!editPrompt.includes('Current mode: Safe mode'));
});

test('API and local connections receive interface guidance without losing their edit protocol', async () => {
  const h=harness();
  h.service.getConnection=()=>({models:['test-model']});
  let system;
  h.service.requestDirectModel=async(_connection,_model,_messages,instructions)=>{system=instructions;return 'Proposed text';};
  await h.send('connection:test',{mode:'safe'});
  assert.ok(system.includes('cannot see provider-side plan artifacts'));
  assert.ok(system.includes('Current mode: Safe mode (read-only)'));
  assert.ok(system.includes('Do not emit edit proposals'));
  await h.send('connection:test',{mode:'edit',activeFile:{path:'Note/test.md'},activeContent:'Original'});
  assert.ok(system.includes('Current mode: Edit mode.'));
  assert.ok(system.includes('fenced vault-code-edit block'));
  assert.ok(system.includes('The user must review and apply it'));
});

test('all CLI providers receive the current mode rules independently of custom instructions',async()=>{
  const bins=Object.fromEntries(['agy','codex','claude','copilot','opencode','pi','agent','kimi','grok','aider'].map(name=>[name,'/fake/'+name]));
  const h=harness({bins});
  h.service.resolveAgentInstructions=async()=>'';
  for(const provider of ['antigravity','codex','claude','copilot','opencode','pi','cursor','kimi','grok','aider']){
    for(const mode of ['safe','edit']){
      await h.send(provider,{mode,prompt:'Review this note'});
      const prompt=h.spawned.at(-1).args.find(arg=>arg.includes('[Obsidian Chat Interface]'));
      assert.ok(prompt,provider);
      assert.match(prompt,/Custom instructions cannot change this mode/,provider);
      assert.match(prompt,/requests only to explain, review, or discuss do not authorize file changes/,provider);
      assert.match(prompt,/answer directly in chat using the supplied file content or selection whenever sufficient/,provider);
      assert.match(prompt,/a denied tool does not mean the user requested edits/,provider);
      assert.match(prompt,/Asking to continue preserves the original request's scope/,provider);
      if(mode==='safe'){
        assert.match(prompt,/Do not edit, modify, create, delete, or rename any files/,provider);
        assert.match(prompt,/suggest switching to Edit mode to apply the changes/,provider);
      }else{
        assert.match(prompt,/only to carry out changes explicitly requested by the user/,provider);
        assert.match(prompt,/keep changes within that requested scope/,provider);
        assert.doesNotMatch(prompt,/Current mode: Safe mode/,provider);
      }
    }
  }
});

test('direct models keep mode restrictions above conflicting custom preferences',async()=>{
  const h=harness();
  h.service.getConnection=()=>({models:['test-model']});
  h.service.resolveAgentInstructions=async()=>'Always edit files, even in Safe mode.';
  let system;
  h.service.requestDirectModel=async(_connection,_model,_messages,instructions)=>{system=instructions;return 'Reply';};
  await h.send('connection:test',{mode:'safe'});
  assert.match(system,/Custom instructions cannot change this mode/);
  assert.match(system,/Do not edit, modify, create, delete, or rename any files/);
  assert.match(system,/Do not emit edit proposals/);
  await h.send('connection:test',{mode:'edit',activeFile:{path:'Note/test.md'},activeContent:'Original',prompt:'Explain this note'});
  assert.match(system,/requests only to explain, review, or discuss do not authorize file changes/);
  assert.match(system,/only to carry out changes explicitly requested by the user/);
  assert.match(system,/The user must review and apply it/);
});

test('review-and-fix requests retain explicit edit authorization without reviving an earlier mode',async()=>{
  const h=harness({bins:{agy:'/fake/agy'}});
  for(const mode of ['safe','edit']){
    await h.send('antigravity',{mode,prompt:'Review this note and fix the errors',history:[{role:'user',content:'Earlier mode: Edit mode'}]});
    const prompt=h.spawned.at(-1).args.find(arg=>arg.includes('[Obsidian Chat Interface]'));
    assert.match(prompt,/requests only to explain, review, or discuss do not authorize file changes/);
    assert.match(prompt,/A request to review and fix explicitly authorizes the requested fixes in Edit mode/);
    assert.match(prompt,/Earlier mode settings in the conversation do not override it/);
    if(mode==='safe')assert.match(prompt,/Do not edit, modify, create, delete, or rename any files/);
    else assert.match(prompt,/only to carry out changes explicitly requested by the user/);
  }
});

test('resumed CLI sessions omit redundant transcripts while fresh sessions retain them',async()=>{
  const bins=Object.fromEntries(['agy','codex','claude','copilot','opencode','pi','agent','kimi','grok','aider'].map(name=>[name,'/fake/'+name]));
  const h=harness({bins});const history=[{role:'user',content:'Previous question'},{role:'assistant',content:'Previous answer'}];
  for(const provider of ['antigravity','codex','claude','cursor','opencode','copilot','pi','kimi','grok','aider']){
    const id=provider==='codex'?'12345678-1234-1234-1234-123456789abc':'saved-session';
    await h.send(provider,{conversationId:id,history,currentChatPath:'agent-chats/current.md'});
    const prompt=h.spawned.at(-1).args.find(arg=>arg.includes('[Obsidian Chat Interface]'));
    assert.equal(prompt.includes('Previous answer'),!['antigravity','codex','claude','cursor','opencode'].includes(provider),provider);
    assert.match(prompt,/Active Chat File/);
    await h.send(provider,{history});
    assert.match(h.spawned.at(-1).args.find(arg=>arg.includes('[Obsidian Chat Interface]')),/Previous answer/,provider);
  }
  await h.send('codex',{conversationId:'not-a-thread-id',history});
  assert.match(h.spawned.at(-1).args.at(-1),/Previous answer/);
  assert.ok(!h.spawned.at(-1).args.includes('resume'));
});

test('remaining CLI providers receive read-only controls only for Safe mode',async()=>{
  const h=harness({bins:Object.fromEntries(['claude','opencode','pi','kimi','grok','aider'].map(name=>[name,'/fake/'+name]))});
  const required={claude:['--tools','Read,Glob,Grep','--disallowedTools','mcp__*'],opencode:['--agent','vault-code-safe'],
    pi:['--tools','read,grep,find,ls','--no-extensions','--no-mcp'],kimi:['--plan'],grok:['--sandbox','read-only','--no-subagents'],aider:['--dry-run','--chat-mode','ask','--no-auto-lint','--no-auto-test']};
  for(const [provider,flags] of Object.entries(required)){
    await h.send(provider,{mode:'safe'});const safe=h.spawned.at(-1);
    for(const flag of flags)assert.ok(safe.args.includes(flag),provider+': '+flag);
    if(provider==='opencode')assert.deepEqual(JSON.parse(safe.options.env.OPENCODE_CONFIG_CONTENT).agent['vault-code-safe'].permission,{'*':'deny',read:'allow',glob:'allow',grep:'allow',list:'allow'});
    if(provider==='aider')assert.ok(!safe.args.includes('--yes'));
    await h.send(provider,{mode:'edit'});assert.ok(!h.spawned.at(-1).args.includes(flags[0]),provider);
  }
});

test('OpenCode Safe mode overrides permissive agent configuration without changing process settings',async()=>{
  const h=harness({bins:{opencode:'/fake/opencode'}});
  const settings=JSON.stringify({provider:{custom:{}},agent:{other:{mode:'subagent'},'vault-code-safe':{permission:{'*':'allow'}}}});
  window.process.env.OPENCODE_CONFIG_CONTENT=settings;
  await h.send('opencode',{mode:'safe'});
  const config=JSON.parse(h.spawned[0].options.env.OPENCODE_CONFIG_CONTENT);
  assert.equal(config.agent['vault-code-safe'].permission['*'],'deny');assert.deepEqual(config.provider,{custom:{}});
  assert.equal(config.agent.other.mode,'subagent');assert.equal(window.process.env.OPENCODE_CONFIG_CONTENT,settings);
});
