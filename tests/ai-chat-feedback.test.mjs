import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:'export * from "./src/ai-chat-feedback"; export * from "./src/ai-chat-turns"; export {setLanguage,t} from "./src/i18n";',resolveDir:process.cwd(),sourcefile:'chat-feedback-test.ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const getLanguage=()=>"en"; export const requireApiVersion=()=>true;'}));}}]});
const mod={exports:{}};new Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const {chatErrorContent,isChatPermissionError,parseChatTurns,escapeChatTurnMarkers,setLanguage,t}=mod.exports;
const denied='A tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.';
test('Safe-mode errors explain the mode choice without executing or resending anything',()=>{
  assert.equal(isChatPermissionError(denied),true);
  assert.ok(chatErrorContent(denied,'safe').includes(t('aiChatSafePermissionHelp')));
  assert.ok(chatErrorContent(denied,'edit').includes(t('aiChatPermissionHelp')));
  assert.ok(!chatErrorContent(denied,'edit').includes('Safe mode'));
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

test('explicit markers keep role headings inside responses and preserve literal markers',()=>{
  const messages=[
    {role:'user',content:'Question'},
    {role:'assistant',content:'## You\nExample heading\n##### Agent\n```md\n<!-- user -->\n\\<!-- agent -->\n\\\\<!-- user -->\n```\n## Assistant'},
    {role:'user',content:'Next request'},
  ];
  const body=messages.map(message=>`${message.role==='user'?'<!-- user -->\n##### You':'<!-- agent -->\n##### Agent'}\n\n${escapeChatTurnMarkers(message.content)}\n`).join('\n');
  assert.deepEqual(parseChatTurns(body),messages);
  assert.deepEqual(parseChatTurns('\r\n'+body.replaceAll('\n','\r\n')),messages);
});

test('an unfinished code fence cannot swallow later explicitly marked turns',()=>{
  const body='<!-- agent -->\n##### Agent\n\n```md\nUnfinished example\n\n<!-- user -->\n##### You\n\nContinue';
  assert.deepEqual(parseChatTurns(body),[{role:'assistant',content:'```md\nUnfinished example'},{role:'user',content:'Continue'}]);
  assert.deepEqual(parseChatTurns('<!-- user -->\n##### You\n\n<!-- agent -->\n##### Agent'),[]);
});

test('the concise read-only reminder is translated with the actual mode labels',()=>{
  try {
    for(const language of ['en','zh-tw','zh-cn','ja','ko','es','fr','it','de','ru']) {
      setLanguage(language);
      assert.ok(t('aiChatContinue').trim());assert.ok(t('aiChatContinueRequest').trim());
      const safe=t('aiChatModeSafe'),edit=t('aiChatModeEdit');
      const hint=t('aiChatReadOnlyHint',safe,edit);
      assert.ok(hint.includes(safe));assert.ok(hint.includes(edit));
      assert.ok(!hint.includes('{0}')&&!hint.includes('{1}'));
      if(language!=='en') assert.ok(!hint.includes('is read-only. Choose'));
    }
  } finally {setLanguage('en');}
});

test('mode labels use plain mode names in every language',()=>{
  const labels={en:['Safe mode','Edit mode'],'zh-tw':['安全模式','編輯模式'],'zh-cn':['安全模式','编辑模式'],ja:['セーフモード','編集モード'],ko:['안전 모드','편집 모드'],de:['Sicherer Modus','Bearbeitungsmodus'],es:['Modo seguro','Modo de edición'],fr:['Mode sécurisé','Mode édition'],it:['Modalità sicura','Modalità modifica'],ru:['Безопасный режим','Режим редактирования']};
  try {for(const [language,expected] of Object.entries(labels)){setLanguage(language);assert.deepEqual([t('aiChatModeSafe'),t('aiChatModeEdit')],expected);}}
  finally{setLanguage('en');}
});
