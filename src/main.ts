import {
	Plugin,
	PluginSettingTab,
	Setting,
	App,
	Notice,
	TextFileView,
	WorkspaceLeaf,
	TFile,
	TFolder,
	TAbstractFile,
	ButtonComponent,
	Modal,
	FuzzySuggestModal,
	FuzzyMatch,
	OpenViewState,
	Platform,
	setIcon,
	getIcon,
	normalizePath,
	Scope,
	ViewStateResult,
	requestUrl,
	Menu,
	View,
} from "obsidian";
import {
	EditorView,
	lineNumbers,
	highlightActiveLineGutter,
	highlightSpecialChars,
	drawSelection,
	dropCursor,
	rectangularSelection,
	crosshairCursor,
	highlightActiveLine,
	keymap,
	Panel,
	ViewUpdate,
	Command,
	ViewPlugin,
	Decoration,
	DecorationSet,
	WidgetType,
} from "@codemirror/view";
import {
	EditorState,
	Transaction,
	Extension,
	Compartment,
	Prec,
	EditorSelection,
	countColumn,
	StateField,
	RangeSetBuilder,
} from "@codemirror/state";
import {
	defaultKeymap,
	history,
	historyKeymap,
	undo,
	redo,
	isolateHistory,
	indentWithTab,
	toggleBlockComment,
} from "@codemirror/commands";
import {
	search,
	openSearchPanel,
	closeSearchPanel,
	searchPanelOpen,
	searchKeymap,
	highlightSelectionMatches,
	SearchQuery,
	setSearchQuery,
	getSearchQuery,
	findNext,
	findPrevious,
	selectMatches,
	replaceNext,
	replaceAll,
} from "@codemirror/search";
import {
	foldGutter,
	foldKeymap,
	bracketMatching,
	indentOnInput,
	syntaxHighlighting,
	defaultHighlightStyle,
	HighlightStyle,
	LanguageDescription,
	LanguageSupport,
	indentString,
	indentUnit,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
	closeBrackets,
	closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { languages } from "@codemirror/language-data";
import {
	unifiedMergeView,
	goToNextChunk,
	goToPreviousChunk,
	getChunks,
	acceptChunk,
	rejectChunk,
} from "@codemirror/merge";
import { PreviewError } from "./preview-errors";
import { DATA_PREVIEW_EXTENSIONS, PREVIEW_LIMITS } from "./file-preview-data";
import { FilePreviewRenderer, formatPreviewError } from "./file-preview";
import { PreviewSaveGuard, previewLineEnding, previewDocumentBytes, decodePreviewBytes, tableEditModel, type CellChange } from "./file-preview-edit";
import { t, setLanguage, SUPPORTED_LANGUAGES } from "./i18n";
import { BUILTIN_EXTENSION_COUNT, additionalEditorExtensions, editableEditorExtensions } from "./editor-extensions";
import { normalizeEditorFontScale } from "./editor-font-scale";
import { ensureChatPropertyTypes } from "./ai-chat-property-types";
import { ExternalFolderFeature } from "./external-folders-ui";
import { GitService } from "./git-service";
import {
	AIService,
	AIProvider,
	ALL_AGENT_DEFS,
	AGENT_INSTALL_CONFIGS,
} from "./ai-service";
import { AIChatView, VIEW_TYPE_AI_CHAT } from "./ai-chat-view";
import { ChatLeafManager } from "./ai-chat-leaf";
import { AIStorage } from "./ai-storage";
import { type AIConnection, connectionProvider, normalizeConnections } from "./ai-connections";
import { renderConnectionSettings } from "./ai-connections-settings";
import { preserveSettingsScroll } from "./settings-scroll";
import { agentSelectionExtension } from "./ai-selection-extension";
import type { SelectionQuote } from "./ai-selection";
import { createCustomMenu } from "./custom-menu";
import { observeExplorerIgnore, filterExplorerRows } from "./explorer-ignore";
import { IgnoreMatcher, parseGitignore, type IgnoreRule, EMPTY_IGNORE_RULES } from "./ignore-rules";
import { guardIgnoredTraversal, CoalescedScan, scanFolderTree } from "./vault-scan";

/* ── View type constants ───────────────────────────────────── */

/**
 * Sets the code editor icon, preferring `</>` (`code-xml` / `code-2`) over `<>` (`code`).
 */
export function setCodeIcon(el: HTMLElement): void {
	if (getIcon("code-xml")) {
		setIcon(el, "code-xml");
	} else if (getIcon("code-2")) {
		setIcon(el, "code-2");
	} else {
		setIcon(el, "code");
	}
}

/**
 * Opens an external URL directly in the user's system default browser (Safari, Chrome, etc.)
 * rather than Obsidian's internal web viewer.
 */
export function openInDefaultBrowser(url: string): void {
	if (Platform.isDesktopApp) {
		try {
			const electron = (
				window as unknown as {
					require?: (module: string) => {
						shell?: { openExternal: (targetUrl: string) => Promise<void> };
					};
				}
			).require?.("electron");
			if (electron?.shell?.openExternal) {
				void electron.shell.openExternal(url);
				return;
			}
		} catch {
			// Fallback if electron require fails
		}
	}

	try {
		window.open(url, "_system");
	} catch {
		window.open(url, "_blank");
	}
}

export const VIEW_TYPE_DOTFILE = "vault-code-editor";

/** Formats that support visual live-preview toggling inside the editor. */
export const PREVIEWABLE_EXTENSIONS = new Set(["svg", "html", "htm", "mjml", ...DATA_PREVIEW_EXTENSIONS]);

/** All code and data file extensions supported for direct opening and editing. */
export const SUPPORTED_EXTENSIONS = new Set([
	"mmd",
	"mermaid",
	"asm",
	"astro",
	"bash",
	"bat",
	"bib",
	"c",
	"c3",
	"cc",
	"cjs",
	"cl",
	"clj",
	"cljc",
	"cljs",
	"cls",
	"cmake",
	"cmd",
	"comp",
	"cpp",
	"cs",
	"css",
	"csv",
	"cts",
	"cu",
	"cuh",
	"cxx",
	"dart",
	"diff",
	"dpk",
	"dpr",
	"edn",
	"el",
	"elm",
	"email",
	"eml",
	"erl",
	"ex",
	"exs",
	"f",
	"f03",
	"f08",
	"f77",
	"f90",
	"f95",
	"fish",
	"for",
	"frag",
	"fs",
	"fsi",
	"fsx",
	"fx",
	"fxh",
	"gd",
	"gdshader",
	"gdshaderinc",
	"geom",
	"gleam",
	"glsl",
	"go",
	"gql",
	"gradle",
	"graphql",
	"groovy",
	"gsh",
	"gvy",
	"gy",
	"h",
	"handlebars",
	"hbs",
	"hcl",
	"hh",
	"hlsl",
	"hpp",
	"hrl",
	"hs",
	"htm",
	"html",
	"hxx",
	"ini",
	"java",
	"jl",
	"js",
	"json",
	"json5",
	"jsonc",
	"jsonl",
	"jsx",
	"kt",
	"kts",
	"less",
	"lhs",
	"liquid",
	"lisp",
	"log",
	"lot",
	"lsp",
	"lua",
	"m",
	"make",
	"mdx",
	"mjml",
	"mjs",
	"mk",
	"ml",
	"mli",
	"mm",
	"mts",
	"ndjson",
	"nim",
	"nimble",
	"nims",
	"nix",
	"odin",
	"pas",
	"patch",
	"php",
	"phtml",
	"pine",
	"pl",
	"pm",
	"pp",
	"prisma",
	"proto",
	"ps1",
	"psd1",
	"psm1",
	"py",
	"pyi",
	"pyw",
	"r",
	"rake",
	"rb",
	"rs",
	"s",
	"sass",
	"sbt",
	"sc",
	"scala",
	"scm",
	"scss",
	"sh",
	"sol",
	"sql",
	"ss",
	"sty",
	"svelte",
	"svg",
	"swift",
	"tex",
	"text",
	"tf",
	"tfvars",
	"toml",
	"tres",
	"ts",
	"tscn",
	"tsrx",
	"tsv",
	"tsx",
	"txt",
	"vert",
	"vue",
	"wat",
	"wgsl",
	"xml",
	"xsd",
	"yaml",
	"yml",
	"zig",
	"zon",
	"zsh",
]);

/** Comprehensive list of binary extensions that must NEVER be opened or saved as text. */
export const BINARY_EXTENSIONS = new Set([
	// Documents & presentations
	"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
	"pages", "numbers", "keynote", "rtf",
	// Archives & compressed (including dotLottie zip packages)
	"zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "xz", "zst", "iso", "dmg", "pkg", "lottie",
	// Images (except SVG which is text/XML)
	"png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "heif", "avif", "apng", "psd", "ai",
	// Audio & video
	"mp3", "wav", "m4a", "flac", "aac", "ogg", "wma",
	"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
	// Executables, binaries & database
	"exe", "dll", "so", "dylib", "bin", "dat", "db", "sqlite", "sqlite3", "class",
	"pyc", "pyo", "wasm", "node", "apk", "aab", "ipa",
]);

/* ── VS Code Syntax Highlighting Style ───────────────────────── */

export const vaultCodeHighlightStyle = HighlightStyle.define([
	// Control keywords (if, return, for, while, switch, import, export, from, await, try, catch)
	{
		tag: [
			tags.controlKeyword,
			tags.moduleKeyword,
		],
		color: "var(--vc-control, #c586c0)",
	},

	// General Keywords & Language constructs (const, let, var, function, class, new, typeof)
	{
		tag: [
			tags.keyword,
			tags.definitionKeyword,
			tags.operatorKeyword,
			tags.modifier,
		],
		color: "var(--vc-keyword, #569cd6)",
	},
	{
		tag: [tags.self],
		color: "var(--vc-keyword, #569cd6)",
		fontStyle: "italic",
	},

	// HTML / XML / SVG Elements & Tags
	{
		tag: tags.tagName,
		color: "var(--vc-tag, #569cd6)",
	},
	{
		tag: [tags.angleBracket],
		color: "var(--vc-tag-bracket, #808080)",
	},

	// HTML / XML Attributes
	{
		tag: [tags.attributeName],
		color: "var(--vc-attribute, #9cdcfe)",
	},

	// Object Properties & JSON keys
	{
		tag: [tags.propertyName],
		color: "var(--vc-property, #9cdcfe)",
	},

	// Functions, Methods & Function Definitions
	{
		tag: [
			tags.function(tags.variableName),
			tags.function(tags.propertyName),
			tags.macroName,
		],
		color: "var(--vc-function, #dcdcaa)",
	},

	// Types, Classes, Namespaces & Interfaces
	{
		tag: [
			tags.typeName,
			tags.standard(tags.typeName),
			tags.namespace,
			tags.definition(tags.className),
			tags.changed,
		],
		color: "var(--vc-type, #4ec9b0)",
	},

	// CSS Selectors & Classes
	{
		tag: [tags.className],
		color: "var(--vc-css-selector, #d7ba7d)",
	},

	// Strings, Characters & Attribute Values
	{
		tag: [tags.string, tags.character],
		color: "var(--vc-string, #ce9178)",
	},
	{
		tag: [tags.attributeValue],
		color: "var(--vc-string, #ce9178)",
	},
	{
		tag: [tags.special(tags.string), tags.escape],
		color: "var(--vc-escape, #d7ba7d)",
	},
	{
		tag: tags.regexp,
		color: "var(--vc-regex, #d16969)",
	},

	// Numbers, Units & Constants
	{
		tag: [tags.number, tags.integer, tags.float, tags.unit],
		color: "var(--vc-number, #b5cea8)",
	},
	{
		tag: [tags.bool, tags.null],
		color: "var(--vc-keyword, #569cd6)",
	},
	{
		tag: [tags.atom],
		color: "var(--vc-constant, #4fc1ff)",
	},

	// Operators & Punctuation
	{
		tag: [tags.operator, tags.compareOperator, tags.logicOperator, tags.arithmeticOperator],
		color: "var(--vc-operator, #d4d4d4)",
	},
	{
		tag: [tags.punctuation, tags.separator, tags.bracket],
		color: "var(--vc-punctuation, #d4d4d4)",
	},

	// Comments
	{
		tag: [
			tags.comment,
			tags.lineComment,
			tags.blockComment,
			tags.docComment,
		],
		color: "var(--vc-comment, #6a9955)",
		fontStyle: "italic",
	},

	// Meta, DOCTYPE, Processing Instructions (e.g. <?php ?> or <!DOCTYPE>)
	{
		tag: [
			tags.meta,
			tags.documentMeta,
			tags.processingInstruction,
			tags.annotation,
		],
		color: "var(--vc-meta, #c586c0)",
	},

	// CSS Colors
	{
		tag: tags.color,
		color: "var(--vc-string, #ce9178)",
	},

	// Variables & Definitions
	{
		tag: [
			tags.definition(tags.variableName),
			tags.variableName,
			tags.special(tags.variableName),
		],
		color: "var(--vc-variable, #9cdcfe)",
	},

	// Markdown / Documentation formatting
	{
		tag: tags.heading,
		color: "var(--vc-keyword, #569cd6)",
		fontWeight: "bold",
	},
	{
		tag: tags.link,
		color: "var(--vc-string, #ce9178)",
		textDecoration: "underline",
	},
	{
		tag: tags.emphasis,
		fontStyle: "italic",
	},
	{
		tag: tags.strong,
		fontWeight: "bold",
	},
	{
		tag: tags.monospace,
		color: "var(--vc-string, #ce9178)",
	},

	// Diff / Git
	{
		tag: tags.inserted,
		color: "var(--vc-type, #4ec9b0)",
		backgroundColor: "rgba(78, 201, 176, 0.15)",
	},
	{
		tag: tags.deleted,
		color: "#f14c4c",
		backgroundColor: "rgba(241, 76, 76, 0.15)",
	},

	// Errors
	{
		tag: tags.invalid,
		color: "#f14c4c",
	},
]);

/* ── CodeMirror Theme for Selections & Highlights ───────────── */

export const vaultCodeTheme = EditorView.theme({
	"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
		backgroundColor: "var(--vc-selection, var(--text-selection, rgba(80, 140, 255, 0.3)))",
	},
	"& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
		backgroundColor: "var(--vc-selection, var(--text-selection, rgba(80, 140, 255, 0.3)))",
	},
	".cm-selectionBackground": {
		backgroundColor: "var(--vc-selection, var(--text-selection, rgba(80, 140, 255, 0.3)))",
	},
	".cm-selectionMatch": {
		backgroundColor: "var(--vc-search-match, var(--text-highlight-bg, rgba(255, 230, 0, 0.35)))",
		borderRadius: "2px",
	},
	".cm-searchMatch": {
		backgroundColor: "var(--vc-search-match, var(--text-highlight-bg, rgba(255, 230, 0, 0.35)))",
		borderRadius: "2px",
	},
	".cm-searchMatch.cm-searchMatch-selected": {
		backgroundColor: "var(--vc-search-match-selected, var(--text-highlight-bg-active, rgba(255, 150, 0, 0.45)))",
		outline: "1px solid var(--interactive-accent)",
		outlineOffset: "-1px",
		borderRadius: "2px",
	},
});

/* ── Type augmentations for internal Obsidian APIs ─────────── */

declare module "obsidian" {
	interface Vault {
		getConfig(key: string): unknown;
		setConfig(key: string, value: unknown): void;
	}
}

/** Internal adapter methods that exist at runtime but aren't typed. */
interface PrivateAdapter {
	fsPromises?: { stat(path: string): Promise<{ isDirectory(): boolean }> };
	_exists(fullPath: string, path: string): Promise<boolean>;
	getFullPath(path: string): string;
	getFullRealPath(realPath: string): string;
	getRealPath(path: string): string;
	listRecursive(path: string): Promise<void>;
	reconcileDeletion(realPath: string, path: string): Promise<void>;
	reconcileFileInternal?(realPath: string, path: string): Promise<void>;
	reconcileFolderCreation(realPath: string, path: string): Promise<void>;
}

/* ── Settings ──────────────────────────────────────────────── */

interface VaultCodeSettings {
	showAllFileTypes: boolean;
	showHiddenFiles: boolean;
	allowEditDotfiles: boolean;
	allowEditCodeFiles: boolean;
	disableAutoSave: boolean;
	customFileExtensions: string;
	preventAutoOpenUnsupported: boolean;
	openUnsupportedOnDoubleClick: boolean;
	useObsidianIgnore: boolean;
	useGitIgnore: boolean;
	language: string;
	tabSize: string;
	indentWithTabs: string;
	lineWrapping: boolean;
	editorFontScale: number;
	enableGitIntegration: boolean;
	enableAIChat: boolean;
	aiProvider: AIProvider;
	aiConnections: AIConnection[];
	aiModel: string;
	aiCodexModel: string;
	aiReasoningEffort: "auto" | "low" | "medium" | "high";
	aiProviderLastModel?: Record<string, string>;
	aiScope: "active-note" | "vault";
	aiMode: "safe" | "edit";
	aiChatFolder: string;
	aiChatAutoClean: "never" | "7d" | "30d" | "90d";
	aiAttachInstructions: boolean;
}


export const DEFAULT_OBSIDIANIGNORE_CONTENT = `# Obsidian & Git
.obsidian/
.git/
.trash/

# macOS
.DS_Store
._*

# Windows
Thumbs.db
desktop.ini

# Folders & Files
agent-chats/
`;

const DEFAULT_SETTINGS: VaultCodeSettings = {
	showAllFileTypes: true,
	showHiddenFiles: true,
	allowEditDotfiles: true,
	allowEditCodeFiles: true,
	disableAutoSave: true,
	customFileExtensions: "",
	preventAutoOpenUnsupported: true,
	openUnsupportedOnDoubleClick: false,
	useObsidianIgnore: true,
	useGitIgnore: false,
	language: "auto",
	tabSize: "auto",
	indentWithTabs: "auto",
	lineWrapping: true,
	editorFontScale: 100,
	enableGitIntegration: true,
	enableAIChat: true,
	aiProvider: "antigravity",
	aiConnections: [],
	aiModel: "gemini-3.8-flash-medium",
	aiCodexModel: "gpt-6.1-sol",
	aiReasoningEffort: "auto",
	aiProviderLastModel: {
		antigravity: "default",
		codex: "default",
		claude: "default",
		copilot: "default",
		cursor: "default",
		ollama: "default",
		kimi: "default",
		grok: "default",
		aider: "default",
		opencode: "default",
		pi: "default",
	},
	aiScope: "active-note",
	aiMode: "safe",
	aiChatFolder: "agent-chats",
	aiChatAutoClean: "never",
	aiAttachInstructions: true,
};

/** Check if any segment of a path is a dotfile or dotfolder. */
function isDotPath(path: string): boolean {
	const segments = path.split("/");
	return segments.some((s) => s.startsWith("."));
}

/* ── Confirm Close Modal ───────────────────────────────────── */

class ConfirmCloseModal extends Modal {
	private titleText: string;
	private bodyText: string;
	private onSave: () => Promise<void> | void;
	private onDiscard: () => void;

	constructor(
		app: App,
		titleText: string,
		bodyText: string,
		onSave: () => Promise<void> | void,
		onDiscard: () => void,
	) {
		super(app);
		this.titleText = titleText;
		this.bodyText = bodyText;
		this.onSave = onSave;
		this.onDiscard = onDiscard;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-confirm-modal");

		contentEl.createEl("h3", {
			text: this.titleText,
		});

		contentEl.createEl("p", {
			text: this.bodyText,
		});

		const buttonContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons hidden-files-confirm-buttons",
		});

		const discardBtn = buttonContainer.createEl("button", {
			cls: "hidden-files-btn-discard",
			text: t("modalButtonDiscard"),
		});
		discardBtn.addEventListener("click", () => {
			this.close();
			this.onDiscard();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		const saveBtn = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: t("modalButtonSave"),
		});
		saveBtn.addEventListener("click", () => {
			this.close();
			void this.onSave();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Confirm Replace All Modal ─────────────────────────────── */

class ConfirmReplaceAllModal extends Modal {
	private countDisplay: string;
	private searchStr: string;
	private replaceStr: string;
	private onConfirm: () => void;

	constructor(
		app: App,
		countDisplay: string,
		searchStr: string,
		replaceStr: string,
		onConfirm: () => void,
	) {
		super(app);
		this.countDisplay = countDisplay;
		this.searchStr = searchStr;
		this.replaceStr = replaceStr;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-confirm-modal");

		contentEl.createEl("h3", {
			text: t("modalReplaceAllTitle"),
		});

		contentEl.createEl("p", {
			text: t(
				"modalReplaceAllMessage",
				this.countDisplay,
				this.searchStr,
				this.replaceStr,
			),
		});

		const buttonContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons",
		});

		const replaceAllBtn = buttonContainer.createEl("button", {
			cls: "mod-warning",
			text: t("modalButtonReplaceAll"),
		});
		replaceAllBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		// Auto-focus confirm button
		replaceAllBtn.focus();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Confirm Revert Modal ───────────────────────────────────── */

class ConfirmRevertModal extends Modal {
	private fileName: string;
	private onRevert: () => Promise<void> | void;

	constructor(
		app: App,
		fileName: string,
		onRevert: () => Promise<void> | void,
	) {
		super(app);
		this.fileName = fileName;
		this.onRevert = onRevert;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-confirm-modal");

		contentEl.createEl("h3", { text: t("gitModalRevertTitle") });
		contentEl.createEl("p", {
			text: t("gitModalRevertDesc", this.fileName),
		});

		const buttonContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons hidden-files-confirm-buttons",
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		const revertBtn = buttonContainer.createEl("button", {
			cls: "mod-warning",
			text: t("gitModalRevertConfirm"),
		});
		revertBtn.addEventListener("click", () => {
			this.close();
			void this.onRevert();
		});

		revertBtn.focus();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Commit File Modal ─────────────────────────────────────── */

class CommitFileModal extends Modal {
	private fileName: string;
	private onCommit: (message: string) => Promise<void> | void;
	private inputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		fileName: string,
		onCommit: (message: string) => Promise<void> | void,
	) {
		super(app);
		this.fileName = fileName;
		this.onCommit = onCommit;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-commit-modal");

		contentEl.createEl("h3", { text: t("gitModalCommitTitle") });

		const desc = contentEl.createEl("p", { cls: "hidden-files-modal-desc" });
		desc.createSpan({
			text: this.fileName,
			cls: "vault-code-setting-filename",
		});

		const form = contentEl.createEl("form");
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const msg = this.inputEl?.value.trim() || `Update ${this.fileName}`;
			this.close();
			void this.onCommit(msg);
		});

		const defaultMsg = `Update ${this.fileName}`;
		this.inputEl = form.createEl("input", {
			type: "text",
			cls: "hidden-files-modal-input",
			placeholder: t("gitModalCommitPlaceholder", this.fileName),
		});
		this.inputEl.value = defaultMsg;

		const buttonContainer = form.createDiv({
			cls: "hidden-files-modal-buttons",
		});

		const cancelBtn = buttonContainer.createEl("button", {
			type: "button",
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		buttonContainer.createEl("button", {
			type: "submit",
			cls: "mod-cta",
			text: t("gitModalCommitConfirm"),
		});

		window.setTimeout(() => {
			if (this.inputEl) {
				this.inputEl.focus();
				this.inputEl.select();
			}
		}, 30);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Branch Switcher Modal ─────────────────────────────────── */

class BranchSwitcherModal extends FuzzySuggestModal<string> {
	private plugin: VaultCodePlugin;
	private branches: string[];
	private currentBranch: string;

	constructor(
		app: App,
		plugin: VaultCodePlugin,
		branches: string[],
		currentBranch: string,
	) {
		super(app);
		this.plugin = plugin;
		this.branches = branches;
		this.currentBranch = currentBranch;
		this.setPlaceholder(t("gitSwitchBranchPlaceholder"));
	}

	getItems(): string[] {
		return this.branches;
	}

	getItemText(item: string): string {
		return item;
	}

	renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		if (match.item === this.currentBranch) {
			el.createSpan({
				cls: "vault-code-branch-current-tag",
				text: `(${t("gitCurrentBranchBadge")})`,
			});
		}
	}

	onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
		if (item === this.currentBranch) {
			return;
		}
		void (async () => {
			const res = await this.plugin.gitService.checkoutBranch(item);
			if (res.success) {
				new Notice(t("gitNoticeBranchSwitched", item));
				await this.plugin.refreshGitState();
			} else {
				new Notice(
					`${t("gitNoticeBranchSwitchFailed")}${res.error ? `: ${res.error}` : ""}`,
				);
			}
		})();
	}
}

/* ── Changed Files Modal ───────────────────────────────────── */

class ChangedFilesModal extends FuzzySuggestModal<TFile> {
	private plugin: VaultCodePlugin;
	private files: TFile[];

	constructor(app: App, plugin: VaultCodePlugin, files: TFile[]) {
		super(app);
		this.plugin = plugin;
		this.files = files;
		this.setPlaceholder(t("gitChangedFilesModalPlaceholder"));
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		el.addClass("mod-complex");
		const iconContainer = el.createDiv({ cls: "suggestion-icon" });
		const iconEl = iconContainer.createSpan({ cls: "suggestion-flair" });
		setIcon(iconEl, "git-compare");
		const contentEl = el.createDiv({ cls: "suggestion-content" });
		const titleEl = contentEl.createDiv({ cls: "suggestion-title" });
		super.renderSuggestion(match, titleEl);
		if (match.item.parent && !match.item.parent.isRoot()) {
			titleEl.createSpan({
				cls: "vault-code-branch-current-tag",
				text: ` (${match.item.parent.path})`,
			});
		}
	}

	onChooseItem(item: TFile): void {
		void this.plugin.openFileInDiffView(item);
	}
}

/* ── Create Branch Modal ───────────────────────────────────── */

class CreateBranchModal extends Modal {
	private plugin: VaultCodePlugin;
	private inputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;

	constructor(app: App, plugin: VaultCodePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-form-modal");

		contentEl.createEl("h3", { text: t("gitCreateBranchTitle") });

		contentEl.createEl("p", {
			cls: "hidden-files-modal-desc",
			text: t("gitCreateBranchDesc"),
		});

		const inputContainer = contentEl.createDiv({
			cls: "hidden-files-modal-input-container",
		});
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			cls: "hidden-files-modal-input",
			placeholder: t("gitCreateBranchPlaceholder"),
			attr: {
				"aria-label": t("gitCreateBranchName"),
			},
		});

		this.errorEl = contentEl.createDiv({
			cls: "hidden-files-modal-error",
		});
		this.errorEl.hide();

		const btnContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons",
		});

		const cancelBtn = btnContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const createBtn = btnContainer.createEl("button", {
			cls: "mod-cta",
			text: t("gitButtonCreateBranch"),
		});
		createBtn.addEventListener("click", () => void this.handleSubmit());

		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void this.handleSubmit();
			} else if (evt.key === "Escape") {
				this.close();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.clearError();
		});

		window.setTimeout(() => {
			this.inputEl.focus();
		}, 50);
	}

	private showError(message: string): void {
		this.errorEl.setText(message);
		this.errorEl.show();
		this.inputEl.addClass("has-error");
		this.inputEl.focus();
	}

	private clearError(): void {
		this.errorEl.setText("");
		this.errorEl.hide();
		this.inputEl.removeClass("has-error");
	}

	private async handleSubmit(): Promise<void> {
		const raw = this.inputEl.value.trim();
		if (!raw) {
			this.showError(t("gitBranchEmptyError"));
			return;
		}
		if (/\s/.test(raw)) {
			this.showError(t("gitBranchSpaceError"));
			return;
		}

		const res = await this.plugin.gitService.createBranch(raw);
		if (res.success) {
			this.close();
			new Notice(t("gitNoticeBranchCreated", raw));
			await this.plugin.refreshGitState();
		} else {
			this.showError(res.error ?? t("gitNoticeBranchCreateFailed"));
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Create File Modal ─────────────────────────────────────── */

class CreateFileModal extends Modal {
	private plugin: VaultCodePlugin;
	private targetFolder: TFolder;
	private inputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		plugin: VaultCodePlugin,
		targetFolder?: TFolder | null,
	) {
		super(app);
		this.plugin = plugin;
		this.targetFolder = targetFolder ?? app.vault.getRoot();
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-form-modal");

		contentEl.createEl("h3", { text: t("modalCreateFileTitle") });

		const folderPath =
			this.targetFolder.isRoot() || !this.targetFolder.path
				? "Vault root"
				: this.targetFolder.path;
		const infoDiv = contentEl.createDiv({
			cls: "hidden-files-modal-destination",
		});
		const iconSpan = infoDiv.createSpan({
			cls: "hidden-files-modal-dest-icon",
		});
		setIcon(iconSpan, "folder");
		infoDiv.createSpan({
			text: folderPath,
			cls: "hidden-files-modal-dest-path",
		});

		const inputContainer = contentEl.createDiv({
			cls: "hidden-files-modal-input-container",
		});
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			cls: "hidden-files-modal-input",
			placeholder: t("modalCreateFilePlaceholder"),
		});

		this.errorEl = contentEl.createDiv({
			cls: "hidden-files-modal-error",
		});
		this.errorEl.hide();

		const btnContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons",
		});

		const cancelBtn = btnContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const createBtn = btnContainer.createEl("button", {
			cls: "mod-cta",
			text: t("modalButtonCreate"),
		});
		createBtn.addEventListener("click", () => void this.handleSubmit());

		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void this.handleSubmit();
			} else if (evt.key === "Escape") {
				this.close();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.clearError();
		});

		window.setTimeout(() => {
			this.inputEl.focus();
		}, 50);
	}

	private showError(message: string): void {
		this.errorEl.setText(message);
		this.errorEl.show();
		this.inputEl.addClass("has-error");
		this.inputEl.focus();
	}

	private clearError(): void {
		this.errorEl.empty();
		this.errorEl.hide();
		this.inputEl.removeClass("has-error");
	}

	private async handleSubmit(): Promise<void> {
		const raw = this.inputEl.value.trim();
		if (!raw) {
			this.showError(t("modalCreateFileEmptyError"));
			return;
		}

		if (/[\\:*?"<>|]/.test(raw)) {
			this.showError(t("modalCreateFilePathInvalidError"));
			return;
		}

		const parentPath = this.targetFolder.isRoot()
			? ""
			: this.targetFolder.path;
		const fullRelPath = normalizePath(
			parentPath ? `${parentPath}/${raw}` : raw,
		);

		// If user input ended with '/', create folder instead
		if (raw.endsWith("/")) {
			try {
				await this.plugin.createFolderRecursive(fullRelPath);
				new Notice(t("noticeCreated", fullRelPath));
				this.close();
			} catch (e) {
				this.showError(e instanceof Error ? e.message : String(e));
			}
			return;
		}

		// Check intermediate parent directories
		const segments = fullRelPath.split("/");
		let testPath = "";
		for (let i = 0; i < segments.length - 1; i++) {
			const segment = segments[i];
			if (!segment) continue;
			testPath = testPath ? `${testPath}/${segment}` : segment;
			let stat = null;
			try {
				stat = await this.app.vault.adapter.stat(testPath);
			} catch {
				stat = null;
			}
			if (stat && stat.type === "file") {
				this.showError(
					`Cannot create: '${segment}' is an existing file, not a folder.`,
				);
				return;
			}
		}

		// Check if destination file or folder already exists
		if (await this.app.vault.adapter.exists(fullRelPath)) {
			const fileName = segments[segments.length - 1] ?? raw;
			this.showError(t("modalCreateFileExistsError", fileName));
			return;
		}

		try {
			const file = await this.plugin.createFileWithFolders(fullRelPath);
			this.close();
			if (file) {
				await this.plugin.openCreatedFile(file);
			}
		} catch (e) {
			this.showError(e instanceof Error ? e.message : String(e));
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Rename Modal ──────────────────────────────────────────── */

class RenameModal extends Modal {
	private plugin: VaultCodePlugin;
	private file: TAbstractFile;
	private inputEl!: HTMLInputElement;
	private errorEl!: HTMLElement;

	constructor(
		app: App,
		plugin: VaultCodePlugin,
		file: TAbstractFile,
	) {
		super(app);
		this.plugin = plugin;
		this.file = file;
	}

	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-form-modal");

		const isFolder = this.file instanceof TFolder;
		contentEl.createEl("h3", {
			text: isFolder
				? t("modalRenameFolderTitle")
				: t("modalEditFileNameAndExtensionTitle"),
		});

		const infoDiv = contentEl.createDiv({
			cls: "hidden-files-modal-destination",
		});
		const iconSpan = infoDiv.createSpan({
			cls: "hidden-files-modal-dest-icon",
		});
		setIcon(iconSpan, isFolder ? "folder" : "file");
		infoDiv.createSpan({
			text: this.file.path,
			cls: "hidden-files-modal-dest-path",
		});

		const inputContainer = contentEl.createDiv({
			cls: "hidden-files-modal-input-container",
		});
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			cls: "hidden-files-modal-input",
			value: this.file.name,
			placeholder: t("modalRenamePlaceholder"),
		});

		this.errorEl = contentEl.createDiv({
			cls: "hidden-files-modal-error",
		});
		this.errorEl.hide();

		const btnContainer = contentEl.createDiv({
			cls: "hidden-files-modal-buttons",
		});

		const cancelBtn = btnContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const renameBtn = btnContainer.createEl("button", {
			cls: "mod-cta",
			text: t("modalButtonRename"),
		});
		renameBtn.addEventListener("click", () => void this.handleSubmit());

		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void this.handleSubmit();
			} else if (evt.key === "Escape") {
				this.close();
			}
		});

		this.inputEl.addEventListener("input", () => {
			this.clearError();
		});

		window.setTimeout(() => {
			this.inputEl.focus();
			// Select only the basename by default if it is a file with extension
			if (this.file instanceof TFile && this.file.extension) {
				const dotIndex = this.file.name.lastIndexOf(".");
				if (dotIndex > 0) {
					this.inputEl.setSelectionRange(0, dotIndex);
					return;
				}
			}
			this.inputEl.select();
		}, 50);
	}

	private showError(message: string): void {
		this.errorEl.setText(message);
		this.errorEl.show();
		this.inputEl.addClass("has-error");
		this.inputEl.focus();
	}

	private clearError(): void {
		this.errorEl.empty();
		this.errorEl.hide();
		this.inputEl.removeClass("has-error");
	}

	private async handleSubmit(): Promise<void> {
		const newName = this.inputEl.value.trim();
		if (!newName) {
			this.showError(t("modalCreateFileEmptyError"));
			return;
		}

		if (newName === this.file.name) {
			this.close();
			return;
		}

		if (
			/[\\/:*?"<>|]/.test(newName) ||
			newName === "." ||
			newName === ".."
		) {
			this.showError(t("modalCreateFilePathInvalidError"));
			return;
		}

		const parentPath =
			!this.file.parent || this.file.parent.isRoot()
				? ""
				: this.file.parent.path;
		const newPath = normalizePath(
			parentPath ? `${parentPath}/${newName}` : newName,
		);

		if (await this.app.vault.adapter.exists(newPath)) {
			this.showError(t("modalCreateFileExistsError", newName));
			return;
		}

		try {
			await this.plugin.renameFileOrFolder(this.file, newName);
			new Notice(`${t("modalButtonRename")}: ${newName}`);
			this.close();
		} catch (e) {
			this.showError(e instanceof Error ? e.message : String(e));
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/* ── Modern Obsidian-Native Search Panel for CodeMirror 6 ──── */

class ModernSearchPanel implements Panel {
	dom: HTMLElement;
	private view: EditorView;
	private query: SearchQuery;
	private searchInput: HTMLTextAreaElement;
	private replaceInput: HTMLTextAreaElement;
	private countEl: HTMLElement;
	private caseBtn: HTMLElement;
	private wordBtn: HTMLElement;
	private regexBtn: HTMLElement;
	private replaceRowEl: HTMLElement;
	private replaceToggleBtn: HTMLElement;
	private isReplaceOpen = false;
	private isCaseSensitive = false;
	private isRegex = false;
	private isWholeWord = false;
	private app?: App;

	constructor(view: EditorView, app?: App) {
		this.view = view;
		this.app = app;
		const currentQuery = getSearchQuery(view.state);
		this.isCaseSensitive = currentQuery.caseSensitive;
		this.isRegex = currentQuery.regexp;
		this.isWholeWord = currentQuery.wholeWord;
		this.query = currentQuery;

		this.dom = createDiv({ cls: "hidden-files-search-panel" });

		// Row 1: Search row
		const searchRow = this.dom.createDiv({
			cls: "hidden-files-search-row",
		});

		// Toggle Replace button (chevron / expander)
		this.replaceToggleBtn = searchRow.createEl("button", {
			cls: "clickable-icon hidden-files-search-chevron-btn",
			attr: {
				"aria-label": t("searchToggleReplaceTooltip"),
				type: "button",
			},
		});
		setIcon(this.replaceToggleBtn, "chevron-right");
		this.replaceToggleBtn.addEventListener("click", () => {
			this.setReplaceOpen(!this.isReplaceOpen);
			if (this.isReplaceOpen) {
				this.replaceInput.focus();
				this.replaceInput.select();
			} else {
				this.searchInput.focus();
			}
		});

		// Search Input Wrapper
		const searchInputWrapper = searchRow.createDiv({
			cls: "hidden-files-search-input-wrapper",
		});

		this.searchInput = searchInputWrapper.createEl("textarea", {
			cls: "hidden-files-search-input",
			attr: {
				rows: "1",
				name: "search",
				"main-field": "true",
				placeholder: t("searchFindPlaceholder"),
				"aria-label": t("searchFindAriaLabel"),
				spellcheck: "false",
				autocomplete: "off",
			},
		});
		this.searchInput.value = this.query.search;
		this.autoResizeInput(this.searchInput);

		// Match count pill
		this.countEl = searchInputWrapper.createSpan({
			cls: "hidden-files-search-count",
		});
		this.countEl.hide();

		// Toggle buttons group (Case, Word, Regex) inside input wrapper
		const togglesWrapper = searchInputWrapper.createDiv({
			cls: "hidden-files-search-toggles",
		});

		this.caseBtn = togglesWrapper.createEl("button", {
			cls: "hidden-files-search-toggle-btn",
			text: "Aa",
			attr: {
				"aria-label": t("searchMatchCase"),
				type: "button",
			},
		});
		this.caseBtn.toggleClass("is-active", this.isCaseSensitive);
		this.caseBtn.addEventListener("click", () => {
			this.isCaseSensitive = !this.isCaseSensitive;
			this.caseBtn.toggleClass("is-active", this.isCaseSensitive);
			this.commit();
		});

		this.wordBtn = togglesWrapper.createEl("button", {
			cls: "hidden-files-search-toggle-btn",
			text: "\\b",
			attr: {
				"aria-label": t("searchWholeWord"),
				type: "button",
			},
		});
		this.wordBtn.toggleClass("is-active", this.isWholeWord);
		this.wordBtn.addEventListener("click", () => {
			this.isWholeWord = !this.isWholeWord;
			this.wordBtn.toggleClass("is-active", this.isWholeWord);
			this.commit();
		});

		this.regexBtn = togglesWrapper.createEl("button", {
			cls: "hidden-files-search-toggle-btn",
			text: ".*",
			attr: {
				"aria-label": t("searchRegex"),
				type: "button",
			},
		});
		this.regexBtn.toggleClass("is-active", this.isRegex);
		this.regexBtn.addEventListener("click", () => {
			this.isRegex = !this.isRegex;
			this.regexBtn.toggleClass("is-active", this.isRegex);
			this.commit();
		});

		// Navigation buttons: Previous, Next, Select All
		const navBtnsWrapper = searchRow.createDiv({
			cls: "hidden-files-search-actions",
		});

		const prevBtn = navBtnsWrapper.createEl("button", {
			cls: "clickable-icon",
			attr: {
				"aria-label": t("searchPreviousMatch"),
				type: "button",
			},
		});
		setIcon(prevBtn, "chevron-up");
		prevBtn.addEventListener("click", () => {
			findPrevious(this.view);
		});

		const nextBtn = navBtnsWrapper.createEl("button", {
			cls: "clickable-icon",
			attr: {
				"aria-label": t("searchNextMatch"),
				type: "button",
			},
		});
		setIcon(nextBtn, "chevron-down");
		nextBtn.addEventListener("click", () => {
			findNext(this.view);
		});

		const selectAllBtn = navBtnsWrapper.createEl("button", {
			cls: "clickable-icon",
			attr: {
				"aria-label": t("searchSelectAll"),
				type: "button",
			},
		});
		setIcon(selectAllBtn, "check-check");
		selectAllBtn.addEventListener("click", () => {
			selectMatches(this.view);
		});

		// Row 2: Replace row
		this.replaceRowEl = this.dom.createDiv({
			cls: "hidden-files-replace-row",
		});
		this.replaceRowEl.hide();

		const replaceInputWrapper = this.replaceRowEl.createDiv({
			cls: "hidden-files-replace-input-wrapper",
		});

		this.replaceInput = replaceInputWrapper.createEl("textarea", {
			cls: "hidden-files-search-input",
			attr: {
				rows: "1",
				name: "replace",
				placeholder: t("searchReplacePlaceholder"),
				"aria-label": t("searchReplaceAriaLabel"),
				spellcheck: "false",
				autocomplete: "off",
			},
		});
		this.replaceInput.value = this.query.replace;
		this.autoResizeInput(this.replaceInput);

		const replaceBtnsWrapper = this.replaceRowEl.createDiv({
			cls: "hidden-files-replace-actions",
		});

		const replaceBtn = replaceBtnsWrapper.createEl("button", {
			cls: "clickable-icon hidden-files-search-action-icon",
			attr: {
				"aria-label": t("searchReplace"),
				type: "button",
			},
		});
		setIcon(replaceBtn, getIcon("replace") ? "replace" : "arrow-left-right");
		replaceBtn.addEventListener("click", () => {
			replaceNext(this.view);
		});

		const replaceAllBtn = replaceBtnsWrapper.createEl("button", {
			cls: "clickable-icon hidden-files-search-action-icon",
			attr: {
				"aria-label": t("searchReplaceAll"),
				type: "button",
			},
		});
		setIcon(replaceAllBtn, getIcon("replace-all") ? "replace-all" : "check-check");
		replaceAllBtn.addEventListener("click", () => {
			this.promptReplaceAll();
		});

		// Input event listeners
		this.searchInput.addEventListener("input", () => {
			this.autoResizeInput(this.searchInput);
			this.commit();
		});
		this.replaceInput.addEventListener("input", () => {
			this.autoResizeInput(this.replaceInput);
			this.commit();
		});

		// Keyboard navigation
		this.dom.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				closeSearchPanel(this.view);
				this.view.focus();
				return;
			}
			if (e.key === "c" && e.altKey) {
				e.preventDefault();
				this.isCaseSensitive = !this.isCaseSensitive;
				this.caseBtn.toggleClass("is-active", this.isCaseSensitive);
				this.commit();
				return;
			}
			if (e.key === "w" && e.altKey) {
				e.preventDefault();
				this.isWholeWord = !this.isWholeWord;
				this.wordBtn.toggleClass("is-active", this.isWholeWord);
				this.commit();
				return;
			}
			if (e.key === "r" && e.altKey) {
				e.preventDefault();
				this.isRegex = !this.isRegex;
				this.regexBtn.toggleClass("is-active", this.isRegex);
				this.commit();
				return;
			}
			if (e.key === "Enter" && e.target === this.searchInput) {
				if (e.shiftKey || e.ctrlKey || e.metaKey) {
					// Shift+Enter, Ctrl+Enter, Cmd+Enter: break line (insert newline)
					e.preventDefault();
					const start = this.searchInput.selectionStart ?? this.searchInput.value.length;
					const end = this.searchInput.selectionEnd ?? this.searchInput.value.length;
					this.searchInput.setRangeText("\n", start, end, "end");
					this.autoResizeInput(this.searchInput);
					this.commit();
					return;
				}
				e.preventDefault();
				if (e.altKey) {
					selectMatches(this.view);
				} else {
					findNext(this.view);
				}
				return;
			}
			if (e.key === "Enter" && e.target === this.replaceInput) {
				if (e.shiftKey || e.ctrlKey || e.metaKey) {
					// Shift+Enter, Ctrl+Enter, Cmd+Enter: break line (insert newline)
					e.preventDefault();
					const start = this.replaceInput.selectionStart ?? this.replaceInput.value.length;
					const end = this.replaceInput.selectionEnd ?? this.replaceInput.value.length;
					this.replaceInput.setRangeText("\n", start, end, "end");
					this.autoResizeInput(this.replaceInput);
					this.commit();
					return;
				}
				e.preventDefault();
				replaceNext(this.view);
				return;
			}
		});

		// Custom event to reveal replace row when triggered by Mod-H
		this.dom.addEventListener("open-replace", () => {
			this.setReplaceOpen(true);
		});
	}

	private promptReplaceAll(): void {
		const query = getSearchQuery(this.view.state);
		if (!query.valid || !query.search) {
			return;
		}

		let count = 0;
		try {
			const cursor = query.getCursor(this.view.state);
			while (!cursor.next().done) {
				count++;
				if (count >= 1000) break;
			}
		} catch {
			return;
		}

		if (count === 0) {
			new Notice(t("searchNoResults"));
			return;
		}

		const countDisplay = count >= 1000 ? "999+" : String(count);
		const app = this.app || (window as unknown as { app?: App }).app;
		if (!app) {
			replaceAll(this.view);
			return;
		}

		new ConfirmReplaceAllModal(
			app,
			countDisplay,
			query.search,
			this.replaceInput.value,
			() => {
				replaceAll(this.view);
				new Notice(t("noticeReplaceAllSuccess", countDisplay));
				this.view.focus();
			},
		).open();
	}

	setReplaceOpen(open: boolean): void {
		this.isReplaceOpen = open;
		if (open) {
			this.replaceRowEl.show();
			setIcon(this.replaceToggleBtn, "chevron-down");
		} else {
			this.replaceRowEl.hide();
			setIcon(this.replaceToggleBtn, "chevron-right");
		}
	}

	private commit(): void {
		const query = new SearchQuery({
			search: this.searchInput.value,
			caseSensitive: this.isCaseSensitive,
			regexp: this.isRegex,
			wholeWord: this.isWholeWord,
			replace: this.replaceInput.value,
		});
		if (!query.eq(this.query)) {
			this.query = query;
			this.view.dispatch({ effects: setSearchQuery.of(query) });
		}
		this.updateMatchCount();
	}

	private updateMatchCount(): void {
		if (!this.countEl) return;
		const query = getSearchQuery(this.view.state);
		if (!query.valid || !query.search) {
			this.countEl.setText("");
			this.countEl.hide();
			return;
		}
		try {
			const cursor = query.getCursor(this.view.state);
			let count = 0;
			let current = 0;
			const mainFrom = this.view.state.selection.main.from;
			let item;
			while (!(item = cursor.next()).done) {
				count++;
				if (item.value.from <= mainFrom) {
					current = count;
				}
				if (count >= 1000) break;
			}
			this.countEl.show();
			if (count === 0) {
				this.countEl.setText(t("searchNoResults"));
				this.countEl.addClass("is-no-matches");
			} else {
				this.countEl.removeClass("is-no-matches");
				const countStr = count >= 1000 ? "999+" : String(count);
				this.countEl.setText(t("searchCountMatches", current || 1, countStr));
			}
		} catch {
			this.countEl.show();
			this.countEl.setText(t("searchInvalidRegex"));
			this.countEl.addClass("is-no-matches");
		}
	}

	private autoResizeInput(el: HTMLTextAreaElement): void {
		const baseHeight = "22px";
		el.setCssProps({ "--search-input-height": baseHeight });
		const scrollH = el.scrollHeight;
		if (scrollH > 24) {
			const newHeight = `${Math.min(scrollH, 140)}px`;
			el.setCssProps({ "--search-input-height": newHeight });
			el.toggleClass("is-scrollable", scrollH > 140);
		} else {
			el.setCssProps({ "--search-input-height": baseHeight });
			el.removeClass("is-scrollable");
		}
	}

	mount(): void {
		this.searchInput.focus();
		this.searchInput.select();
		this.autoResizeInput(this.searchInput);
		this.autoResizeInput(this.replaceInput);
		this.updateMatchCount();
	}

	update(update: ViewUpdate): void {
		let queryChanged = false;
		for (const tr of update.transactions) {
			for (const effect of tr.effects) {
				if (effect.is(setSearchQuery)) {
					if (!effect.value.eq(this.query)) {
						this.query = effect.value;
						queryChanged = true;
					}
				}
			}
		}
		if (queryChanged) {
			this.searchInput.value = this.query.search;
			this.replaceInput.value = this.query.replace;
			this.autoResizeInput(this.searchInput);
			this.autoResizeInput(this.replaceInput);
			this.isCaseSensitive = this.query.caseSensitive;
			this.isRegex = this.query.regexp;
			this.isWholeWord = this.query.wholeWord;
			this.caseBtn.toggleClass("is-active", this.isCaseSensitive);
			this.wordBtn.toggleClass("is-active", this.isWholeWord);
			this.regexBtn.toggleClass("is-active", this.isRegex);
		}
		if (update.docChanged || update.selectionSet || queryChanged) {
			this.updateMatchCount();
		}
	}

	get top(): boolean {
		return true;
	}
}

