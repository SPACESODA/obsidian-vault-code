import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const names={en:'en','zh-tw':'zhTw','zh-cn':'zhCn',ja:'ja',ko:'ko',es:'es',fr:'fr',it:'it',de:'de',ru:'ru'};
const imports=Object.entries(names).map(([path,name])=>`import { ${name} } from './src/i18n/locales/${path}';`).join('\n');
const compiled=await build({stdin:{contents:imports+'\nexport const translations={'+Object.entries(names).map(([path,name])=>JSON.stringify(path)+':'+name).join(',')+'};',resolveDir:process.cwd(),sourcefile:'preview-translations-entry.ts'},bundle:true,write:false,platform:'node',format:'cjs'});
const mod={exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {translations}=mod.exports;
test('every supported language has all preview strings with matching placeholders',()=>{
  const keys=Object.keys(translations.en).filter(key=>key.startsWith('preview'));
  assert.equal(keys.length,45);assert.equal(Object.keys(translations).length,10);
  for(const [language,strings] of Object.entries(translations))for(const key of keys){
    assert.equal(typeof strings[key],'string',`${language}: ${key}`);assert.ok(strings[key].trim(),`${language}: ${key}`);
    assert.deepEqual((strings[key].match(/\{\d+\}/g)||[]).sort(),(translations.en[key].match(/\{\d+\}/g)||[]).sort(),`${language}: ${key}`);
  }
});
test('boolean and numeric validation translations retain the required source literals',()=>{
  for(const strings of Object.values(translations)){
    assert.ok(strings.previewBoolean.includes('true'));assert.ok(strings.previewBoolean.includes('false'));
    assert.ok(strings.previewNumber.includes('0.5'));
    assert.ok(strings.previewCsvBreak.includes('LF'));assert.ok(strings.previewCsvBreak.includes('CRLF'));
  }
});

test('all UI translations have matching keys, placeholders and nonempty values',()=>{
  const keys=Object.keys(translations.en).sort();
  for(const [language,strings] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(strings).sort(),keys,language);
    for(const key of keys) {
      assert.ok(typeof strings[key]==='string'&&strings[key].trim(),`${language}: ${key}`);
      assert.deepEqual((strings[key].match(/\{\d+\}/g)||[]).sort(),(translations.en[key].match(/\{\d+\}/g)||[]).sort(),`${language}: ${key}`);
    }
  }
});
