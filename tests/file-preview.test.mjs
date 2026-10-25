import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
async function load(entry, stub) {
  const compiled = await build({...(entry==='src/file-preview.ts'?{stdin:{contents:'export * from "./src/file-preview"; export { setLanguage, t } from "./src/i18n"; export { PreviewError } from "./src/preview-errors";',resolveDir:process.cwd(),sourcefile:'preview-test-entry.ts'}}:{entryPoints:[entry]}),bundle:true,write:false,platform:'node',format:'cjs',plugins:stub?[{name:'obsidian',setup(b){
    b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub}));
  }}]:[]});
  const mod={exports:{}};
  new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
  return mod.exports;
}
const {parseDelimited,parseJsonPreview,jsonRecordTable,parseDiffPreview,mermaidMarkdown,PREVIEW_LIMITS,DATA_PREVIEW_EXTENSIONS}=await load('src/file-preview-data.ts');
const {FilePreviewRenderer,setLanguage,t,formatPreviewError,PreviewError}=await load('src/file-preview.ts',`
  export const getLanguage=()=>"en"; export const requireApiVersion=()=>true;
  export class Component {
    constructor(){this.children=[];this.callbacks=[];}
    register(fn){this.callbacks.push(fn);}
    addChild(c){this.children.push(c);return c;}
    removeChild(c){this.children=this.children.filter(x=>x!==c);c.unload();return c;}
    unload(){for(const child of [...this.children])this.removeChild(child);for(const fn of this.callbacks)fn();}
  }
  globalThis.TestComponent=Component;
  export const MarkdownRenderer={render:(...args)=>globalThis.markdownPreviewRender(...args)};
`);
class Element {
  constructor(tag='div',opts={}){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.attrs=opts.attr||{};this.text=opts.text||'';this.classes=new Set((opts.cls||'').split(' ').filter(Boolean));this.events={};this.open=false;this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c))};}
  createEl(tag,opts={}){const child=new Element(tag,opts);this.children.push(child);return child;}
  createDiv(opts={}){return this.createEl('div',opts);}
  createSpan(opts={}){return this.createEl('span',opts);}
  empty(){this.children=[];this.text='';}
  addEventListener(event,fn){this.events[event]=fn;}
  all(tag){return [...(this.tag===tag?[this]:[]),...this.children.flatMap(c=>c.all(tag))];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this.text=value;this.children=[];}
  setText(value){this.textContent=value;}
  setAttribute(key,value){this.attrs[key]=value;}
  focus(){this.focused=true;}
  querySelector(selector){const tags=selector.split(',').map(s=>s.trim());return tags.flatMap(tag=>this.all(tag))[0]||null;}
}
function renderer(){const owner=new globalThis.TestComponent();const root=new Element();return {owner,root,preview:new FilePreviewRenderer({},owner)};}

