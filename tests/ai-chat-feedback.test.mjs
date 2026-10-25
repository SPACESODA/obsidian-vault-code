import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:'export * from "./src/ai-chat-feedback"; export * from "./src/ai-chat-turns"; export {setLanguage,t} from "./src/i18n";',resolveDir:process.cwd(),sourcefile:'chat-feedback-test.ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const getLanguage=()=>"en"; export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {chatErrorContent,isChatPermissionError,parseChatTurns,setLanguage,t}=mod.exports;
const denied='A tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.';
test('Safe-mode errors explain the mode choice without executing or resending anything',()=>{
  assert.equal(isChatPermissionError(denied),true);
  assert.ok(chatErrorContent(denied,'safe').includes(t('aiChatSafePermissionHelp')));
  assert.ok(chatErrorContent(denied,'edit').includes(t('aiChatPermissionHelp')));
  assert.ok(!chatErrorContent(denied,'edit').includes('Vault safe'));
  assert.equal(isChatPermissionError('Authentication required'),false);
});
test('errors retain partial replies and keep multiline details inside the error block',()=>{
  const text=chatErrorContent('Failure\n---\nExtra detail','safe','Partial reply');assert.ok(text.startsWith('Partial reply\n\n>'));assert.ok(text.includes('\n> ---\n> Extra detail'));
});
test('permission recovery text is localized for every supported language',()=>{
  try{for(const language of ['en','zh-tw','zh-cn','ja','ko','es','fr','it','de','ru']){setLanguage(language);const message=chatErrorContent(denied,'safe');assert.ok(message.includes(t('aiChatSafePermissionHelp')));assert.ok(message.includes(t('aiChatErrorLabel')));}}finally{setLanguage('en');}
});
test('saved responses retain rules and role-like headings inside fenced examples',()=>{
  const body='##### You\nQuestion\n\n##### Agent\n---\n# Title\n\n```md\n##### You\nNot a real turn\n```\n\n##### Agent workflow\nStill the same response\n---\n\n##### You\nNext request';
  const turns=parseChatTurns(body);assert.equal(turns.length,3);assert.deepEqual(turns.map(t=>t.role),['user','assistant','user']);assert.ok(turns[1].content.includes('##### You\nNot a real turn'));assert.ok(turns[1].content.includes('##### Agent workflow'));
});
test('legacy emoji headings, CRLF, and tilde fences retain their turn boundaries',()=>{
  const body='## 👤 You\r\nRequest\r\n#### ✨ Agent\r\n~~~~text\r\n##### Assistant\r\nExample\r\n~~~~\r\nFinal';const turns=parseChatTurns(body);assert.equal(turns.length,2);assert.ok(turns[1].content.includes('##### Assistant\nExample'));
});
