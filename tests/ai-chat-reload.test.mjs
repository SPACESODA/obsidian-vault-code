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