test('CSV handles BOM, quoted delimiters, escaped quotes, CRLF, multiline and empty cells',()=>{
  assert.deepEqual(parseDelimited('\uFEFFa,b,c\r\n"x,y","Say ""hi""","one\r\ntwo"\r\n,,',',').rows,[['a','b','c'],['x,y','Say "hi"','one\r\ntwo'],['','','']]);
  assert.deepEqual(parseDelimited('a\tb\n1\t"two"\n','\t').rows,[['a','b'],['1','"two"']]);
  assert.throws(()=>parseDelimited('a\n"unclosed',','),/Unclosed.*row 2/);
  assert.throws(()=>parseDelimited('a\n"closed"x',','),/Unexpected.*row 2/);
});
test('CSV row and column limits stop oversized previews',()=>{
  const rows=parseDelimited('header\n'+Array(700).fill('value').join('\n'),',');
  assert.equal(rows.rows.length,501);assert.equal(rows.truncated,true);
  const columns=parseDelimited(Array(150).fill('x').join(','),',');
  assert.equal(columns.rows[0].length,100);assert.equal(columns.truncated,true);
});
test('JSON lines keep source line errors and bound record counts',()=>{
  assert.deepEqual(parseJsonPreview('\uFEFF{"a":1}\n\n{"a":2}\n',true).value,[{a:1},{a:2}]);
  assert.throws(()=>parseJsonPreview('{}\n\nno',true),/line 3/);
  const data=parseJsonPreview(Array(600).fill('{}').join('\n'),true);
  assert.equal(data.value.length,500);assert.equal(data.truncated,true);
});
test('JSON tables preserve null, missing cells, unusual keys and heterogeneous columns',()=>{
  const data=JSON.parse('[{"__proto__":"safe","a":null},{"b":true,"a":2}]');
  assert.deepEqual(jsonRecordTable(data).rows,[['__proto__','a','b'],['"safe"','null',''],['','2','true']]);
  assert.equal(jsonRecordTable([{nested:{value:1}}]),null);
  assert.equal(jsonRecordTable([1,null,2]),null);
});
test('unified patches track both line numbers, zero-count hunks, and header-like changed text',()=>{
  const data=parseDiffPreview('--- a/test\n+++ b/test\n@@ -2,2 +2,3 @@\n same\n-old\n+++ literal content\n+new\n\\ No newline at end of file\n@@ -8,0 +10,1 @@\n+inserted\n');
  assert.deepEqual(data.lines.filter(l=>l.kind==='add').map(l=>[l.text,l.after]),[['+++ literal content',3],['+new',4],['+inserted',10]]);
  assert.equal(data.lines.find(l=>l.kind==='remove').before,3);
  assert.equal(data.lines.find(l=>l.kind==='context').after,2);
  assert.equal(data.truncated,false);
  assert.equal(parseDiffPreview(Array(6000).fill('+a').join('\n')).lines.length,5000);
});
test('Mermaid input cannot escape its fenced block',()=>{
  const source='graph TD\nA["```"]\n````\n<img src=x onerror=alert(1)>';
  const markdown=mermaidMarkdown(source);
  assert.ok(markdown.startsWith('`````mermaid\n'));
  assert.ok(markdown.endsWith('\n`````'));
});
test('sample fixtures cover every supported preview extension and parse correctly',async()=>{
  const names=['preview-data.csv','preview-data.tsv','preview-project.json','preview-events.jsonl','preview-records.ndjson','preview-workflow.mmd','preview-sequence.mermaid','preview-update.diff','preview-settings.patch'];
  for(const name of names){
    const source=await readFile(`tests/fixtures/previews/${name}`,'utf8');const ext=name.split('.').pop();
    assert.ok(DATA_PREVIEW_EXTENSIONS.has(ext));
    if(['csv','tsv'].includes(ext)) assert.ok(parseDelimited(source,ext==='csv'?',':'\t').rows.length>1);
    else if(['json','jsonl','ndjson'].includes(ext)) assert.ok(parseJsonPreview(source,ext!=='json').value);
    else if(['diff','patch'].includes(ext)) assert.ok(parseDiffPreview(source).lines.some(l=>l.kind==='add'));
    else assert.ok(mermaidMarkdown(source).includes(source));
  }
});
test('data previews use text nodes, pad ragged rows, and provide keyboard scroll access',async()=>{
  const h=renderer();await h.preview.render(h.root,'csv','A,B\n<img src=x onerror=alert(1)>\nsecond,last','a.csv');
  assert.equal(h.root.all('td').length,4);assert.equal(h.root.all('img').length,0);
  assert.ok(h.root.textContent.includes('<img src=x'));
  assert.ok(h.root.all('div').some(e=>e.attrs.role==='region'&&e.attrs.tabindex==='0'));
});
test('nested JSON is lazy, preserves primitives, and stops deep/large expansion',async()=>{
  const h=renderer();await h.preview.render(h.root,'json',JSON.stringify({nested:{a:1},enabled:false,empty:null}),'a.json');
  const details=h.root.all('details');assert.equal(details.length,2);
  assert.equal(details[1].children.length,1);
  details[1].open=true;details[1].events.toggle();assert.ok(h.root.textContent.includes('a:1'));
  details[1].events.toggle();assert.equal(h.root.all('details').length,2);
  await h.preview.render(h.root,'json',JSON.stringify(Object.fromEntries(Array.from({length:200},(_,i)=>['key'+i,i]))),'a.json');
  assert.ok(h.root.textContent.includes('Preview shortened'));
  assert.ok(h.root.all('span').length<=200);
});
test('large tables have a DOM budget and explain truncation',async()=>{
  const h=renderer();const row=Array(100).fill('cell').join(',');
  await h.preview.render(h.root,'csv',Array(500).fill(row).join('\n'),'large.csv');
  assert.ok(h.root.all('td').length<=10000);assert.ok(h.root.textContent.includes('Preview shortened'));
});
test('empty, invalid, and oversized files stay readable without launching Mermaid',async()=>{
  const h=renderer();await h.preview.render(h.root,'json','{bad','bad.json');assert.ok(h.root.all('div').some(e=>e.classes.has('hidden-files-preview-error')));
  await h.preview.render(h.root,'json','  ','empty.json');assert.equal(h.root.textContent,'Nothing to preview.');
  await h.preview.render(h.root,'json','x'.repeat(PREVIEW_LIMITS.characters+1),'large.json');assert.match(h.root.textContent,/too large/);
});
test('a late Mermaid render cannot overwrite a new preview; components unload on clear',async()=>{
  const h=renderer();let finish;
  globalThis.markdownPreviewRender=async(_app,md,target,path,component)=>{
    assert.ok(md.startsWith('```mermaid'));assert.equal(path,'a.mmd');assert.ok(component);
    await new Promise(resolve=>{finish=resolve;});target.createSpan({text:'Old diagram'});
  };
  const old=h.preview.render(h.root,'mmd','graph TD; A-->B','a.mmd');
  assert.equal(h.owner.children.length,1);
  await h.preview.render(h.root,'json','{"fresh":true}','a.json');
  finish();await old;
  assert.equal(h.owner.children.length,0);assert.ok(!h.root.textContent.includes('Old diagram'));
  assert.ok(h.root.textContent.includes('fresh:'));
});


