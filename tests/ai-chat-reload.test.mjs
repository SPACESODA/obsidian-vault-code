import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import esbuild from "esbuild";
const require = createRequire(import.meta.url);

async function load(entry, stubs = {}) {
	const result = await esbuild.build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		plugins: [{
			name: "stubs",
			setup(b) {
				for (const [name, contents] of Object.entries(stubs)) {
					b.onResolve({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, () => ({ path: name, namespace: "stub" }));
					b.onLoad({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), namespace: "stub" }, () => ({ contents, resolveDir: process.cwd() }));
				}
			},
		}],
	});
	const mod = { exports: {} };
	new Function("module", "exports", "require", result.outputFiles[0].text)(mod, mod.exports, require);
	return mod.exports;
}

const OBSIDIAN_STUB = `
	export { load as parseYaml, dump as stringifyYaml } from "js-yaml";
	export class ItemView {
		constructor(leaf) { this.leaf = leaf; this.containerEl = { children: [1] }; this.contentEl = { empty(){}, addClass(){} }; }
	}
	export class WorkspaceLeaf {}
	export class App {}
	export class FileSystemAdapter {}
	export class TFile { constructor(path) { this.path = path; } }
	export class TFolder {}
	export const normalizePath = (p) => p;
	globalThis.__TestTFile = TFile;
	export class Component { registerEvent(){} }
	export class Modal {}
	export class SuggestModal {}
	export class Menu {}
	export class ToggleComponent { setValue(){ return this; } onChange(){ return this; } }
	export const Platform = { isDesktop: true, isMacOS: true, isWin: false };
	export const setIcon = () => {};
	export const Notice = class {};
	export const debounce = (fn) => fn;
	export const MarkdownRenderer = { render: async () => {} };
	export const getLanguage = () => "en";
	export const requireApiVersion = () => true;
	export const requestUrl = () => {};
`;

const { AIChatView, VIEW_TYPE_AI_CHAT } = await load("src/ai-chat-view.ts", {
	obsidian: OBSIDIAN_STUB,
});

test("AIChatView getState and setState preserve active chat file across view reloads", async () => {
	const leaf = {};
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "edit",
		},
		aiService: { getModelsForProvider: async () => [] },
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	const dummyFile = new globalThis.__TestTFile("agent-chats/my-chat.md");
	view.currentChatFile = dummyFile;

	const state = view.getState();
	assert.equal(state.chatPath, "agent-chats/my-chat.md");

	let loadedFile = null;
	view.loadChatFromFile = async (file) => { loadedFile = file; };
	view.app = {
		vault: {
			getAbstractFileByPath: (p) => (p === "agent-chats/my-chat.md" ? dummyFile : null),
		},
	};

	await view.setState({ chatPath: "agent-chats/my-chat.md" }, {});
	assert.equal(loadedFile, dummyFile);
});

test("stale AI chat leaves are revived by cycling view state", async () => {
	const calls = [];
	const deadLeaf = {
		view: { containerEl: { children: [] } },
		getViewState: () => ({ type: VIEW_TYPE_AI_CHAT, state: { chatPath: "test.md" } }),
		setViewState: async (s) => { calls.push(s); },
	};

	const leaves = [deadLeaf];
	const workspace = {
		iterateAllLeaves: (fn) => leaves.forEach(fn),
		getLeavesOfType: (type) => (type === VIEW_TYPE_AI_CHAT ? leaves : []),
		activeLeaf: null,
		getActiveViewOfType: () => null,
	};

	// Simulate reload logic
	const leavesToReload = [];
	workspace.iterateAllLeaves((leaf) => {
		const viewState = leaf.getViewState();
		if (viewState && viewState.type === VIEW_TYPE_AI_CHAT) {
			const view = leaf.view;
			const isDeadOrStale = !(view instanceof AIChatView) || view.containerEl.children.length === 0;
			if (isDeadOrStale) leavesToReload.push(leaf);
		}
	});

	assert.equal(leavesToReload.length, 1);
	for (const leaf of leavesToReload) {
		const viewState = leaf.getViewState();
		await leaf.setViewState({ type: "empty" });
		await leaf.setViewState({
			type: VIEW_TYPE_AI_CHAT,
			state: viewState?.state ?? {},
			active: false,
		});
	}

	assert.deepEqual(calls, [
		{ type: "empty" },
		{ type: VIEW_TYPE_AI_CHAT, state: { chatPath: "test.md" }, active: false },
	]);
});