/** HTML void elements that do not require a closing tag. */
const VOID_HTML_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/**
 * VS Code-grade smart newline and auto-indentation handler.
 * Replaces CodeMirror's naive AST-dependent newlineAndIndent to provide:
 * 1. Bracket & HTML Tag explosion: `{|}`, `[|]`, `(|)`, `<tag>|</tag>`
 * 2. Predictable block indent: adds 1 indent unit after `{`, `[`, `(`, `:`, unclosed HTML tags, or block keywords (do, then, etc.).
 * 3. Never adds extra indent after closed constructs: `}`, `};`, `</tag>`, `<span>...</span>`, `end`, etc.
 * 4. Preserves current line indentation for normal statement lines (never snaps back on parser errors).
 */
export const smartNewlineAndIndent: Command = (view: EditorView) => {
	if (view.state.readOnly) return false;
	const viewState = view.state;

	const changes = viewState.changeByRange((range) => {
		const { from } = range;
		let { to } = range;
		const line = viewState.doc.lineAt(from);

		// Consume trailing spaces on current line after cursor if only spaces remain
		while (to < line.to && /\s/.test(line.text[to - line.from] ?? "")) to++;

		const textBefore = line.text.slice(0, from - line.from);
		const textAfter = line.text.slice(to - line.from);
		const trimmedBefore = textBefore.trimEnd();
		const trimmedAfter = textAfter.trimStart();

		const lineIndentStr = /^\s*/.exec(line.text)?.[0] ?? "";
		const lineIndentCol = countColumn(lineIndentStr, viewState.tabSize);
		const oneIndentCol =
			countColumn(viewState.facet(indentUnit), viewState.tabSize) || 4;

		// 1. Bracket & HTML Tag explosion: `{|}`, `[|]`, `(|)`, `<tag>|</tag>`
		const isBrackets =
			(trimmedBefore.endsWith("{") && trimmedAfter.startsWith("}")) ||
			(trimmedBefore.endsWith("[") && trimmedAfter.startsWith("]")) ||
			(trimmedBefore.endsWith("(") && trimmedAfter.startsWith(")"));

		const tagOpenMatch = trimmedBefore.match(
			/<([a-zA-Z0-9_-]+)(?:\s+[^<>]*)?>$/,
		);
		const tagCloseMatch = trimmedAfter.match(/^<\/([a-zA-Z0-9_-]+)>/);
		const isTagExplode = Boolean(
			tagOpenMatch?.[1] &&
				tagCloseMatch?.[1] &&
				tagOpenMatch[1].toLowerCase() ===
					tagCloseMatch[1].toLowerCase() &&
				!trimmedBefore.endsWith("/>"),
		);

		if (isBrackets || isTagExplode) {
			const innerIndent = indentString(
				viewState,
				lineIndentCol + oneIndentCol,
			);
			const outerIndent = indentString(viewState, lineIndentCol);
			const textToInsert =
				viewState.lineBreak +
				innerIndent +
				viewState.lineBreak +
				outerIndent;
			return {
				changes: { from, to, insert: textToInsert },
				range: EditorSelection.cursor(
					from + viewState.lineBreak.length + innerIndent.length,
				),
			};
		}

		// 2. Block comment continuation (JSDoc / C-style)
		if (trimmedBefore === "/**" || trimmedBefore === "/*") {
			const indent = indentString(viewState, lineIndentCol);
			const textToInsert = viewState.lineBreak + indent + " * ";
			return {
				changes: { from, to, insert: textToInsert },
				range: EditorSelection.cursor(from + textToInsert.length),
			};
		}
		const docCommentMatch = textBefore.match(/^(\s*)\*\s*(.*)$/);
		if (docCommentMatch && !trimmedBefore.endsWith("*/")) {
			const commentIndent = docCommentMatch[1];
			const commentBody = docCommentMatch[2];
			if (commentBody === "") {
				// User pressed Enter on an empty comment line " * ", clear the asterisk
				const textToInsert = viewState.lineBreak + commentIndent;
				return {
					changes: { from: line.from, to, insert: textToInsert },
					range: EditorSelection.cursor(
						line.from + textToInsert.length,
					),
				};
			}
			const textToInsert = viewState.lineBreak + commentIndent + "* ";
			return {
				changes: { from, to, insert: textToInsert },
				range: EditorSelection.cursor(from + textToInsert.length),
			};
		}

		let nextIndentCol = lineIndentCol;

		// 3. Open block constructs: {, [, (, :, unclosed HTML tag, or block keywords
		const openBraceCount = (textBefore.match(/\{/g) || []).length;
		const closeBraceCount = (textBefore.match(/\}/g) || []).length;
		const openBracketCount = (textBefore.match(/\[/g) || []).length;
		const closeBracketCount = (textBefore.match(/\]/g) || []).length;
		const openParenCount = (textBefore.match(/\(/g) || []).length;
		const closeParenCount = (textBefore.match(/\)/g) || []).length;

		const openTagName = tagOpenMatch?.[1]?.toLowerCase();
		const isVoidOrSelfClosing =
			Boolean(openTagName) &&
			(trimmedBefore.endsWith("/>") ||
				(openTagName ? VOID_HTML_TAGS.has(openTagName) : false));
		const isTagClosedSameLine =
			Boolean(openTagName && tagOpenMatch) &&
			new RegExp(`</${openTagName}>`, "i").test(
				line.text.slice(tagOpenMatch!.index),
			);

		if (
			trimmedBefore.endsWith("{") ||
			(openBraceCount > closeBraceCount &&
				/[{[(]\s*$/.test(textBefore)) ||
			trimmedBefore.endsWith("[") ||
			(openBracketCount > closeBracketCount &&
				/\[\s*$/.test(textBefore)) ||
			trimmedBefore.endsWith("(") ||
			(openParenCount > closeParenCount && /\(\s*$/.test(textBefore)) ||
			(trimmedBefore.endsWith(":") &&
				!trimmedBefore.startsWith("http:") &&
				!trimmedBefore.startsWith("https:")) ||
			/\b(?:do|then|begin|else|elsif|elif)\b$/.test(trimmedBefore) ||
			(tagOpenMatch && !isVoidOrSelfClosing && !isTagClosedSameLine)
		) {
			nextIndentCol = lineIndentCol + oneIndentCol;
		} else if (
			/[}\])]\s*;?,?$/.test(trimmedBefore) ||
			/<\/[a-zA-Z0-9_-]+>$/.test(trimmedBefore) ||
			/\bend\b$/.test(trimmedBefore)
		) {
			// 4. Closed block: keep line indent exactly, never add extra indent
			nextIndentCol = lineIndentCol;
		} else {
			// 5. Default normal statement line: keep current line indent
			nextIndentCol = lineIndentCol;
		}

		const nextIndentStr = indentString(viewState, nextIndentCol);
		const textToInsert = viewState.lineBreak + nextIndentStr;
		return {
			changes: { from, to, insert: textToInsert },
			range: EditorSelection.cursor(from + textToInsert.length),
		};
	});

	view.dispatch(
		viewState.update(changes, {
			scrollIntoView: true,
			userEvent: "input",
		}),
	);
	return true;
};

/* ── Prevent Stuck Auto-Scroll Extension ────────────────────── */

let isGlobalMouseDown = false;
const activeDragScrollIntervals = new Set<number>();

if (typeof window !== "undefined") {
	window.addEventListener(
		"mousedown",
		(e) => {
			if (e.buttons > 0) isGlobalMouseDown = true;
			if (e.button === 1) {
				// Prevent Chromium middle-click autoscroll mode
				e.preventDefault();
			}
		},
		true,
	);
	window.addEventListener(
		"mouseup",
		() => {
			isGlobalMouseDown = false;
			clearAllDragScrollIntervals();
		},
		true,
	);
	window.addEventListener(
		"pointerup",
		() => {
			isGlobalMouseDown = false;
			clearAllDragScrollIntervals();
		},
		true,
	);
	window.addEventListener(
		"dragend",
		() => {
			isGlobalMouseDown = false;
			clearAllDragScrollIntervals();
		},
		true,
	);
	window.addEventListener(
		"blur",
		() => {
			isGlobalMouseDown = false;
			clearAllDragScrollIntervals();
		},
		true,
	);
}

function clearAllDragScrollIntervals(): void {
	for (const id of activeDragScrollIntervals) {
		try {
			window.clearInterval(id);
		} catch {
			// ignore
		}
	}
	activeDragScrollIntervals.clear();
}

let isMouseSelectionPatched = false;

function patchMouseSelectionPrototype(mouseSel: unknown): void {
	if (isMouseSelectionPatched || !mouseSel) return;
	isMouseSelectionPatched = true;

	const proto = Object.getPrototypeOf(mouseSel) as {
		_vaultCodePatched?: boolean;
		setScrollSpeed?: (sx: number, sy: number) => void;
		scroll?: () => void;
		destroy?: () => void;
		scrolling?: number;
		scrollSpeed?: { x: number; y: number };
		lastEvent?: unknown;
	} | null;

	if (!proto || proto._vaultCodePatched) return;
	proto._vaultCodePatched = true;

	const origSetScrollSpeed = proto.setScrollSpeed;
	if (typeof origSetScrollSpeed === "function") {
		proto.setScrollSpeed = function (sx: number, sy: number) {
			const res = origSetScrollSpeed.call(this, sx, sy);
			if (this.scrolling != null && this.scrolling > -1) {
				activeDragScrollIntervals.add(this.scrolling);
			}
			return res;
		};
	}

	const origScroll = proto.scroll;
	if (typeof origScroll === "function") {
		proto.scroll = function () {
			// If mouse button is not physically held down, kill the interval immediately
			const lastEvent = this.lastEvent as MouseEvent | undefined;
			const hasButton =
				lastEvent && typeof lastEvent.buttons === "number"
					? lastEvent.buttons > 0
					: isGlobalMouseDown;

			if (!hasButton || !isGlobalMouseDown) {
				if (this.scrolling != null && this.scrolling > -1) {
					activeDragScrollIntervals.delete(this.scrolling);
					try {
						window.clearInterval(this.scrolling);
					} catch {
						// ignore
					}
					this.scrolling = -1;
					this.scrollSpeed = { x: 0, y: 0 };
				}
				if (typeof this.destroy === "function") {
					try {
						this.destroy();
					} catch {
						// ignore
					}
				}
				return;
			}

			try {
				origScroll.call(this);
			} catch {
				if (this.scrolling != null && this.scrolling > -1) {
					activeDragScrollIntervals.delete(this.scrolling);
					try {
						window.clearInterval(this.scrolling);
					} catch {
						// ignore
					}
					this.scrolling = -1;
					this.scrollSpeed = { x: 0, y: 0 };
				}
			}
		};
	}

	const origDestroy = proto.destroy;
	if (typeof origDestroy === "function") {
		proto.destroy = function () {
			if (this.scrolling != null && this.scrolling > -1) {
				activeDragScrollIntervals.delete(this.scrolling);
				try {
					window.clearInterval(this.scrolling);
				} catch {
					// ignore
				}
				this.scrolling = -1;
				this.scrollSpeed = { x: 0, y: 0 };
			}
			return origDestroy.call(this);
		};
	}
}

interface InternalMouseSelection {
	scrolling?: number;
	scrollSpeed?: { x: number; y: number };
	setScrollSpeed?: (x: number, y: number) => void;
	destroy?: () => void;
	select?: (event: unknown) => void;
	lastEvent?: unknown;
	dragging?: boolean | null;
}

interface InternalInputState {
	mouseSelection?: InternalMouseSelection | null;
}

interface InternalEditorView {
	inputState?: InternalInputState;
}

function stopInternalMouseSelection(
	view: EditorView,
	selectLastEvent = false,
): void {
	const inputState = (view as unknown as InternalEditorView).inputState;
	const mouseSel = inputState?.mouseSelection;
	if (!mouseSel) return;

	if (
		selectLastEvent &&
		mouseSel.dragging == null &&
		typeof mouseSel.select === "function" &&
		mouseSel.lastEvent
	) {
		try {
			mouseSel.select(mouseSel.lastEvent);
		} catch {
			// ignore
		}
	}

	if (typeof mouseSel.setScrollSpeed === "function") {
		try {
			mouseSel.setScrollSpeed(0, 0);
		} catch {
			// ignore
		}
	}

	if (mouseSel.scrolling != null && mouseSel.scrolling > -1) {
		try {
			window.clearInterval(mouseSel.scrolling);
			mouseSel.scrolling = -1;
		} catch {
			// ignore
		}
	}

	if (typeof mouseSel.destroy === "function") {
		try {
			mouseSel.destroy();
		} catch {
			// ignore
		}
	}

	if (inputState) {
		inputState.mouseSelection = null;
	}
}

/**
 * Extension to prevent and immediately cancel any stuck auto-scrolling loops.
 *
 * In CodeMirror 6, dragging text selection near the top/bottom boundary triggers
 * an internal `setInterval(..., 50)` in `MouseSelection.prototype.setScrollSpeed`.
 * If mouseup occurs outside the editor or is swallowed by another Obsidian UI
 * element calling stopPropagation(), CodeMirror never clears this interval,
 * causing endless slow auto-scrolling until the tab is closed.
 * Middle-click in Chromium/Electron can also trigger continuous autoscroll mode.
 *
 * This extension registers capture-phase listeners on window and view DOM to
 * immediately cancel any mouse-selection scroll loop whenever:
 * 1. Mouse/pointer is released anywhere on the screen (capture phase).
 * 2. Mouse/pointer moves with no buttons held down (e.buttons === 0).
 * 3. The user scrolls manually via trackpad / mouse wheel.
 * 4. The user presses any key (or Escape).
 * 5. The editor or window loses focus (blur) or opens a context menu.
 * 6. Middle-click autoscroll is attempted (e.button === 1).
 */
export function preventStuckAutoScrollExtension(): Extension {
	return ViewPlugin.fromClass(
		class {
			private cleanups: (() => void)[] = [];

			constructor(view: EditorView) {
				const win = view.dom.ownerDocument?.defaultView ?? window;

				const inputState = (view as unknown as InternalEditorView)
					.inputState as {
					_vaultCodeHooked?: boolean;
					startMouseSelection?: (mouseSel: unknown) => void;
				} | undefined;

				if (
					inputState &&
					!inputState._vaultCodeHooked &&
					typeof inputState.startMouseSelection === "function"
				) {
					inputState._vaultCodeHooked = true;
					const origStart =
						inputState.startMouseSelection.bind(inputState);
					inputState.startMouseSelection = (mSel: unknown) => {
						patchMouseSelectionPrototype(mSel);
						return origStart(mSel);
					};
				}

				const onGlobalUp = (e: MouseEvent | PointerEvent) => {
					isGlobalMouseDown = false;
					clearAllDragScrollIntervals();
					if (e.buttons === 0 || e.button === 0) {
						stopInternalMouseSelection(view, true);
					}
				};

				const onGlobalMove = (e: MouseEvent | PointerEvent) => {
					if (e.buttons === 0) {
						isGlobalMouseDown = false;
						clearAllDragScrollIntervals();
						const currentInputState = (
							view as unknown as InternalEditorView
						).inputState;
						if (currentInputState?.mouseSelection) {
							stopInternalMouseSelection(view, false);
						}
					}
				};

				const onCancel = () => {
					clearAllDragScrollIntervals();
					stopInternalMouseSelection(view, false);
				};

				const onGlobalKeyDown = (e: KeyboardEvent) => {
					if (e.key === "Escape") {
						clearAllDragScrollIntervals();
						stopInternalMouseSelection(view, false);
					}
				};

				const onEditorMouseDown = (e: MouseEvent) => {
					if (e.button === 1) {
						// Prevent Chromium middle-click autoscroll mode
						e.preventDefault();
						clearAllDragScrollIntervals();
						stopInternalMouseSelection(view, false);
					}
				};

				// Register global capture-phase listeners on the window
				win.addEventListener("mouseup", onGlobalUp, true);
				win.addEventListener("pointerup", onGlobalUp, true);
				win.addEventListener("mousemove", onGlobalMove, true);
				win.addEventListener("pointermove", onGlobalMove, true);
				win.addEventListener("blur", onCancel, true);
				win.addEventListener("contextmenu", onCancel, true);
				win.addEventListener("keydown", onGlobalKeyDown, {
					capture: true,
					passive: true,
				});

				// Register view-level listeners for scroll wheel and typing
				view.dom.addEventListener("wheel", onCancel, { passive: true });
				view.dom.addEventListener("keydown", onCancel, {
					passive: true,
				});
				view.dom.addEventListener("mousedown", onEditorMouseDown);

				this.cleanups.push(() => {
					win.removeEventListener("mouseup", onGlobalUp, true);
					win.removeEventListener("pointerup", onGlobalUp, true);
					win.removeEventListener("mousemove", onGlobalMove, true);
					win.removeEventListener("pointermove", onGlobalMove, true);
					win.removeEventListener("blur", onCancel, true);
					win.removeEventListener("contextmenu", onCancel, true);
					win.removeEventListener("keydown", onGlobalKeyDown, true);

					view.dom.removeEventListener("wheel", onCancel);
					view.dom.removeEventListener("keydown", onCancel);
					view.dom.removeEventListener(
						"mousedown",
						onEditorMouseDown,
					);
				});
			}

			destroy() {
				clearAllDragScrollIntervals();
				for (const cleanup of this.cleanups) {
					cleanup();
				}
				this.cleanups = [];
			}
		},
	);
}

/* ── Dotfile & Code Editor View ────────────────────────────── */

export class DotfileView extends TextFileView {
	public editor: EditorView | null = null;
	private editorEl: HTMLElement | null = null;
	private previewEl: HTMLElement | null = null;
	private filePreviewRenderer: FilePreviewRenderer | null = null;
	private previewGeneration = 0;
	private previewSave: { file: TFile; guard: PreviewSaveGuard; separator: string; prefix: string } | null = null;
	private previewConflictNotified = false;
	private langEl: HTMLElement | null = null;
	private lineWrapBtnEl: HTMLButtonElement | null = null;
	private searchBtnEl: HTMLButtonElement | null = null;
	private saveBtnEl: HTMLButtonElement | null = null;
	private saveIconEl: HTMLElement | null = null;
	private saveTextEl: HTMLElement | null = null;
	private viewToggleBtnEl: HTMLButtonElement | null = null;
	private viewToggleIconEl: HTMLElement | null = null;
	private viewToggleTextEl: HTMLElement | null = null;
	private dirtyDotEl: HTMLElement | null = null;
	private languageCompartment = new Compartment();
	private lineWrappingCompartment = new Compartment();
	private isLineWrapping = false;
	public plugin: VaultCodePlugin;
	private isModified = false;
	private discardOnClose = false;
	private isPreviewMode = false;
	private headerFileNameEl: HTMLElement | null = null;
	private filePath: string | null = null;
	private gotoLineEl: HTMLElement | null = null;
	private gotoLineInputEl: HTMLInputElement | null = null;
	private gitDiffStatsBtnEl: HTMLButtonElement | null = null;
	private diffCompartment = new Compartment();
	public isDiffMode = false;
	private diffToolbarEl: HTMLElement | null = null;
	private initialDiffRequested = false;
	private isDiffModePending = false;

	constructor(leaf: WorkspaceLeaf, plugin: VaultCodePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "f", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.openFind();
			return false;
		});
		this.scope.register(["Mod"], "h", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.openReplace();
			return false;
		});
		this.scope.register(["Mod", "Alt"], "f", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.openReplace();
			return false;
		});
		this.scope.register(["Alt"], "z", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.toggleLineWrapping();
			return false;
		});
		this.scope.register(["Ctrl"], "g", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.openGotoLine();
			return false;
		});
		this.scope.register(["Mod", "Alt"], "g", (evt: KeyboardEvent) => {
			evt.preventDefault();
			this.openGotoLine();
			return false;
		});
	}

	getViewType(): string {
		return VIEW_TYPE_DOTFILE;
	}

	override getDisplayText(): string {
		if (this.file) return this.file.name;
		if (this.filePath) {
			const parts = this.filePath.split("/");
			return parts[parts.length - 1] || t("settingsGroupCodeEditor");
		}
		return t("settingsGroupCodeEditor");
	}

	override getIcon(): string {
		return "file-code";
	}

	override getState(): Record<string, unknown> {
		const state = super.getState();
		state.file = this.file ? this.file.path : this.filePath;
		state.preview = this.isPreviewMode;
		state.diff = this.isDiffMode;
		return state;
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Record<string, unknown> | null | undefined;
		if (s && typeof s.file === "string") {
			this.filePath = s.file;
			if (!this.file || this.file.path !== s.file) {
				const abstractFile = this.app.vault.getAbstractFileByPath(s.file);
				if (abstractFile instanceof TFile) {
					if (this.file) {
						await this.onUnloadFile(this.file);
					}
					this.file = abstractFile;
					let content = "";
					try {
						content = await this.app.vault.read(abstractFile);
					} catch {
						// ignore
					}
					await this.onLoadFile(abstractFile);
					this.setViewData(content, true);
				}
			}
		}
		if (s && typeof s.preview === "boolean") {
			this.isPreviewMode = s.preview;
		}
		if (s && typeof s.diff === "boolean") {
			this.initialDiffRequested = s.diff;
		}
		await super.setState(state, result);
		// File loading can update the UI before the saved preview flag is restored.
		this.updateViewModeUI();

		if (
			this.initialDiffRequested &&
			this.editor &&
			this.file &&
			this.plugin.isGitAvailable()
		) {
			this.initialDiffRequested = false;
			await this.setDiffMode(true);
		} else if (!this.initialDiffRequested && this.isDiffMode) {
			await this.setDiffMode(false);
		}
	}

	override async onLoadFile(file: TFile): Promise<void> {
		this.filePath = file.path;
		await super.onLoadFile(file);
		if (this.headerFileNameEl) {
			this.headerFileNameEl.setText(file.name);
		}
		this.applyLanguage();
		this.updateStatus();
		this.updateDirtyUI();
		this.updateViewModeUI();
		void this.updateGitStatus();
	}

	canAcceptExtension(extension: string): boolean {
		const ext = extension ? extension.toLowerCase() : "";
		if (BINARY_EXTENSIONS.has(ext)) {
			return false;
		}
		if (this.isDirty()) {
			return false;
		}
		if (ext === "md") {
			return true;
		}
		return this.plugin.isExtensionEditable(ext);
	}

	isDirty(): boolean {
		if (this.discardOnClose) return false;
		return this.isModified;
	}

	discardChanges(): void {
		this.discardOnClose = true;
		this.isModified = false;
	}

	openFind(): void {
		if (this.isPreviewMode) {
			this.toggleViewMode();
		}
		if (this.editor) {
			openSearchPanel(this.editor);
			const searchInput = this.editor.dom.querySelector<HTMLElement & { focus: () => void; select: () => void }>(
				'.hidden-files-search-panel [name="search"]',
			);
			if (searchInput) {
				searchInput.focus();
				searchInput.select();
			}
		}
	}

	openReplace(): void {
		if (this.isPreviewMode) {
			this.toggleViewMode();
		}
		if (this.editor) {
			openSearchPanel(this.editor);
			const panelDom = this.editor.dom.querySelector<HTMLElement>(
				".hidden-files-search-panel",
			);
			if (panelDom) {
				panelDom.dispatchEvent(new CustomEvent("open-replace"));
			}
			const replaceInput = this.editor.dom.querySelector<HTMLElement & { focus: () => void; select: () => void }>(
				'.hidden-files-search-panel [name="replace"]',
			);
			if (replaceInput) {
				replaceInput.focus();
				replaceInput.select();
			}
		}
	}

	closeFind(): void {
		if (this.editor) {
			closeSearchPanel(this.editor);
		}
	}

	toggleSearch(): void {
		if (this.isPreviewMode) {
			this.toggleViewMode();
		}
		if (!this.editor) return;
		if (searchPanelOpen(this.editor.state)) {
			closeSearchPanel(this.editor);
		} else {
			this.openFind();
		}
	}

	openGotoLine(): void {
		if (this.isPreviewMode) {
			this.toggleViewMode();
		}
		if (!this.editor || !this.editorEl) return;

		if (this.gotoLineEl && this.gotoLineInputEl) {
			this.gotoLineInputEl.focus();
			this.gotoLineInputEl.select();
			return;
		}

		const state = this.editor.state;
		const totalLines = state.doc.lines;
		const currentLine = state.doc.lineAt(state.selection.main.head).number;

		const widget = this.editorEl.createDiv({
			cls: "hidden-files-goto-corner-widget",
		});
		this.gotoLineEl = widget;

		const form = widget.createEl("form");
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			this.submitGotoLine();
		});

		const inputWrapper = form.createDiv({
			cls: "hidden-files-goto-input-wrapper",
		});

		const input = inputWrapper.createEl("input", {
			type: "text",
			cls: "hidden-files-goto-input",
			value: String(currentLine),
		});
		input.setAttribute("placeholder", String(currentLine));
		input.setAttribute("aria-label", t("commandGotoLine"));
		this.gotoLineInputEl = input;

		inputWrapper.createSpan({
			cls: "hidden-files-goto-total",
			text: `/ ${totalLines}`,
		});

		form.createEl("button", {
			type: "submit",
			cls: "hidden-files-goto-btn",
			text: t("modalButtonGo"),
		});

		const closeBtn = form.createEl("button", {
			type: "button",
			cls: "hidden-files-goto-close",
			attr: { "aria-label": t("modalButtonCancel") },
		});
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => {
			this.closeGotoLine();
			this.editor?.focus();
		});

		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.closeGotoLine();
				this.editor?.focus();
			}
		});

		window.setTimeout(() => {
			if (this.gotoLineInputEl) {
				this.gotoLineInputEl.focus();
				this.gotoLineInputEl.select();
			}
		}, 20);
	}

	closeGotoLine(): void {
		if (this.gotoLineEl) {
			this.gotoLineEl.remove();
			this.gotoLineEl = null;
			this.gotoLineInputEl = null;
		}
	}

	private submitGotoLine(): void {
		if (!this.gotoLineInputEl || !this.editor) {
			this.closeGotoLine();
			return;
		}

		const raw = this.gotoLineInputEl.value.trim();
		if (!raw) {
			this.closeGotoLine();
			this.editor.focus();
			return;
		}

		const state = this.editor.state;
		const totalLines = state.doc.lines;
		const currentHead = state.selection.main.head;
		const currentLine = state.doc.lineAt(currentHead).number;

		// Match formats: "42", "42:10", "+10", "-5", "50%"
		const match = /^([+-])?(\d+)?(?::(\d+))?(%)?$/.exec(raw);
		if (!match) {
			this.closeGotoLine();
			this.editor.focus();
			return;
		}

		const [, sign, lnStr, clStr, percent] = match;
		const col = clStr ? Math.max(0, parseInt(clStr, 10) - 1) : 0;
		let line = lnStr ? parseInt(lnStr, 10) : currentLine;

		if (lnStr && percent) {
			let pc = line / 100;
			if (sign) {
				pc = pc * (sign === "-" ? -1 : 1) + (currentLine / totalLines);
			}
			line = Math.round(totalLines * pc);
		} else if (lnStr && sign) {
			line = currentLine + (sign === "-" ? -line : line);
		}

		const clampedLine = Math.max(1, Math.min(totalLines, line));
		const docLine = state.doc.line(clampedLine);
		const targetPos = docLine.from + Math.min(col, docLine.length);

		this.editor.dispatch({
			selection: EditorSelection.cursor(targetPos),
			effects: EditorView.scrollIntoView(targetPos, { y: "center" }),
		});
		this.editor.focus();
		this.closeGotoLine();
	}

	async saveExplicitly(): Promise<void> {
		if (this.isBinaryOrNonEditable() || !this.file) return;
		if (this.previewSave?.file === this.file) { await this.saveGuardedPreview(); return; }
		this.data = this.getViewData();
		this.isModified = false;
		this.discardOnClose = false;
		await super.save();
		this.updateDirtyUI();
		this.updateStatus();
		void this.updateGitStatus();
		this.plugin.debouncedUpdateGitStatus();
	}

	private isBinaryOrNonEditable(): boolean {
		if (!this.file) return true;
		const ext = this.file.extension?.toLowerCase() ?? "";
		return (
			BINARY_EXTENSIONS.has(ext) ||
			!this.plugin.isViewableInCodeEditor(this.file)
		);
	}

	override async save(clear?: boolean): Promise<void> {
		if (this.isBinaryOrNonEditable() || this.discardOnClose) {
			return;
		}
		if (this.plugin.settings.disableAutoSave && !this.isModified) {
			return;
		}
		if (this.previewSave?.file === this.file) { await this.saveGuardedPreview(); return; }
		this.data = this.getViewData();
		this.isModified = false;
		await super.save(clear);
		this.updateDirtyUI();
		void this.updateGitStatus();
		this.plugin.debouncedUpdateGitStatus();
	}

	private async saveGuardedPreview(): Promise<void> {
		const session = this.previewSave;
		if (!session || this.file !== session.file || this.discardOnClose) return;
		const document = previewDocumentBytes(this.getViewData(), session.separator, session.prefix);
		try {
			await session.guard.save(() => document, update => this.app.vault.process(session.file, update));
			if (this.file !== session.file) return;
			this.data = session.guard.expected;
			this.isModified = previewDocumentBytes(this.getViewData(), session.separator, session.prefix) !== session.guard.expected;
			this.updateDirtyUI(); this.updateStatus();
			void this.updateGitStatus();
			this.plugin.debouncedUpdateGitStatus();
		} catch (reason: unknown) {
			if (this.file === session.file) { this.isModified = true; this.updateDirtyUI(); }
			if (!this.previewConflictNotified) {
				this.previewConflictNotified = true;
				new Notice(formatPreviewError(reason, "previewSaveFailed"), 10000);
			}
			throw reason;
		}
	}

	private async applyPreviewCellEdit(source: string, file: TFile, change: CellChange, current: () => boolean): Promise<void> {
		const stillCurrent = () => current() && this.isPreviewMode && this.file === file && this.getViewData() === source && Boolean(this.editor) && !this.editor?.state.readOnly && !this.discardOnClose;
		if (!stillCurrent() || this.isBinaryOrNonEditable()) throw new PreviewError("previewChanged");
		const session = this.previewSave?.file === file ? this.previewSave : null;
		const disk = decodePreviewBytes(await this.app.vault.readBinary(file));
		if (!stillCurrent()) throw new PreviewError("previewChanged");
		if (!tableEditModel(disk, file.extension.toLowerCase())) throw new PreviewError("previewFormat");
		const separator = previewLineEnding(disk);
		if (!separator) throw new PreviewError("previewMixedLines");
		if (session?.guard.conflicted || (session ? disk !== session.guard.expected : previewDocumentBytes(disk.replace(/^\uFEFF/, ""), "\n") !== source)) throw new PreviewError("previewUnsaved");
		this.previewSave = session ?? { file, guard: new PreviewSaveGuard(disk), separator, prefix: disk.startsWith("\uFEFF") ? "\uFEFF" : "" };
		this.editor!.dispatch({ changes: change, annotations: [Transaction.userEvent.of("input.preview"), isolateHistory.of("full")] });
		await this.renderPreview();
	}

	private updateDirtyUI(): void {
		const dirty = this.isDirty();

		if (this.dirtyDotEl) {
			this.dirtyDotEl.toggleClass("is-visible", dirty);
		}

		if (this.saveBtnEl) {
			if (dirty) {
				this.saveBtnEl.removeClass("is-saved");
				this.saveBtnEl.addClass("is-dirty");
				if (this.saveIconEl) setIcon(this.saveIconEl, "save");
				if (this.saveTextEl) this.saveTextEl.setText(t("saveChanges"));
				this.saveBtnEl.setAttribute("aria-label", t("saveChangesTooltip"));
			} else {
				this.saveBtnEl.removeClass("is-dirty");
				this.saveBtnEl.addClass("is-saved");
				if (this.saveIconEl) setIcon(this.saveIconEl, "check");
				if (this.saveTextEl) this.saveTextEl.setText(t("saved"));
				this.saveBtnEl.setAttribute("aria-label", t("saved"));
			}
		}
	}

	getViewData(): string {
		return this.editor ? this.editor.state.doc.toString() : this.data;
	}

	setViewData(data: string, clear: boolean): void {
		const session = this.previewSave;
		if (!clear && session?.file === this.file && !session.guard.acceptReload(session.prefix + data, previewDocumentBytes(this.getViewData(), session.separator, session.prefix))) {
			if (session.guard.conflicted && !this.previewConflictNotified) {
				this.previewConflictNotified = true;
				new Notice(t("previewConflict"), 10000);
			}
			return;
		}
		if (!clear && session?.file === this.file) {
			const separator = previewLineEnding(data);
			if (separator) session.separator = separator;
			else this.previewSave = null;
			if (previewDocumentBytes(data, "\n") === this.getViewData()) { this.data = data; return; }
		}
		this.data = data;
		this.isModified = false;
		this.discardOnClose = false;
		if (this.editor) {
			const current = this.editor.state.doc.toString();
			if (current !== data) {
				this.editor.dispatch({
					changes: {
						from: 0,
						to: this.editor.state.doc.length,
						insert: data,
					},
				});
			}
			this.applyLanguage();
			this.updateStatus();
			this.updateDirtyUI();
			this.updateViewModeUI();
		}
	}

	clear(): void {
		this.data = "";
		this.isModified = false;
		this.discardOnClose = false;
		if (this.editor) {
			this.editor.dispatch({
				changes: {
					from: 0,
					to: this.editor.state.doc.length,
					insert: "",
				},
			});
			this.updateStatus();
			this.updateDirtyUI();
		}
	}

	async onOpen(): Promise<void> {
		await super.onOpen();

		if (this.file) {
			const ext = this.file.extension?.toLowerCase() ?? "";
			if (
				BINARY_EXTENSIONS.has(ext) ||
				!this.plugin.isViewableInCodeEditor(this.file)
			) {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.addClass("hidden-files-editor-container");
				const callout = contentEl.createDiv({ cls: "callout" });
				callout.setAttribute("data-callout", "warning");
				const title = callout.createDiv({ cls: "callout-title" });
				title.createDiv({
					cls: "callout-title-inner",
					text: t("calloutBinaryTitle"),
				});
				const content = callout.createDiv({ cls: "callout-content" });
				content.createEl("p", {
					text: t("calloutBinaryDesc", this.file.name),
				});
				return;
			}
		}

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-editor-container");
		this.isLineWrapping = this.plugin.settings.lineWrapping ?? true;

		// Header bar with filename, language badge, and live position
		const headerEl = contentEl.createDiv({
			cls: "hidden-files-editor-header",
		});

		const leftEl = headerEl.createDiv({
			cls: "hidden-files-editor-header-left",
		});
		this.headerFileNameEl = leftEl.createSpan({
			cls: "hidden-files-editor-title",
		});
		this.headerFileNameEl.setText(this.file?.name ?? "Editor");

		this.dirtyDotEl = leftEl.createSpan({
			cls: "hidden-files-editor-dirty-dot",
			text: "●",
		});

		this.langEl = leftEl.createSpan({
			cls: "hidden-files-editor-lang",
		});
		this.langEl.setText(this.getLanguageLabel());

		const rightEl = headerEl.createDiv({
			cls: "hidden-files-editor-header-right",
		});

		// Toggle line wrapping button (icon-only, on the left of search button)
		this.lineWrapBtnEl = rightEl.createEl("button", {
			cls: "clickable-icon hidden-files-editor-wrap-btn",
		});
		setIcon(this.lineWrapBtnEl, "wrap-text");
		this.lineWrapBtnEl.addEventListener("click", () => {
			this.toggleLineWrapping();
		});
		this.updateLineWrappingUI();

		// Find and replace button (icon-only, on the left of View button)
		this.searchBtnEl = rightEl.createEl("button", {
			cls: "clickable-icon hidden-files-editor-search-btn",
		});
		setIcon(this.searchBtnEl, "search");
		const searchTooltip = `${t("searchFindAriaLabel")} / ${t("searchReplace")}`;
		this.searchBtnEl.setAttribute("aria-label", searchTooltip);
		this.searchBtnEl.addEventListener("click", () => {
			this.toggleSearch();
		});

		// Git diff toggle button displaying diff stats (replaces duplicate git icon)
		this.gitDiffStatsBtnEl = rightEl.createEl("button", {
			cls: "vault-code-diff-stats-btn",
			attr: {
				type: "button",
				"aria-label": t("gitViewChanges"),
			},
		});
		this.gitDiffStatsBtnEl.addEventListener("click", () => {
			void this.toggleDiffMode();
		});
		this.gitDiffStatsBtnEl.hide();

		// Code / Preview toggle for supported visual and data formats
		this.viewToggleBtnEl = rightEl.createEl("button", {
			cls: "hidden-files-editor-view-toggle-btn",
		});
		this.viewToggleIconEl = this.viewToggleBtnEl.createSpan({
			cls: "hidden-files-btn-icon",
		});
		this.viewToggleTextEl = this.viewToggleBtnEl.createSpan({
			cls: "hidden-files-btn-text",
		});
		this.viewToggleBtnEl.addEventListener("click", () => {
			this.toggleViewMode();
		});

		this.saveBtnEl = rightEl.createEl("button", {
			cls: "hidden-files-editor-save-btn is-saved",
		});
		this.saveIconEl = this.saveBtnEl.createSpan({
			cls: "hidden-files-btn-icon",
		});
		this.saveTextEl = this.saveBtnEl.createSpan({
			cls: "hidden-files-btn-text",
		});
		this.saveBtnEl.addEventListener("click", () => {
			void this.saveExplicitly();
		});

		this.updateDirtyUI();

		// Editor wrapper
		this.editorEl = contentEl.createDiv({
			cls: "hidden-files-editor-wrapper",
		});

		// Preview container
		this.previewEl = contentEl.createDiv({
			cls: "hidden-files-editor-preview",
		});
		this.previewEl.hide();
		this.previewEl.addEventListener("keydown", event => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || !this.editor || event.isComposing) return;
			const target = event.target as HTMLElement;
			if (target.closest("input, textarea, select")) return;
			if (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") {
				event.preventDefault();
				const action = event.shiftKey || event.key.toLowerCase() === "y" ? redo : undo;
				if (action(this.editor)) void this.renderPreview();
			}
		});

		// Initialize CodeMirror 6 with language compartment
		this.editor = new EditorView({
			state: this.createEditorState(this.data ?? ""),
			parent: this.editorEl,
		});

		this.applyFontScale();
		this.applyLanguage();
		this.updateViewModeUI();

		// Notify Obsidian workspace of CodeMirror editor instance
		this.app.workspace.trigger("codemirror", this.editor);
	}

	private createEditorState(content: string): EditorState {
		let useTab = (this.app.vault.getConfig("useTab") as boolean) ?? true;
		if (this.plugin.settings.indentWithTabs === "tabs") {
			useTab = true;
		} else if (this.plugin.settings.indentWithTabs === "spaces") {
			useTab = false;
		}

		let tabSize = (this.app.vault.getConfig("tabSize") as number) ?? 4;
		if (
			this.plugin.settings.tabSize &&
			this.plugin.settings.tabSize !== "auto"
		) {
			const parsed = parseInt(this.plugin.settings.tabSize, 10);
			if (!isNaN(parsed) && parsed > 0) {
				tabSize = parsed;
			}
		}

		const extensions: Extension[] = [
			this.plugin.createAgentSelectionExtension(),
			preventStuckAutoScrollExtension(),
			lineNumbers(),
			highlightActiveLineGutter(),
			highlightSpecialChars(),
			history(),
			foldGutter({
				markerDOM: (open: boolean) => {
					const el = createDiv({
						cls: `cm-fold-marker ${open ? "is-open" : "is-closed"}`,
					});
					setIcon(el, open ? "chevron-down" : "chevron-right");
					return el;
				},
			}),
			drawSelection(),
			dropCursor(),
			vaultCodeTheme,
			EditorState.allowMultipleSelections.of(true),
			EditorState.tabSize.of(tabSize),
			indentUnit.of(useTab ? "\t" : " ".repeat(tabSize)),
			indentOnInput(),
			syntaxHighlighting(vaultCodeHighlightStyle),
			syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
			bracketMatching(),
			closeBrackets(),
			rectangularSelection(),
			crosshairCursor(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			search({
				top: true,
				createPanel: (view) => new ModernSearchPanel(view, this.app),
			}),
			this.languageCompartment.of([]),
			this.lineWrappingCompartment.of(
				this.isLineWrapping ? EditorView.lineWrapping : [],
			),
			this.diffCompartment.of([]),
			Prec.highest(
				keymap.of([
					{
						key: "Mod-f",
						run: () => {
							this.openFind();
							return true;
						},
						scope: "editor search-panel",
						preventDefault: true,
					},
					{
						key: "Mod-h",
						run: () => {
							this.openReplace();
							return true;
						},
						scope: "editor search-panel",
						preventDefault: true,
					},
					{
						key: "Mod-Alt-f",
						run: () => {
							this.openReplace();
							return true;
						},
						scope: "editor search-panel",
						preventDefault: true,
					},
					// VS Code muscle memory parity
					{
						key: "Ctrl-g",
						run: () => {
							this.openGotoLine();
							return true;
						},
						preventDefault: true,
					},
					{
						key: "Mod-Alt-g",
						run: () => {
							this.openGotoLine();
							return true;
						},
						preventDefault: true,
					},
					{
						key: "Shift-Alt-a",
						run: toggleBlockComment,
						preventDefault: true,
					},
					...closeBracketsKeymap,
					{
						key: "Enter",
						run: smartNewlineAndIndent,
					},
					...defaultKeymap,
					...searchKeymap,
					...historyKeymap,
					...foldKeymap,
					indentWithTab,
					{
						key: "Mod-s",
						run: () => {
							void this.saveExplicitly();
							return true;
						},
					},
					{
						key: "Alt-z",
						run: () => {
							this.toggleLineWrapping();
							return true;
						},
					},
				]),
			),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					if (!this.isBinaryOrNonEditable()) {
						const currentDoc = update.state.doc.toString();
						this.isModified = this.previewSave?.file === this.file ? previewDocumentBytes(currentDoc, this.previewSave.separator, this.previewSave.prefix) !== this.previewSave.guard.expected : currentDoc !== (this.data ?? "");
						this.updateDirtyUI();

						if (!this.plugin.settings.disableAutoSave) {
							this.data = currentDoc;
							this.requestSave();
						}
					}
				}
				if (this.searchBtnEl) {
					this.searchBtnEl.toggleClass(
						"is-active",
						searchPanelOpen(update.state),
					);
				}
			}),
		];

		return EditorState.create({
			doc: content,
			extensions: extensions,
		});
	}

	private applyLanguage(): void {
		if (!this.editor || !this.file) return;

		const filename = this.file.name;
		const ext = this.file.extension?.toLowerCase() ?? "";
		const name = filename.toLowerCase();

		let desc: LanguageDescription | null = null;

		// Plain text and tabular data formats should never be parsed as programming languages
		if (ext === "txt" || ext === "text" || ext === "csv" || ext === "tsv" || ext === "log") {
			desc = null;
		} else {
			desc =
				LanguageDescription.matchFilename(languages, filename.toLowerCase()) ||
				(name === ".gitignore" ||
				name === ".gitattributes" ||
				name === ".dockerignore"
					? LanguageDescription.matchFilename(languages, "file.sh")
					: null) ||
				(name.startsWith(".env")
					? LanguageDescription.matchFilename(languages, "file.properties")
					: null) ||
				(name === ".editorconfig" || name === ".npmrc"
					? LanguageDescription.matchFilename(languages, "file.ini")
					: null) ||
				(ext === "mdx"
					? LanguageDescription.matchFilename(languages, "file.md")
					: null) ||
				(ext === "mjml"
					? LanguageDescription.matchFilename(languages, "file.html")
					: null) ||
				(ext === "email" || ext === "eml"
					? LanguageDescription.matchFilename(languages, "file.html")
					: null) ||
				(ext === "astro"
					? LanguageDescription.matchFilename(languages, "file.tsx")
					: null) ||
				(ext === "svelte"
					? LanguageDescription.matchFilename(languages, "file.html")
					: null) ||
				(ext === "svg"
					? LanguageDescription.matchFilename(languages, "file.xml")
					: null) ||
				(ext === "pine" || ext === "tsrx"
					? LanguageDescription.matchFilename(languages, "file.py")
					: null) ||
				(ext === "gd" || ext === "nim" || ext === "nimble" || ext === "nims"
					? LanguageDescription.matchFilename(languages, "file.py")
					: null) ||
				(ext === "json5" || ext === "jsonc" || ext === "jsonl" || ext === "ndjson" || ext === "lot"
					? LanguageDescription.matchFilename(languages, "file.json")
					: null) ||
				(ext === "bash" || ext === "zsh" || ext === "fish" || ext === "make" || ext === "mk"
					? LanguageDescription.matchFilename(languages, "file.sh")
					: null) ||
				(ext === "cmd" || ext === "bat"
					? LanguageDescription.matchFilename(languages, "file.ps1")
					: null) ||
				(ext === "gql" || ext === "graphql" || ext === "sol"
					? LanguageDescription.matchFilename(languages, "file.js")
					: null) ||
				(ext === "prisma"
					? LanguageDescription.matchFilename(languages, "file.rs")
					: null) ||
				(ext === "patch"
					? LanguageDescription.matchFilename(languages, "file.diff")
					: null) ||
				(ext === "bib" || ext === "cls" || ext === "sty"
					? LanguageDescription.matchFilename(languages, "file.tex")
					: null) ||
				(ext === "cu" || ext === "cuh"
					? LanguageDescription.matchFilename(languages, "file.cpp")
					: null) ||
				(ext === "comp" || ext === "frag" || ext === "vert" || ext === "geom" || ext === "glsl" || ext === "hlsl" || ext === "fx" || ext === "fxh" || ext === "wgsl" || ext === "gdshader" || ext === "gdshaderinc"
					? LanguageDescription.matchFilename(languages, "file.c")
					: null) ||
				(ext === "ex" || ext === "exs" || ext === "hrl"
					? LanguageDescription.matchFilename(languages, "file.erl")
					: null) ||
				(ext === "f03" || ext === "f08"
					? LanguageDescription.matchFilename(languages, "file.f90")
					: null) ||
				(ext === "fsi" || ext === "fsx"
					? LanguageDescription.matchFilename(languages, "file.fs")
					: null) ||
				(ext === "gsh" || ext === "gvy" || ext === "gy"
					? LanguageDescription.matchFilename(languages, "file.groovy")
					: null) ||
				(ext === "lhs"
					? LanguageDescription.matchFilename(languages, "file.hs")
					: null) ||
				(ext === "lsp"
					? LanguageDescription.matchFilename(languages, "file.lisp")
					: null) ||
				(ext === "pyi" || ext === "pyw"
					? LanguageDescription.matchFilename(languages, "file.py")
					: null) ||
				(ext === "rake"
					? LanguageDescription.matchFilename(languages, "file.rb")
					: null) ||
				(ext === "sbt" || ext === "sc"
					? LanguageDescription.matchFilename(languages, "file.scala")
					: null) ||
				(ext === "tf" || ext === "tfvars" || ext === "hcl"
					? LanguageDescription.matchFilename(languages, "file.yaml")
					: null) ||
				(ext === "tres" || ext === "tscn"
					? LanguageDescription.matchFilename(languages, "file.ini")
					: null) ||
				(ext === "dpk" || ext === "dpr"
					? LanguageDescription.matchFilename(languages, "file.pas")
					: null) ||
				(ext === "asm"
					? LanguageDescription.matchFilename(languages, "file.s")
					: null) ||
				(ext === "zig" || ext === "zon" || ext === "odin" || ext === "c3" || ext === "gleam" || ext === "nix"
					? LanguageDescription.matchFilename(languages, "file.rs")
					: null) ||
				(ext
					? LanguageDescription.matchFilename(languages, `file.${ext}`)
					: null);
		}

		if (desc) {
			void desc.load().then((langSupport: LanguageSupport) => {
				if (this.editor) {
					this.editor.dispatch({
						effects: this.languageCompartment.reconfigure(langSupport),
					});
				}
			});
		} else {
			this.editor.dispatch({
				effects: this.languageCompartment.reconfigure([]),
			});
		}

		if (this.langEl) {
			this.langEl.setText(this.getLanguageLabel());
		}
	}

	private getLanguageLabel(): string {
		if (!this.file) return "Plain Text";
		const ext = this.file.extension?.toLowerCase() ?? "";
		const name = this.file.name.toLowerCase();

		if (name === ".gitignore") return "Git Ignore";
		if (name === ".gitattributes") return "Git Attributes";
		if (name.startsWith(".env")) return "Environment";
		if (name === ".dockerignore") return "Docker Ignore";
		if (name === ".editorconfig") return "EditorConfig";
		if (name === ".npmrc") return "NPM Config";
		if (name === ".prettierrc") return "Prettier Config";
		if (name === ".eslintrc") return "ESLint Config";
		if (name === "dockerfile") return "Dockerfile";
		if (name === "makefile" || name === "gnumakefile") return "Makefile";
		if (name === "license" || name === "licence") return "License";
		if (name === "procfile") return "Procfile";
		if (name === "cname") return "CNAME";

		const labels: Record<string, string> = {
			asm: "Assembly",
			astro: "Astro",
			bash: "Bash",
			bat: "Batch",
			bib: "BibTeX",
			c: "C",
			c3: "C3",
			cc: "C++",
			cjs: "JavaScript",
			cl: "Common Lisp",
			clj: "Clojure",
			cljc: "Clojure",
			cljs: "ClojureScript",
			cls: "LaTeX Class",
			cmake: "CMake",
			cmd: "Command Script",
			comp: "GLSL Compute",
			cpp: "C++",
			cs: "C#",
			css: "CSS",
			csv: "CSV",
			cts: "TypeScript",
			cu: "CUDA C++",
			cuh: "CUDA Header",
			cxx: "C++",
			dart: "Dart",
			diff: "Diff",
			dpk: "Delphi Package",
			dpr: "Delphi Project",
			edn: "EDN",
			el: "Emacs Lisp",
			elm: "Elm",
			email: "Email",
			eml: "Email (EML)",
			erl: "Erlang",
			ex: "Elixir",
			exs: "Elixir Script",
			f: "Fortran",
			f03: "Fortran 2003",
			f08: "Fortran 2008",
			f77: "Fortran 77",
			f90: "Fortran 90",
			f95: "Fortran 95",
			fish: "Fish",
			for: "Fortran",
			frag: "GLSL Fragment",
			fs: "F#",
			fsi: "F# Signature",
			fsx: "F# Script",
			fx: "HLSL Effect",
			fxh: "HLSL Header",
			gd: "GDScript",
			gdshader: "Godot Shader",
			gdshaderinc: "Godot Shader Inc",
			geom: "GLSL Geometry",
			gleam: "Gleam",
			glsl: "GLSL Shader",
			go: "Go",
			gql: "GraphQL",
			gradle: "Gradle",
			graphql: "GraphQL",
			groovy: "Groovy",
			gsh: "Groovy Shell",
			gvy: "Groovy",
			gy: "Groovy",
			h: "C Header",
			handlebars: "Handlebars",
			hbs: "Handlebars",
			hcl: "HCL",
			hh: "C++ Header",
			hlsl: "HLSL Shader",
			hpp: "C++ Header",
			hrl: "Erlang Header",
			hs: "Haskell",
			htm: "HTML",
			html: "HTML",
			hxx: "C++ Header",
			ini: "INI",
			java: "Java",
			jl: "Julia",
			js: "JavaScript",
			json: "JSON",
			json5: "JSON5",
			jsonc: "JSONC",
			jsonl: "JSON Lines",
			jsx: "JSX (React)",
			kt: "Kotlin",
			kts: "Kotlin Script",
			less: "Less",
			lhs: "Literate Haskell",
			liquid: "Liquid",
			lisp: "Lisp",
			log: "Log",
			lot: "Lottie JSON",
			lsp: "Lisp",
			lua: "Lua",
			m: "Objective-C",
			make: "Makefile",
			markdown: "Markdown",
			md: "Markdown",
			mdx: "MDX",
			mjml: "MJML",
			mjs: "JavaScript",
			mk: "Makefile",
			ml: "OCaml",
			mli: "OCaml Interface",
			mm: "Objective-C++",
			mts: "TypeScript",
			ndjson: "NDJSON",
			nim: "Nim",
			nimble: "Nimble",
			nims: "Nim Script",
			nix: "Nix",
			odin: "Odin",
			pas: "Pascal",
			patch: "Patch",
			php: "PHP",
			phtml: "PHP HTML",
			pine: "Pine Script",
			pl: "Perl",
			pm: "Perl Module",
			pp: "Puppet",
			prisma: "Prisma",
			proto: "Protobuf",
			ps1: "PowerShell",
			psd1: "PowerShell Data",
			psm1: "PowerShell Module",
			py: "Python",
			pyi: "Python Stub",
			pyw: "Python GUI",
			r: "R",
			rake: "Rakefile",
			rb: "Ruby",
			rs: "Rust",
			s: "Assembly",
			sass: "Sass",
			sbt: "SBT",
			sc: "Scala Script",
			scala: "Scala",
			scm: "Scheme",
			scss: "SCSS",
			sh: "Shell",
			sol: "Solidity",
			sql: "SQL",
			ss: "Scheme",
			sty: "LaTeX Style",
			svelte: "Svelte",
			svg: "SVG",
			swift: "Swift",
			tex: "LaTeX",
			text: "Plain Text",
			tf: "Terraform",
			tfvars: "Terraform Vars",
			toml: "TOML",
			tres: "Godot Resource",
			ts: "TypeScript",
			tscn: "Godot Scene",
			tsrx: "TradingView Script",
			tsv: "TSV",
			tsx: "TSX (React)",
			txt: "Plain Text",
			vert: "GLSL Vertex",
			vue: "Vue",
			wat: "WebAssembly Text",
			wgsl: "WGSL Shader",
			xml: "XML",
			xsd: "XML Schema",
			yaml: "YAML",
			yml: "YAML",
			zig: "Zig",
			zon: "ZON (Zig)",
			zsh: "Zsh",
		};

		return labels[ext] ?? (ext ? ext.toUpperCase() : "Plain Text");
	}

	private updateStatus(): void {
		// Line/col and character count is displayed natively in Obsidian's status bar
	}

	override async onRename(file: TFile): Promise<void> {
		this.filePath = file.path;
		try {
			await super.onRename(file);
		} catch {
			// Base onRename might not be implemented
		}
		if (this.headerFileNameEl) {
			this.headerFileNameEl.setText(file.name);
		}
		this.applyLanguage();
		this.updateStatus();
		this.updateDirtyUI();
		this.updateViewModeUI();
		void this.updateGitStatus();
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		this.filePreviewRenderer?.clear();
		if (this.diffToolbarEl) {
			this.diffToolbarEl.remove();
			this.diffToolbarEl = null;
		}
		this.isDiffMode = false;
		await super.onUnloadFile(file);
		this.previewSave = null;
		this.previewConflictNotified = false;
	}

	async onClose(): Promise<void> {
		this.previewGeneration++;
		this.closeGotoLine();
		if (this.diffToolbarEl) {
			this.diffToolbarEl.remove();
			this.diffToolbarEl = null;
		}
		this.isDiffMode = false;
		this.filePreviewRenderer?.clear();
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}
		if (this.previewEl) {
			this.previewEl.empty();
			this.previewEl = null;
		}
		await super.onClose();
	}

	applyFontScale(): void {
		this.editorEl?.setCssProps({ "--vault-code-font-scale": String(normalizeEditorFontScale(this.plugin.settings.editorFontScale) / 100) });
		// Remeasure glyphs, wrapped lines, gutters, and the selection-to-Agent action.
		this.editor?.requestMeasure();
	}

	toggleLineWrapping(wrap?: boolean): void {
		this.isLineWrapping = wrap !== undefined ? wrap : !this.isLineWrapping;
		if (this.editor) {
			this.editor.dispatch({
				effects: this.lineWrappingCompartment.reconfigure(
					this.isLineWrapping ? EditorView.lineWrapping : [],
				),
			});
		}
		this.plugin.settings.lineWrapping = this.isLineWrapping;
		void this.plugin.saveSettings();
		this.updateLineWrappingUI();
	}

	getLineWrapping(): boolean {
		return this.isLineWrapping;
	}

	private updateLineWrappingUI(): void {
		if (!this.lineWrapBtnEl) return;
		this.lineWrapBtnEl.toggleClass("is-active", this.isLineWrapping);
		this.lineWrapBtnEl.setAttribute("aria-label", t("editorLineWrapToggle"));
	}

	public isPreviewable(): boolean {
		if (!this.file) return false;
		const ext = this.file.extension?.toLowerCase() ?? "";
		return PREVIEWABLE_EXTENSIONS.has(ext);
	}

	public toggleViewMode(): void {
		if (!this.isPreviewable()) return;
		this.isPreviewMode = !this.isPreviewMode;
		this.updateViewModeUI();
	}

	private updateViewModeUI(): void {
		if (!this.isPreviewMode) this.previewGeneration++;
		const previewable = this.isPreviewable();

		if (!previewable) {
			this.filePreviewRenderer?.clear();
			this.isPreviewMode = false;
			if (this.viewToggleBtnEl) this.viewToggleBtnEl.hide();
			if (this.previewEl) this.previewEl.hide();
			if (this.editorEl) this.editorEl.show();
			if (this.searchBtnEl) this.searchBtnEl.show();
			if (this.lineWrapBtnEl) this.lineWrapBtnEl.show();
			return;
		}

		if (this.viewToggleBtnEl) {
			this.viewToggleBtnEl.show();
			if (this.viewToggleIconEl) {
				if (this.isPreviewMode) {
					setCodeIcon(this.viewToggleIconEl);
				} else {
					setIcon(this.viewToggleIconEl, "eye");
				}
			}
			if (this.viewToggleTextEl) {
				this.viewToggleTextEl.setText(
					this.isPreviewMode ? t("viewToggleCode") : t("viewToggleRendered"),
				);
			}
			const tooltip = t("viewToggleTooltip");
			this.viewToggleBtnEl.setAttribute("aria-label", tooltip);
			this.viewToggleBtnEl.toggleClass("is-active", this.isPreviewMode);
		}

		if (this.isPreviewMode) {
			if (this.editorEl) this.editorEl.hide();
			if (this.searchBtnEl) this.searchBtnEl.hide();
			if (this.lineWrapBtnEl) this.lineWrapBtnEl.hide();
			if (this.previewEl) {
				this.previewEl.show();
				void this.renderPreview();
			}
		} else {
			this.filePreviewRenderer?.clear();
			if (this.previewEl) this.previewEl.hide();
			if (this.searchBtnEl) this.searchBtnEl.show();
			if (this.lineWrapBtnEl) this.lineWrapBtnEl.show();
			if (this.editorEl) {
				this.editorEl.show();
				if (this.editor) {
					this.editor.focus();
				}
			}
		}
	}

	private async renderPreview(): Promise<void> {
		if (!this.previewEl || !this.file) return;
		const generation = ++this.previewGeneration;
		this.filePreviewRenderer?.clear();
		this.previewEl.empty();

		const ext = this.file.extension?.toLowerCase() ?? "";
		const rawContent = this.getViewData();

		if (DATA_PREVIEW_EXTENSIONS.has(ext)) {
			this.filePreviewRenderer ??= new FilePreviewRenderer(this.app, this);
			const file = this.file;
			await this.filePreviewRenderer.render(this.previewEl, ext, rawContent, file.path,
				(change, current) => this.applyPreviewCellEdit(rawContent, file, change, current),
				() => {
					if (file.stat.size > PREVIEW_LIMITS.characters * 4) return Promise.reject(new PreviewError("previewTooLarge"));
					return this.app.vault.readBinary(file);
				});
		} else if (ext === "svg") {
			this.renderSvgPreview(rawContent);
		} else if (ext === "html" || ext === "htm") {
			await this.renderHtmlPreview(rawContent);
		} else if (ext === "mjml") {
			await this.renderMjmlPreview(rawContent, generation);
		}
	}

	private renderSvgPreview(content: string): void {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText(t("previewEmpty"));
			return;
		}

		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(trimmed, "image/svg+xml");
			const parserError = doc.querySelector("parsererror");

			if (parserError) {
				const errBox = this.previewEl.createDiv({
					cls: "hidden-files-preview-error",
				});
				const title = errBox.createDiv({
					cls: "hidden-files-preview-error-title",
				});
				const iconSpan = title.createSpan({
					cls: "hidden-files-preview-error-icon",
				});
				setIcon(iconSpan, "alert-triangle");
				title.createSpan({
					text: t("previewSvgSyntax"),
				});
				errBox.createDiv({
					cls: "hidden-files-preview-error-msg",
					text: parserError.textContent || t("previewSvgParse"),
				});
				return;
			}

			const svgElement = doc.documentElement;
			if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
				const errBox = this.previewEl.createDiv({
					cls: "hidden-files-preview-error",
				});
				errBox.setText(t("previewSvgRoot"));
				return;
			}

			const stage = this.previewEl.createDiv({
				cls: "hidden-files-svg-stage",
			});
			const canvas = stage.createDiv({
				cls: "hidden-files-svg-canvas",
			});

			const imported = document.importNode(svgElement, true);
			canvas.appendChild(imported);
		} catch (e) {
			const errBox = this.previewEl.createDiv({
				cls: "hidden-files-preview-error",
			});
			errBox.setText(
				t("previewSvgFailed", e instanceof Error ? e.message : String(e)),
			);
		}
	}

	private static cssCache = new Map<string, string>();

	public static clearCssCache(): void {
		DotfileView.cssCache.clear();
	}

	private static setCssCache(key: string, value: string): void {
		if (DotfileView.cssCache.size >= 100) {
			const iter = DotfileView.cssCache.keys();
			const next = iter.next();
			if (!next.done && typeof next.value === "string") {
				DotfileView.cssCache.delete(next.value);
			}
		}
		DotfileView.cssCache.set(key, value);
	}

	private resolveCssUrls(css: string, baseUrl: string): string {
		return css.replace(
			/url\(\s*(['"]?)([^'"]+)\1\s*\)/gi,
			(match, quote, relUrl) => {
				const trimmed = (relUrl as string).trim();
				if (
					trimmed.startsWith("data:") ||
					trimmed.startsWith("blob:") ||
					trimmed.startsWith("http://") ||
					trimmed.startsWith("https://")
				) {
					return match;
				}
				if (trimmed.startsWith("//")) {
					return `url(${quote}https:${trimmed}${quote})`;
				}
				try {
					const resolved = new URL(trimmed, baseUrl).href;
					return `url(${quote}${resolved}${quote})`;
				} catch {
					return match;
				}
			},
		);
	}

	private async resolveCssImports(
		css: string,
		baseUrl: string,
		depth = 0,
	): Promise<string> {
		if (depth > 2) return css;
		const importRegex =
			/@import\s+(?:url\(\s*(['"]?)([^'"]+)\1\s*\)|(['"])([^'"]+)\3)\s*;/gi;
		const matches = [...css.matchAll(importRegex)];
		if (matches.length === 0) return css;

		let resultCss = css;
		for (const m of matches) {
			const rawUrl = (m[2] ?? m[4] ?? "").trim();
			if (!rawUrl) continue;
			let importUrl = rawUrl;
			if (importUrl.startsWith("//")) {
				importUrl = "https:" + importUrl;
			} else if (
				!importUrl.startsWith("http://") &&
				!importUrl.startsWith("https://")
			) {
				try {
					importUrl = new URL(importUrl, baseUrl).href;
				} catch {
					continue;
				}
			}

			let importedCss = DotfileView.cssCache.get(importUrl);
			if (!importedCss) {
				try {
					const resp = await requestUrl({ url: importUrl, throw: false });
					if (resp.status >= 200 && resp.status < 300) {
						importedCss = this.resolveCssUrls(resp.text, importUrl);
						importedCss = await this.resolveCssImports(
							importedCss,
							importUrl,
							depth + 1,
						);
						DotfileView.setCssCache(importUrl, importedCss);
					}
				} catch {
					// fallback or ignore
				}
			}
			if (importedCss) {
				resultCss = resultCss.replace(
					m[0],
					`/* @import ${importUrl} */\n${importedCss}\n`,
				);
			}
		}
		return resultCss;
	}

	private async prepareAndInlineHtml(
		content: string,
		localBaseUrl?: string,
	): Promise<string> {
		let htmlContent = content;

		// 1. Detect remote web origin if available
		let webOrigin = "";
		const baseMatch = htmlContent.match(
			/<base\b[^>]+href=["'](https?:\/\/[^"'/]+)/i,
		);
		const canonicalMatch =
			htmlContent.match(
				/<link\b[^>]+rel=["']canonical["'][^>]+href=["'](https?:\/\/[^"'/]+)/i,
			) ||
			htmlContent.match(
				/<link\b[^>]+href=["'](https?:\/\/[^"'/]+)[^>]+rel=["']canonical["']/i,
			);
		const ogMatch =
			htmlContent.match(
				/<meta\b[^>]+property=["']og:url["'][^>]+content=["'](https?:\/\/[^"'/]+)/i,
			) ||
			htmlContent.match(
				/<meta\b[^>]+content=["'](https?:\/\/[^"'/]+)[^>]+property=["']og:url["']/i,
			);
		const savedMatch = htmlContent.match(
			/saved from url=\(\d+\)(https?:\/\/[^"'\s/]+)/i,
		);

		if (baseMatch?.[1]) {
			webOrigin = baseMatch[1];
		} else if (canonicalMatch?.[1]) {
			webOrigin = canonicalMatch[1];
		} else if (ogMatch?.[1]) {
			webOrigin = ogMatch[1];
		} else if (savedMatch?.[1]) {
			webOrigin = savedMatch[1];
		} else {
			const assetOrigins = [
				...htmlContent.matchAll(
					/(?:src|href)=["'](https?:\/\/[a-zA-Z0-9.-]+)/gi,
				),
			]
				.map((m) => m[1])
				.filter(
					(url): url is string =>
						typeof url === "string" &&
						!url.includes("google") &&
						!url.includes("cdnjs") &&
						!url.includes("jsdelivr") &&
						!url.includes("unpkg"),
				);
			if (assetOrigins.length > 0) {
				const counts = new Map<string, number>();
				for (const o of assetOrigins) {
					counts.set(o, (counts.get(o) ?? 0) + 1);
				}
				let best = "";
				let maxCount = 0;
				for (const [o, count] of counts.entries()) {
					if (count > maxCount) {
						best = o;
						maxCount = count;
					}
				}
				if (best) webOrigin = best;
			}
		}

		// 2. Upgrade protocol-relative URLs (//...) to https://
		htmlContent = htmlContent.replace(
			/(src|href|action|poster|srcset)\s*=\s*(["'])\/\/([^"'\s>]+)\2/gi,
			"$1=$2https://$3$2",
		);
		htmlContent = htmlContent.replace(
			/url\(\s*(["']?)\/\/([^)"'\s]+)\1\s*\)/gi,
			"url($1https://$2$1)",
		);
		htmlContent = htmlContent.replace(
			/@import\s+(["'])\/\/([^"'\s;]+)\1/gi,
			"@import $1https://$2$1",
		);

		// 3. Rewrite root-relative URLs (/path) if web origin is known
		if (webOrigin) {
			htmlContent = htmlContent.replace(
				/(src|href|action|poster)\s*=\s*(["'])\/([^/'"\s>][^'"\s>]*)\2/gi,
				`$1=$2${webOrigin}/$3$2`,
			);
			htmlContent = htmlContent.replace(
				/url\(\s*(["']?)\/([^/)'"\s][^)'"\s]*)\1\s*\)/gi,
				`url($1${webOrigin}/$2$1)`,
			);
			htmlContent = htmlContent.replace(
				/@import\s+(["'])\/([^/'"\s;][^'"\s;]*)\1/gi,
				`@import $1${webOrigin}/$2$1`,
			);
		}

		// 4. Strip integrity attributes to prevent SRI mismatches
		htmlContent = htmlContent.replace(
			/\s+integrity=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
			"",
		);

		// 5. Find external stylesheet links and inline them as <style> tags
		// (Obsidian's host CSP restricts external <link rel="stylesheet">, but allows 'unsafe-inline' <style>)
		const linkRegex = /<link\b[^>]*>/gi;
		const linkMatches = [...htmlContent.matchAll(linkRegex)];
		const externalStylesheets: { tag: string; href: string }[] = [];

		for (const m of linkMatches) {
			const tag = m[0];
			const isStylesheet =
				/rel=["'](?:[^"']*\s+)?stylesheet(?:\s+[^"']*)?["']/i.test(tag) ||
				(/rel=["']preload["']/i.test(tag) && /as=["']style["']/i.test(tag));
			if (!isStylesheet) continue;

			const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
			if (!hrefMatch?.[1]) continue;
			let href = hrefMatch[1].trim();
			if (href.startsWith("//")) {
				href = "https:" + href;
			} else if (href.startsWith("/") && webOrigin) {
				href = `${webOrigin}${href}`;
			}

			if (href.startsWith("http://") || href.startsWith("https://")) {
				externalStylesheets.push({ tag, href });
			}
		}

		// Fetch missing stylesheets concurrently
		await Promise.all(
			externalStylesheets.map(async ({ href }) => {
				if (DotfileView.cssCache.has(href)) return;
				try {
					const resp = await requestUrl({ url: href, throw: false });
					if (resp.status >= 200 && resp.status < 300) {
						let css = resp.text;
						css = this.resolveCssUrls(css, href);
						css = await this.resolveCssImports(css, href);
						DotfileView.setCssCache(href, css);
						return;
					}
				} catch {
					// fallback to fetch
				}
				try {
					const res = await window.fetch(href);
					if (res.ok) {
						let css = await res.text();
						css = this.resolveCssUrls(css, href);
						css = await this.resolveCssImports(css, href);
						DotfileView.setCssCache(href, css);
					}
				} catch {
					// ignore fetch failure
				}
			}),
		);

		// Replace link tags with inline <style>
		for (const { tag, href } of externalStylesheets) {
			const inlinedCss = DotfileView.cssCache.get(href);
			if (inlinedCss) {
				const styleTag = `<style data-source="${href}">\n${inlinedCss}\n</style>`;
				htmlContent = htmlContent.replace(tag, styleTag);
			}
		}

		// 6. Network shim for runtime fetch/xhr
		const shimScript = `<script>
(function() {
  function fixUrl(url) {
    if (typeof url === "string") {
      var m = url.match(/^(?:app|file|capacitor):\\/\\/([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})(\\/.*)?$/);
      if (m && m[1] !== "local" && m[1] !== "localhost" && m[1] !== "obsidian.md") {
        return "https://" + m[1] + (m[2] || "/");
      }
      if (url.startsWith("//")) {
        return "https:" + url;
      }
    }
    return url;
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(resource, init) {
      if (typeof resource === "string") {
        resource = fixUrl(resource);
      } else if (resource && resource.url) {
        try {
          resource = new Request(fixUrl(resource.url), resource);
        } catch(e) {}
      }
      return origFetch.call(this, resource, init);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    arguments[1] = fixUrl(url);
    return origOpen.apply(this, arguments);
  };
})();
</script>`;

		// 7. Local base tag for relative local resources
		let baseTag = "";
		if (localBaseUrl) {
			htmlContent = htmlContent.replace(/<base\b[^>]*>/gi, "");
			baseTag = `<base href="${localBaseUrl}">`;
		}

		const injection = `${shimScript}${baseTag}`;
		if (/<head\b[^>]*>/i.test(htmlContent)) {
			htmlContent = htmlContent.replace(/<head\b[^>]*>/i, `$&${injection}`);
		} else {
			htmlContent = `${injection}${htmlContent}`;
		}

		return htmlContent;
	}

	private async renderHtmlPreview(content: string): Promise<void> {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText(t("previewEmpty"));
			return;
		}

		let baseUrl: string | undefined;
		if (this.file) {
			const fileUrl = this.app.vault.getResourcePath(this.file);
			const cleanUrl = fileUrl.split("?")[0] ?? fileUrl;
			baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf("/") + 1);
		}

		const container = this.previewEl.createDiv({
			cls: "hidden-files-html-container",
		});
		const iframe = container.createEl("iframe", {
			cls: "hidden-files-html-iframe",
			attr: {
				title: this.file?.name ?? t("previewHtml"),
			},
		});

		// Sandbox allowing scripts, forms, modals, and popups with same-origin
		iframe.setAttribute(
			"sandbox",
			"allow-scripts allow-forms allow-modals allow-same-origin allow-popups",
		);

		const inlinedHtml = await this.prepareAndInlineHtml(content, baseUrl);

		if (!this.previewEl || !this.isPreviewMode) return;
		iframe.srcdoc = inlinedHtml;
	}

	private async renderMjmlPreview(content: string, generation: number): Promise<void> {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText(t("previewEmpty"));
			return;
		}

		try {
			// Initialize the email compiler only when an MJML preview is requested.
			const { default: mjml2html } = await import("mjml-browser");
			if (generation !== this.previewGeneration || !this.isPreviewMode) return;
			const mjmlFn =
				typeof mjml2html === "function"
					? mjml2html
					: (mjml2html as { default?: typeof mjml2html }).default ?? mjml2html;

			const result = await mjmlFn(trimmed, {
				validationLevel: "soft",
				minify: false,
			});

			if (!this.previewEl || !this.isPreviewMode || generation !== this.previewGeneration) return;

			if (!result || !result.html) {
				const errBox = this.previewEl.createDiv({
					cls: "hidden-files-preview-error",
				});
				errBox.setText(t("previewNoOutput"));
				return;
			}

			await this.renderHtmlPreview(result.html);
		} catch (e) {
			if (!this.previewEl || !this.isPreviewMode || generation !== this.previewGeneration) return;
			this.previewEl.empty();
			const errBox = this.previewEl.createDiv({
				cls: "hidden-files-preview-error",
			});
			const title = errBox.createDiv({
				cls: "hidden-files-preview-error-title",
			});
			const iconSpan = title.createSpan({
				cls: "hidden-files-preview-error-icon",
			});
			setIcon(iconSpan, "alert-triangle");
			title.createSpan({
				text: t("previewMjmlError"),
			});
			errBox.createDiv({
				cls: "hidden-files-preview-error-msg",
				text: e instanceof Error ? e.message : String(e),
			});
		}
	}

	public async revertToContent(content: string): Promise<void> {
		this.data = content;
		if (this.editor) {
			this.editor.dispatch({
				changes: {
					from: 0,
					to: this.editor.state.doc.length,
					insert: content,
				},
			});
		}
		this.isModified = false;
		this.updateDirtyUI();
		await this.setDiffMode(false);
	}

	public hideGitUI(): void {
		if (this.gitDiffStatsBtnEl) {
			this.gitDiffStatsBtnEl.hide();
		}
		if (this.isDiffMode) {
			void this.setDiffMode(false);
		}
	}

	public async updateGitStatus(): Promise<void> {
		if (!this.file || !this.plugin.isGitAvailable()) {
			if (this.gitDiffStatsBtnEl) this.gitDiffStatsBtnEl.hide();
			if (this.isDiffMode) {
				void this.setDiffMode(false);
			}
			return;
		}

		if (!this.plugin.isFileSupportedForGitDiff(this.file)) {
			if (this.gitDiffStatsBtnEl) this.gitDiffStatsBtnEl.hide();
			if (this.isDiffMode) {
				void this.setDiffMode(false);
			}
			return;
		}

		const isRepo = await this.plugin.gitService.isGitRepo();
		if (!isRepo) {
			if (this.gitDiffStatsBtnEl) this.gitDiffStatsBtnEl.hide();
			return;
		}

		const stats = await this.plugin.gitService.getFileDiffStats(this.file.path);
		if (this.gitDiffStatsBtnEl) {
			this.gitDiffStatsBtnEl.empty();
			if (stats && stats.isModified) {
				const parts: string[] = [];
				if (stats.deletions > 0) {
					parts.push(`-${stats.deletions}`);
				}
				if (stats.additions > 0) {
					parts.push(`+${stats.additions}`);
				}
				this.gitDiffStatsBtnEl.setText(parts.join(" "));
				this.gitDiffStatsBtnEl.show();
				this.gitDiffStatsBtnEl.addClass("has-changes");
			} else {
				this.gitDiffStatsBtnEl.hide();
				this.gitDiffStatsBtnEl.removeClass("has-changes");
				if (this.isDiffMode) {
					void this.setDiffMode(false);
					new Notice(t("gitAllChangesResolved"));
				}
			}

			this.gitDiffStatsBtnEl.toggleClass("is-active", this.isDiffMode);
			this.gitDiffStatsBtnEl.setAttribute(
				"aria-label",
				this.isDiffMode ? t("gitHideChanges") : t("gitViewChanges"),
			);
		}
	}

	public async toggleDiffMode(): Promise<void> {
		await this.setDiffMode(!this.isDiffMode);
	}

	public async setDiffMode(enable: boolean): Promise<void> {
		if (!this.editor || !this.file) return;
		if (this.isDiffMode === enable) return;
		if (this.isDiffModePending) return;

		this.isDiffModePending = true;
		try {
			if (enable) {
				const stats = await this.plugin.gitService.getFileDiffStats(this.file.path);
				if (!stats || !stats.isModified) {
					new Notice(t("gitNoChanges"));
					return;
				}

				if (this.isPreviewMode) {
					this.toggleViewMode();
				}

				const headContent = await this.plugin.gitService.getHeadContent(this.file.path);
				if (!this.editor || !this.file) return;

				this.isDiffMode = true;

				if (this.gitDiffStatsBtnEl) {
					this.gitDiffStatsBtnEl.addClass("is-active");
					this.gitDiffStatsBtnEl.setAttribute("aria-label", t("gitHideChanges"));
				}

				this.editor.dispatch({
					effects: this.diffCompartment.reconfigure([
						unifiedMergeView({
							original: headContent,
							highlightChanges: true,
							gutter: true,
							allowInlineDiffs: true,
							mergeControls: false,
							collapseUnchanged: {
								margin: 3,
								minSize: 4,
							},
						}),
						this.createChunkActionBarsExtension(),
					]),
				});

				this.renderDiffToolbar();
				this.editor.requestMeasure();
			} else {
				this.isDiffMode = false;
				if (this.gitDiffStatsBtnEl) {
					this.gitDiffStatsBtnEl.removeClass("is-active");
					this.gitDiffStatsBtnEl.setAttribute("aria-label", t("gitViewChanges"));
				}

				this.editor.dispatch({
					effects: this.diffCompartment.reconfigure([]),
				});

				if (this.diffToolbarEl) {
					this.diffToolbarEl.remove();
					this.diffToolbarEl = null;
				}

				void this.updateGitStatus();
			}
		} finally {
			this.isDiffModePending = false;
			this.plugin.updateLeafHeaderActions(this.leaf);
		}
	}

	private createChunkActionBarsExtension(): Extension {
		class ChunkActionBarWidget extends WidgetType {
			constructor(
				private readonly chunkPos: number,
				private readonly view: DotfileView,
			) {
				super();
			}

			eq(other: ChunkActionBarWidget): boolean {
				return this.chunkPos === other.chunkPos;
			}

			override get estimatedHeight(): number {
				return 32;
			}

			toDOM(editorView: EditorView): HTMLElement {
				const container = createDiv({
					cls: "vault-code-chunk-actions-bar",
				});
				const inner = container.createDiv({
					cls: "vault-code-chunk-actions-inner",
				});

				// Undo button (solid square, icon only)
				const undoBtn = inner.createEl("button", {
					cls: "vault-code-merge-chunk-btn is-reject",
					attr: {
						type: "button",
						"aria-label": t("gitUndoChunk"),
					},
				});
				const undoIcon = undoBtn.createSpan({ cls: "vault-code-btn-icon" });
				setIcon(undoIcon, "undo");

				undoBtn.addEventListener("mousedown", (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					rejectChunk(editorView, this.chunkPos);
					void (async () => {
						await this.view.save();
						void this.view.updateGitStatus();
						this.view.plugin.debouncedUpdateGitStatus();
					})();
				});

				// Keep button (theme color, checkmark + Keep)
				const keepBtn = inner.createEl("button", {
					cls: "vault-code-merge-chunk-btn is-accept",
					attr: {
						type: "button",
					},
				});
				const keepIcon = keepBtn.createSpan({ cls: "vault-code-btn-icon" });
				setIcon(keepIcon, "check");
				keepBtn.createSpan({
					cls: "vault-code-btn-text",
					text: t("gitKeepChunk"),
				});

				keepBtn.addEventListener("mousedown", (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					acceptChunk(editorView, this.chunkPos);
					void this.view.updateGitStatus();
				});

				return container;
			}
		}

		const buildDecorations = (state: EditorState): DecorationSet => {
			const result = getChunks(state);
			const chunks = result ? result.chunks : [];
			const items: Array<{
				targetPos: number;
				targetSide: number;
				chunk: (typeof chunks)[number];
			}> = [];
			const docLength = state.doc.length;

			for (const chunk of chunks) {
				const isPureDeletion = chunk.toB <= chunk.fromB;
				let targetPos: number;
				if (isPureDeletion) {
					targetPos = Math.min(Math.max(0, chunk.fromB), docLength);
				} else {
					const linePos = Math.min(Math.max(0, chunk.toB - 1), docLength);
					try {
						targetPos = state.doc.lineAt(linePos).to;
					} catch {
						targetPos = Math.min(chunk.toB, docLength);
					}
				}
				const targetSide = isPureDeletion ? -0.5 : 1;
				items.push({ targetPos, targetSide, chunk });
			}

			items.sort(
				(a, b) =>
					a.targetPos - b.targetPos || a.targetSide - b.targetSide,
			);

			const builder = new RangeSetBuilder<Decoration>();
			let lastPos = -1;
			for (const item of items) {
				if (item.targetPos < lastPos) continue;
				lastPos = item.targetPos;
				builder.add(
					item.targetPos,
					item.targetPos,
					Decoration.widget({
						widget: new ChunkActionBarWidget(
							item.chunk.fromB,
							this,
						),
						block: true,
						side: item.targetSide,
					}),
				);
			}
			return builder.finish();
		};

		return StateField.define<DecorationSet>({
			create(state) {
				return buildDecorations(state);
			},
			update(_deco, tr) {
				return buildDecorations(tr.state);
			},
			provide: (f) => EditorView.decorations.from(f),
		});
	}

	private renderDiffToolbar(): void {
		if (this.diffToolbarEl) {
			this.diffToolbarEl.remove();
			this.diffToolbarEl = null;
		}
		if (!this.editor || !this.editorEl || !this.file) return;

		const toolbar = createDiv({
			cls: "vault-code-diff-toolbar",
		});
		this.diffToolbarEl = toolbar;

		// Insert toolbar between header and editor wrapper
		this.editorEl.parentElement?.insertBefore(toolbar, this.editorEl);

		// Left controls: navigation
		const leftEl = toolbar.createDiv({ cls: "vault-code-diff-toolbar-left" });
		const navGroup = leftEl.createDiv({ cls: "vault-code-diff-nav-group" });

		const prevBtn = navGroup.createEl("button", {
			cls: "clickable-icon vault-code-diff-nav-btn",
			attr: { "aria-label": t("gitPreviousChange") },
		});
		setIcon(prevBtn, "chevron-up");
		prevBtn.addEventListener("click", () => {
			if (this.editor) goToPreviousChunk(this.editor);
		});

		const nextBtn = navGroup.createEl("button", {
			cls: "clickable-icon vault-code-diff-nav-btn",
			attr: { "aria-label": t("gitNextChange") },
		});
		setIcon(nextBtn, "chevron-down");
		nextBtn.addEventListener("click", () => {
			if (this.editor) goToNextChunk(this.editor);
		});

		// Right controls: Revert (two-step inline confirmation), Commit, Done
		const rightEl = toolbar.createDiv({ cls: "vault-code-diff-toolbar-right" });

		let isConfirmingRevert = false;
		let revertTimeoutId: number | null = null;

		const resetRevertButton = () => {
			if (!isConfirmingRevert) return;
			isConfirmingRevert = false;
			if (revertTimeoutId !== null) {
				window.clearTimeout(revertTimeoutId);
				revertTimeoutId = null;
			}
			revertBtn.removeClass("is-confirming");
			revertIcon.empty();
			setIcon(revertIcon, "undo");
			revertText.setText(t("gitModalRevertConfirm"));
		};

		const revertBtn = rightEl.createEl("button", {
			cls: "vault-code-diff-action-btn mod-revert",
			attr: {
				type: "button",
				"aria-label": t("gitRevertChanges"),
			},
		});
		const revertIcon = revertBtn.createSpan({ cls: "vault-code-btn-icon" });
		setIcon(revertIcon, "undo");
		const revertText = revertBtn.createSpan({
			cls: "vault-code-btn-text",
			text: t("gitModalRevertConfirm"),
		});

		void this.plugin.gitService.getFileDiffStats(this.file.path).then((stats) => {
			if (stats?.isUntracked) {
				revertBtn.hide();
			}
		});

		revertBtn.addEventListener("click", (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (!isConfirmingRevert) {
				isConfirmingRevert = true;
				revertBtn.addClass("is-confirming");
				revertIcon.empty();
				setIcon(revertIcon, "alert-circle");
				revertText.setText(t("gitConfirmRevert"));

				revertTimeoutId = window.setTimeout(() => {
					resetRevertButton();
				}, 4000);
				return;
			}

			if (revertTimeoutId !== null) {
				window.clearTimeout(revertTimeoutId);
				revertTimeoutId = null;
			}
			isConfirmingRevert = false;

			void (async () => {
				if (!this.file) return;
				const ok = await this.plugin.gitService.discardFileChanges(this.file.path);
				if (ok) {
					const restored = await this.app.vault.adapter.read(this.file.path);
					await this.revertToContent(restored);
					void this.plugin.updateStatusBarGit();
					new Notice(t("gitNoticeReverted", this.file.name));
					await this.setDiffMode(false);
				} else {
					new Notice(t("gitNoticeRevertFailed", "Error discarding changes"));
					resetRevertButton();
				}
			})();
		});

		const commitBtn = rightEl.createEl("button", {
			cls: "vault-code-diff-action-btn mod-commit",
			attr: { "aria-label": t("gitCommitFile") },
		});
		const commitIcon = commitBtn.createSpan({ cls: "vault-code-btn-icon" });
		setIcon(commitIcon, "git-commit");
		commitBtn.createSpan({
			cls: "vault-code-btn-text",
			text: t("gitModalCommitConfirm"),
		});
		commitBtn.addEventListener("click", () => {
			if (!this.file) return;
			void (async () => {
				if (!this.file) return;
				const stats = await this.plugin.gitService.getFileDiffStats(this.file.path);
				if (!stats || !stats.isModified) {
					new Notice(t("gitNoChanges"));
					return;
				}
				new CommitFileModal(this.app, this.file.name, async (msg) => {
					if (!this.file) return;
					await this.saveExplicitly();
					const res = await this.plugin.gitService.commitFile(this.file.path, msg);
					if (res.success) {
						new Notice(t("gitNoticeCommitted", this.file.name));
						await this.setDiffMode(false);
						void this.plugin.updateStatusBarGit();
					} else {
						new Notice(t("gitNoticeCommitFailed", res.error ?? "Git commit error"));
					}
				}).open();
			})();
		});

		const doneBtn = rightEl.createEl("button", {
			cls: "clickable-icon vault-code-diff-done-btn",
			attr: { "aria-label": t("gitHideChanges") },
		});
		setIcon(doneBtn, "x");
		doneBtn.addEventListener("click", () => {
			void this.setDiffMode(false);
		});
	}
}

/* ── Plugin ────────────────────────────────────────────────── */

export default class VaultCodePlugin extends Plugin {
	settings!: VaultCodeSettings;
	public gitService = new GitService(this.app);
	public cachedModifiedFiles: Set<string> = new Set();
	private statusBarGitEl: HTMLElement | null = null;
	private gitStatusDebounceTimer: number | null = null;
	private previousShowUnsupportedFiles = false;
	private originalReconcileDeletion:
		| PrivateAdapter["reconcileDeletion"]
		| null = null;
	private originalI18nT: ((...args: unknown[]) => string) | null = null;
	private originalOpenFile:
		| ((file: TFile, openState?: OpenViewState) => Promise<void>)
		| null = null;
	private originalDetach: (() => void) | null = null;
	private originalGetTypeByExtension:
		| ((ext: string) => string | undefined)
		| null = null;
	private originalIsExtensionRegistered:
		| ((ext: string) => boolean)
		| null = null;
	private hiddenPaths = new Set<string>();

	private originalFileItemStartRename:
		| ((...args: unknown[]) => unknown)
		| null = null;
	private fileItemTargetProto: Record<string, unknown> | null = null;
	private originalCreateFileItem:
		| ((...args: unknown[]) => unknown)
		| null = null;
	private originalStartRenameFile:
		| ((...args: unknown[]) => unknown)
		| null = null;
	private fileExplorerTargetProto: Record<string, unknown> | null = null;
	private originalTFileGetNewPath:
		| ((newName: string) => string)
		| null = null;
	private originalPromptForFileRename:
		| ((file: TAbstractFile) => unknown)
		| null = null;
	private fileItemProtoPatched = false;
	private originalPOGetTitle: ((...args: unknown[]) => string) | null = null;
	private originalPOUpdateTitle:
		| ((...args: unknown[]) => unknown)
		| null = null;
	private poTargetProto: Record<string, unknown> | null = null;
	private originalSaveRename:
		| ((...args: unknown[]) => Promise<boolean>)
		| null = null;
	private originalOnFileRenameInput:
		| ((...args: unknown[]) => unknown)
		| null = null;
	private lastUnsupportedClickFile: string | null = null;
	private lastUnsupportedClickTime = 0;
	cachedObsidianIgnoreRules: IgnoreRule[] = [];
	cachedGitIgnoreRules: IgnoreRule[] = [];
	private ignoreMatcher = new IgnoreMatcher();
	private explorerObservers = new Map<HTMLElement, () => void>();
	private unloading = false;
	private initializingIgnoreFiltering = true;
	private rescanRunner = new CoalescedScan(() => this.scanVaultFolders());
	settingsTab: VaultCodeSettingTab | null = null;
	aiService!: AIService;
	aiStorage!: AIStorage;
	private aiChatRibbonIconEl: HTMLElement | null = null;
	private externalFolders?: ExternalFolderFeature;
	private aiChatLeaves = new ChatLeafManager<WorkspaceLeaf>();
	private chatPropertyTypesTask: Promise<void> | null = null;

	async onload() {
		this.aiService = new AIService(this.app, this);
		this.aiStorage = new AIStorage(this.app);
		// Registering a view can immediately restore it during startup or hot reload.
		// Its settings and ignore policy must already be ready before onOpen runs.
		await this.initializeIgnoreFiltering();
		if (Platform.isDesktop) {
			this.externalFolders = new ExternalFolderFeature(this.app, path => this.isPathIgnored(path, true), () => this.applyFileExplorerFiltering());
			this.register(this.externalFolders.guardDeletion());
		}

		this.registerView(
			VIEW_TYPE_DOTFILE,
			(leaf) => new DotfileView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_AI_CHAT,
			(leaf) => new AIChatView(leaf, this),
		);

		if (Platform.isDesktop) {
			this.statusBarGitEl = this.addStatusBarItem();
			this.statusBarGitEl.addClass("vault-code-status-git");
			this.statusBarGitEl.hide();
		}

		// Auto-create .obsidianignore if enabled and missing on startup
		if (this.settings.useObsidianIgnore) {
			try {
				const exists = await this.app.vault.adapter.exists(".obsidianignore");
				if (!exists) {
					await this.app.vault.adapter.write(
						".obsidianignore",
						DEFAULT_OBSIDIANIGNORE_CONTENT,
					);
				}
			} catch (e) {
				console.error("Vault Code: Failed to auto-create .obsidianignore", e);
			}
		}
		this.previousShowUnsupportedFiles =
			(this.app.vault.getConfig("showUnsupportedFiles") as boolean) ??
			false;

		this.applyShowAllFileTypes();

		this.patchWorkspaceLeaf();
		this.patchViewRegistry();
		this.patchTFileGetNewPath();
		this.patchFileManagerPrompt();

		this.registerDomEvent(window, "input", this.onInputCapture, true);
		this.registerEditorExtension(this.createAgentSelectionExtension());

		// Watch for ignore file changes at vault root and git status updates
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				this.externalFolders?.invalidate(file.path);
				void this.handleIgnoreFileEvent(file.path);
				this.debouncedUpdateGitStatus();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				this.externalFolders?.invalidate(file.path);
				void this.handleIgnoreFileEvent(file.path);
				this.debouncedUpdateGitStatus();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.externalFolders?.invalidate(file.path);
				void this.handleIgnoreFileEvent(file.path);
				this.debouncedUpdateGitStatus();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.externalFolders?.invalidate(file.path);
				void this.handleIgnoreFileEvent(file.path);
				this.externalFolders?.invalidate(oldPath);
				void this.handleIgnoreFileEvent(oldPath);
				this.applyFileExplorerFiltering();
				this.debouncedUpdateGitStatus();
			}),
		);

		this.app.workspace.onLayoutReady(async () => {
			this.patchFileExplorer();
			if (this.settings.showHiddenFiles) {
				this.patchAdapter();
				this.suppressDotfileWarning();
				void this.rescanVault();
			}

			if (Platform.isDesktop && this.isGitAvailable()) {
				void this.gitService.getRepoRoot().then(() => {
					this.updateAllLeafHeaderActions();
					void this.updateStatusBarGit();
				});
			}

			// Seamlessly restore code editor leaves on launch or after plugin update/reload
			await this.reloadCodeEditorLeaves();
			this.updateAllLeafHeaderActions();

			if (Platform.isDesktop) {
				if (this.settings.enableAIChat) {
					await this.reloadAIChatLeaves();
					if (this.settings.aiAttachInstructions !== false) {
						void this.aiStorage.ensureInstructionsFile(this.settings.aiChatFolder || "agent-chats");
					}
					if (this.settings.aiChatAutoClean !== "never") {
						void this.aiStorage.runAutoCleanup(
							this.settings.aiChatFolder,
							this.settings.aiChatAutoClean,
						);
					}
				} else {
					this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
				}
			}
		});

		if (this.app.workspace.layoutReady) {
			void this.reloadCodeEditorLeaves();
			if (Platform.isDesktop && this.isGitAvailable()) {
				void this.gitService.getRepoRoot().then(() => {
					this.updateAllLeafHeaderActions();
					void this.updateStatusBarGit();
				});
			}
		}

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.patchFileExplorer();
				this.updateAllLeafHeaderActions();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf) {
					this.updateLeafHeaderActions(leaf);
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.updateAllLeafHeaderActions();
			}),
		);

		if (Platform.isMobile) {
			this.registerDomEvent(document, "visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					const dirtyViews = this.getDirtyViews();
					for (const view of dirtyViews) {
						void view.saveExplicitly();
					}
				}
			});
		}

		this.registerEvent(
			this.app.workspace.on("quit", (tasks) => {
				const dirtyViews = this.getDirtyViews();
				if (dirtyViews.length > 0) {
					tasks.add(async () => {
						for (const view of dirtyViews) {
							await view.saveExplicitly();
						}
					});
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on(
				"file-menu",
				(menu, file, source, leaf) => {
					if (file instanceof TFolder) {
						this.externalFolders?.menu(menu, file);
						menu.addItem((item) => {
							item
								.setTitle(t("contextNewFile"))
								.setIcon("file-plus")
								.setSection("action")
								.onClick(() => {
									new CreateFileModal(this.app, this, file).open();
								});
						});
					} else if (file instanceof TFile) {
						const targetFolder =
							file.parent ?? this.app.vault.getRoot();

						menu.addItem((item) => {
							item
								.setTitle(t("contextNewNoteHere"))
								.setIcon("file-text")
								.setSection("action")
								.onClick(() => {
									void this.createNewNoteInFolder(targetFolder);
								});
						});

						menu.addItem((item) => {
							item
								.setTitle(t("contextNewFileHere"))
								.setIcon("file-plus")
								.setSection("action")
								.onClick(() => {
									new CreateFileModal(
										this.app,
										this,
										targetFolder,
									).open();
								});
						});

						menu.addItem((item) => {
							item
								.setTitle(t("contextNewFolderHere"))
								.setIcon("folder-plus")
								.setSection("action")
								.onClick(() => {
									void this.createNewFolderInFolder(targetFolder);
								});
						});

						this.externalFolders?.menu(menu, file);

						menu.addItem((item) => {
							item
								.setTitle(t("contextEditFileNameAndExtension"))
								.setIcon("pencil")
								.setSection("action")
								.onClick(() => {
									new RenameModal(this.app, this, file).open();
								});
						});

						if (this.isViewableInCodeEditor(file)) {
							const isCurrentCodeEditor =
								leaf?.view instanceof DotfileView;

							// If in more-options and already in code editor for a non-markdown file, skip
							if (
								source === "more-options" &&
								isCurrentCodeEditor &&
								!this.isMarkdownFile(file)
							) {
								return;
							}

							menu.addItem((item) => {
								item
									.setTitle(t("contextEditInCodeEditor"))
									.setIcon(
										getIcon("file-code")
											? "file-code"
											: "code",
									);

								if (source === "more-options") {
									item.setSection("pane");
									item.setChecked(isCurrentCodeEditor);
								}

								item.onClick(async () => {
									let targetLeaf = leaf;
									if (!targetLeaf) {
										this.app.workspace.iterateAllLeaves((l) => {
											if (
												!targetLeaf &&
												(l.view as { file?: TFile })?.file?.path ===
													file.path
											) {
												targetLeaf = l;
											}
										});
									}
									if (!targetLeaf) {
										targetLeaf = this.app.workspace.getLeaf(false);
									}

									await this.toggleCodeEditorForLeaf(targetLeaf, file);
								});
							});
						}

						if (
							this.isGitAvailable() &&
							(this.gitService.isCachedGitRepo() ||
								!this.gitService.hasCheckedRepo())
						) {
							menu.addItem((item) => {
								item
									.setTitle(t("gitViewChanges"))
									.setIcon("git-compare")
									.setSection("action")
									.onClick(() => {
										void this.openFileInDiffView(file);
									});
							});
						}
					}
				},
			),
		);

		this.registerEvent(
			this.app.workspace.on("files-menu", (menu) => {
				const root = this.app.vault.getRoot();
				menu.addItem((item) => {
					item
						.setTitle(t("contextNewFile"))
						.setIcon("file-plus")
						.onClick(() => {
							new CreateFileModal(this.app, this, root).open();
						});
				});
			}),
		);

		this.addRibbonIcon("file-plus", t("ribbonNewFileTooltip"), () => {
			const targetFolder = this.getActiveOrSelectedFolder();
			new CreateFileModal(this.app, this, targetFolder).open();
		});

		this.addCommand({
			id: "add-external-folder",
			name: t("externalFolderAdd"),
			checkCallback: checking => {
				if (!Platform.isDesktop) return false;
				if (!checking) void this.externalFolders?.choose(this.getActiveOrSelectedFolder().path);
				return true;
			},
		});

		this.addAIChatRibbon();

		this.addCommand({
			id: "open-ai-chat",
			name: t("aiChatWithAgent"),
			checkCallback: (checking) => {
				if (!Platform.isDesktop || !this.settings.enableAIChat) return false;
				if (!checking) {
					void this.activateAIChatView();
				}
				return true;
			},
		});

		this.addSettingTab(new VaultCodeSettingTab(this.app, this));

		this.addCommand({
			id: "create-new-file",
			name: t("commandCreateFile"),
			callback: () => {
				const activeFolder = this.getActiveOrSelectedFolder();
				new CreateFileModal(this.app, this, activeFolder).open();
			},
		});

		this.addCommand({
			id: "create-new-folder",
			name: t("commandCreateFolder"),
			callback: () => {
				const activeFolder = this.getActiveOrSelectedFolder();
				void this.createNewFolderInFolder(activeFolder);
			},
		});

		this.addCommand({
			id: "rename-active-file",
			name: t("commandRenameActive"),
			callback: () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					new RenameModal(this.app, this, activeFile).open();
					return;
				}

				const leaves =
					this.app.workspace.getLeavesOfType("file-explorer");
				for (const leaf of leaves) {
					const view = leaf.view as {
						selectedFile?: TAbstractFile;
					};
					if (
						view?.selectedFile &&
						!(
							view.selectedFile instanceof TFolder &&
							view.selectedFile.isRoot()
						)
					) {
						new RenameModal(this.app, this, view.selectedFile).open();
						return;
					}
				}

				new Notice(t("noticeNoActiveToRename"));
			},
		});

		this.addCommand({
			id: "toggle-show-hidden-files",
			name: t("commandToggleHidden"),
			callback: async () => {
				this.settings.showHiddenFiles = !this.settings.showHiddenFiles;
				await this.saveSettings();
				if (this.settings.showHiddenFiles) {
					await this.enableHiddenFiles();
					new Notice(t("noticeHiddenFilesVisible"));
				} else {
					await this.disableHiddenFiles();
					new Notice(t("noticeHiddenFilesHidden"));
				}
			},
		});

		this.addCommand({
			id: "toggle-show-all-file-types",
			name: t("commandToggleAllTypes"),
			callback: async () => {
				this.settings.showAllFileTypes = !this.settings.showAllFileTypes;
				await this.saveSettings();
				this.applyShowAllFileTypes();
				new Notice(
					this.settings.showAllFileTypes
						? t("noticeAllFilesVisible")
						: t("noticeAllFilesHidden"),
				);
			},
		});

		this.addCommand({
			id: "toggle-allow-edit-dotfiles",
			name: t("commandToggleAllowEditDotfiles"),
			callback: async () => {
				this.settings.allowEditDotfiles = !this.settings.allowEditDotfiles;
				await this.saveSettings();
				new Notice(
					this.settings.allowEditDotfiles
						? t("noticeDotfileEditingEnabled")
						: t("noticeDotfileEditingDisabled"),
				);
			},
		});

		this.addCommand({
			id: "toggle-allow-edit-code-files",
			name: t("commandToggleAllowEditCodeFiles"),
			callback: async () => {
				this.settings.allowEditCodeFiles = !this.settings.allowEditCodeFiles;
				await this.saveSettings();
				new Notice(
					this.settings.allowEditCodeFiles
						? t("noticeCodeEditingEnabled")
						: t("noticeCodeEditingDisabled"),
				);
			},
		});

		this.addCommand({
			id: "toggle-disable-auto-save",
			name: t("settingsDisableAutoSaveName"),
			callback: async () => {
				this.settings.disableAutoSave = !this.settings.disableAutoSave;
				await this.saveSettings();
				new Notice(
					this.settings.disableAutoSave
						? t("noticeAutoSaveDisabled")
						: t("noticeAutoSaveEnabled"),
				);
			},
		});

		this.addCommand({
			id: "find-and-replace-code-editor",
			name: `${t("searchFindAriaLabel")} / ${t("searchReplace")}`,
			checkCallback: (checking: boolean) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (activeView) {
					if (!checking) {
						activeView.openFind();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "replace-code-editor",
			name: t("searchReplace"),
			checkCallback: (checking: boolean) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (activeView) {
					if (!checking) {
						activeView.openReplace();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-line-wrapping-code-editor",
			name: t("commandToggleLineWrapping"),
			checkCallback: (checking: boolean) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (activeView) {
					if (!checking) {
						activeView.toggleLineWrapping();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-preview-code-editor",
			name: t("commandTogglePreview"),
			checkCallback: (checking: boolean) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (activeView && activeView.isPreviewable()) {
					if (!checking) {
						activeView.toggleViewMode();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "goto-line-code-editor",
			name: t("commandGotoLine"),
			checkCallback: (checking: boolean) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (activeView) {
					if (!checking) {
						activeView.openGotoLine();
					}
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "git-view-changes",
			name: t("commandGitViewChanges"),
			checkCallback: (checking: boolean) => {
				if (!this.isGitAvailable()) return false;
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;
				if (!checking) {
					const activeView =
						this.app.workspace.getActiveViewOfType(DotfileView);
					if (activeView && activeView.file?.path === activeFile.path) {
						void activeView.toggleDiffMode();
					} else {
						void this.openFileInDiffView(activeFile);
					}
				}
				return true;
			},
		});

		this.addCommand({
			id: "git-revert-changes",
			name: t("commandGitRevertChanges"),
			checkCallback: (checking: boolean) => {
				if (!this.isGitAvailable()) return false;
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (!activeView || !activeView.file) return false;
				if (!checking) {
					new ConfirmRevertModal(
						this.app,
						activeView.file.name,
						async () => {
							if (!activeView.file) return;
							const ok = await this.gitService.discardFileChanges(
								activeView.file.path,
							);
							if (ok) {
								const restored = await this.app.vault.adapter.read(
									activeView.file.path,
								);
								await activeView.revertToContent(restored);
								void this.updateStatusBarGit();
								new Notice(
									t("gitNoticeReverted", activeView.file.name),
								);
							} else {
								new Notice(
									t(
										"gitNoticeRevertFailed",
										"Error discarding changes",
									),
								);
							}
						},
					).open();
				}
				return true;
			},
		});

		this.addCommand({
			id: "git-commit-file",
			name: t("commandGitCommitFile"),
			checkCallback: (checking: boolean) => {
				if (!this.isGitAvailable()) return false;
				const activeView =
					this.app.workspace.getActiveViewOfType(DotfileView);
				if (!activeView || !activeView.file) return false;
				if (!checking) {
					new CommitFileModal(
						this.app,
						activeView.file.name,
						async (msg) => {
							if (!activeView.file) return;
							await activeView.saveExplicitly();
							const res = await this.gitService.commitFile(
								activeView.file.path,
								msg,
							);
							if (res.success) {
								new Notice(
									t("gitNoticeCommitted", activeView.file.name),
								);
								await activeView.setDiffMode(false);
								void this.updateStatusBarGit();
							} else {
								new Notice(
									t(
										"gitNoticeCommitFailed",
										res.error ?? "Git commit error",
									),
								);
							}
						},
					).open();
				}
				return true;
			},
		});

		this.addCommand({
			id: "git-switch-branch",
			name: t("commandGitSwitchBranch"),
			checkCallback: (checking: boolean) => {
				if (!this.isGitAvailable()) return false;
				if (!checking) {
					void this.openBranchSwitcherModal();
				}
				return true;
			},
		});

		this.addCommand({
			id: "git-create-branch",
			name: t("commandGitCreateBranch"),
			checkCallback: (checking: boolean) => {
				if (!this.isGitAvailable()) return false;
				if (!checking) {
					void this.openCreateBranchModal();
				}
				return true;
			},
		});
	}

	private async reloadCodeEditorLeaves(): Promise<void> {
		const leavesToReload: WorkspaceLeaf[] = [];
		const sidebarLeavesToDetach: WorkspaceLeaf[] = [];

		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewState = leaf.getViewState();
			if (viewState && viewState.type === VIEW_TYPE_DOTFILE) {
				if (leaf.getRoot() !== this.app.workspace.rootSplit) {
					sidebarLeavesToDetach.push(leaf);
					return;
				}
				const view = leaf.view;
				const isDeadOrStale =
					!(view instanceof DotfileView) ||
					!view.editor ||
					view.plugin !== this ||
					view.contentEl.children.length === 0;

				if (isDeadOrStale) {
					leavesToReload.push(leaf);
				}
			}
		});

		for (const leaf of sidebarLeavesToDetach) {
			leaf.detach();
		}

		for (const leaf of leavesToReload) {
			const viewState = leaf.getViewState();
			const filePath =
				(viewState?.state as { file?: string } | undefined)?.file ||
				(leaf.view as unknown as { file?: { path: string }; filePath?: string })?.file?.path ||
				(leaf.view as unknown as { filePath?: string })?.filePath;

			const targetState = {
				...(viewState?.state ?? {}),
				...(filePath ? { file: filePath } : {}),
			};
			const activeFile = this.app.workspace.getActiveFile();
			const isActive = Boolean(activeFile && filePath && activeFile.path === filePath);

			// Clear view state first so Obsidian purges the stale instance and re-invokes
			// the newly registered DotfileView constructor cleanly
			await leaf.setViewState({ type: "empty" });
			await leaf.setViewState({
				type: VIEW_TYPE_DOTFILE,
				state: targetState,
				active: isActive,
			});
		}
	}

	onunload() {
		this.unloading = true;
		if (this.gitStatusDebounceTimer !== null) {
			window.clearTimeout(this.gitStatusDebounceTimer);
			this.gitStatusDebounceTimer = null;
		}

		// Save any dirty code editor views before unloading to prevent data loss
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof DotfileView && leaf.view.isDirty()) {
				try {
					void leaf.view.save();
				} catch {
					// ignore
				}
			}
		});

		this.restoreWorkspaceLeaf();
		this.restoreViewRegistry();
		this.restoreTFileGetNewPath();
		this.restoreFileManagerPrompt();
		this.restoreFileExplorer();
		void this.restoreAdapter();
		this.restoreDotfileWarning();
		this.app.vault.setConfig(
			"showUnsupportedFiles",
			this.previousShowUnsupportedFiles,
		);

		// Remove any injected toggle buttons from leaves
		this.app.workspace.iterateAllLeaves((leaf) => {
			const actionsEl = (
				leaf.view as unknown as { actionsEl?: HTMLElement }
			)?.actionsEl;
			actionsEl?.querySelector(".vault-code-header-toggle-btn")?.remove();
			actionsEl?.querySelector(".vault-code-header-ai-chat-btn")?.remove();
			actionsEl?.querySelector(".vault-code-header-diff-btn")?.remove();
		});

		this.removeAIChatRibbon();

		DotfileView.clearCssCache();
	}

	public addAIChatRibbon(): void {
		if (this.aiChatRibbonIconEl || !Platform.isDesktop || !this.settings.enableAIChat) return;
		this.aiChatRibbonIconEl = this.addRibbonIcon("sparkles", t("aiChatWithAgent"), () => {
			void this.activateAIChatView();
		});
	}

	public removeAIChatRibbon(): void {
		if (this.aiChatRibbonIconEl) {
			this.aiChatRibbonIconEl.remove();
			this.aiChatRibbonIconEl = null;
		}
	}

	private async reloadAIChatLeaves(): Promise<void> {
		if (!Platform.isDesktop) return;
		if (!this.settings.enableAIChat) {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
			return;
		}
		await this.ensureAIChatLeaf();
	}

	private async ensureAIChatLeaf(): Promise<WorkspaceLeaf | null> {
		if (!Platform.isDesktop || !this.settings.enableAIChat || this.unloading) return null;
		// Startup enters here after layout is ready; enabling chat later uses the same path.
		await (this.chatPropertyTypesTask ??= ensureChatPropertyTypes(this.app)
			.catch((error: unknown) => { console.warn("Vault Code: Could not register chat date types", error); })
			.finally(() => { this.chatPropertyTypesTask = null; }));
		const { workspace } = this.app;
		return this.aiChatLeaves.ensure({
			enabled: () => Platform.isDesktop && this.settings.enableAIChat && !this.unloading,
			leaves: () => {
				const leaves: WorkspaceLeaf[] = [];
				// Deferred views may not yet appear in getLeavesOfType on startup.
				workspace.iterateAllLeaves((leaf) => {
					if (leaf.getViewState()?.type === VIEW_TYPE_AI_CHAT) leaves.push(leaf);
				});
				return leaves;
			},
			create: () => workspace.getRightLeaf(false),
			state: (leaf) => leaf.getViewState(),
			keep: (leaf) => leaf.view instanceof AIChatView && leaf.view.hasPendingChatContent(),
			current: (leaf) => leaf.view instanceof AIChatView && leaf.view.plugin === this && leaf.view.containerEl.children.length > 0,
			active: (leaf) => workspace.getActiveViewOfType(AIChatView) === leaf.view,
			setState: (leaf, state) => leaf.setViewState(state),
			detach: (leaf) => leaf.detach(),
			type: VIEW_TYPE_AI_CHAT,
		});
	}

	async initAIChatLeaf(): Promise<void> {
		await this.ensureAIChatLeaf();
	}

	public createAgentSelectionExtension(): Extension {
		return agentSelectionExtension({
			enabled: () => Platform.isDesktop && this.settings.enableAIChat,
			label: () => t("aiChatQuoteSelection"),
			filePath: (editor) => {
				let path: string | null = null;
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view.containerEl.contains(editor.dom)) path = this.getLeafFilePath(leaf);
				});
				return path;
			},
			onQuote: (quote) => { void this.activateAIChatView(quote); },
		});
	}

	async activateAIChatView(quote?: SelectionQuote): Promise<void> {
		if (!Platform.isDesktop || !this.settings.enableAIChat) return;
		const { workspace } = this.app;
		const leaf = await this.ensureAIChatLeaf();
		// Ensure the right sidebar is expanded if collapsed
		const rightSplit = workspace.rightSplit;
		if (rightSplit && "collapsed" in rightSplit && rightSplit.collapsed) {
			rightSplit.expand();
		}

		if (leaf) {
			workspace.setActiveLeaf(leaf, { focus: true });
			if (leaf.view instanceof AIChatView) {
				if (quote) leaf.view.attachSelection(quote);
				leaf.view.focusInput();
			}
		}
	}

	/* ── Git integration ───────────────────────────────────────── */

	public isGitAvailable(): boolean {
		return Boolean(
			this.settings.enableGitIntegration && this.gitService.isAvailable(),
		);
	}

	public getActiveWorkspaceLeaf(): WorkspaceLeaf | null {
		const mostRecent = (
			this.app.workspace as unknown as {
				getMostRecentLeaf?: (root?: unknown) => WorkspaceLeaf | null;
			}
		).getMostRecentLeaf?.(this.app.workspace.rootSplit);
		if (
			mostRecent &&
			mostRecent.getRoot() === this.app.workspace.rootSplit
		) {
			return mostRecent;
		}
		const activeView =
			this.app.workspace.getActiveViewOfType(DotfileView) ??
			this.app.workspace.getActiveViewOfType(TextFileView) ??
			this.app.workspace.getActiveViewOfType(View);
		if (
			activeView &&
			activeView.leaf &&
			activeView.leaf.getRoot() === this.app.workspace.rootSplit
		) {
			return activeView.leaf;
		}
		return this.app.workspace.getLeaf(false);
	}

	public getLeafFilePath(
		leaf: WorkspaceLeaf | null | undefined,
	): string | null {
		if (!leaf || !leaf.view) return null;
		if (leaf.getRoot() !== this.app.workspace.rootSplit) {
			return null;
		}
		const view = leaf.view as unknown as {
			file?: TFile;
			filePath?: string;
		};
		if (view.file && typeof view.file.path === "string") {
			return view.file.path;
		}
		if (typeof view.filePath === "string") {
			return view.filePath;
		}
		return null;
	}

	public isLeafDirty(leaf: WorkspaceLeaf | null | undefined): boolean {
		if (!leaf || !leaf.view) return false;
		const view = leaf.view;
		if (view instanceof DotfileView) {
			return view.isDirty();
		}
		return false;
	}

	public async saveLeafViewIfDirty(
		leaf: WorkspaceLeaf | null | undefined,
	): Promise<void> {
		if (!leaf || !leaf.view) return;
		const view = leaf.view;
		if (view instanceof DotfileView) {
			if (view.isDirty()) {
				await view.saveExplicitly();
			}
			return;
		}
		const anyView = view as unknown as {
			save?: () => Promise<void>;
		};
		if (typeof anyView.save === "function") {
			try {
				await anyView.save();
			} catch {
				// ignore
			}
		}
	}

	public async openFileInDiffView(file: TFile): Promise<void> {
		if (!this.isGitAvailable()) return;
		try {
			if (!this.isFileSupportedForGitDiff(file)) {
				new Notice(t("gitBinaryDiffUnsupported"));
				const activeLeaf = this.getActiveWorkspaceLeaf();
				const isDirty = this.isLeafDirty(activeLeaf);
				const targetLeaf = isDirty
					? this.app.workspace.getLeaf("tab")
					: (activeLeaf ?? this.app.workspace.getLeaf(false));
				await targetLeaf.openFile(file);
				return;
			}
			const stats = await this.gitService.getFileDiffStats(file.path);
			if (!stats || !stats.isModified) {
				new Notice(t("gitNoChanges"));
				return;
			}

			// 1. Check if the target file is already open in any existing leaf in the main editor area
			let existingLeaf: WorkspaceLeaf | null = null;
			const activeLeaf = this.getActiveWorkspaceLeaf();
			if (
				activeLeaf &&
				activeLeaf.getRoot() === this.app.workspace.rootSplit &&
				this.getLeafFilePath(activeLeaf) === file.path
			) {
				existingLeaf = activeLeaf;
			} else {
				this.app.workspace.iterateRootLeaves((leaf) => {
					if (!existingLeaf && this.getLeafFilePath(leaf) === file.path) {
						existingLeaf = leaf;
					}
				});
			}

			if (existingLeaf) {
				this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
				if (existingLeaf.view instanceof DotfileView) {
					if (!existingLeaf.view.isDiffMode) {
						await existingLeaf.view.setDiffMode(true);
					}
					this.updateAllLeafHeaderActions();
					return;
				}

				await this.saveLeafViewIfDirty(existingLeaf);
				await existingLeaf.setViewState({
					type: VIEW_TYPE_DOTFILE,
					active: true,
					state: { file: file.path, diff: true },
				});
				if (
					existingLeaf.view instanceof DotfileView &&
					!existingLeaf.view.isDiffMode
				) {
					await existingLeaf.view.setDiffMode(true);
				}
				this.updateAllLeafHeaderActions();
				return;
			}

			// 2. Target file is not open in any main editor leaf.
			// If the active tab has unsaved changes, preserve it and open in a new tab.
			// Otherwise, open on that existing tab.
			const isCurrentDirty = this.isLeafDirty(activeLeaf);
			let targetLeaf: WorkspaceLeaf;
			if (isCurrentDirty) {
				targetLeaf = this.app.workspace.getLeaf("tab");
			} else {
				targetLeaf =
					activeLeaf &&
					activeLeaf.getRoot() === this.app.workspace.rootSplit
						? activeLeaf
						: this.app.workspace.getLeaf(false);
				await this.saveLeafViewIfDirty(targetLeaf);
			}

			await targetLeaf.setViewState({
				type: VIEW_TYPE_DOTFILE,
				active: true,
				state: { file: file.path, diff: true },
			});
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });

			if (
				targetLeaf.view instanceof DotfileView &&
				!targetLeaf.view.isDiffMode
			) {
				await targetLeaf.view.setDiffMode(true);
			}
			this.updateAllLeafHeaderActions();
		} catch (err) {
			console.error("Failed to open file in diff view:", err);
		}
	}

	public debouncedUpdateGitStatus(): void {
		if (!this.isGitAvailable()) return;
		if (this.gitStatusDebounceTimer !== null) {
			window.clearTimeout(this.gitStatusDebounceTimer);
		}
		this.gitStatusDebounceTimer = window.setTimeout(() => {
			this.gitStatusDebounceTimer = null;
			void this.updateStatusBarGit();
		}, 1500);
	}

	public async updateStatusBarGit(): Promise<void> {
		if (!this.statusBarGitEl) return;
		if (!this.isGitAvailable()) {
			this.statusBarGitEl.empty();
			this.statusBarGitEl.hide();
			return;
		}

		const isRepo = await this.gitService.isGitRepo();
		if (!isRepo) {
			this.statusBarGitEl.empty();
			this.statusBarGitEl.hide();
			return;
		}

		const branch = await this.gitService.getCurrentBranch();
		if (!branch) {
			this.statusBarGitEl.empty();
			this.statusBarGitEl.hide();
			return;
		}

		const modifiedFiles = await this.gitService.getModifiedVaultFiles();
		this.cachedModifiedFiles = modifiedFiles;
		this.updateAllLeafHeaderActions();
		const count = modifiedFiles.size;

		this.statusBarGitEl.empty();
		this.statusBarGitEl.show();

		const iconSpan = this.statusBarGitEl.createSpan({
			cls: "vault-code-status-git-icon",
		});
		setIcon(iconSpan, "git-branch");

		this.statusBarGitEl.createSpan({
			cls: "vault-code-status-git-branch",
			text: branch,
		});

		if (count > 0) {
			this.statusBarGitEl.createSpan({
				cls: "vault-code-status-git-dot",
				text: "●",
			});
			this.statusBarGitEl.createSpan({
				cls: "vault-code-status-git-count",
				text: String(count),
			});
		}

		const tooltip =
			count > 0
				? `${t("gitBranchStatus", branch)} (${t("gitChangedFilesCount", count)})`
				: t("gitBranchStatus", branch);
		this.statusBarGitEl.setAttribute("aria-label", tooltip);

		this.statusBarGitEl.onclick = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();
			(
				menu as unknown as {
					setUseNativeMenu?: (use: boolean) => Menu;
					useNativeMenu?: boolean;
				}
			).setUseNativeMenu?.(false);
			(
				menu as unknown as { useNativeMenu?: boolean }
			).useNativeMenu = false;

			menu.addItem((item) => {
				item
					.setTitle(`${t("gitBranchStatus", branch)}`)
					.setIcon("git-branch")
					.setDisabled(true);
			});

			menu.addSeparator();

			menu.addItem((item) => {
				item
					.setTitle(t("gitSwitchBranch"))
					.setIcon(getIcon("arrow-left-right") ? "arrow-left-right" : "git-branch")
					.onClick(() => {
						void this.openBranchSwitcherModal();
					});
			});

			menu.addItem((item) => {
				item
					.setTitle(t("gitCreateBranch"))
					.setIcon(getIcon("git-branch-plus") ? "git-branch-plus" : "plus")
					.onClick(() => {
						void this.openCreateBranchModal();
					});
			});

			menu.addSeparator();

			const supportedFiles: TFile[] = [];
			let unsupportedOrIgnoredCount = 0;

			for (const filePath of modifiedFiles) {
				if (this.isPathIgnored(filePath, false)) {
					unsupportedOrIgnoredCount++;
					continue;
				}
				const tfile = this.app.vault.getAbstractFileByPath(filePath);
				if (tfile instanceof TFile && this.isFileSupportedForGitDiff(tfile)) {
					supportedFiles.push(tfile);
				} else {
					unsupportedOrIgnoredCount++;
				}
			}

			supportedFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

			if (supportedFiles.length > 0 || unsupportedOrIgnoredCount > 0) {
				if (supportedFiles.length > 0) {
					menu.addItem((item) => {
						item
							.setTitle(t("gitChangedFilesCount", supportedFiles.length))
							.setIcon("files")
							.setDisabled(true);
					});

					const maxDisplay = 10;
					const displayFiles = supportedFiles.slice(0, maxDisplay);
					for (const tfile of displayFiles) {
						menu.addItem((item) => {
							item
								.setTitle(tfile.name)
								.setIcon("git-compare")
								.onClick(() => {
									void this.openFileInDiffView(tfile);
								});
						});
					}

					if (supportedFiles.length > maxDisplay) {
						const remaining = supportedFiles.length - maxDisplay;
						menu.addItem((item) => {
							item
								.setTitle(t("gitMoreFilesCount", remaining))
								.setIcon(
									getIcon("list-filter")
										? "list-filter"
										: "search",
								)
								.onClick(() => {
									new ChangedFilesModal(
										this.app,
										this,
										supportedFiles,
									).open();
								});
						});
					}
				}

				if (unsupportedOrIgnoredCount > 0) {
					menu.addItem((item) => {
						item
							.setTitle(
								t(
									"gitUnsupportedOrIgnoredCount",
									unsupportedOrIgnoredCount,
								),
							)
							.setIcon(
								getIcon("eye-off")
									? "eye-off"
									: (getIcon("file-minus") ? "file-minus" : "slash"),
							)
							.setDisabled(true);
					});
				}

				menu.addSeparator();
			}

			menu.addItem((item) => {
				item
					.setTitle(t("gitRefreshStatus"))
					.setIcon("refresh-cw")
					.onClick(() => {
						void this.updateStatusBarGit();
					});
			});

			menu.showAtMouseEvent(e);
		};
	}

	public async refreshGitState(): Promise<void> {
		await this.updateStatusBarGit();
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof DotfileView) {
				void leaf.view.updateGitStatus();
			}
		});
	}

	public async openBranchSwitcherModal(): Promise<void> {
		if (!this.isGitAvailable()) return;
		const isRepo = await this.gitService.isGitRepo();
		if (!isRepo) return;
		const currentBranch = (await this.gitService.getCurrentBranch()) ?? "";
		const branches = await this.gitService.getLocalBranches();
		if (branches.length === 0) {
			new Notice(t("gitNoBranchesFound"));
			return;
		}
		new BranchSwitcherModal(this.app, this, branches, currentBranch).open();
	}

	public async openCreateBranchModal(): Promise<void> {
		if (!this.isGitAvailable()) return;
		const isRepo = await this.gitService.isGitRepo();
		if (!isRepo) return;
		new CreateBranchModal(this.app, this).open();
	}

	public async applyGitIntegrationToggle(enabled: boolean): Promise<void> {
		this.settings.enableGitIntegration = enabled;
		await this.saveSettings();

		if (this.gitStatusDebounceTimer !== null) {
			window.clearTimeout(this.gitStatusDebounceTimer);
			this.gitStatusDebounceTimer = null;
		}

		if (!enabled) {
			this.cachedModifiedFiles.clear();

			if (this.statusBarGitEl) {
				this.statusBarGitEl.empty();
				this.statusBarGitEl.hide();
			}

			// Cleanly remove all Git UI and exit diff mode across all open views
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view instanceof DotfileView) {
					leaf.view.hideGitUI();
				}
			});

			this.updateAllLeafHeaderActions();
		} else {
			if (Platform.isDesktop) {
				await this.gitService.getRepoRoot();
				await this.updateStatusBarGit();
				this.updateAllLeafHeaderActions();

				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view instanceof DotfileView) {
						void leaf.view.updateGitStatus();
					}
				});
			}
		}
	}

	/* ── editability & extension handling ──────────────────── */

	getEditableExtensionsSet(): Set<string> {
		return editableEditorExtensions(this.settings.customFileExtensions);
	}

	isMarkdownFile(file: TFile): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension ? file.extension.toLowerCase() : "";
		return ext === "md" || ext === "markdown";
	}

	public isFileSupportedForGitDiff(file: TFile | null): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension ? file.extension.toLowerCase() : "";
		if (BINARY_EXTENSIONS.has(ext)) {
			return false;
		}
		if (ext === "canvas") {
			return false;
		}
		return this.isViewableInCodeEditor(file);
	}

	isViewableInCodeEditor(file: TFile): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension ? file.extension.toLowerCase() : "";
		if (ext && BINARY_EXTENSIONS.has(ext)) {
			return false;
		}
		if (this.isMarkdownFile(file)) {
			return true;
		}
		return this.isFileEditable(file);
	}

	async toggleCodeEditorForLeaf(
		leaf: WorkspaceLeaf,
		targetFile?: TFile,
	): Promise<void> {
		if (!leaf || !leaf.view) return;
		const view = leaf.view;
		const file = targetFile ?? (view as { file?: TFile }).file;
		if (!file) return;

		if (
			view instanceof DotfileView &&
			(!targetFile || targetFile.path === view.file?.path)
		) {
			await view.saveExplicitly();
			await leaf.setViewState({
				type: "markdown",
				state: { file: file.path },
				active: true,
			});
			this.updateAllLeafHeaderActions();
			return;
		}

		const currentView = view as unknown as { save?: () => Promise<void> };
		if (typeof currentView?.save === "function") {
			try {
				await currentView.save();
			} catch {
				// Ignore save error
			}
		}

		await leaf.setViewState({
			type: VIEW_TYPE_DOTFILE,
			state: { file: file.path },
			active: true,
		});
		this.updateAllLeafHeaderActions();
	}

	updateLeafHeaderActions(leaf: WorkspaceLeaf): void {
		if (!leaf || !leaf.view) return;
		const view = leaf.view;
		const actionsEl = (view as unknown as { actionsEl?: HTMLElement })
			?.actionsEl;
		if (!actionsEl || !actionsEl.instanceOf(HTMLElement)) return;

		const file = (view as { file?: TFile }).file;
		const isMarkdown = Boolean(file && this.isMarkdownFile(file));

		const existingBtn = actionsEl.querySelector<HTMLElement>(
			".vault-code-header-toggle-btn",
		);

		const isCodeEditor = view instanceof DotfileView;

		// Agent chat button in leaf header
		const existingAiChatBtn = actionsEl.querySelector<HTMLElement>(
			".vault-code-header-ai-chat-btn",
		);
		const shouldShowAiChatBtn =
			Platform.isDesktop &&
			this.settings.enableAIChat &&
			!(view instanceof AIChatView) &&
			Boolean(file);

		if (shouldShowAiChatBtn) {
			if (!existingAiChatBtn) {
				const aiChatBtn = createEl("button", {
					cls: "clickable-icon view-action vault-code-header-ai-chat-btn",
					attr: {
						"aria-label": t("aiChatWithAgent"),
					},
				});
				setIcon(aiChatBtn, "sparkles");

				aiChatBtn.addEventListener("click", (evt: MouseEvent) => {
					evt.preventDefault();
					evt.stopPropagation();
					void this.activateAIChatView();
				});

				if (actionsEl.firstChild) {
					actionsEl.insertBefore(aiChatBtn, actionsEl.firstChild);
				} else {
					actionsEl.appendChild(aiChatBtn);
				}
			} else {
				existingAiChatBtn.setAttribute("aria-label", t("aiChatWithAgent"));
				if (actionsEl.firstChild && existingAiChatBtn !== actionsEl.firstChild) {
					actionsEl.insertBefore(existingAiChatBtn, actionsEl.firstChild);
				}
			}
		} else if (existingAiChatBtn) {
			existingAiChatBtn.remove();
		}

		if (!isMarkdown) {
			if (existingBtn) {
				existingBtn.remove();
			}
		} else if (existingBtn) {
			existingBtn.toggleClass("is-active", isCodeEditor);
			existingBtn.setAttribute(
				"aria-label",
				isCodeEditor
					? t("viewToggleTooltip")
					: t("contextEditInCodeEditor"),
			);
		} else {
			const btn = createEl("button", {
				cls: `clickable-icon view-action vault-code-header-toggle-btn${
					isCodeEditor ? " is-active" : ""
				}`,
				attr: {
					"aria-label": isCodeEditor
						? t("viewToggleTooltip")
						: t("contextEditInCodeEditor"),
				},
			});
			setCodeIcon(btn);

			btn.addEventListener("click", (evt: MouseEvent) => {
				evt.preventDefault();
				evt.stopPropagation();
				void this.toggleCodeEditorForLeaf(leaf);
			});

			actionsEl.appendChild(btn);
		}

		// Show Git diff for supported changed files in native and code editor views.
		const existingDiffBtn = actionsEl.querySelector<HTMLElement>(
			".vault-code-header-diff-btn",
		);

		const isGitAvailable = Boolean(file && this.isGitAvailable());
		const isGitRepoKnown = this.gitService.isCachedGitRepo();
		const isRepoChecked = this.gitService.hasCheckedRepo();

		if (isGitAvailable && !isRepoChecked) {
			void this.gitService.isGitRepo().then((isRepo) => {
				if (isRepo) {
					this.updateLeafHeaderActions(leaf);
				}
			});
		}

		const isGitReady = isGitAvailable && (isGitRepoKnown || !isRepoChecked);
		const isSupportedForDiff = file
			? this.isFileSupportedForGitDiff(file)
			: false;
		const hasChanges = Boolean(
			file && this.cachedModifiedFiles.has(file.path),
		);
		const shouldShowHeaderDiffBtn =
			isGitReady &&
			isSupportedForDiff &&
			hasChanges;

		if (shouldShowHeaderDiffBtn) {
			if (!existingDiffBtn) {
				const diffBtn = createEl("button", {
					cls: "clickable-icon view-action vault-code-header-diff-btn",
					attr: {
						"aria-label": t("gitViewChanges"),
					},
				});
				setIcon(diffBtn, "git-compare");
				diffBtn.addEventListener("click", (evt: MouseEvent) => {
					evt.preventDefault();
					evt.stopPropagation();
					const currentFile =
						(leaf.view as { file?: TFile }).file ?? file;
					if (leaf.view instanceof DotfileView) {
						void leaf.view.toggleDiffMode();
					} else if (currentFile) {
						void this.openFileInDiffView(currentFile);
					}
				});

				actionsEl.appendChild(diffBtn);
			}
		} else if (existingDiffBtn) {
			existingDiffBtn.remove();
		}

		const headerDiffButton = actionsEl.querySelector<HTMLElement>(".vault-code-header-diff-btn");
		if (headerDiffButton) {
			const active = view instanceof DotfileView && view.isDiffMode;
			headerDiffButton.toggleClass("is-active", active);
			headerDiffButton.setAttribute("aria-label", t(active ? "gitHideChanges" : "gitViewChanges"));
		}

		// Keep plugin actions together before native actions, in keyboard and visual order.
		let previous: HTMLElement | null = null;
		for (const selector of [".vault-code-header-ai-chat-btn", ".vault-code-header-diff-btn", ".vault-code-header-toggle-btn"]) {
			const button = actionsEl.querySelector<HTMLElement>(selector);
			if (!button) continue;
			const anchor: ChildNode | null = previous ? previous.nextSibling : actionsEl.firstChild;
			if (button !== anchor) actionsEl.insertBefore(button, anchor);
			previous = button;
		}
	}

	updateAllLeafHeaderActions(): void {
		this.app.workspace.iterateAllLeaves((leaf) => {
			this.updateLeafHeaderActions(leaf);
		});
	}

	isFileEditable(file: TFile): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension ? file.extension.toLowerCase() : "";
		if (ext && BINARY_EXTENSIONS.has(ext)) {
			return false;
		}

		const isDotfileOrExtensionless =
			(file.name || "").startsWith(".") || ext === "";

		if (isDotfileOrExtensionless) {
			return this.settings.allowEditDotfiles;
		}

		if (this.settings.allowEditCodeFiles && ext) {
			return this.getEditableExtensionsSet().has(ext);
		}

		return false;
	}

	isExtensionEditable(extension?: string): boolean {
		if (extension === undefined || extension === null) {
			return false;
		}
		const ext = extension.trim().toLowerCase();
		if (ext && BINARY_EXTENSIONS.has(ext)) {
			return false;
		}
		if (ext === "") {
			return this.settings.allowEditDotfiles;
		}
		if (this.settings.allowEditCodeFiles) {
			return this.getEditableExtensionsSet().has(ext);
		}
		return false;
	}

	isUnsupportedFile(file: TFile): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}

		// 1. If it is editable by our built-in code editor (code files, dotfiles, extensionless)
		if (this.isFileEditable(file)) {
			return false;
		}

		// 2. If it is natively supported by Obsidian core
		const ext = file.extension ? file.extension.toLowerCase() : "";
		const NATIVE_OBSIDIAN_EXTENSIONS = new Set([
			"md",
			"canvas",
			// Images (raster, vector, icons)
			"png",
			"jpg",
			"jpeg",
			"gif",
			"bmp",
			"svg",
			"webp",
			"avif",
			"ico",
			// Audio
			"mp3",
			"wav",
			"m4a",
			"ogg",
			"3gp",
			"flac",
			"aac",
			"opus",
			// Video
			"mp4",
			"webm",
			"ogv",
			"mov",
			"mkv",
			"m4v",
			// PDF
			"pdf",
		]);
		if (NATIVE_OBSIDIAN_EXTENSIONS.has(ext)) {
			return false;
		}

		// 3. If any other community plugin has registered a view for this extension (e.g. EPUB, Excalidraw, etc.)
		const viewRegistry = (
			this.app as unknown as {
				viewRegistry?: {
					getTypeByExtension?: (ext?: string) => string | undefined;
					typeByExtension?: Record<string, string>;
					isExtensionRegistered?: (ext?: string) => boolean;
				};
			}
		).viewRegistry;

		const registeredType =
			viewRegistry?.getTypeByExtension?.(ext) ??
			viewRegistry?.typeByExtension?.[ext];

		if (registeredType && registeredType !== VIEW_TYPE_DOTFILE) {
			return false;
		}

		if (
			viewRegistry?.isExtensionRegistered &&
			viewRegistry.isExtensionRegistered(ext)
		) {
			return false;
		}

		// Non-editable binary/document files (e.g. .docx, .zip, .exe, .dmg)
		return true;
	}

	/* ── viewRegistry patch ────────────────────────────────── */

	private patchViewRegistry() {
		const viewRegistry = (this.app as unknown as {
			viewRegistry?: {
				getTypeByExtension: (ext?: string) => string | undefined;
				isExtensionRegistered?: (ext?: string) => boolean;
			};
		}).viewRegistry;
		if (!viewRegistry || this.originalGetTypeByExtension) return;

		this.originalGetTypeByExtension = viewRegistry.getTypeByExtension.bind(viewRegistry);
		const origGetType = this.originalGetTypeByExtension;

		if (viewRegistry.isExtensionRegistered) {
			this.originalIsExtensionRegistered = viewRegistry.isExtensionRegistered.bind(viewRegistry);
		}
		const origIsRegistered = this.originalIsExtensionRegistered;
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- Needed to preserve plugin reference in patched method
		const plugin = this;

		viewRegistry.getTypeByExtension = (extension?: string) => {
			if (!extension || typeof extension !== "string") {
				return origGetType ? origGetType(extension as string) : undefined;
			}
			const ext = extension.trim().toLowerCase();
			if (!ext) {
				return origGetType ? origGetType(extension) : undefined;
			}
			if (plugin.isExtensionEditable(ext)) {
				return VIEW_TYPE_DOTFILE;
			}
			const origType = origGetType
				? (origGetType(extension) ?? origGetType(ext))
				: undefined;
			if (origType === VIEW_TYPE_DOTFILE) {
				return undefined;
			}
			return origType;
		};

		if (viewRegistry.isExtensionRegistered && origIsRegistered) {
			viewRegistry.isExtensionRegistered = (extension?: string) => {
				if (!extension || typeof extension !== "string") {
					return origIsRegistered ? origIsRegistered(extension as string) : false;
				}
				const ext = extension.trim().toLowerCase();
				if (!ext) {
					return origIsRegistered ? origIsRegistered(extension) : false;
				}
				if (plugin.isExtensionEditable(ext)) {
					return true;
				}
				const origRegistered = Boolean(
					origIsRegistered(extension) || origIsRegistered(ext),
				);
				if (
					origRegistered &&
					origGetType &&
					(origGetType(extension) === VIEW_TYPE_DOTFILE ||
						origGetType(ext) === VIEW_TYPE_DOTFILE)
				) {
					return false;
				}
				return origRegistered;
			};
		}
	}

	private restoreViewRegistry() {
		const viewRegistry = (this.app as unknown as {
			viewRegistry?: {
				getTypeByExtension: (ext: string) => string | undefined;
				isExtensionRegistered?: (ext: string) => boolean;
			};
		}).viewRegistry;
		if (viewRegistry) {
			if (this.originalGetTypeByExtension) {
				viewRegistry.getTypeByExtension = this.originalGetTypeByExtension;
				this.originalGetTypeByExtension = null;
			}
			if (this.originalIsExtensionRegistered && viewRegistry.isExtensionRegistered) {
				viewRegistry.isExtensionRegistered = this.originalIsExtensionRegistered;
				this.originalIsExtensionRegistered = null;
			}
		}
	}

	/* ── workspace leaf openFile patch ─────────────────────── */

	private patchWorkspaceLeaf() {
		const proto = WorkspaceLeaf.prototype as unknown as {
			openFile: (file: TFile, openState?: OpenViewState) => Promise<void>;
			detach: () => void;
		};

		if (!this.originalOpenFile) {
			this.originalOpenFile = proto.openFile;
			const origOpenFile = this.originalOpenFile;
			// eslint-disable-next-line @typescript-eslint/no-this-alias -- Needed to preserve plugin reference in patched method
			const plugin = this;

			proto.openFile = async function (
				this: WorkspaceLeaf,
				file: TFile,
				openState?: OpenViewState,
			): Promise<void> {
				// Intercept unsupported files: prevent external app launch on single click,
				// while allowing double-click to open in default app if enabled.
				if (file instanceof TFile && plugin.isUnsupportedFile(file)) {
					const now = Date.now();
					const isDoubleClick =
						plugin.lastUnsupportedClickFile === file.path &&
						now - plugin.lastUnsupportedClickTime < 500;
					plugin.lastUnsupportedClickFile = file.path;
					plugin.lastUnsupportedClickTime = isDoubleClick
						? 0
						: now;

					if (
						isDoubleClick &&
						plugin.settings.openUnsupportedOnDoubleClick
					) {
						const appWithOpen = plugin.app as unknown as {
							openWithDefaultApp?: (p: string) => void;
						};
						appWithOpen.openWithDefaultApp?.(file.path);
					}
					return;
				}

				// If this active leaf has unsaved changes, do NOT replace it! Open the clicked file in a new tab instead.
				if (plugin.isLeafDirty(this)) {
					const newLeaf = plugin.app.workspace.getLeaf("tab");
					return newLeaf.openFile(file, openState);
				}

				if (file instanceof TFile && plugin.isFileEditable(file)) {
					const stateObj =
						openState && typeof openState === "object"
							? (openState as Record<string, unknown>)
							: {};
					const innerState =
						stateObj.state && typeof stateObj.state === "object"
							? (stateObj.state as Record<string, unknown>)
							: {};
					innerState.file = file.path;
					const active =
						stateObj.active !== undefined
							? Boolean(stateObj.active)
							: true;

					await this.setViewState({
						type: VIEW_TYPE_DOTFILE,
						state: innerState,
						active: active,
						group: stateObj.group as WorkspaceLeaf | undefined,
					});
					return;
				}

				const stateObj =
					openState && typeof openState === "object"
						? (openState as Record<string, unknown>)
						: {};
				const innerState =
					stateObj.state && typeof stateObj.state === "object"
						? (stateObj.state as Record<string, unknown>)
						: {};
				const isDiffRequested = Boolean(
					stateObj.diff || innerState.diff,
				);

				if (
					isDiffRequested &&
					file instanceof TFile &&
					plugin.isMarkdownFile(file)
				) {
					innerState.file = file.path;
					innerState.diff = true;
					const active =
						stateObj.active !== undefined
							? Boolean(stateObj.active)
							: true;

					await this.setViewState({
						type: VIEW_TYPE_DOTFILE,
						state: innerState,
						active: active,
						group: stateObj.group as WorkspaceLeaf | undefined,
					});
					return;
				}

				if (
					!isDiffRequested &&
					this.view instanceof DotfileView &&
					file instanceof TFile &&
					plugin.isMarkdownFile(file) &&
					!plugin.isFileEditable(file)
				) {
					innerState.file = file.path;
					const active =
						stateObj.active !== undefined
							? Boolean(stateObj.active)
							: true;

					await this.setViewState({
						type: "markdown",
						state: innerState,
						active: active,
						group: stateObj.group as WorkspaceLeaf | undefined,
					});
					return origOpenFile.call(this, file, openState);
				}
				return origOpenFile.call(this, file, openState);
			};
		}

		if (!this.originalDetach) {
			this.originalDetach = proto.detach;
			const origDetach = this.originalDetach;
			// eslint-disable-next-line @typescript-eslint/no-this-alias -- Needed to preserve plugin reference in patched method
			const plugin = this;

			proto.detach = function (this: WorkspaceLeaf): void {
				if (
					plugin.settings.disableAutoSave &&
					this.view instanceof DotfileView &&
					this.view.isDirty()
				) {
					const dotfileView = this.view;
					const fileName = dotfileView.file?.name ?? "file";

					new ConfirmCloseModal(
						plugin.app,
						t("modalUnsavedTitle", fileName),
						t("modalUnsavedMessage"),
						async () => {
							await dotfileView.saveExplicitly();
							origDetach.call(this);
						},
						() => {
							dotfileView.discardChanges();
							origDetach.call(this);
						},
					).open();
					return;
				}
				origDetach.call(this);
			};
		}
	}

	private restoreWorkspaceLeaf() {
		const proto = WorkspaceLeaf.prototype as unknown as {
			openFile: (file: TFile, openState?: OpenViewState) => Promise<void>;
			detach: () => void;
		};
		if (this.originalOpenFile) {
			proto.openFile = this.originalOpenFile;
			this.originalOpenFile = null;
		}
		if (this.originalDetach) {
			proto.detach = this.originalDetach;
			this.originalDetach = null;
		}
	}

	getDirtyViews(): DotfileView[] {
		const dirty: DotfileView[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof DotfileView && leaf.view.isDirty()) {
				dirty.push(leaf.view);
			}
		});
		return dirty;
	}

	/* ── settings persistence ──────────────────────────────── */

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<VaultCodeSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
		this.settings.editorFontScale = normalizeEditorFontScale(loaded?.editorFontScale);
		this.settings.aiConnections = normalizeConnections(loaded?.aiConnections);
		if (this.settings.aiProvider === "ollama") {
			const id = "local-ollama";
			const model = this.settings.aiProviderLastModel?.ollama;
			if (!this.settings.aiConnections.some((c) => c.id === id)) this.settings.aiConnections.push({ id, name: "Ollama", kind: "local", baseUrl: "http://127.0.0.1:11434/v1", format: "chat-completions", models: model && !["default", "auto"].includes(model) ? [model] : [] });
			this.settings.aiProvider = connectionProvider(id);
		}

		// Migrate the old full list to additions without losing user-defined extensions.
		this.settings.customFileExtensions = additionalEditorExtensions(loaded?.customFileExtensions);
		if (loaded && loaded.customFileExtensions !== this.settings.customFileExtensions) await this.saveSettings();

		setLanguage(this.settings.language);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/* ── show all file types ───────────────────────────────── */

	applyShowAllFileTypes() {
		this.app.vault.setConfig(
			"showUnsupportedFiles",
			this.settings.showAllFileTypes,
		);
	}

	/* -- show hidden files: adapter monkey-patch ------------ */

	private adapter(): PrivateAdapter {
		return this.app.vault.adapter as unknown as PrivateAdapter;
	}

	private async initializeIgnoreFiltering(): Promise<void> {
		// Prevent existing explorer rows flashing while settings and ignore files are read.
		const body = document.body;
		body.addClass("vault-code-ignore-loading");
		this.register(() => body.removeClass("vault-code-ignore-loading"));
		try {
			await this.loadSettings();
			await this.reloadAllIgnoreRules();
			this.patchFileExplorer();
		} finally {
			this.initializingIgnoreFiltering = false;
			body.removeClass("vault-code-ignore-loading");
		}
	}

	private configuredIgnoreMatcher(): IgnoreMatcher {
		this.ignoreMatcher.configure(
			this.settings.useGitIgnore ? this.cachedGitIgnoreRules : EMPTY_IGNORE_RULES,
			this.settings.useObsidianIgnore ? this.cachedObsidianIgnoreRules : EMPTY_IGNORE_RULES,
		);
		return this.ignoreMatcher;
	}

	private canPruneIgnoredDirectory(path: string): boolean {
		const normalized = normalizePath(path).replace(/^\/+|\/+$/g, "");
		return this.configuredIgnoreMatcher().canPrune(normalized);
	}

	async loadObsidianIgnoreRules(): Promise<void> {
		if (!this.settings.useObsidianIgnore) {
			this.cachedObsidianIgnoreRules = [];
			return;
		}

		try {
			const exists = await this.app.vault.adapter.exists(".obsidianignore");
			if (exists) {
				const content = await this.app.vault.adapter.read(".obsidianignore");
				this.cachedObsidianIgnoreRules = parseGitignore(content);
			} else {
				this.cachedObsidianIgnoreRules = this.initializingIgnoreFiltering ? parseGitignore(DEFAULT_OBSIDIANIGNORE_CONTENT) : [];
			}
		} catch (e) {
			console.error("Vault Code: Failed to read .obsidianignore", e);
			this.cachedObsidianIgnoreRules = [];
		}
	}

	async loadGitIgnoreRules(): Promise<void> {
		if (!this.settings.useGitIgnore) {
			this.cachedGitIgnoreRules = [];
			return;
		}

		try {
			const exists = await this.app.vault.adapter.exists(".gitignore");
			if (exists) {
				const content = await this.app.vault.adapter.read(".gitignore");
				this.cachedGitIgnoreRules = parseGitignore(content);
			} else {
				this.cachedGitIgnoreRules = [];
			}
		} catch (e) {
			console.error("Vault Code: Failed to read .gitignore", e);
			this.cachedGitIgnoreRules = [];
		}
	}

	async reloadAllIgnoreRules(): Promise<void> {
		await Promise.all([
			this.loadObsidianIgnoreRules(),
			this.loadGitIgnoreRules(),
		]);
	}

	isPathIgnored(path: string, isDirectory?: boolean): boolean {
		const normalized = normalizePath(path).replace(/^\/+|\/+$/g, "");
		if (!normalized) return false;

		if (this.externalFolders?.isBlocked(normalized)) return true;

		// Never ignore the ignore files themselves at vault root
		if (normalized === ".obsidianignore" || normalized === ".gitignore") {
			return false;
		}

		const isDir =
			isDirectory ??
			(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder);

		return this.configuredIgnoreMatcher().ignored(normalized, isDir);
	}

	async handleIgnoreFileEvent(path: string): Promise<void> {
		const norm = normalizePath(path).replace(/^\/+/, "");
		if (norm === ".obsidianignore") {
			await this.loadObsidianIgnoreRules();
			this.applyFileExplorerFiltering();
			if (this.settings.showHiddenFiles) {
				await this.rescanVault();
			}
			this.settingsTab?.updateIgnoreButtons();
		} else if (norm === ".gitignore") {
			await this.loadGitIgnoreRules();
			this.applyFileExplorerFiltering();
			if (this.settings.showHiddenFiles) {
				await this.rescanVault();
			}
		}
	}

	applyFileExplorerFiltering(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
			filterExplorerRows(leaf.view.containerEl, (path, directory) => this.isPathIgnored(path, directory), (row, path, directory) => this.externalFolders?.decorate(row, path, directory));
		}
	}

	private patchAdapter() {
		const adapter = this.adapter();
		if (!adapter || !adapter.reconcileDeletion) return;

		if (this.originalReconcileDeletion) return; // already patched
		this.originalReconcileDeletion =
			adapter.reconcileDeletion.bind(adapter);

		const origReconcileDeletion = this.originalReconcileDeletion;

		adapter.reconcileDeletion = async (
			realPath: string,
			path: string,
		) => {
			if (this.settings.showHiddenFiles) {
				let ignored = this.isPathIgnored(path);
				// An unindexed hidden folder looks like a file to the vault. Resolve its type
				// only when a directory-only rule would change the ignore decision.
				if (ignored !== this.isPathIgnored(path, true)) {
					try {
						// This callback may already be inside the adapter queue. Calling its
						// public stat() here would enqueue work behind the scan awaiting us.
						if (adapter.fsPromises && adapter.getFullPath) {
							const stat = await adapter.fsPromises.stat(adapter.getFullPath(path));
							ignored = this.isPathIgnored(path, stat.isDirectory());
						}
					} catch { /* Preserve the existing decision for missing or unreadable paths. */ }
				}
				if (ignored) {
					this.hiddenPaths.delete(path);
					return origReconcileDeletion(realPath, path);
				}

				if (isDotPath(path)) {
					// File exists on disk: re-register it instead of deleting
					const fullPath = adapter.getFullPath ? adapter.getFullPath(path) : path;
					if (adapter._exists && (await adapter._exists(fullPath, path))) {
						this.hiddenPaths.add(path);
						await this.showFile(path);
						return;
					}
					this.hiddenPaths.delete(path);
				}
			}
			return origReconcileDeletion(realPath, path);
		};
	}

	private async restoreAdapter(): Promise<void> {
		if (this.originalReconcileDeletion) {
			const adapter = this.adapter();
			if (!adapter) return;
			adapter.reconcileDeletion = this.originalReconcileDeletion;
			this.originalReconcileDeletion = null;

			// Hide all files we previously revealed
			for (const path of this.hiddenPaths) {
				const realPath = adapter.getRealPath ? adapter.getRealPath(path) : path;
				await adapter.reconcileDeletion(realPath, path);
			}
			this.hiddenPaths.clear();
		}
	}

	/** Re-register a dotfile/dotfolder with the vault. */
	private async showFile(path: string): Promise<void> {
		const adapter = this.adapter();
		if (!adapter) return;
		const realPath = adapter.getRealPath ? adapter.getRealPath(path) : path;

		if (adapter.reconcileFileInternal) {
			await adapter.reconcileFileInternal(realPath, path);
		}
	}

	/** Hide a previously shown dotfile. */
	private async hideFile(path: string): Promise<void> {
		const adapter = this.adapter();
		if (!adapter) return;
		const realPath = adapter.getRealPath ? adapter.getRealPath(path) : path;
		if (this.originalReconcileDeletion) {
			await this.originalReconcileDeletion(
				realPath,
				path,
			);
		}
	}

	/** Share concurrent requests and walk the folder tree without repeatedly collecting every file. */
	rescanVault(): Promise<void> {
		return this.rescanRunner.run();
	}

	private async scanVaultFolders(): Promise<void> {
		const adapter = this.adapter();
		if (!adapter.listRecursive || !this.settings.showHiddenFiles || this.unloading) return;
		const restoreTraversal = guardIgnoredTraversal(adapter, (path) => !this.unloading && this.settings.showHiddenFiles && this.canPruneIgnoredDirectory(path));
		try {
			await scanFolderTree({
				scan: (path) => adapter.listRecursive(path),
				children: (path) => {
					const folder = path ? this.app.vault.getAbstractFileByPath(path) : this.app.vault.getRoot();
					return folder instanceof TFolder
						? folder.children.filter((child): child is TFolder => child instanceof TFolder).map((child) => child.path)
						: [];
				},
				shouldPrune: (path) => this.canPruneIgnoredDirectory(path),
				active: () => !this.unloading && this.settings.showHiddenFiles,
				yield: () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
			});
		} finally { restoreTraversal(); }
		if (!this.unloading) this.applyFileExplorerFiltering();
	}

	getActiveOrSelectedFolder(): TFolder {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");

		// 1. Priority: Explicitly selected / focused item in File Explorer sidebar
		for (const leaf of leaves) {
			const view = leaf.view as unknown as {
				fileItems?: Record<
					string,
					{
						file?: TAbstractFile;
						selfEl?: HTMLElement;
						el?: HTMLElement;
					}
				>;
				selectedFile?: TAbstractFile;
			};

			if (view?.fileItems) {
				for (const item of Object.values(view.fileItems)) {
					const isExplicitlySelected =
						item.selfEl?.classList.contains("is-selected") ||
						item.el?.classList.contains("is-selected");

					if (isExplicitlySelected && item.file) {
						const f = item.file;
						if (f instanceof TFolder) {
							return f;
						}
						if (f instanceof TFile && f.parent instanceof TFolder) {
							return f.parent;
						}
					}
				}
			}

			if (view?.selectedFile) {
				const sf = view.selectedFile;
				if (sf instanceof TFolder) {
					return sf;
				}
				if (sf instanceof TFile && sf.parent instanceof TFolder) {
					return sf.parent;
				}
			}
		}

		// 2. Priority: Active file open in workspace editor
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.parent instanceof TFolder) {
			return activeFile.parent;
		}

		// 3. Priority: Active item in File Explorer sidebar
		for (const leaf of leaves) {
			const view = leaf.view as unknown as {
				fileItems?: Record<
					string,
					{
						file?: TAbstractFile;
						selfEl?: HTMLElement;
						el?: HTMLElement;
					}
				>;
			};

			if (view?.fileItems) {
				for (const item of Object.values(view.fileItems)) {
					const isActive =
						item.selfEl?.classList.contains("is-active") ||
						item.el?.classList.contains("is-active");

					if (isActive && item.file) {
						const f = item.file;
						if (f instanceof TFolder) {
							return f;
						}
						if (f instanceof TFile && f.parent instanceof TFolder) {
							return f.parent;
						}
					}
				}
			}
		}

		// 4. Default: Vault root folder
		return this.app.vault.getRoot();
	}

	async createNewNoteInFolder(folder: TFolder): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		try {
			for (const leaf of leaves) {
				const fileExplorerView = leaf.view as unknown as {
					createAbstractFile?: (
						type: "file" | "folder",
						location: TFolder,
						newLeaf?: boolean,
					) => Promise<void>;
				};
				if (typeof fileExplorerView?.createAbstractFile === "function") {
					await fileExplorerView.createAbstractFile(
						"file",
						folder,
						false,
					);
					return;
				}
			}
		} catch {
			// Fallback to vault create below
		}

		const parentPath = folder.isRoot() ? "" : folder.path;
		let fileName = "Untitled.md";
		let index = 1;
		let fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
		while (await this.app.vault.adapter.exists(fullPath)) {
			fileName = `Untitled ${index}.md`;
			fullPath = parentPath ? `${parentPath}/${fileName}` : fileName;
			index++;
		}
		const newFile = await this.app.vault.create(fullPath, "");
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(newFile);
	}

	async createNewFolderInFolder(folder: TFolder): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		try {
			for (const leaf of leaves) {
				const fileExplorerView = leaf.view as unknown as {
					createAbstractFile?: (
						type: "file" | "folder",
						location: TFolder,
						newLeaf?: boolean,
					) => Promise<void>;
				};
				if (typeof fileExplorerView?.createAbstractFile === "function") {
					await fileExplorerView.createAbstractFile(
						"folder",
						folder,
					);
					return;
				}
			}
		} catch {
			// Fallback to vault create below
		}

		const parentPath = folder.isRoot() ? "" : folder.path;
		let folderName = "Untitled";
		let index = 1;
		let fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
		while (await this.app.vault.adapter.exists(fullPath)) {
			folderName = `Untitled ${index}`;
			fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
			index++;
		}
		await this.app.vault.createFolder(fullPath);
	}

	async registerHiddenPath(path: string): Promise<void> {
		this.hiddenPaths.add(path);
		const adapter = this.adapter();
		if (!adapter) return;
		const realPath = adapter.getRealPath ? adapter.getRealPath(path) : path;
		try {
			const stat = await this.app.vault.adapter.stat(path);
			if (stat?.type === "folder") {
				if (adapter.reconcileFolderCreation) {
					await adapter.reconcileFolderCreation(realPath, path);
				}
			} else {
				if (adapter.reconcileFileInternal) {
					await adapter.reconcileFileInternal(realPath, path);
				}
			}
		} catch {
			if (adapter.reconcileFileInternal) {
				await adapter.reconcileFileInternal(realPath, path);
			}
		}
	}

	async createFolderRecursive(folderPath: string): Promise<TFolder | null> {
		const normalized = normalizePath(folderPath);
		if (!normalized || normalized === "/" || normalized === ".") {
			return this.app.vault.getRoot();
		}

		const segments = normalized.split("/");
		let currentPath = "";

		for (const segment of segments) {
			if (!segment) continue;
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			let stat = null;
			try {
				stat = await this.app.vault.adapter.stat(currentPath);
			} catch {
				stat = null;
			}
			if (stat) {
				if (stat.type === "file") {
					throw new Error(
						`Cannot create folder: '${segment}' already exists as a file.`,
					);
				}
				continue;
			}

			const isDot =
				segment.startsWith(".") ||
				isDotPath(currentPath);

			if (isDot) {
				await this.app.vault.adapter.mkdir(currentPath);
				await this.registerHiddenPath(currentPath);
			} else {
				try {
					await this.app.vault.createFolder(currentPath);
				} catch {
					await this.app.vault.adapter.mkdir(currentPath);
				}
			}
		}

		const folder = this.app.vault.getAbstractFileByPath(currentPath);
		return folder instanceof TFolder ? folder : null;
	}

	async createFileWithFolders(
		filePath: string,
		data = "",
	): Promise<TFile | null> {
		const normalized = normalizePath(filePath);
		if (!normalized) throw new Error("File path cannot be empty.");

		const lastSlash = normalized.lastIndexOf("/");
		const parentDir =
			lastSlash !== -1 ? normalized.substring(0, lastSlash) : "";
		const fileName =
			lastSlash !== -1 ? normalized.substring(lastSlash + 1) : normalized;

		if (!fileName) throw new Error("File name cannot be empty.");

		if (parentDir) {
			await this.createFolderRecursive(parentDir);
		}

		if (await this.app.vault.adapter.exists(normalized)) {
			throw new Error(`A file or folder named '${fileName}' already exists.`);
		}

		const isDotfile =
			fileName.startsWith(".") ||
			isDotPath(normalized);

		if (isDotfile) {
			await this.app.vault.adapter.write(normalized, data);
			await this.registerHiddenPath(normalized);
		} else {
			try {
				await this.app.vault.create(normalized, data);
			} catch {
				await this.app.vault.adapter.write(normalized, data);
			}
		}

		let file = this.app.vault.getAbstractFileByPath(normalized);
		for (let i = 0; i < 10 && !(file instanceof TFile); i++) {
			await new Promise((resolve) => window.setTimeout(resolve, 50));
			file = this.app.vault.getAbstractFileByPath(normalized);
		}

		return file instanceof TFile ? file : null;
	}

	async openCreatedFile(file: TFile): Promise<void> {
		const ext = file.extension ? file.extension.toLowerCase() : "";
		const isMarkdown = ext === "md" || ext === "markdown";
		const isCode = this.isFileEditable(file);

		const leaf = this.app.workspace.getLeaf(false);
		if (isMarkdown) {
			await leaf.openFile(file);
		} else if (isCode) {
			await leaf.setViewState({
				type: VIEW_TYPE_DOTFILE,
				state: { file: file.path },
				active: true,
			});
		} else {
			new Notice(t("noticeCreated", file.name));
		}
	}

	async renameFileOrFolder(
		file: TAbstractFile,
		newName: string,
	): Promise<void> {
		const parentPath =
			!file.parent || file.parent.isRoot() ? "" : file.parent.path;
		const newPath = normalizePath(
			parentPath ? `${parentPath}/${newName}` : newName,
		);

		const isExplicitFile = file instanceof TFile;
		if (isExplicitFile) {
			(file as TFile & { _explicitRename?: boolean })._explicitRename = true;
		}

		try {
			await this.app.fileManager.renameFile(file, newPath);
		} catch {
			await this.app.vault.adapter.rename(file.path, newPath);
		} finally {
			if (isExplicitFile) {
				delete (file as TFile & { _explicitRename?: boolean })._explicitRename;
			}
		}

		if (
			newName.startsWith(".") ||
			isDotPath(newPath)
		) {
			await this.registerHiddenPath(newPath);
		}

		const newFile = this.app.vault.getAbstractFileByPath(newPath);
		if (newFile instanceof TFile) {
			const isMarkdown = this.isMarkdownFile(newFile);
			const isCode = this.isViewableInCodeEditor(newFile);

			this.app.workspace.iterateAllLeaves((leaf) => {
				const leafFile = (leaf.view as { file?: TFile })?.file;
				if (leafFile?.path === newPath || leafFile?.path === file.path) {
					if (isMarkdown && leaf.view instanceof DotfileView) {
						void leaf.setViewState({
							type: "markdown",
							state: { file: newPath },
							active: true,
						});
					} else if (isCode && !(leaf.view instanceof DotfileView)) {
						void leaf.setViewState({
							type: VIEW_TYPE_DOTFILE,
							state: { file: newPath },
							active: true,
						});
					}
				}
			});
			this.updateAllLeafHeaderActions();
		}
	}

	/** Enable hidden files: patch + rescan. */
	async enableHiddenFiles(): Promise<void> {
		this.patchAdapter();
		this.suppressDotfileWarning();
		await this.rescanVault();
	}

	/** Disable hidden files: hide all revealed files + restore. */
	async disableHiddenFiles(): Promise<void> {
		// Hide all currently visible dotfiles before restoring
		for (const path of this.hiddenPaths) {
			await this.hideFile(path);
		}
		this.hiddenPaths.clear();
		await this.restoreAdapter();
		this.restoreDotfileWarning();
	}

	/* ── suppress the "bad dotfile" warning ────────────────── */

	private suppressDotfileWarning() {
		const win = window as unknown as {
			i18next?: { t: (...args: unknown[]) => string };
		};
		if (!win.i18next || this.originalI18nT) return;

		this.originalI18nT = win.i18next.t.bind(win.i18next);
		const origT = this.originalI18nT;

		win.i18next.t = function (...args: unknown[]): string {
			if (args[0] === "plugins.file-explorer.msg-bad-dotfile") {
				return "";
			}
			return origT(...args);
		};
	}

	private restoreDotfileWarning() {
		if (this.originalI18nT) {
			const win = window as unknown as {
				i18next?: { t: (...args: unknown[]) => string };
			};
			if (win.i18next) {
				win.i18next.t = this.originalI18nT;
			}
			this.originalI18nT = null;
		}
	}

	public isKnownExtension(ext: string): boolean {
		if (!ext || ext.length === 0 || ext.length > 20) return false;
		if (/[\s/\\:*?"<>|]/.test(ext)) return false;
		const lower = ext.toLowerCase();
		if (
			lower === "md" ||
			lower === "markdown" ||
			lower === "canvas"
		) {
			return true;
		}
		if (SUPPORTED_EXTENSIONS.has(lower)) return true;
		if (BINARY_EXTENSIONS.has(lower)) return true;
		if (this.getEditableExtensionsSet().has(lower)) return true;
		const viewRegistry = (
			this.app as unknown as {
				viewRegistry?: {
					getTypeByExtension?: (e: string) => string | undefined;
				};
			}
		).viewRegistry;
		if (
			typeof viewRegistry?.getTypeByExtension === "function" &&
			Boolean(viewRegistry.getTypeByExtension(lower))
		) {
			return true;
		}
		return false;
	}

	/* ── inline rename & path resolution patches ────────── */

	private patchTFileGetNewPath(): void {
		if (this.originalTFileGetNewPath) return;

		const proto = TFile.prototype as unknown as {
			getNewPathAfterRename?: (newName: string) => string;
		};
		if (!proto.getNewPathAfterRename) return;

		this.originalTFileGetNewPath = proto.getNewPathAfterRename;

		// eslint-disable-next-line @typescript-eslint/no-this-alias -- Needed to access plugin instance inside patched method
		const plugin = this;

		proto.getNewPathAfterRename = function (
			this: TFile & { _explicitRename?: boolean },
			newName: string,
		): string {
			// eslint-disable-next-line no-control-regex -- Needed to strip control characters from filename
			let cleanName = newName.replace(/[\x00-\x1F]/g, " ").trim();
			if (!cleanName) return "";

			if (this._explicitRename) {
				const parentPath =
					!this.parent || this.parent.isRoot() ? "" : this.parent.path;
				return parentPath ? `${parentPath}/${cleanName}` : cleanName;
			}

			const isMarkdown = plugin.isMarkdownFile(this);

			if (isMarkdown) {
				// For Markdown notes, the title in Obsidian note view is purely the note title.
				// Regardless of dots, spaces, or words in the title (e.g. "1. How it works", "app.txt details", "App.v1"),
				// a Markdown note must ALWAYS retain its .md extension unless .md was already explicitly typed.
				if (
					!cleanName.toLowerCase().endsWith(".md") &&
					!cleanName.toLowerCase().endsWith(".markdown")
				) {
					cleanName = `${cleanName}.${this.extension || "md"}`;
				}
			} else {
				// For non-markdown files (code files, dotfiles, data files)
				const isDotfile = cleanName.startsWith(".");
				const lastDot = cleanName.lastIndexOf(".");
				let hasExplicitValidExt = false;

				if (lastDot > 0 && lastDot < cleanName.length - 1) {
					const candidate = cleanName.slice(lastDot + 1);
					if (
						(this.extension &&
							candidate.toLowerCase() ===
								this.extension.toLowerCase()) ||
						plugin.isKnownExtension(candidate)
					) {
						hasExplicitValidExt = true;
					}
				}

				if (!hasExplicitValidExt && !isDotfile && this.extension) {
					cleanName = `${cleanName}.${this.extension}`;
				}
			}

			const parentPath =
				!this.parent || this.parent.isRoot() ? "" : this.parent.path;
			return parentPath ? `${parentPath}/${cleanName}` : cleanName;
		};
	}

	private restoreTFileGetNewPath(): void {
		if (this.originalTFileGetNewPath) {
			const proto = TFile.prototype as unknown as {
				getNewPathAfterRename?: (newName: string) => string;
			};
			proto.getNewPathAfterRename = this.originalTFileGetNewPath;
			this.originalTFileGetNewPath = null;
		}
	}

	private patchFileManagerPrompt(): void {
		const fileManager = this.app.fileManager as unknown as {
			promptForFileRename?: (file: TAbstractFile) => unknown;
		};
		if (!fileManager || this.originalPromptForFileRename) return;

		this.originalPromptForFileRename =
			fileManager.promptForFileRename?.bind(fileManager) ?? null;

		fileManager.promptForFileRename = (file: TAbstractFile) => {
			if (file instanceof TFile || file instanceof TFolder) {
				new RenameModal(this.app, this, file).open();
				return;
			}
			return this.originalPromptForFileRename?.(file);
		};
	}

	private restoreFileManagerPrompt(): void {
		const fileManager = this.app.fileManager as unknown as {
			promptForFileRename?: (file: TAbstractFile) => unknown;
		};
		if (fileManager && this.originalPromptForFileRename) {
			fileManager.promptForFileRename = this.originalPromptForFileRename;
			this.originalPromptForFileRename = null;
		}
	}

	private patchFileExplorer(): void {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");

		const containers = new Set(leaves.map((leaf) => leaf.view.containerEl));
		for (const [container, disconnect] of this.explorerObservers) {
			if (!containers.has(container)) { disconnect(); this.explorerObservers.delete(container); }
		}
		for (const container of containers) {
			if (!this.explorerObservers.has(container)) {
				this.explorerObservers.set(container, observeExplorerIgnore(container, (path, directory) => this.isPathIgnored(path, directory), (row, path, directory) => this.externalFolders?.decorate(row, path, directory)));
			}
		}

		if (!leaves.length) return;
		const fileExplorerView = leaves[0]?.view as unknown as
			| Record<string, unknown>
			| undefined;
		if (!fileExplorerView) return;

		// eslint-disable-next-line @typescript-eslint/no-this-alias -- Needed to preserve plugin reference in patched method
		const plugin = this;

		const viewProto = Object.getPrototypeOf(fileExplorerView) as Record<
			string,
			unknown
		> | null;
		if (viewProto) {
			this.fileExplorerTargetProto = viewProto;
			if (
				!this.originalCreateFileItem &&
				typeof viewProto.createFileItem === "function"
			) {
				this.originalCreateFileItem = viewProto.createFileItem as (
					...args: unknown[]
				) => unknown;
				this.fileExplorerTargetProto = viewProto;
				const origCreate = this.originalCreateFileItem;
				const patchItem = this.patchFileItemPrototype.bind(this);
				viewProto.createFileItem = function (
					this: unknown,
					...args: unknown[]
				) {
					const res = origCreate?.apply(this, args);
					if (!plugin.fileItemProtoPatched || !plugin.originalPOGetTitle) {
						patchItem(this);
					}

					const item = res as
						| { el?: HTMLElement; file?: TAbstractFile }
						| undefined;
					const file =
						item?.file ??
						(args[0] instanceof TAbstractFile ? args[0] : null);
					const el = item?.el;

					if (el) {
						if (file) {
							const isDir = file instanceof TFolder;
							const isIgnored = plugin.isPathIgnored(file.path, isDir);
							el.toggleClass("is-ignored-hidden", isIgnored);
						} else if (typeof args[0] === "string") {
							const isIgnored = plugin.isPathIgnored(args[0]);
							el.toggleClass("is-ignored-hidden", isIgnored);
						}
					}

					return res;
				};
			}

			if (
				!this.originalStartRenameFile &&
				typeof viewProto.startRenameFile === "function"
			) {
				this.originalStartRenameFile = viewProto.startRenameFile as (
					...args: unknown[]
				) => unknown;
				const origStart = this.originalStartRenameFile;
				const patchItem = this.patchFileItemPrototype.bind(this);
				viewProto.startRenameFile = function (
					this: unknown,
					...args: unknown[]
				) {
					patchItem(this);
					return origStart?.apply(this, args);
				};
			}

			if (
				!this.originalSaveRename &&
				typeof viewProto.saveRename === "function"
			) {
				this.originalSaveRename = viewProto.saveRename as (
					...args: unknown[]
				) => Promise<boolean>;
				const origSave = this.originalSaveRename;
				const handleNested = this.handleNestedFolderRename.bind(this);
				viewProto.saveRename = async function (
					this: {
						fileBeingRenamed?: TAbstractFile;
						fileItems?: Record<string, { innerEl?: HTMLElement }>;
					},
				): Promise<boolean> {
					const file = this.fileBeingRenamed;
					if (file instanceof TFolder) {
						const item = this.fileItems?.[file.path];
						const text = item?.innerEl?.getText()?.trim() ?? "";
						if (text.includes("/")) {
							return await handleNested(this, file, item, text);
						}
					}
					return (await origSave?.apply(this)) ?? true;
				};
			}

			if (
				!this.originalOnFileRenameInput &&
				typeof viewProto.onFileRenameInput === "function"
			) {
				this.originalOnFileRenameInput = viewProto.onFileRenameInput as (
					...args: unknown[]
				) => unknown;
				const origOnInput = this.originalOnFileRenameInput;
				viewProto.onFileRenameInput = function (
					this: { files?: Map<HTMLElement, TAbstractFile> },
					e: Event,
					t: HTMLElement,
				) {
					const n = this.files?.get(t.parentElement?.parentElement ?? t);
					if (n instanceof TFolder) {
						const i = t.getText();
						if (i.includes("/")) {
							const hasBadChars = /[\\:*?"<>|]/.test(i);
							if (!hasBadChars) {
								if (
									!(
										1 === t.childNodes.length &&
										t.firstChild?.nodeType === Node.TEXT_NODE
									)
								) {
									t.setText(i);
								}
								const tooltip =
									t.parentElement?.find(".tooltip") ||
									document.querySelector(".tooltip.mod-error");
								tooltip?.remove();
								return;
							}
						}
					}
					return origOnInput?.call(this, e, t);
				};
			}
		}

		this.patchFileItemPrototype(fileExplorerView);
		this.applyFileExplorerFiltering();
	}

	private onInputCapture = (evt: Event) => {
		const target = evt.target as HTMLElement | null;
		if (!target) return;

		const isFolderTitle =
			target.classList?.contains("nav-folder-title-content") ||
			target.closest?.(".nav-folder-title-content");

		if (isFolderTitle) {
			const text = target.textContent ?? "";
			if (text.includes("/")) {
				const hasBadChars = /[\\:*?"<>|]/.test(text);
				if (!hasBadChars) {
					evt.stopImmediatePropagation();
					const tooltips =
						document.querySelectorAll(".tooltip.mod-error");
					tooltips.forEach((el) => el.remove());
				}
			}
		}
	};

	private async handleNestedFolderRename(
		view: {
			fileItems?: Record<string, unknown>;
			displayError?: (msg: string, item: unknown) => void;
		},
		folder: TFolder,
		item: unknown,
		input: string,
	): Promise<boolean> {
		// eslint-disable-next-line no-control-regex -- Needed to strip control characters from folder input
		const cleanInput = input.replace(/[\x00-\x1F]/g, " ").trim();
		if (!cleanInput) {
			view.displayError?.("Folder name cannot be empty.", item);
			return false;
		}

		if (/[\\:*?"<>|]/.test(cleanInput)) {
			view.displayError?.(
				"Path cannot contain invalid characters (\\ : * ? \" < > |).",
				item,
			);
			return false;
		}

		const segments = cleanInput
			.split("/")
			.map((s) => s.trim())
			.filter(Boolean);

		if (segments.length === 0) {
			view.displayError?.("Folder name cannot be empty.", item);
			return false;
		}

		if (segments.some((s) => s === "." || s === "..")) {
			view.displayError?.("Folder path cannot contain '.' or '..'.", item);
			return false;
		}

		const parentPath =
			folder.parent && !folder.parent.isRoot()
				? folder.parent.path
				: "";
		const targetRelPath = normalizePath(
			parentPath ? `${parentPath}/${cleanInput}` : cleanInput,
		);

		if (folder.path === targetRelPath) {
			return true;
		}

		if (await this.app.vault.adapter.exists(targetRelPath)) {
			const folderName = segments[segments.length - 1];
			view.displayError?.(
				`A file or folder named '${folderName}' already exists.`,
				item,
			);
			return false;
		}

		try {
			// 1. Ensure all intermediate parent folders are created recursively
			const lastSlash = targetRelPath.lastIndexOf("/");
			if (lastSlash > 0) {
				const intermediateParent = targetRelPath.substring(
					0,
					lastSlash,
				);
				await this.createFolderRecursive(intermediateParent);
			}

			// 2. Rename the current folder to the final target path
			try {
				await this.app.fileManager.renameFile(folder, targetRelPath);
			} catch {
				await this.app.vault.adapter.rename(folder.path, targetRelPath);
			}

			// 3. Register any hidden path segments if they start with '.'
			let currentCheck = parentPath;
			for (const segment of segments) {
				currentCheck = currentCheck
					? `${currentCheck}/${segment}`
					: segment;
				if (segment.startsWith(".")) {
					await this.registerHiddenPath(currentCheck);
				}
			}

			// 4. Trigger vault rescan so Obsidian's tree immediately discovers all intermediate and new dotfolders
			await this.rescanVault();

			return true;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			view.displayError?.(msg, item);
			return false;
		}
	}

	private patchFileItemPrototype(fileExplorerView: unknown): void {
		if (!fileExplorerView || (this.fileItemProtoPatched && this.originalPOGetTitle)) return;

		const view = fileExplorerView as {
			fileItems?: Record<string, unknown>;
		};
		if (!view.fileItems) return;

		const fileItem = (Object.values(view.fileItems).find(
			(i: unknown) =>
				(i as { file?: TAbstractFile })?.file instanceof TFile,
		) || Object.values(view.fileItems)[0]) as
			| Record<string, unknown>
			| undefined;
		if (!fileItem) return;

		// 1. Patch PO.prototype (so dotfiles display full name and hide tag badge)
		let poProto: Record<string, unknown> | null = Object.getPrototypeOf(
			fileItem,
		) as Record<string, unknown> | null;
		while (poProto && poProto !== Object.prototype) {
			if (Object.prototype.hasOwnProperty.call(poProto, "getTitle")) {
				break;
			}
			poProto = Object.getPrototypeOf(poProto) as Record<
				string,
				unknown
			> | null;
		}

		if (
			poProto &&
			!this.originalPOGetTitle &&
			typeof poProto.getTitle === "function"
		) {
			this.originalPOGetTitle = poProto.getTitle as (
				...args: unknown[]
			) => string;
			this.poTargetProto = poProto;
			const origGetTitle = this.originalPOGetTitle;

			poProto.getTitle = function (this: {
				file?: TAbstractFile;
			}): string {
				if (
					this.file &&
					this.file.name &&
					this.file.name.startsWith(".")
				) {
					return this.file.name;
				}
				return origGetTitle.call(this);
			};

			if (typeof poProto.updateTitle === "function") {
				this.originalPOUpdateTitle = poProto.updateTitle as (
					...args: unknown[]
				) => unknown;
				const origUpdateTitle = this.originalPOUpdateTitle;

				poProto.updateTitle = function (this: {
					file?: TAbstractFile;
					tagEl?: HTMLElement | null;
				}) {
					origUpdateTitle.call(this);
					if (
						this.file &&
						this.file.name &&
						this.file.name.startsWith(".")
					) {
						if (this.tagEl) {
							this.tagEl.detach();
							this.tagEl = null;
						}
					}
				};
			}

			// Immediately refresh titles of loaded dotfiles
			for (const item of Object.values(view.fileItems)) {
				const fItem = item as {
					file?: TAbstractFile;
					updateTitle?: () => void;
				};
				if (fItem?.file?.name?.startsWith(".")) {
					fItem.updateTitle?.();
				}
			}
		}

		// 2. Patch DO.prototype for inline startRename
		if (!this.fileItemProtoPatched) {
			let curr: Record<string, unknown> | null = Object.getPrototypeOf(
				fileItem,
			) as Record<string, unknown> | null;
			while (curr && curr !== Object.prototype) {
				if (Object.prototype.hasOwnProperty.call(curr, "startRename")) {
					break;
				}
				curr = Object.getPrototypeOf(curr) as Record<
					string,
					unknown
				> | null;
			}

			if (curr && typeof curr.startRename !== "function") return;

			if (curr) {
				this.originalFileItemStartRename = curr.startRename as (
					...args: unknown[]
				) => unknown;
				this.fileItemTargetProto = curr;
				const origStartRename = this.originalFileItemStartRename;

				curr.startRename = function (this: {
					file: TAbstractFile;
					selfEl: HTMLElement;
					innerEl: HTMLElement;
					view?: { app?: App };
				}) {
					const file = this.file;
					if (file instanceof TFile) {
						this.selfEl.addClass("is-being-renamed");
						this.innerEl.setAttribute("contenteditable", "true");
						const spellcheck =
							this.view?.app?.vault?.getConfig("spellcheck");
						this.innerEl.setAttribute("spellcheck", String(spellcheck));

						const ext = file.extension ? file.extension.toLowerCase() : "";
						const isMarkdown =
							ext === "md" || ext === "markdown";
						const displayName = isMarkdown
							? file.basename
							: file.name;

						// Display displayName in innerEl
						this.innerEl.setText(displayName);

						// Pre-select only the basename if the file has an extension
						const dotIndex = displayName.lastIndexOf(".");
						const textNode = this.innerEl.firstChild;
						if (
							textNode &&
							textNode.nodeType === Node.TEXT_NODE &&
							textNode.textContent
						) {
							const len = textNode.textContent.length;
							const selectEnd =
								!isMarkdown && dotIndex > 0
									? Math.min(dotIndex, len)
									: len;
							const win =
								(this.innerEl as unknown as { win?: Window }).win ??
								window;
							const range = win.document.createRange();
							range.setStart(textNode, 0);
							range.setEnd(textNode, selectEnd);
							const sel = win.getSelection();
							if (sel) {
								sel.removeAllRanges();
								sel.addRange(range);
							}
							this.innerEl.focus({ preventScroll: true });
							return;
						}

						// Fallback: select all contents
						const win =
							(this.innerEl as unknown as { win?: Window }).win ??
							window;
						const range = win.document.createRange();
						range.selectNodeContents(this.innerEl);
						const sel = win.getSelection();
						if (sel) {
							sel.removeAllRanges();
							sel.addRange(range);
						}
						this.innerEl.focus({ preventScroll: true });
						return;
					}

					return origStartRename.call(this);
				};

				this.fileItemProtoPatched = true;
			}
		}
	}

	private restoreFileExplorer(): void {
		for (const disconnect of this.explorerObservers.values()) disconnect();
		this.explorerObservers.clear();
		if (this.originalPOGetTitle && this.poTargetProto) {
			this.poTargetProto.getTitle = this.originalPOGetTitle;
			this.originalPOGetTitle = null;
		}
		if (this.originalPOUpdateTitle && this.poTargetProto) {
			this.poTargetProto.updateTitle = this.originalPOUpdateTitle;
			this.originalPOUpdateTitle = null;
		}
		this.poTargetProto = null;

		if (this.originalFileItemStartRename && this.fileItemTargetProto) {
			this.fileItemTargetProto.startRename =
				this.originalFileItemStartRename;
			this.originalFileItemStartRename = null;
			this.fileItemTargetProto = null;
		}
		if (this.originalCreateFileItem && this.fileExplorerTargetProto) {
			this.fileExplorerTargetProto.createFileItem =
				this.originalCreateFileItem;
			this.originalCreateFileItem = null;
		}
		if (this.originalStartRenameFile && this.fileExplorerTargetProto) {
			this.fileExplorerTargetProto.startRenameFile =
				this.originalStartRenameFile;
			this.originalStartRenameFile = null;
		}
		if (this.originalSaveRename && this.fileExplorerTargetProto) {
			this.fileExplorerTargetProto.saveRename = this.originalSaveRename;
			this.originalSaveRename = null;
		}
		if (this.originalOnFileRenameInput && this.fileExplorerTargetProto) {
			this.fileExplorerTargetProto.onFileRenameInput =
				this.originalOnFileRenameInput;
			this.originalOnFileRenameInput = null;
		}
		this.fileExplorerTargetProto = null;
		this.fileItemProtoPatched = false;

		// Refresh file items to restore default Obsidian titles
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const view = leaf.view as { fileItems?: Record<string, unknown> };
			if (view.fileItems) {
				for (const item of Object.values(view.fileItems)) {
					(item as { updateTitle?: () => void })?.updateTitle?.();
					(item as { el?: HTMLElement }).el?.removeClass("is-ignored-hidden");
				}
			}
		}
	}
}

/* ── Settings tab ──────────────────────────────────────────── */

function createSettingNameWithFilename(
	template: string,
	filename: string,
): DocumentFragment {
	return createFragment((frag) => {
		const parts = template.split("{0}");
		if (parts.length > 1) {
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part) {
					frag.append(part);
				}
				if (i < parts.length - 1) {
					frag.createSpan({
						cls: "vault-code-setting-filename",
						text: filename,
					});
				}
			}
		} else {
			frag.append(template);
		}
	});
}

class VaultCodeSettingTab extends PluginSettingTab {
	private aiSettingsTab: "cli" | "api" | "local" = "cli";
	plugin: VaultCodePlugin;
	updateButtonState?: () => Promise<void>;

	constructor(app: App, plugin: VaultCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		const connection = plugin.settings.aiConnections.find((c) => connectionProvider(c.id) === plugin.settings.aiProvider);
		if (connection) this.aiSettingsTab = connection.kind;
	}

	updateIgnoreButtons(): void {
		void this.updateButtonState?.();
	}

	override hide(): void {
		this.updateButtonState = undefined;
		this.plugin.settingsTab = null;
		super.hide();
	}

	getSettingDefinitions(): unknown[] {
		return [];
	}

	private refreshSettings(anchorSelector?: string): void {
		const restoreScroll = preserveSettingsScroll(this.containerEl, anchorSelector);
		this.display();
		restoreScroll();
	}

	display(): void {
		this.plugin.settingsTab = this;
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("hidden-files-settings");

		// Language Setting
		new Setting(containerEl)
			.setName(t("settingsLanguageName"))
			.setDesc(t("settingsLanguageDesc"))
			.addDropdown((dropdown) => {
				dropdown.addOption("auto", t("settingsLanguageAuto"));
				for (const [code, label] of Object.entries(SUPPORTED_LANGUAGES)) {
					if (code !== "auto") {
						dropdown.addOption(code, label);
					}
				}
				dropdown
					.setValue(this.plugin.settings.language || "auto")
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						setLanguage(value);
						await this.plugin.saveSettings();
						this.refreshSettings();
					});
			});

		const createSectionHeading = (title: string, iconName?: string): Setting => {
			const heading = new Setting(containerEl)
				.setName(title)
				.setHeading();
			heading.settingEl.tabIndex = -1;
			heading.settingEl.removeAttribute("tabindex");
			heading.settingEl.addEventListener("focus", () => {
				heading.settingEl.blur();
			});
			if (iconName) {
				const iconSpan = createSpan({ cls: "vault-code-heading-icon" });
				setIcon(iconSpan, iconName);
				heading.nameEl.prepend(iconSpan);
			}
			return heading;
		};

		// Group 1: File explorer
		createSectionHeading(t("settingsGroupFileExplorer"), "folder");

		new Setting(containerEl)
			.setName(t("settingsShowHiddenDotfilesName"))
			.setDesc(t("settingsShowHiddenDotfilesDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHiddenFiles)
					.onChange(async (value) => {
						this.plugin.settings.showHiddenFiles = value;
						await this.plugin.saveSettings();
						if (value) {
							await this.plugin.enableHiddenFiles();
							new Notice(t("noticeHiddenFilesVisible"));
						} else {
							await this.plugin.disableHiddenFiles();
							new Notice(t("noticeHiddenFilesHidden"));
						}
					}),
			);

		new Setting(containerEl)
			.setName(t("settingsShowAllFileTypesName"))
			.setDesc(t("settingsShowAllFileTypesDesc"))
			.addToggle((toggle) => {
				const current =
					(this.app.vault.getConfig(
						"showUnsupportedFiles",
					) as boolean) ?? false;
				toggle.setValue(current).onChange(async (value) => {
					this.plugin.settings.showAllFileTypes = value;
					await this.plugin.saveSettings();
					this.plugin.applyShowAllFileTypes();
					new Notice(
						value
							? t("noticeAllFilesVisible")
							: t("noticeAllFilesHidden"),
					);
				});
			});

		new Setting(containerEl)
			.setName(t("settingsOpenOnDoubleClickName"))
			.setDesc(t("settingsOpenOnDoubleClickDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.openUnsupportedOnDoubleClick,
					)
					.onChange(async (value) => {
						this.plugin.settings.openUnsupportedOnDoubleClick =
							value;
						await this.plugin.saveSettings();
					}),
			);

		let obsidianIgnoreButton: ButtonComponent | null = null;
		let obsidianIgnoreButtonIconEl: HTMLElement | null = null;
		let obsidianIgnoreButtonTextEl: HTMLElement | null = null;

		const updateButtonState = async () => {
			if (!obsidianIgnoreButton || !obsidianIgnoreButtonIconEl || !obsidianIgnoreButtonTextEl) return;
			try {
				const exists = await this.app.vault.adapter.exists(".obsidianignore");
				if (exists) {
					obsidianIgnoreButtonIconEl.show();
					setIcon(obsidianIgnoreButtonIconEl, "copy");
					obsidianIgnoreButtonTextEl.setText(t("settingsButtonCopyDefault"));
					obsidianIgnoreButton.setTooltip(t("settingsTooltipCopyDefault"));
				} else {
					obsidianIgnoreButtonIconEl.empty();
					obsidianIgnoreButtonIconEl.hide();
					obsidianIgnoreButtonTextEl.setText(t("settingsButtonCreateDefault"));
					obsidianIgnoreButton.setTooltip(t("settingsTooltipCreateDefault"));
				}
			} catch {
				// ignore
			}
		};

		this.updateButtonState = updateButtonState;

		new Setting(containerEl)
			.setClass("vault-code-setting-with-actions")
			.setName(
				createSettingNameWithFilename(
					t("settingsObsidianIgnoreName"),
					".obsidianignore",
				),
			)
			.setDesc(t("settingsObsidianIgnoreDesc"))
			.addButton((button) => {
				obsidianIgnoreButton = button;
				button.setCta();
				button.setClass("vault-code-ignore-btn");
				button.buttonEl.empty();
				obsidianIgnoreButtonIconEl = button.buttonEl.createSpan({
					cls: "vault-code-btn-icon",
				});
				obsidianIgnoreButtonTextEl = button.buttonEl.createSpan({
					cls: "vault-code-btn-text",
				});
				button.onClick(async () => {
					try {
						const exists = await this.app.vault.adapter.exists(".obsidianignore");
						if (!exists) {
							await this.app.vault.adapter.write(
								".obsidianignore",
								DEFAULT_OBSIDIANIGNORE_CONTENT,
							);
							await this.plugin.loadObsidianIgnoreRules();
							this.plugin.applyFileExplorerFiltering();
							if (this.plugin.settings.showHiddenFiles) {
								await this.plugin.rescanVault();
							}
							new Notice(t("settingsNoticeCreatedObsidianIgnore"));
							await updateButtonState();
						} else {
							try {
								await navigator.clipboard.writeText(
									DEFAULT_OBSIDIANIGNORE_CONTENT,
								);
								new Notice(t("settingsNoticeCopiedDefaultIgnore"));
								if (obsidianIgnoreButtonIconEl) {
									setIcon(obsidianIgnoreButtonIconEl, "check");
									window.setTimeout(() => {
										if (obsidianIgnoreButtonIconEl) {
											setIcon(obsidianIgnoreButtonIconEl, "copy");
										}
									}, 1500);
								}
							} catch (err) {
								console.error("Vault Code: Clipboard copy failed", err);
							}
						}
					} catch (e) {
						console.error("Vault Code: Failed to handle .obsidianignore button", e);
					}
				});
				void updateButtonState();
			})
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useObsidianIgnore)
					.onChange(async (value) => {
						this.plugin.settings.useObsidianIgnore = value;
						await this.plugin.saveSettings();
						if (value) {
							const exists = await this.app.vault.adapter.exists(".obsidianignore");
							if (!exists) {
								await this.app.vault.adapter.write(
									".obsidianignore",
									DEFAULT_OBSIDIANIGNORE_CONTENT,
								);
								new Notice(t("settingsNoticeCreatedObsidianIgnore"));
								await updateButtonState();
							}
						}
						await this.plugin.loadObsidianIgnoreRules();
						this.plugin.applyFileExplorerFiltering();
						if (this.plugin.settings.showHiddenFiles) {
							await this.plugin.rescanVault();
						}
					}),
			);

		new Setting(containerEl)
			.setName(
				createSettingNameWithFilename(
					t("settingsGitIgnoreName"),
					".gitignore",
				),
			)
			.setDesc(t("settingsGitIgnoreDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useGitIgnore)
					.onChange(async (value) => {
						this.plugin.settings.useGitIgnore = value;
						await this.plugin.saveSettings();
						await this.plugin.loadGitIgnoreRules();
						this.plugin.applyFileExplorerFiltering();
						if (this.plugin.settings.showHiddenFiles) {
							await this.plugin.rescanVault();
						}
					}),
			);

		// Group 2: Code editor
		createSectionHeading(t("settingsGroupCodeEditor"), "code-xml");


		const allowEditSetting = new Setting(containerEl)
			.setName(t("settingsAllowEditDotfilesName"));
		allowEditSetting.descEl.createDiv({
			text: t("settingsAllowEditDotfilesDesc"),
		});
		allowEditSetting.descEl.createDiv({
			cls: "vault-code-setting-accent-note",
			text: t("settingsSecurityWarning"),
		});
		allowEditSetting.addToggle((toggle) =>
			toggle
				.setValue(this.plugin.settings.allowEditDotfiles)
				.onChange(async (value) => {
					this.plugin.settings.allowEditDotfiles = value;
					await this.plugin.saveSettings();
					new Notice(
						value
							? t("noticeDotfileEditingEnabled")
							: t("noticeDotfileEditingDisabled"),
					);
				}),
		);

		new Setting(containerEl)
			.setName(t("settingsAllowEditCodeFilesName"))
			.setDesc(t("settingsAllowEditCodeFilesDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowEditCodeFiles)
					.onChange(async (value) => {
						this.plugin.settings.allowEditCodeFiles = value;
						await this.plugin.saveSettings();
						new Notice(
							value
								? t("noticeCodeEditingEnabled")
								: t("noticeCodeEditingDisabled"),
						);
					}),
			);

		new Setting(containerEl)
			.setName(t("settingsCustomExtensionsName"))
			.setDesc(t("settingsCustomExtensionsDesc", BUILTIN_EXTENSION_COUNT))
			.setClass("hidden-files-extensions-setting")
			.addTextArea((text) => {
				text
					.setPlaceholder(t("settingsCustomExtensionsPlaceholder"))
					.setValue(this.plugin.settings.customFileExtensions)
					.onChange(async (value) => {
						this.plugin.settings.customFileExtensions = additionalEditorExtensions(value);
						await this.plugin.saveSettings();
					});
				text.inputEl.addEventListener("blur", () => { text.setValue(this.plugin.settings.customFileExtensions); });
				text.inputEl.addClass("hidden-files-extensions-textarea");
				text.inputEl.rows = 2;
				text.inputEl.cols = 35;
			});

		new Setting(containerEl)
			.setName(t("settingsTabSizeName"))
			.setDesc(t("settingsTabSizeDesc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", t("settingsTabSizeAuto"))
					.addOption("2", "2")
					.addOption("4", "4")
					.addOption("8", "8")
					.setValue(this.plugin.settings.tabSize || "auto")
					.onChange(async (value) => {
						this.plugin.settings.tabSize = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settingsIndentWithName"))
			.setDesc(t("settingsIndentWithDesc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", t("settingsIndentWithAuto"))
					.addOption("tabs", t("settingsIndentWithTabs"))
					.addOption("spaces", t("settingsIndentWithSpaces"))
					.setValue(this.plugin.settings.indentWithTabs || "auto")
					.onChange(async (value) => {
						this.plugin.settings.indentWithTabs = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settingsLineWrappingName"))
			.setDesc(t("settingsLineWrappingDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lineWrapping ?? true)
					.onChange(async (value) => {
						this.plugin.settings.lineWrapping = value;
						await this.plugin.saveSettings();
						this.app.workspace
							.getLeavesOfType(VIEW_TYPE_DOTFILE)
							.forEach((leaf) => {
								if (leaf.view instanceof DotfileView) {
									if (leaf.view.getLineWrapping() !== value) {
										leaf.view.toggleLineWrapping(value);
									}
								}
							});
					}),
			);

		const autoSaveSetting = new Setting(containerEl)
			.setName(t("settingsDisableAutoSaveName"));
		autoSaveSetting.descEl.createSpan({
			text: `${t("settingsDisableAutoSaveDesc")} `,
		});
		autoSaveSetting.descEl.createSpan({
			cls: "vault-code-setting-accent-text",
			text: t("settingsDisableAutoSaveLimitation"),
		});

		const warningEl = autoSaveSetting.descEl.createDiv({
			cls: "hidden-files-auto-save-warning",
			text: t("settingsAutoSaveWarning"),
		});

		const updateWarning = (disableAutoSave: boolean) => {
			warningEl.toggle(!disableAutoSave);
		};
		updateWarning(this.plugin.settings.disableAutoSave);

		autoSaveSetting.addToggle((toggle) =>
			toggle
				.setValue(this.plugin.settings.disableAutoSave)
				.onChange(async (value) => {
					this.plugin.settings.disableAutoSave = value;
					updateWarning(value);
					await this.plugin.saveSettings();
					new Notice(
						value
							? t("noticeAutoSaveDisabled")
							: t("noticeAutoSaveEnabled"),
					);
				}),
		);

		const fontSetting = new Setting(containerEl).setName(t("settingsEditorFontSize"));
		let fallbackFontValue: HTMLElement | undefined;
		let resetFontScale = () => {};
		const applyFontScale = (value: number) => {
			this.plugin.settings.editorFontScale = normalizeEditorFontScale(value);
			fallbackFontValue?.setText(`${this.plugin.settings.editorFontScale}%`);
			this.app.workspace.iterateAllLeaves(leaf => { if (leaf.view instanceof DotfileView) leaf.view.applyFontScale(); });
			void this.plugin.saveSettings();
		};
		fontSetting.addExtraButton(button => button.setIcon("rotate-ccw").setTooltip(t("settingsButtonResetDefault")).onClick(() => resetFontScale()));
		fontSetting.addSlider(slider => {
			slider.getValuePretty = () => `${slider.getValue()}%`;
			slider.setLimits(100, 150, 5).setInstant(true).setValue(this.plugin.settings.editorFontScale).onChange(applyFontScale);
			// Older Obsidian versions expose only a tooltip instead of a persistent value.
			if (!fontSetting.controlEl.querySelector(".slider-value")) {
				fallbackFontValue = fontSetting.controlEl.createSpan({ cls: "slider-value", text: slider.getValuePretty() });
				slider.sliderEl.before(fallbackFontValue);
			}
			resetFontScale = () => {
				slider.setValue(100);
				if (this.plugin.settings.editorFontScale !== 100) applyFontScale(100);
			};
		});

		// Group 3: Git (Desktop only)
		if (Platform.isDesktop) {
			createSectionHeading(t("settingsGroupGit"), "git-branch");

			const gitSetting = new Setting(containerEl)
				.setName(t("settingsGitName"));
			gitSetting.descEl.createDiv({
				text: t("settingsGitDesc"),
			});
			const gitNoteEl = gitSetting.descEl.createDiv({
				cls: "vault-code-setting-accent-note",
			});
			this.renderTextWithLinks(
				gitNoteEl,
				t("settingsGitWorkflowNote"),
				[
					{
						text: "Obsidian Git",
						url: "https://community.obsidian.md/plugins/obsidian-git",
					},
					{
						text: "GitHub Desktop",
						url: "https://github.com/apps/desktop",
					},
				],
			);
			gitSetting.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableGitIntegration ?? true)
					.onChange(async (value) => {
						await this.plugin.applyGitIntegrationToggle(value);
					}),
			);
		}

		// Group: AI Chat (Antigravity CLI)
		if (Platform.isDesktop) {
			createSectionHeading(t("settingsGroupAI"), "sparkles");

			new Setting(containerEl)
				.setClass("vault-code-ai-enable-setting")
				.setName(t("settingsEnableAIName"))
				.setDesc(t("settingsEnableAIDesc"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.enableAIChat)
						.onChange(async (value) => {
							this.plugin.settings.enableAIChat = value;
							await this.plugin.saveSettings();
							if (value) {
								this.plugin.addAIChatRibbon();
								void this.plugin.initAIChatLeaf();
							} else {
								this.plugin.removeAIChatRibbon();
								this.plugin.aiService.clearCache();
								this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
							}
							this.plugin.updateAllLeafHeaderActions();
							this.refreshSettings(".vault-code-ai-enable-setting");
						}),
				);

			if (this.plugin.settings.enableAIChat) {
			const connectionTabs = containerEl.createDiv({ cls: "vault-code-connection-tabs", attr: { role: "tablist" } });
			const connectionPanels = containerEl.createDiv({ cls: "vault-code-connection-panels" });
			const panels = new Map<string, HTMLElement>();
			const tabs = new Map<string, HTMLButtonElement>();
			const showConnectionTab = (id: "cli" | "api" | "local") => {
				this.aiSettingsTab = id;
				if (!panels.has(id)) {
					const panel = connectionPanels.createDiv({ attr: { role: "tabpanel" } });
					panels.set(id, panel);
					renderConnectionPanel(panel, id);
				}
				for (const [tabId, panel] of panels) panel.hidden = tabId !== id;
				for (const [tabId, tab] of tabs) {
					tab.toggleClass("is-active", tabId === id);
					tab.setAttribute("aria-selected", String(tabId === id));
				}
			};
			const tabDefs: Array<["cli" | "api" | "local", string]> = [
				["cli", t("settingsAITabCLI")],
				["api", t("settingsAITabAPI")],
				["local", t("settingsAITabLocal")],
			];
			for (const [id, label] of tabDefs) {
				const tab = connectionTabs.createEl("button", { text: label, attr: { role: "tab" } });
				tabs.set(id, tab);
				tab.addEventListener("click", () => showConnectionTab(id));
			}
			const renderConnectionPanel = (containerEl: HTMLElement, tabId: "cli" | "api" | "local") => {
			if (tabId !== "cli") {
				const connectionsContainer = containerEl.createDiv();
				renderConnectionSettings(connectionsContainer, this.plugin, tabId);
			}
			if (tabId === "cli") {
				const agentSection = containerEl.createDiv({ cls: "vault-code-agent-section" });
			const sectionHeader = agentSection.createDiv({ cls: "vault-code-agent-section-header" });
			const titleRow = sectionHeader.createDiv({ cls: "vault-code-agent-title-row" });
			titleRow.createDiv({
				cls: "vault-code-agent-section-title",
				text: t("settingsAIAgentsTitle"),
			});
			const refreshProvidersButton = titleRow.createEl("button", {
				cls: "clickable-icon vault-code-agent-refresh",
				attr: { type: "button", "aria-label": t("settingsAICLIRefreshProviders") },
			});
			setIcon(refreshProvidersButton, "refresh-cw");
			const description = sectionHeader.createDiv({ cls: "vault-code-agent-section-desc" });
			description.createSpan({ text: t("settingsAIAgentsDesc") });
			description.appendText(" ");
			description.createSpan({ cls: "vault-code-agent-subscription", text: t("settingsAIAgentsSubscription") });

			const gridEl = agentSection.createDiv({ cls: "vault-code-agent-grid" });
			const activityPanel = agentSection.createDiv({ cls: "vault-code-cli-activity" });
			activityPanel.hidden = true;
			const activityHeader = activityPanel.createDiv({ cls: "vault-code-cli-activity-header" });
			const activityInfo = activityHeader.createDiv({ cls: "vault-code-cli-activity-info" });
			activityInfo.createDiv({ cls: "vault-code-cli-activity-title", text: t("settingsAICLIActivity") });
			const activitySummary = activityInfo.createDiv({ cls: "vault-code-cli-activity-summary", attr: { role: "status", "aria-live": "polite" } });
			const activityActions = activityHeader.createDiv({ cls: "vault-code-cli-activity-actions" });
			const detailsButton = activityActions.createEl("button", {
				cls: "vault-code-cli-details-button", text: t("settingsAICLIShowDetails"), attr: { "aria-expanded": "false" },
			});
			const copyResultsButton = activityActions.createEl("button", {
				cls: "vault-code-cli-details-button", text: t("settingsAICLICopyLog"),
			});
			const operationLog = activityPanel.createDiv({ cls: "vault-code-cli-log", attr: { role: "log", "aria-label": t("settingsAICLILogAria") } });
			operationLog.hidden = true;
			detailsButton.addEventListener("click", () => {
				operationLog.hidden = !operationLog.hidden;
				detailsButton.setText(operationLog.hidden ? t("settingsAICLIShowDetails") : t("settingsAICLIHideDetails"));
				detailsButton.setAttribute("aria-expanded", String(!operationLog.hidden));
			});
			copyResultsButton.addEventListener("click", () => {
				void navigator.clipboard.writeText(operationLog.innerText).then(() => new Notice(t("settingsAICLICopiedLog")));
			});
			const logOperation = (message: string, summary?: string) => {
				activityPanel.hidden = false;
				if (summary) activitySummary.setText(summary);
				operationLog.createDiv({ cls: "vault-code-cli-log-entry", text: message });
			};
			let maintenanceRunning = false;
			let refreshingProviders = false;
			const providerBadges = new Map<AIProvider, HTMLElement>();
			const setAgentActivity = (id: AIProvider, state: "installing" | "updating" | "updated" | "failed") => {
				const badge = providerBadges.get(id);
				if (!badge) return;
				badge.empty();
				const busy = state === "installing" || state === "updating";
				badge.className = `vault-code-agent-card-badge ${busy ? "is-installing" : state === "updated" ? "is-installed" : "is-missing"}`;
				badge.setAttribute("aria-busy", String(busy));
				if (busy) badge.createSpan({ cls: "vault-code-badge-spinner" });
				badge.createSpan({ text: state === "installing" ? t("settingsAIAgentInstalling") : state === "updating" ? t("settingsAIAgentUpdating") : state === "updated" ? t("settingsAIAgentUpdated") : t("settingsAICLINeedsAttention") });
			};

			const renderCards = (
				agents: Array<{
					id: import("./ai-service").CLIProvider;
					name: string;
					icon: string;
					isInstalled?: boolean;
					version?: string;
					diagnostic?: string;
					connectionStatus?: string;
				}>,
				isChecking = false,
			) => {
				const statusLabels: Record<string, string> = {
					"Installed": t("settingsAIAgentInstalled"),
					"Signed in": t("settingsAIAgentSignedIn"),
					"Sign-in required": t("settingsAIAgentSignInRequired"),
					"Version check failed": t("settingsAIAgentVersionFailed"),
				};
				gridEl.empty();
				providerBadges.clear();
				for (const agent of agents.filter((a) => a.id !== "ollama")) {
					const isActive = (this.plugin.settings.aiProvider || "antigravity") === agent.id;
					const cardEl = gridEl.createDiv({
						cls: `vault-code-agent-card${isActive ? " is-active" : ""}`,
					});

					const infoEl = cardEl.createDiv({ cls: "vault-code-agent-card-info" });
					const iconEl = infoEl.createDiv({ cls: "vault-code-agent-card-icon" });
					setIcon(iconEl, agent.icon);

					const textEl = infoEl.createDiv({ cls: "vault-code-agent-card-text" });
					textEl.createDiv({ cls: "vault-code-agent-card-name", text: agent.name });

					const isInstalled = !!agent.isInstalled;
					if (!isChecking) {
						const versionText = isInstalled
							? (agent.version ? statusLabels[agent.version] ?? agent.version : t("settingsAIAgentNotDetected"))
							: t("settingsAIAgentMissing");
						const versionEl = textEl.createDiv({ cls: "vault-code-agent-card-version", text: versionText });
						if (agent.diagnostic) versionEl.setAttribute("title", agent.diagnostic);
						if (agent.connectionStatus) textEl.createDiv({ cls: "vault-code-agent-card-version", text: statusLabels[agent.connectionStatus] ?? agent.connectionStatus });
					}

					const handleInstallAgent = async (
						agentToInstall: { id: import("./ai-service").CLIProvider; name: string },
						btnEl: HTMLButtonElement,
					) => {
						if (btnEl.disabled || maintenanceRunning || refreshingProviders) return;
						const installConfig = AGENT_INSTALL_CONFIGS[agentToInstall.id];
						if (!installConfig.installCmd && installConfig.manualUrl) {
							logOperation(`${agentToInstall.name}: follow the official setup guide.\n${installConfig.manualUrl}`, `Setup guide for ${agentToInstall.name}`);
							openInDefaultBrowser(installConfig.manualUrl);
							return;
						}
						maintenanceRunning = true;
						refreshProvidersButton.disabled = true;
						updateAllBtn.disabled = true;
						btnEl.disabled = true;
						setAgentActivity(agentToInstall.id, "installing");

						try {
							const installingText = t("settingsAIAgentInstalling", agentToInstall.name);
							logOperation(`${installingText}…`, installingText);
							const res = await this.plugin.aiService.installAgent(agentToInstall.id);
							logOperation(`${res.message}${res.command ? `\n${res.command}` : ""}`, res.success ? `${agentToInstall.name} installed` : `${agentToInstall.name} needs attention - see details`);
							if (!res.success && res.command?.startsWith("https://")) openInDefaultBrowser(res.command);
							if (res.success) {
								new Notice(t("settingsAIAgentInstallSuccess", agentToInstall.name));
								this.plugin.aiService.refreshAgentsCache();
								const updatedAgents = await this.plugin.aiService.detectAllAgents();
								currentAgents = updatedAgents;
								renderCards(updatedAgents, false);
							} else {
								new Notice(res.message, 8000);
								if (
									res.command &&
									(res.command.startsWith("npm ") ||
										res.command.startsWith("python") ||
										res.command.startsWith("brew ") || res.command.startsWith("uv ") || res.command.startsWith("curl "))
								) {
									try {
										await navigator.clipboard.writeText(res.command);
										new Notice(t("settingsAICommandCopied", res.command), 8000);
									} catch {
										// ignore
									}
								}
								btnEl.disabled = false;
								btnEl.className = "vault-code-agent-card-badge is-missing is-installable";
								btnEl.empty();
								btnEl.setText(t("settingsAIAgentInstallQuestion"));
							}
						} catch (err: unknown) {
							const msg = err instanceof Error ? err.message : String(err);
							new Notice(`${t("settingsAIAgentInstallFailed", agentToInstall.name)}: ${msg}`, 8000);
							btnEl.disabled = false;
							btnEl.className = "vault-code-agent-card-badge is-missing is-installable";
							btnEl.empty();
							btnEl.setText(t("settingsAIAgentInstallQuestion"));
							logOperation(msg, `${agentToInstall.name} installation failed - see details`);
						} finally {
							maintenanceRunning = false;
							refreshProvidersButton.disabled = false;
							updateAllBtn.disabled = false;
						}
					};

					if (isChecking) {
						const checkingBadge = cardEl.createDiv({
							cls: "vault-code-agent-card-badge is-checking",
						});
						checkingBadge.createSpan({ cls: "vault-code-badge-spinner" });
						checkingBadge.createSpan({ text: t("settingsAIAgentChecking") });
					} else if (isInstalled) {
						const installedBadge = cardEl.createDiv({
							cls: `vault-code-agent-card-badge ${agent.diagnostic ? "is-missing" : "is-installed"}`,
							text: agent.diagnostic ? t("settingsAICLINeedsAttention") : t("settingsAIAgentInstalled"),
						});
						providerBadges.set(agent.id, installedBadge);
					} else {
						const installBtn = cardEl.createEl("button", {
							cls: "vault-code-agent-card-badge is-missing is-installable",
							text: AGENT_INSTALL_CONFIGS[agent.id].installCmd ? t("settingsAIAgentInstallQuestion") : t("settingsAICLISetupGuide"),
						});
						providerBadges.set(agent.id, installBtn);
						installBtn.addEventListener("click", (e) => {
							e.stopPropagation();
							void handleInstallAgent(agent, installBtn);
						});
					}

					cardEl.addEventListener("click", () => {
						if (!isInstalled || isChecking || maintenanceRunning || refreshingProviders) return;
						this.plugin.settings.aiProvider = agent.id;
						void this.plugin.saveSettings().then(() => {
							renderCards(currentAgents, false);
						});
					});
				}
			};

			let currentAgents: Parameters<typeof renderCards>[0] = ALL_AGENT_DEFS.map((d) => ({
				id: d.id, name: d.name, icon: d.icon, isInstalled: false,
			}));

			const footerEl = agentSection.createDiv({ cls: "vault-code-agent-footer" });

			const updateAllBtn = footerEl.createEl("button", {
				cls: "vault-code-agent-footer-btn",
			});
			const updateIcon = updateAllBtn.createSpan({ cls: "vault-code-pill-icon" });
			setIcon(updateIcon, "refresh-cw");
			const updateText = updateAllBtn.createSpan({ text: t("settingsAIUpdateConnectedCLIs") });

			const refreshProviders = async (clearCache = true) => {
				if (maintenanceRunning || refreshingProviders) return;
				refreshingProviders = true;
				refreshProvidersButton.disabled = true;
				refreshProvidersButton.setAttribute("aria-busy", "true");
				refreshProvidersButton.addClass("vault-code-spin");
				updateAllBtn.disabled = true;
				renderCards(currentAgents, true);
				try {
					if (clearCache) this.plugin.aiService.refreshAgentsCache();
					currentAgents = await this.plugin.aiService.detectAllAgents();
				} catch {
					new Notice(t("settingsAICLIRefreshFailed"));
				} finally {
					renderCards(currentAgents, false);
					refreshingProviders = false;
					refreshProvidersButton.disabled = false;
					refreshProvidersButton.setAttribute("aria-busy", "false");
					refreshProvidersButton.removeClass("vault-code-spin");
					updateAllBtn.disabled = false;
				}
			};
			refreshProvidersButton.addEventListener("click", () => { void refreshProviders(); });
			void refreshProviders(false);

			updateAllBtn.addEventListener("click", () => {
				if (updateAllBtn.disabled || maintenanceRunning || refreshingProviders) return;
				maintenanceRunning = true;
				refreshProvidersButton.disabled = true;
				updateAllBtn.disabled = true;
				updateIcon.addClass("vault-code-spin");
				updateText.setText(t("settingsAIAgentUpdating"));
				logOperation("Checking installed CLIs before updating…", "Updating installed CLIs...");

				void (async () => {
					try {
						operationLog.empty();
						const result = await this.plugin.aiService.updateAllConnectedAgents(
							(agent, success, error) => {
								setAgentActivity(agent.id, success ? "updated" : "failed");
								logOperation(`${agent.name}: ${success ? "Updated and version check passed" : error || "Update failed"}`);
								if (!success) {
									new Notice(t("settingsAIAgentUpdateFailedSingle", agent.name), 5000);
								}
							},
							(agent) => {
								setAgentActivity(agent.id, "updating");
								activitySummary.setText(`${t("settingsAIUpdatingCLIs")}: ${agent.name}...`);
							},
						);
						logOperation(`${result.updated} updated, ${result.failed} failed or require manual setup (${result.total} installed).`, `${result.updated} updated · ${result.failed} need attention`);
						if (result.total === 0) {
							new Notice(t("settingsAINoConnectedCLIsToUpdate"));
						} else if (result.failed === 0) {
							new Notice(t("settingsAIUpdateAllSuccess", result.updated));
						} else if (result.updated > 0) {
							new Notice(t("settingsAIUpdatePartial", result.updated, result.failed));
						}
						this.plugin.aiService.refreshAgentsCache();
						const fresh = await this.plugin.aiService.detectAllAgents();
						currentAgents = fresh;
						renderCards(fresh, false);
					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : String(err);
						new Notice(`${t("settingsAIUpdateFailed")}: ${msg}`);
						logOperation(msg, "Update stopped - see details");
					} finally {
						maintenanceRunning = false;
						refreshProvidersButton.disabled = false;
						updateAllBtn.disabled = false;
						updateIcon.removeClass("vault-code-spin");
						updateText.setText(t("settingsAIUpdateConnectedCLIs"));
					}
				})();
			});

			const copyBtn = footerEl.createEl("button", {
				cls: "mod-cta vault-code-agent-footer-btn",
			});
			const copyIcon = copyBtn.createSpan({ cls: "vault-code-pill-icon" });
			setIcon(copyIcon, "copy");
			copyBtn.createSpan({ text: t("settingsAICopyMCPConfig") });
			copyBtn.addEventListener("click", () => {
				const snippet = this.plugin.aiService.getMCPConfigSnippet();
				void navigator.clipboard.writeText(snippet).then(() => {
					new Notice(t("settingsAICopiedMCPConfig"));
				});
			});

			}

			};
			showConnectionTab(this.aiSettingsTab);

			new Setting(containerEl)
				.setName(t("settingsAIDefaultScopeName"))
				.setDesc(t("settingsAIDefaultScopeDesc"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("active-note", t("aiChatScopeActiveNote"))
						.addOption("vault", t("aiChatScopeVault"))
						.setValue(this.plugin.settings.aiScope)
						.onChange(async (value: string) => {
							this.plugin.settings.aiScope = value as "active-note" | "vault";
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName(t("settingsAIDefaultModeName"))
				.setDesc(t("settingsAIDefaultModeDesc"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("safe", t("aiChatModeSafe"))
						.addOption("edit", t("aiChatModeEdit"))
						.setValue(this.plugin.settings.aiMode)
						.onChange(async (value: string) => {
							this.plugin.settings.aiMode = value as "safe" | "edit";
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName(t("settingsAIAttachInstructionsName"))
				.setDesc(t("settingsAIAttachInstructionsDesc"))
				.addButton((button) =>
					button
						.setIcon("file-text")
						.setTooltip(t("settingsTooltipOpenInstructions"))
						.onClick(async () => {
							try {
								const file =
									await this.plugin.aiStorage.ensureInstructionsFile(
										this.plugin.settings.aiChatFolder ||
											"agent-chats",
									);
								if (file instanceof TFile) {
									await this.app.workspace
										.getLeaf("tab")
										.openFile(file);
								}
							} catch {
								// Silently ignore if cannot open
							}
						}),
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.aiAttachInstructions ?? true)
						.onChange(async (value) => {
							this.plugin.settings.aiAttachInstructions = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName(t("settingsAIChatFolderName"))
				.setDesc(t("settingsAIChatFolderDesc"))
				.addText((text) =>
					text
						.setPlaceholder("agent-chats")
						.setValue(this.plugin.settings.aiChatFolder)
						.onChange(async (value) => {
							this.plugin.settings.aiChatFolder = value.trim() || "agent-chats";
							await this.plugin.saveSettings();
							if (this.plugin.settings.aiAttachInstructions !== false) {
								void this.plugin.aiStorage.ensureInstructionsFile(this.plugin.settings.aiChatFolder);
							}
						}),
				);

			new Setting(containerEl)
				.setName(t("settingsAIAutoCleanName"))
				.setDesc(t("settingsAIAutoCleanDesc"))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("never", t("settingsAIAutoCleanNever"))
						.addOption("7d", t("settingsAIAutoClean7d"))
						.addOption("30d", t("settingsAIAutoClean30d"))
						.addOption("90d", t("settingsAIAutoClean90d"))
						.setValue(this.plugin.settings.aiChatAutoClean)
						.onChange(async (value: string) => {
							this.plugin.settings.aiChatAutoClean = value as "never" | "7d" | "30d" | "90d";
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName(t("settingsAICleanupNowName"))
				.setDesc(t("settingsAICleanupNowDesc"))
				.addButton((button) =>
					button
						.setButtonText(t("settingsAICleanupNowBtn"))
						.onClick((e) => {
							const menu = createCustomMenu();
							menu.addItem((item) => {
								item.setTitle(t("aiChatCleanupOlder7d"));
								item.setIcon("calendar");
								item.onClick(async () => {
									const count = await this.plugin.aiStorage.cleanupOldChats(this.plugin.settings.aiChatFolder, "7d");
									new Notice(t("aiChatNoticeCleanedCount").replace("{0}", String(count)));
								});
							});
							menu.addItem((item) => {
								item.setTitle(t("aiChatCleanupOlder30d"));
								item.setIcon("calendar");
								item.onClick(async () => {
									const count = await this.plugin.aiStorage.cleanupOldChats(this.plugin.settings.aiChatFolder, "30d");
									new Notice(t("aiChatNoticeCleanedCount").replace("{0}", String(count)));
								});
							});
							menu.addSeparator();
							menu.addItem((item) => {
								item.setTitle(t("aiChatCleanupAll"));
								item.setIcon("trash-2");
								item.setWarning(true);
								item.onClick(async () => {
									const count = await this.plugin.aiStorage.cleanupOldChats(this.plugin.settings.aiChatFolder, "all");
									new Notice(t("aiChatNoticeCleanedCount").replace("{0}", String(count)));
								});
							});
							menu.showAtMouseEvent(e);
						}),
				);
			}
		}

		let isConfirmingReset = false;
		let resetTimeoutId: number | null = null;

		new Setting(containerEl)
			.setClass("vault-code-reset-setting")
			.setName(t("settingsResetAllName"))
			.setDesc(t("settingsResetAllDesc"))
			.addButton((button) =>
				button
					.setButtonText(t("settingsButtonResetAll"))
					.setWarning()
					.setTooltip(t("settingsTooltipResetAll"))
					.onClick(async () => {
						if (!isConfirmingReset) {
							isConfirmingReset = true;
							button.buttonEl.addClass("is-confirming");
							button.setButtonText(t("settingsButtonConfirmResetAll"));
							resetTimeoutId = window.setTimeout(() => {
								if (!isConfirmingReset) return;
								isConfirmingReset = false;
								button.buttonEl.removeClass("is-confirming");
								button.setButtonText(t("settingsButtonResetAll"));
								resetTimeoutId = null;
							}, 4000);
							return;
						}

						if (resetTimeoutId !== null) {
							window.clearTimeout(resetTimeoutId);
							resetTimeoutId = null;
						}
						isConfirmingReset = false;
						button.buttonEl.removeClass("is-confirming");

						this.plugin.settings = {
							...DEFAULT_SETTINGS,
							aiProviderLastModel: { ...DEFAULT_SETTINGS.aiProviderLastModel },
						aiConnections: [],
						};
						setLanguage(this.plugin.settings.language);
						await this.plugin.saveSettings();
						this.plugin.applyShowAllFileTypes();
						await this.plugin.reloadAllIgnoreRules();
						this.plugin.applyFileExplorerFiltering();
						if (this.plugin.settings.showHiddenFiles) {
							await this.plugin.enableHiddenFiles();
						} else {
							await this.plugin.disableHiddenFiles();
						}
						await this.plugin.applyGitIntegrationToggle(this.plugin.settings.enableGitIntegration);

						// Re-apply editor preferences (line wrapping) across all open editor leaves
						this.app.workspace.iterateAllLeaves((leaf) => {
							const view = leaf.view;
							if (view instanceof DotfileView) view.applyFontScale();
							if (view && "toggleLineWrapping" in view && typeof view.toggleLineWrapping === "function") {
								(view as { toggleLineWrapping: (wrap: boolean) => void }).toggleLineWrapping(
									this.plugin.settings.lineWrapping ?? true,
								);
							}
						});

						// Reset AI service cache, ribbon icon and views
						this.plugin.aiService.clearCache();
						if (this.plugin.settings.enableAIChat) {
							this.plugin.addAIChatRibbon();
							void this.plugin.initAIChatLeaf();
						} else {
							this.plugin.removeAIChatRibbon();
							this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_CHAT);
						}
						this.plugin.updateAllLeafHeaderActions();

						// Reset any active chat view session to clean initial state
						this.app.workspace.iterateAllLeaves((leaf) => {
							if (leaf.view instanceof AIChatView) {
								leaf.view.startNewChat();
							}
						});

						this.refreshSettings(".vault-code-reset-setting");
						new Notice(t("noticeAllSettingsReset"));
					}),
			);

		const footerEl = containerEl.createDiv({
			cls: "vault-code-settings-footer",
		});
		footerEl.createSpan({ text: "Brought to you by " });
		const authorLink = footerEl.createEl("a", {
			text: "SPACESODA",
			href: "https://github.com/SPACESODA",
			attr: {
				target: "_blank",
				rel: "noopener noreferrer",
			},
		});
		const handleAuthorClick = (e: MouseEvent): void => {
			e.preventDefault();
			e.stopPropagation();
			openInDefaultBrowser("https://github.com/SPACESODA");
		};
		authorLink.addEventListener("click", handleAuthorClick);
		authorLink.addEventListener("auxclick", handleAuthorClick);

		footerEl.createSpan({ text: " | Star on " });
		const starLink = footerEl.createEl("a", {
			text: "GitHub",
			href: "https://github.com/SPACESODA/obsidian-vault-code",
			attr: {
				target: "_blank",
				rel: "noopener noreferrer",
			},
		});
		const handleStarClick = (e: MouseEvent): void => {
			e.preventDefault();
			e.stopPropagation();
			openInDefaultBrowser("https://github.com/SPACESODA/obsidian-vault-code");
		};
		starLink.addEventListener("click", handleStarClick);
		starLink.addEventListener("auxclick", handleStarClick);
	}

	private renderTextWithLinks(
		container: HTMLElement,
		template: string,
		links: { text: string; url: string }[],
	): void {
		const parts = template.split(/\{(\d+)\}/);
		for (const part of parts) {
			const idx = parseInt(part, 10);
			if (!isNaN(idx) && links[idx]) {
				const linkInfo = links[idx];
				const a = container.createEl("a", {
					text: linkInfo.text,
					href: linkInfo.url,
					attr: {
						target: "_blank",
						rel: "noopener noreferrer",
					},
				});
				a.addEventListener("click", (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					openInDefaultBrowser(linkInfo.url);
				});
			} else if (part) {
				container.createSpan({ text: part });
			}
		}
	}
}