test('editable cells require explicit confirmation; cancel and blur never apply', async()=>{
  const h=renderer();let edits=0;
  const apply=async()=>{edits++;};
  await h.preview.render(h.root,'csv','Name,Count\na,2\n','a.csv',apply);
  const cell=h.root.all('td')[0];
  assert.ok(cell.classes.has('is-editable'));
  cell.events.dblclick();
  const input=cell.all('textarea')[0];input.value='changed';
  assert.equal(input.events.blur,undefined);
  assert.equal(edits,0);
  cell.all('button')[1].events.click();
  assert.equal(edits,0);assert.equal(cell.textContent,'a');
  cell.events.dblclick();cell.all('textarea')[0].value='changed';
  cell.all('button')[0].events.click();await new Promise(r=>setImmediate(r));
  assert.equal(edits,1);
});
test('invalid numeric edits keep the draft and never reach the apply callback',async()=>{
  const h=renderer();let edits=0;
  await h.preview.render(h.root,'jsonl','{"n":12,"s":"hello","b":true,"empty":null}\n','a.jsonl',async()=>{edits++;});
  const cells=h.root.all('td');assert.ok(!cells[3].classes.has('is-editable'));
  cells[0].events.dblclick();cells[0].all('input')[0].value='not a number';
  cells[0].all('button')[0].events.click();await new Promise(r=>setImmediate(r));
  assert.equal(edits,0);assert.ok(cells[0].textContent.includes('precision loss'));
  assert.equal(cells[0].all('input')[0].value,'not a number');
});
test('truncated and malformed tables never offer cell editing',async()=>{
  const h=renderer();const apply=async()=>{throw new Error('must not edit');};
  await h.preview.render(h.root,'csv','A,B\n1\n','ragged.csv',apply);
  assert.ok(h.root.all('td').every(c=>!c.classes.has('is-editable')));
  await h.preview.render(h.root,'csv','A\n'+Array(600).fill('x').join('\n'),'long.csv',apply);
  assert.ok(h.root.all('td').every(c=>!c.classes.has('is-editable')));
});


test('preview tables and editors have accessible names without hover tips or instructional text',async()=>{
  const h=renderer();await h.preview.render(h.root,'csv','Name,Notes\nOne,Text\n','a.csv',async()=>{});
  assert.ok(!h.root.textContent.includes('Double-click'));
  const region=h.root.all('div').find(e=>e.attrs.role==='region');
  assert.ok(region.attrs['aria-labelledby']);assert.equal(region.attrs['aria-label'],undefined);
  const cell=h.root.all('td')[1];assert.equal(cell.attrs.title,undefined);
  cell.events.dblclick();
  const input=cell.all('textarea')[0];assert.ok(input.attrs['aria-labelledby']);assert.equal(input.attrs['aria-label'],undefined);
  assert.ok(h.root.all('button').every(e=>!e.attrs.title&&!e.attrs['aria-label']));
});