test("AIChatView defaults to safe mode (Safe mode)", async () => {
	const leaf = {};
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "safe",
		},
		aiService: { getModelsForProvider: async () => [] },
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	assert.equal(view.mode, "safe");
});

test("changing mode or scope immediately updates the chat file frontmatter", async () => {
	const leaf = {};
	const dummyFile = new globalThis.__TestTFile("agent-chats/active.md");
	const updated = [];
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "safe",
		},
		aiService: { getModelsForProvider: async () => [] },
		aiStorage: {
			updateChatMode: async (file, mode) => { updated.push({ type: "mode", file, mode }); },
			updateChatScope: async (file, scope) => { updated.push({ type: "scope", file, scope }); },
		},
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	view.currentChatFile = dummyFile;

	view.setMode("edit");
	assert.equal(view.mode, "edit");
	assert.deepEqual(updated[0], { type: "mode", file: dummyFile, mode: "edit" });

	view.setChatScope("vault");
	assert.equal(view.chatScope, "vault");
	assert.deepEqual(updated[1], { type: "scope", file: dummyFile, scope: "vault" });
});

test("changing provider, model, or effort immediately updates the chat file frontmatter", async () => {
	const leaf = {};
	const dummyFile = new globalThis.__TestTFile("agent-chats/active.md");
	const updated = [];
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "safe",
			aiConnections: [],
		},
		aiService: {
			getModelsForProvider: async () => [{ id: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet" }],
			detectAllAgents: async () => [],
		},
		aiStorage: {
			updateChatProvider: async (file, provider, model) => { updated.push({ type: "provider", file, provider, model }); },
			updateChatModel: async (file, model) => { updated.push({ type: "model", file, model }); },
			updateChatEffort: async (file, effort) => { updated.push({ type: "effort", file, effort }); },
		},
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	view.currentChatFile = dummyFile;

	// Changing provider
	view.selectProvider("claude");
	assert.equal(view.selectedProvider, "claude");
	assert.equal(updated[0].type, "provider");
	assert.equal(updated[0].provider, "claude");

	// Auto-adjusting model when loading models
	view.availableModels = [{ id: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet" }];
	await view.loadModelsForProvider("claude");
	assert.equal(view.selectedModel, "claude-3-5-sonnet");
	assert.equal(updated[1].type, "model");
	assert.equal(updated[1].model, "claude-3-5-sonnet");
});

test("loadChatFromFile follows recorded provider, model, effort, scope, and mode when available", async () => {
	const leaf = {};
	const dummyFile = new globalThis.__TestTFile("agent-chats/existing.md");
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "safe",
			aiConnections: [],
		},
		aiService: {
			getModelsForProvider: async () => [],
			isProviderAvailable: async (prov) => prov === "claude",
		},
		aiStorage: {
			parseChat: () => ({
				metadata: {
					title: "Existing Claude Chat",
					created: "2026-10-25 10:00:00",
					provider: "claude",
					model: "claude-3-7-sonnet",
					reasoning_effort: "high",
					scope: "vault",
					mode: "edit",
					conversationId: "conv-123",
				},
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi" },
				],
			}),
		},
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	view.app = {
		vault: {
			read: async () => "dummy",
		},
	};

	await view.loadChatFromFile(dummyFile);

	assert.equal(view.selectedProvider, "claude");
	assert.equal(view.selectedModel, "claude-3-7-sonnet");
	assert.equal(view.selectedReasoningEffort, "high");
	assert.equal(view.chatScope, "vault");
	assert.equal(view.mode, "edit");
	assert.equal(view.conversationId, "conv-123");
});

test("loadChatFromFile falls back to settings default provider when recorded provider does not exist", async () => {
	const leaf = {};
	const dummyFile = new globalThis.__TestTFile("agent-chats/deleted-provider.md");
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: { antigravity: "gemini-2.5-flash" },
			aiReasoningEffort: "medium",
			aiScope: "vault",
			aiMode: "safe",
			aiConnections: [],
		},
		aiService: {
			getModelsForProvider: async () => [],
			isProviderAvailable: async () => false, // Provider unavailable
		},
		aiStorage: {
			parseChat: () => ({
				metadata: {
					title: "Old Removed Connection Chat",
					created: "2026-10-20 10:00:00",
					provider: "connection:deleted-id",
					model: "custom-model",
					scope: "active-note",
					mode: "edit",
					conversationId: "dead-conv-id",
				},
				messages: [],
			}),
		},
		saveSettings: async () => {},
	};
	const view = new AIChatView(leaf, plugin);
	view.app = {
		vault: {
			read: async () => "dummy",
		},
	};

	await view.loadChatFromFile(dummyFile);

	// Provider fell back to default
	assert.equal(view.selectedProvider, "antigravity");
	assert.equal(view.selectedModel, "gemini-2.5-flash");
	// Conversation ID reset because provider changed
	assert.equal(view.conversationId, undefined);
	// Recorded mode is still respected
	assert.equal(view.mode, "edit");
	// Fallback effort used since old metadata had none
	assert.equal(view.selectedReasoningEffort, "medium");
});

