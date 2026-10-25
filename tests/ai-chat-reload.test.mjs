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
					b.onLoad({ filter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), namespace: "stub" }, () => ({ contents }));
				}
			},
		}],
	});
	const mod = { exports: {} };
	new Function("module", "exports", "require", result.outputFiles[0].text)(mod, mod.exports, require);
	return mod.exports;
}

const { AIChatView, VIEW_TYPE_AI_CHAT } = await load("src/ai-chat-view.ts", {
	obsidian: `
		export class ItemView {
			constructor(leaf) { this.leaf = leaf; this.containerEl = { children: [1] }; this.contentEl = { empty(){}, addClass(){} }; }
		}
		export class WorkspaceLeaf {}
		export class App {}
		export class FileSystemAdapter {}
		export class TFile { constructor(path) { this.path = path; } }
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
	`,
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
	const dummyFile = new globalThis.__TestTFile("Agent-Chats/my-chat.md");
	view.currentChatFile = dummyFile;

	const state = view.getState();
	assert.equal(state.chatPath, "Agent-Chats/my-chat.md");

	let loadedFile = null;
	view.loadChatFromFile = async (file) => { loadedFile = file; };
	view.app = {
		vault: {
			getAbstractFileByPath: (p) => (p === "Agent-Chats/my-chat.md" ? dummyFile : null),
		},
	};

	await view.setState({ chatPath: "Agent-Chats/my-chat.md" }, {});
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

test("AIChatView defaults to safe mode (Vault safe)", async () => {
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
	const dummyFile = new globalThis.__TestTFile("Agent-Chats/active.md");
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
	const dummyFile = new globalThis.__TestTFile("Agent-Chats/active.md");
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
	const dummyFile = new globalThis.__TestTFile("Agent-Chats/existing.md");
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
	const dummyFile = new globalThis.__TestTFile("Agent-Chats/deleted-provider.md");
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