test('TSV preview treats quotes literally and reports legacy multiline row ambiguity',()=>{
  assert.deepEqual(parseDelimited('A\tB\n1\t"literal"\n','\t').rows,[['A','B'],['1','"literal"']]);
  assert.throws(()=>parseDelimited('A\tB\n1\t"first\nsecond"\n','\t'),/TSV row 3/);
});
test('JSON line tables display multiline strings as text while edits keep escaped source',async()=>{
  const h=renderer();const source=JSON.stringify({text:'first\nsecond',literal:'\\n'})+'\n';
  await h.preview.render(h.root,'jsonl',source,'a.jsonl',async()=>{});
  const cells=h.root.all('td');assert.equal(cells[0].textContent,'first\nsecond');assert.equal(cells[1].textContent,'\\n');
  cells[0].events.dblclick();assert.equal(cells[0].all('textarea')[0].value,'first\nsecond');
});

test('TSV multiline input remains a local draft and cannot reach file editing',async()=>{
  const h=renderer();let edits=0;
  await h.preview.render(h.root,'tsv','A\tB\nleft\tright\n','a.tsv',async()=>{edits++;});
  const cell=h.root.all('td')[1];cell.events.dblclick();cell.all('textarea')[0].value='first\nsecond';
  cell.all('button')[0].events.click();await new Promise(r=>setImmediate(r));
  assert.equal(edits,0);assert.ok(cell.textContent.includes('TSV cells cannot contain tabs or line breaks'));
  assert.equal(cell.all('textarea')[0].value,'first\nsecond');
});
test('JSONL and NDJSON multiline editors pass escaped single-token changes to the buffer',async()=>{
  for(const extension of ['jsonl','ndjson']){
    const h=renderer();let patch;
    const source='{"text":"before","keep":2}\n';
    await h.preview.render(h.root,extension,source,'a.'+extension,async change=>{patch=change;});
    const cell=h.root.all('td')[0];cell.events.dblclick();cell.all('textarea')[0].value='first\nsecond';
    cell.all('button')[0].events.click();await new Promise(r=>setImmediate(r));
    assert.equal(patch.insert,'"first\\nsecond"');assert.ok(!patch.insert.includes('\n'));
    assert.equal(source.slice(patch.to),',"keep":2}\n');
  }
});


test('preview controls and errors use the selected language without changing data literals',async()=>{
  try{
    for(const [language,apply,cancel] of [['zh-tw','套用','取消'],['ja','適用','キャンセル'],['de','Anwenden','Abbrechen']]){
      setLanguage(language);const h=renderer();
      await h.preview.render(h.root,'tsv','Name\tNotes\none\ttrue\n','a.tsv',async()=>{});
      const cell=h.root.all('td')[1];assert.equal(cell.textContent,'true');cell.events.dblclick();
      assert.deepEqual(cell.all('button').map(e=>e.textContent),[apply,cancel]);
      cell.all('textarea')[0].value='first\nsecond';cell.all('button')[0].events.click();await new Promise(r=>setImmediate(r));
      assert.ok(cell.textContent.includes(t('previewTsvCellBreak')));assert.ok(!cell.textContent.includes('TSV cells cannot'));
      assert.ok(!cell.attrs.title);assert.ok(!cell.all('textarea')[0].attrs['aria-label']);
    }
  }finally{setLanguage('en');}
});
test('structured errors localize when displayed, including positional values and language changes',()=>{
  const error=new PreviewError('previewTsvFields',5,1,4);
  try{
    for(const language of ['zh-tw','zh-cn','ja','ko','es','fr','it','de','ru']){
      setLanguage(language);const message=formatPreviewError(error);
      assert.equal(message,t('previewTsvFields',5,1,4));assert.ok(!message.includes('{0}'));assert.notEqual(message,error.message);
    }
  }finally{setLanguage('en');}
  assert.equal(formatPreviewError(error),'TSV row 5: field count is 1, expected 4. Review the source in Code.');
});