test("updateChatProvider deletes reasoning_effort when switching to provider without effort support", async () => {
	const frontmatter = {
		title: "Active Chat",
		provider: "codex",
		model: "o3-mini",
		reasoning_effort: "high",
	};
	const fakeApp = {
		fileManager: {
			processFrontMatter: async (_file, fn) => { fn(frontmatter); },
		},
	};
	const { AIStorage } = await load("src/ai-storage.ts", {
		obsidian: OBSIDIAN_STUB,
	});
	const storage = new AIStorage(fakeApp);
	const dummyFile = new globalThis.__TestTFile("agent-chats/test.md");

	// Switch to Antigravity (does not support reasoning effort)
	await storage.updateChatProvider(dummyFile, "antigravity", "gemini-3.8-flash-high");
	assert.equal(frontmatter.chat_provider, "antigravity");
	assert.equal(frontmatter.chat_model, "gemini-3.8-flash-high");
	assert.equal("reasoning_effort" in frontmatter, false);
	assert.equal("chat_effort" in frontmatter, false);

	// Switch back to Codex (supports reasoning effort)
	await storage.updateChatProvider(dummyFile, "codex", "o3-mini", "medium");
	assert.equal(frontmatter.chat_provider, "codex");
	assert.equal(frontmatter.chat_model, "o3-mini");
	assert.equal(frontmatter.chat_effort, "medium");
});

