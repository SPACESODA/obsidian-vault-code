import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: ['src/ai-chat-markdown.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'obsidian-test', setup(b) {
  b.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
    export const getLanguage=()=> "en"; export const requireApiVersion=()=>true;
    export class Component {
      children = new Set(); callbacks = [];
      addChild(child) { this.children.add(child); return child; }
      removeChild(child) { this.children.delete(child); child.unload(); return child; }
      register(fn) { this.callbacks.push(fn); }
      unload() { for (const child of this.children) child.unload(); for (const fn of this.callbacks.splice(0)) fn(); }
    }
    export const MarkdownRenderer = { render: (...args) => globalThis.__renderMarkdown(...args) };
  ` }));
} }] });
const mod = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputFiles[0].text)(mod, mod.exports, require);
const { renderChatMarkdown, disposeChatMarkdown } = mod.exports;
function element() {
  const classes = new Set();
  return {
    createDiv() { const child = element(); this.append(child); return child; },
    createSpan(options={}) { const child=element(); child.id=options.attr?.id;child.textContent=options.text;this.append(child);return child; },
    detach() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); },
    classList: { add: (...names) => names.forEach(n => classes.add(n)), contains: n => classes.has(n) },
    children: [], attributes: {}, tables: [],
    querySelectorAll(selector) { return selector==="table"?this.tables:[]; },
    querySelector() { return null; },
    replaceChildren(...children) { this.children = children; },
    append(child) { child.parentElement = this; this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
function owner() {
  return { children: new Set(), addChild(child) { this.children.add(child); return child; }, removeChild(child) { this.children.delete(child); child.unload(); } };
}
test('a slower streaming render cannot replace the final answer', async () => {
  const pending = [];
  globalThis.__renderMarkdown = (app, text, el, source) => new Promise(resolve => { el.textContent = text; pending.push({resolve, source}); });
  const body = element(), view = owner();
  const first = renderChatMarkdown({}, '> Partial', body, 'Agent-Chats/test.md', view);
  const final = renderChatMarkdown({}, '> Final', body, 'Agent-Chats/test.md', view);
  pending[1].resolve(); await final;
  pending[0].resolve(); await first;
  assert.equal(body.children[0].textContent, '> Final');
  assert.match(body.children[0].className, /markdown-rendered/);
  assert.equal(pending[1].source, 'Agent-Chats/test.md');
  assert.equal(view.children.size, 1);
});
test('replacing a response unloads the old Markdown components', async () => {
  globalThis.__renderMarkdown = async () => {};
  const body = element(), view = owner();
  await renderChatMarkdown({}, 'First', body, '', view);
  const old = [...view.children][0]; let unloaded = false; old.register(() => { unloaded = true; });
  await renderChatMarkdown({}, 'Second', body, '', view);
  assert.equal(unloaded, true); assert.equal(view.children.size, 1);
});
test('postprocessor failure falls back to readable text without interpreting HTML', async () => {
  globalThis.__renderMarkdown = async () => { throw new Error('Optional plugin failed'); };
  const body = element();
  await renderChatMarkdown({}, '<script>example</script>\n> Quote', body, '', owner());
  assert.equal(body.children[0].textContent, '<script>example</script>\n> Quote');
  assert.ok(body.children[0].classList.contains('is-plain-text'));
});
test('tables gain a keyboard-accessible scroll region and reuse native wrappers', async () => {
  for (const nativeWrapper of [false, true]) {
    const table = element(), parent = element();
    if (nativeWrapper) parent.classList.add('table-wrapper');
    table.parentElement = parent;
    let wrapper;
    table.before = el => { wrapper = el; };
    globalThis.__renderMarkdown = async (app, text, el) => { el.tables = [table]; };
    await renderChatMarkdown({}, '| A | B |', element(), '', owner());
    const actual = nativeWrapper ? parent : wrapper;
    assert.ok(actual.classList.contains('vault-code-chat-table-scroll'));
    assert.equal(actual.tabIndex, 0); assert.equal(actual.attributes.role, 'region');
    if (nativeWrapper) assert.equal(wrapper, undefined);
    else assert.equal(actual.children[0], table);
  }
});
test('an unloaded view cannot receive a late render', async () => {
  let resolve;
  globalThis.__renderMarkdown = () => new Promise(r => { resolve = r; });
  const view = owner(), body = element();
  const pending = renderChatMarkdown({}, 'Late', body, '', view);
  [...view.children][0].unload(); resolve(); await pending;
  assert.equal(body.children.length, 0); assert.equal(view.children.size, 0);
});


test('leading horizontal rules are message content rather than hidden frontmatter',async()=>{
  let received;globalThis.__renderMarkdown=async(_app,text,el)=>{received=text;el.textContent='Visible response';};
  const original='---\n# Vault Code\n\nJapanese description\n---';const body=element();
  await renderChatMarkdown({},original,body,'',owner());
  assert.ok(received.startsWith('<!-- vault-code-message -->'));assert.ok(received.includes(original));assert.equal(body.children[0].textContent,'Visible response');
});
test('a response suppressed by a postprocessor falls back to readable source',async()=>{
  globalThis.__renderMarkdown=async()=>{};const body=element();await renderChatMarkdown({},'Important response',body,'',owner());
  assert.equal(body.children[0].textContent,'Important response');assert.ok(body.children[0].classList.contains('is-plain-text'));
});
test('task status is display-only and cannot write to the source note',async()=>{
  const checkbox={disabled:false,tabIndex:0};
  globalThis.__renderMarkdown=async(_app,_text,el)=>{el.textContent='Task';const query=el.querySelectorAll.bind(el);el.querySelectorAll=s=>s==='input[type="checkbox"]'?[checkbox]:query(s);};
  await renderChatMarkdown({},'- [ ] Task',element(),'chat.md',owner());assert.equal(checkbox.disabled,true);assert.equal(checkbox.tabIndex,-1);
});
test('clearing a conversation unloads visible and pending Markdown components',async()=>{
  const body=element(),view=owner();globalThis.__renderMarkdown=async(_a,text,el)=>{el.textContent=text;};await renderChatMarkdown({},'Visible',body,'',view);
  let finish;globalThis.__renderMarkdown=()=>new Promise(r=>{finish=r;});const pending=renderChatMarkdown({},'Pending',body,'',view);assert.equal(view.children.size,2);
  disposeChatMarkdown(body,view);assert.equal(view.children.size,0);finish();await pending;assert.equal(body.children[0].textContent,'Visible');assert.equal(view.children.size,0);
});