test("getModelsForProvider caches discovered models to avoid repeating slow CLI calls", async () => {
	let fetchCount = 0;
	const { AIService } = await load("src/ai-service.ts", {
		obsidian: OBSIDIAN_STUB,
	});
	const service = new AIService({});
	service.getAvailableModels = async () => {
		fetchCount++;
		return [{ id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" }];
	};

	const models1 = await service.getModelsForProvider("antigravity");
	assert.equal(fetchCount, 1);
	assert.equal(models1.length, 1);

	// Second call should return from cache with no additional fetch
	const models2 = await service.getModelsForProvider("antigravity");
	assert.equal(fetchCount, 1);
	assert.deepEqual(models2, models1);

	// Refresh cache should allow re-fetching
	service.refreshAgentsCache();
	const models3 = await service.getModelsForProvider("antigravity");
	assert.equal(fetchCount, 2);
	assert.deepEqual(models3, models1);
});

test("context chip attach, pin, and remove state updates work immediately and reliably", async () => {
	const leaf = {};
	const plugin = {
		settings: {
			aiProvider: "antigravity",
			aiProviderLastModel: {},
			aiReasoningEffort: "auto",
			aiScope: "active-note",
			aiMode: "safe",
			aiConnections: [],
		},
		aiService: { getModelsForProvider: async () => [] },
		isPathIgnored: () => false,
		saveSettings: async () => {},
	};

	const view = new AIChatView(leaf, plugin);
	const noteA = new globalThis.__TestTFile("README Draft.md");
	noteA.name = "README Draft.md";
	const noteB = new globalThis.__TestTFile("main.ts");
	noteB.name = "main.ts";

	let currentActive = noteA;
	view.app = {
		workspace: {
			getActiveFile: () => currentActive,
		},
	};

	let emptyCalls = 0;
	let renderedState = {};
	view.contextChipEl = {
		empty: () => { emptyCalls++; renderedState = {}; },
		show: () => {},
		hide: () => { renderedState.hidden = true; },
		addClass: (cls) => { renderedState.cls = cls; },
		removeClass: () => {},
		createSpan: (opts) => {
			if (opts?.text) renderedState.fileName = opts.text;
			return { title: "" };
		},
		createEl: (tag, opts) => {
			renderedState.tag = tag;
			if (opts?.cls) renderedState.btnCls = opts.cls;
			return {
				addEventListener: () => {},
				createSpan: (sOpts) => {
					if (sOpts?.text) renderedState.attachText = sOpts.text;
					return {};
				},
			};
		},
	};

	// 1. Initial render attaches noteA
	view.updateContextChip();
	assert.equal(emptyCalls, 1);
	assert.equal(renderedState.fileName, "README Draft.md");
	assert.equal(view.contextExcluded, false);

	// 2. Second render with same file does NOT empty or rebuild DOM
	view.updateContextChip();
	assert.equal(emptyCalls, 1); // No change!

	// 3. Pinning noteA
	view.togglePinContext(noteA);
	assert.equal(view.isContextPinned, true);
	assert.equal(view.pinnedContextFile, noteA);
	assert.equal(emptyCalls, 2);

	// 4. Switching active note while pinned stays on noteA
	currentActive = noteB;
	view.updateContextChip();
	assert.equal(emptyCalls, 2); // Still noteA pinned, no DOM rebuild!

	// 5. Unpinning
	view.togglePinContext(noteA);
	assert.equal(view.isContextPinned, false);
	assert.equal(emptyCalls, 3);
	assert.equal(renderedState.fileName, "main.ts");

	// 6. Removing context (clicking x)
	view.removeContext();
	assert.equal(view.contextExcluded, true);
	assert.equal(emptyCalls, 4);
	assert.ok(renderedState.attachText.includes("Attach: main.ts"));

	// 7. Switching active note while excluded updates attach button, stays detached
	currentActive = noteA;
	view.updateContextChip();
	assert.equal(emptyCalls, 5);
	assert.ok(renderedState.attachText.includes("Attach: README Draft.md"));
	assert.equal(view.contextExcluded, true);

	// 8. Re-attaching via attachActiveFile updates immediately back to attached state!
	view.attachActiveFile(noteA);
	assert.equal(view.contextExcluded, false);
	assert.equal(view.chatScope, "active-note");
	assert.equal(emptyCalls, 6);
	assert.equal(renderedState.fileName, "README Draft.md");
});

test("streaming follows the bottom only until the reader scrolls away", () => {
	const view = Object.create(AIChatView.prototype);
	view.messagesContainerEl = { scrollTop: 100, scrollHeight: 1000 };
	view.followOutput = false;
	view.scrollToBottom();
	assert.equal(view.messagesContainerEl.scrollTop, 100);
	view.scrollToBottom(true);
	assert.equal(view.messagesContainerEl.scrollTop, 1000);
	assert.equal(view.followOutput, true);
});

test("Stop invalidates pending submissions and labels an otherwise empty reply", () => {
	const view = Object.create(AIChatView.prototype);
	view.submissionId = 7;
	view.renderRafId = null;
	view.isGenerating = true;
	const message = { id: "assistant-1", content: "" };
	view.messages = [message];
	const body = {};
	view.currentStreamingMsgEl = { getAttribute: () => message.id, querySelector: () => body };
	let killed = false;
	view.activeProcessHandle = { kill: () => { killed = true; } };
	let rendered;
	view.renderMessageBody = (content, target) => { rendered = { content, target }; return Promise.resolve(); };
	view.updateSendButtonState = () => {};
	view.scrollToBottom = () => {};
	view.stopGenerating();
	assert.equal(killed, true);
	assert.equal(view.submissionId, 8);
	assert.equal(view.isGenerating, false);
	assert.equal(message.content, "Response stopped.");
	assert.equal(rendered.target, body);
});

test("late message layout follows the latest reply unless the reader scrolls up", () => {
	const previousObserver = globalThis.ResizeObserver;
	let notifyResize;
	let disconnected = 0;
	globalThis.ResizeObserver = class {
		constructor(callback) { notifyResize = callback; }
		disconnect() { disconnected++; }
	};
	try {
		const view = Object.create(AIChatView.prototype);
		const listeners = {};
		const list = { scrollTop: 0, scrollHeight: 100, clientHeight: 100,
			addEventListener: (name, callback) => { listeners[name] = callback; },
			querySelectorAll: () => [],
		};
		view.renderMessages = () => {};
		view.followOutput = true;
		view.buildMessageList({ createDiv: () => list });
		list.scrollHeight = 900;
		notifyResize();
		assert.equal(list.scrollTop, 900);
		list.scrollTop = 50;
		listeners.scroll();
		list.scrollHeight = 1200;
		notifyResize();
		assert.equal(list.scrollTop, 50);
		list.scrollTop = 1100;
		listeners.scroll();
		list.scrollHeight = 1400;
		notifyResize();
		assert.equal(list.scrollTop, 1400);
		view.disposeMessageRendering();
		assert.equal(disconnected, 1);
	} finally { globalThis.ResizeObserver = previousObserver; }
});

test("Continue prepares a follow-up with the original context and never sends or overwrites drafts", () => {
	const view = Object.create(AIChatView.prototype);
	const original = { path: "Note/original.md" };
	view.messages = [{ id: "user-1", role: "user", content: "Add a translation" }];
	view.safeRequest = { userId: "user-1", file: original, quote: null, scope: "active-note" };
	view.mode = "safe"; view.isGenerating = false;
	view.continueBtnEl = { hidden: true };
	view.inputEl = { value: "", focus() {} };
	view.updateModeBtnLabel = () => {};
	view.renderSelectionQuote = () => {};
	view.updateVaultToggleState = () => {};
	view.updateContextChip = () => {};
	view.autoResizeTextarea = () => {};
	view.updateSendButtonState = () => view.updateContinueAction();
	let sent = 0; view.handleSubmit = () => { sent++; };
	view.updateContinueAction();
	assert.equal(view.continueBtnEl.hidden, true);
	view.setMode("edit");
	assert.equal(sent, 0);
	assert.equal(view.continueBtnEl.hidden, false);
	view.inputEl.value = "My unsent draft";
	view.prepareContinuation();
	assert.equal(view.inputEl.value, "My unsent draft");
	view.inputEl.value = "";
	view.prepareContinuation();
	assert.equal(view.inputEl.value, "Please carry out my previous request in edit mode.");
	assert.equal(view.pinnedContextFile, original);
	assert.equal(view.isContextPinned, true);
	assert.equal(view.safeRequest, null);
	assert.equal(view.continueBtnEl.hidden, true);
	assert.equal(sent, 0);
});

test("Continue is unavailable during generation or after another user request", () => {
	const view = Object.create(AIChatView.prototype);
	view.mode = "edit"; view.isGenerating = true;
	view.continueBtnEl = { hidden: false }; view.inputEl = { value: "" };
	view.messages = [{ id: "user-1", role: "user" }];
	view.safeRequest = { userId: "user-1" };
	view.updateContinueAction(); assert.equal(view.continueBtnEl.hidden, true);
	view.isGenerating = false;
	view.messages.push({ id: "user-2", role: "user" });
	view.updateContinueAction(); assert.equal(view.continueBtnEl.hidden, true);
});

test("an older chat load cannot replace a more recently opened conversation", async () => {
	const plugin = {
		settings: { aiProvider: "claude", aiProviderLastModel: {}, aiConnections: [] },
		aiService: { isProviderAvailable: async () => true, getModelsForProvider: async () => [] },
		aiStorage: { parseChat: text => ({ metadata: { title: text, provider: "claude" }, messages: [{ role: "assistant", content: text }] }) },
	};
	const view = new AIChatView({}, plugin);
	let resolveOld;
	view.app = { vault: { read: file => file.path === "old.md" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve("Latest") } };
	for (const method of ["renderSelectionQuote", "updateProviderBtnLabel", "updateModelBtnLabel", "updateEffortBtn", "updateVaultToggleState", "updateModeBtnLabel", "updateContextChip", "renderMessages"]) view[method] = () => {};
	const old = view.loadChatFromFile(new globalThis.__TestTFile("old.md"));
	const latest = new globalThis.__TestTFile("latest.md");
	await view.loadChatFromFile(latest);
	resolveOld("Old"); await old;
	assert.equal(view.currentChatFile, latest);
	assert.equal(view.currentChatTitle, "Latest");
	assert.equal(view.messages[0].content, "Latest");
});

function chatFixHarness({read=async()=> 'Attached text',create}={}) {
  const saves=[],requests=[],rendered=[];
  const note=new globalThis.__TestTFile('Note/test.md');note.name='test.md';
  const history=new globalThis.__TestTFile('agent-chats/test.md');
  const plugin={settings:{aiProvider:'antigravity',aiProviderLastModel:{antigravity:'chosen-model'},aiMode:'safe',aiScope:'active-note',aiReasoningEffort:'auto',aiChatFolder:'agent-chats',aiConnections:[]},
    isPathIgnored:()=>false,saveSettings:async()=>{},
    aiStorage:{formatDateTime:()=> '2026-10-27T12:00:00',updateChatNote:async(file,metadata,messages)=>{saves.push({file,metadata,messages});},
      createChatNote:create||(async()=>history),updateChatModel:async()=>{}},
    aiService:{getModelsForProvider:async()=>[{id:'default',displayName:'Agent default'}],sendMessage:options=>{requests.push(options);return {kill(){}};}}};
  const view=new AIChatView({},plugin);
  function element(options={}) {
    const children=[];const el={children,attributes:{...options.attr},cls:options.cls||'',empty(){children.length=0;},remove(){},
      createDiv:o=>add(o),createSpan:o=>add(o),createEl:(_tag,o)=>add(o),getAttribute:key=>el.attributes[key],
      querySelector:selector=>children.find(child=>selector.startsWith('.')&&child.cls.split(' ').includes(selector.slice(1)))||null,
      querySelectorAll:()=>[],addEventListener(){},setText(){},addClass(){},removeClass(){},removeAttribute(){},show(){}};
    function add(o){const child=element(o);children.push(child);return child;}return el;
  }
  view.app={vault:{read,getAbstractFileByPath:()=>note},workspace:{getActiveFile:()=>note}};
  view.inputEl={value:'Explain this note',focus(){}};view.messagesContainerEl=element();view.headerTitleEl=element();
  view.currentChatFile=history;
  for(const name of ['renderSelectionQuote','updateVaultToggleState','updateContextChip','autoResizeTextarea','updateSendButtonState','renderMessageBubble','scrollToBottom','updateProviderBtnLabel','updateModelBtnLabel','updateEffortBtn','updateModeBtnLabel','renderMessages'])view[name]=()=>{};
  view.renderMessageBody=async text=>{rendered.push(text);};view.scheduleStreamingRender=()=>{};
  return {view,plugin,saves,requests,rendered,note,history};
}

test('Stop persists the user request and partial response and rejects late callbacks',async()=>{
  const h=chatFixHarness();await h.view.handleSubmit();
  h.requests[0].onDelta('Partial answer');h.view.stopGenerating();await h.view.chatSaveTask;
  assert.equal(h.saves.at(-1).messages.at(-1).content,'Partial answer');
  assert.equal(h.saves.at(-1).messages.at(-2).content,'Explain this note');
  h.requests[0].onDone('Late completion');assert.equal(h.view.messages.at(-1).content,'Partial answer');
});

test('switching chats keeps the saved file, metadata and transcript snapshots together',async()=>{
  const h=chatFixHarness();await h.view.handleSubmit();h.requests[0].onDelta('Old partial');
  h.view.startNewChat();await h.view.chatSaveTask;
  const saved=h.saves.at(-1);assert.equal(saved.file,h.history);assert.equal(saved.messages.at(-1).content,'Old partial');
  assert.equal(h.view.messages.length,0);assert.equal(h.view.currentChatFile,null);
});

test('closing a chat waits for the interrupted transcript save',async()=>{
  const h=chatFixHarness();await h.view.handleSubmit();h.requests[0].onDelta('Before closing');
  await h.view.onClose();assert.equal(h.saves.at(-1).messages.at(-1).content,'Before closing');
});

test('unreadable attached notes stop submission and preserve a translated error in history',async()=>{
  const h=chatFixHarness({read:async()=>{throw Error('Read failed');}});
  await h.view.handleSubmit();await h.view.chatSaveTask;
  assert.equal(h.requests.length,0);assert.equal(h.view.isGenerating,false);
  assert.match(h.saves.at(-1).messages.at(-1).content,/original note is no longer available/);
});

test('stopping while the first history file is being created retains the partial conversation',async()=>{
  let resolve,creating;
  const begun=new Promise(r=>{creating=r;});const created=new Promise(r=>{resolve=r;});
  const h=chatFixHarness({create:async()=>{creating();return created;}});h.view.currentChatFile=null;
  const submission=h.view.handleSubmit();await begun;h.view.stopGenerating();resolve(h.history);await submission;await h.view.chatSaveTask;
  assert.equal(h.requests.length,0);assert.equal(h.view.currentChatFile,h.history);
  assert.equal(h.saves.at(-1).messages[0].content,'Explain this note');assert.equal(h.saves.at(-1).messages.at(-1).content,'Response stopped.');
});

test('late first-file creation cannot attach its old transcript to a new chat',async()=>{
  let resolve,creating;const begun=new Promise(r=>{creating=r;});const created=new Promise(r=>{resolve=r;});
  const h=chatFixHarness({create:async()=>{creating();return created;}});h.view.currentChatFile=null;
  const submission=h.view.handleSubmit();await begun;h.view.startNewChat();resolve(h.history);await submission;await h.view.chatSaveTask;
  assert.equal(h.view.currentChatFile,null);assert.equal(h.view.messages.length,0);
  assert.equal(h.saves.at(-1).file,h.history);assert.equal(h.saves.at(-1).messages[0].content,'Explain this note');
});

test('continuing after Stop shares a pending first chat file instead of splitting the history',async()=>{
  let resolve,creating,creates=0;const begun=new Promise(r=>{creating=r;});const created=new Promise(r=>{resolve=r;});
  const h=chatFixHarness({create:async()=>{creates++;creating();return created;}});h.view.currentChatFile=null;
  const first=h.view.handleSubmit();await begun;h.view.stopGenerating();
  h.view.inputEl.value='Continue please';const second=h.view.handleSubmit();
  await Promise.resolve();resolve(h.history);await Promise.all([first,second]);
  assert.equal(creates,1);assert.equal(h.requests.length,1);assert.equal(h.view.currentChatFile,h.history);
  h.requests[0].onDone('Continued answer');await h.view.chatSaveTask;
  assert.equal(h.saves.at(-1).messages.length,4);assert.equal(h.saves.at(-1).messages.at(-1).content,'Continued answer');
});

test('queued transcript snapshots remain ordered and a failed save does not prevent a later save',async()=>{
  const h=chatFixHarness();h.view.messages=[{id:'a',role:'assistant',content:'First',timestamp:0}];
  let calls=0;const previous=console.error;console.error=()=>{};
  h.plugin.aiStorage.updateChatNote=async(file,metadata,messages)=>{calls++;if(calls===1)throw Error('Temporary failure');h.saves.push({file,metadata,messages});};
  try{
    const first=h.view.persistChat();h.view.messages[0].content='Second';const second=h.view.persistChat();
    await Promise.all([first,second]);assert.equal(calls,2);assert.equal(h.saves[0].messages[0].content,'Second');
  }finally{console.error=previous;}
});
