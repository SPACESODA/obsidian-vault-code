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
	TextAreaComponent,
	ButtonComponent,
	Modal,
	OpenViewState,
	Platform,
	setIcon,
	getIcon,
	normalizePath,
	Scope,
	ViewStateResult,
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
} from "@codemirror/view";
import {
	EditorState,
	Extension,
	Compartment,
	Prec,
	EditorSelection,
	countColumn,
} from "@codemirror/state";
import {
	defaultKeymap,
	history,
	historyKeymap,
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
import mjml2html from "mjml-browser";
import { t, setLanguage, SUPPORTED_LANGUAGES } from "./i18n";

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
export const PREVIEWABLE_EXTENSIONS = new Set(["svg", "html", "htm", "mjml"]);

/** All code and data file extensions supported for direct opening and editing. */
export const SUPPORTED_EXTENSIONS = new Set([
	"astro",
	"bash",
	"bat",
	"bib",
	"c",
	"cjs",
	"cmd",
	"cpp",
	"cs",
	"css",
	"csv",
	"dart",
	"diff",
	"email",
	"eml",
	"fish",
	"go",
	"gql",
	"graphql",
	"h",
	"handlebars",
	"hbs",
	"hpp",
	"htm",
	"html",
	"ini",
	"java",
	"jl",
	"js",
	"json",
	"json5",
	"jsonc",
	"jsx",
	"kt",
	"less",
	"liquid",
	"log",
	"lua",
	"mdx",
	"mjml",
	"mjs",
	"patch",
	"php",
	"pine",
	"prisma",
	"ps1",
	"py",
	"r",
	"rb",
	"rs",
	"sass",
	"scss",
	"sh",
	"sql",
	"svelte",
	"svg",
	"swift",
	"tex",
	"toml",
	"ts",
	"tsx",
	"tsv",
	"txt",
	"vue",
	"xml",
	"yaml",
	"yml",
	"zig",
	"zsh",
]);

/** Comprehensive list of binary extensions that must NEVER be opened or saved as text. */
export const BINARY_EXTENSIONS = new Set([
	// Documents & presentations
	"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
	"pages", "numbers", "keynote", "rtf",
	// Archives & compressed
	"zip", "tar", "gz", "tgz", "bz2", "7z", "rar", "xz", "zst", "iso", "dmg", "pkg",
	// Images (except SVG which is text/XML)
	"png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "heif", "avif", "psd", "ai",
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
}

const DEFAULT_EXTENSIONS =
	"astro, bash, bat, bib, c, cjs, cmd, cpp, cs, css, csv, dart, diff, email, eml, fish, go, gql, graphql, h, handlebars, hbs, hpp, htm, html, ini, java, jl, js, json, json5, jsonc, jsx, kt, less, liquid, log, lua, mdx, mjml, mjs, patch, php, pine, prisma, ps1, py, r, rb, rs, sass, scss, sh, sql, svelte, svg, swift, tex, toml, ts, tsx, tsv, txt, vue, xml, yaml, yml, zig, zsh";

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
`;

const DEFAULT_SETTINGS: VaultCodeSettings = {
	showAllFileTypes: true,
	showHiddenFiles: true,
	allowEditDotfiles: true,
	allowEditCodeFiles: true,
	disableAutoSave: true,
	customFileExtensions: DEFAULT_EXTENSIONS,
	preventAutoOpenUnsupported: true,
	openUnsupportedOnDoubleClick: true,
	useObsidianIgnore: true,
	useGitIgnore: false,
	language: "auto",
	tabSize: "auto",
	indentWithTabs: "auto",
	lineWrapping: true,
};

interface IgnoreRule {
	dirOnly: boolean;
	negate: boolean;
	exactRegex: RegExp;
	childRegex: RegExp;
	fullRegex: RegExp;
}

function parseGitignore(text: string): IgnoreRule[] {
	const rules: IgnoreRule[] = [];
	const lines = text.split(/\r?\n/);
	for (let line of lines) {
		line = line.trim();
		if (!line || line.startsWith("#")) continue;

		let negate = false;
		if (line.startsWith("!")) {
			negate = true;
			line = line.slice(1).trim();
			if (!line) continue;
		}

		let dirOnly = false;
		if (line.endsWith("/")) {
			dirOnly = true;
			line = line.slice(0, -1).trim();
			if (!line) continue;
		}

		const hasSlash = line.includes("/");
		if (line.startsWith("/")) {
			line = line.slice(1);
		}

		let regexStr = "";
		let i = 0;
		while (i < line.length) {
			const c = line[i];
			if (!c) break;
			if (c === "*") {
				if (line[i + 1] === "*") {
					if (line[i + 2] === "/") {
						regexStr += "(?:.*/)?";
						i += 3;
						continue;
					} else {
						regexStr += ".*";
						i += 2;
						continue;
					}
				} else {
					regexStr += "[^/]*";
					i++;
					continue;
				}
			} else if (c === "?") {
				regexStr += "[^/]";
				i++;
				continue;
			} else if (c === "[") {
				// Character class range notation e.g. [a-zA-Z] or [tT]
				const closeIdx = line.indexOf("]", i + 1);
				if (closeIdx > i + 1 && !line.slice(i, closeIdx).includes("/")) {
					const classContent = line.slice(i + 1, closeIdx);
					regexStr += "[" + classContent + "]";
					i = closeIdx + 1;
					continue;
				} else {
					regexStr += "\\[";
					i++;
					continue;
				}
			} else if (/[.+^$(){}|\\]/.test(c)) {
				regexStr += "\\" + c;
				i++;
				continue;
			} else {
				regexStr += c;
				i++;
				continue;
			}
		}

		let exactRegex: RegExp;
		let childRegex: RegExp;
		let fullRegex: RegExp;

		// Strictly case-sensitive matching matching official .gitignore specification
		if (hasSlash) {
			exactRegex = new RegExp("^" + regexStr + "$");
			childRegex = new RegExp("^" + regexStr + "/.*$");
			fullRegex = new RegExp("^" + regexStr + "(?:/.*)?$");
		} else {
			exactRegex = new RegExp("(?:^|/)" + regexStr + "$");
			childRegex = new RegExp("(?:^|/)" + regexStr + "/.*$");
			fullRegex = new RegExp("(?:^|/)" + regexStr + "(?:/.*)?$");
		}

		try {
			rules.push({
				dirOnly,
				negate,
				exactRegex,
				childRegex,
				fullRegex,
			});
		} catch {
			// Skip invalid regex pattern
		}
	}
	return rules;
}

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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("hidden-files-form-modal");

		const isFolder = this.file instanceof TFolder;
		contentEl.createEl("h3", {
			text: isFolder ? t("modalRenameFolderTitle") : t("modalRenameFileTitle"),
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

		if (/[\\/:*?"<>|]/.test(newName)) {
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
				title: t("searchToggleReplaceTooltip"),
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
				title: t("searchMatchCase"),
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
				title: t("searchWholeWord"),
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
				title: t("searchRegex"),
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
				title: t("searchPreviousMatch"),
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
				title: t("searchNextMatch"),
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
				title: t("searchSelectAll"),
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
			cls: "hidden-files-search-action-btn",
			text: t("searchReplace"),
			attr: {
				title: t("searchReplace"),
				"aria-label": t("searchReplace"),
				type: "button",
			},
		});
		replaceBtn.addEventListener("click", () => {
			replaceNext(this.view);
		});

		const replaceAllBtn = replaceBtnsWrapper.createEl("button", {
			cls: "hidden-files-search-action-btn",
			text: t("searchReplaceAll"),
			attr: {
				title: t("searchReplaceAll"),
				"aria-label": t("searchReplaceAll"),
				type: "button",
			},
		});
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
		return "document-code";
	}

	override getState(): Record<string, unknown> {
		const state = super.getState();
		state.file = this.file ? this.file.path : this.filePath;
		state.preview = this.isPreviewMode;
		return state;
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Record<string, unknown> | null | undefined;
		if (s && typeof s.file === "string") {
			this.filePath = s.file;
		}
		if (s && typeof s.preview === "boolean") {
			this.isPreviewMode = s.preview;
		}
		await super.setState(state, result);
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
	}

	canAcceptExtension(extension: string): boolean {
		const ext = extension ? extension.toLowerCase() : "";
		if (BINARY_EXTENSIONS.has(ext)) {
			return false;
		}
		if (this.isDirty()) {
			return false;
		}
		return this.plugin.isExtensionEditable(ext);
	}

	isDirty(): boolean {
		if (this.discardOnClose) return false;
		if (this.editor) {
			return this.editor.state.doc.toString() !== (this.data ?? "");
		}
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
		this.data = this.getViewData();
		this.isModified = false;
		this.discardOnClose = false;
		await super.save();
		this.updateDirtyUI();
		this.updateStatus();
		new Notice(t("noticeSaved"));
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
		this.data = this.getViewData();
		this.isModified = false;
		await super.save(clear);
		this.updateDirtyUI();
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

		// View / Code toggle button for previewable files (svg, html, htm)
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

		// Initialize CodeMirror 6 with language compartment
		this.editor = new EditorView({
			state: this.createEditorState(this.data ?? ""),
			parent: this.editorEl,
		});

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
						key: "Mod-e",
						run: () => {
							if (this.isPreviewable()) {
								this.toggleViewMode();
								return true;
							}
							return false;
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
						this.isModified = currentDoc !== (this.data ?? "");
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

		const desc =
			LanguageDescription.matchFilename(languages, filename) ||
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
			(ext === "pine"
				? LanguageDescription.matchFilename(languages, "file.py")
				: null) ||
			(ext === "json5" || ext === "jsonc"
				? LanguageDescription.matchFilename(languages, "file.json")
				: null) ||
			(ext === "bash" || ext === "zsh" || ext === "fish"
				? LanguageDescription.matchFilename(languages, "file.sh")
				: null) ||
			(ext === "patch"
				? LanguageDescription.matchFilename(languages, "file.diff")
				: null) ||
			(ext === "bib"
				? LanguageDescription.matchFilename(languages, "file.tex")
				: null) ||
			(ext === "gql"
				? LanguageDescription.matchFilename(languages, "file.graphql")
				: null) ||
			(ext === "cmd" || ext === "bat"
				? LanguageDescription.matchFilename(languages, "file.cmd")
				: null) ||
			(ext
				? LanguageDescription.matchFilename(languages, `file.${ext}`)
				: null);

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
			astro: "Astro",
			bash: "Bash",
			bat: "Batch",
			bib: "BibTeX",
			c: "C",
			cjs: "JavaScript",
			cmd: "Command Script",
			cpp: "C++",
			cs: "C#",
			css: "CSS",
			csv: "CSV",
			dart: "Dart",
			diff: "Diff",
			email: "Email",
			eml: "Email (EML)",
			fish: "Fish",
			go: "Go",
			gql: "GraphQL",
			graphql: "GraphQL",
			h: "C Header",
			handlebars: "Handlebars",
			hbs: "Handlebars",
			hpp: "C++ Header",
			htm: "HTML",
			html: "HTML",
			ini: "INI",
			java: "Java",
			jl: "Julia",
			js: "JavaScript",
			json: "JSON",
			json5: "JSON5",
			jsonc: "JSONC",
			jsx: "JSX (React)",
			kt: "Kotlin",
			less: "Less",
			liquid: "Liquid",
			log: "Log",
			lua: "Lua",
			markdown: "Markdown",
			md: "Markdown",
			mdx: "MDX",
			mjml: "MJML",
			mjs: "JavaScript",
			patch: "Patch",
			php: "PHP",
			pine: "Pine Script",
			prisma: "Prisma",
			ps1: "PowerShell",
			py: "Python",
			r: "R",
			rb: "Ruby",
			rs: "Rust",
			sass: "Sass",
			scss: "SCSS",
			sh: "Shell",
			sql: "SQL",
			svelte: "Svelte",
			svg: "SVG",
			swift: "Swift",
			tex: "LaTeX",
			toml: "TOML",
			ts: "TypeScript",
			tsx: "TSX (React)",
			tsv: "TSV",
			txt: "Plain Text",
			vue: "Vue",
			xml: "XML",
			yaml: "YAML",
			yml: "YAML",
			zig: "Zig",
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
	}

	async onClose(): Promise<void> {
		this.closeGotoLine();
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

	private isPreviewable(): boolean {
		if (!this.file) return false;
		const ext = this.file.extension?.toLowerCase() ?? "";
		return PREVIEWABLE_EXTENSIONS.has(ext);
	}

	private toggleViewMode(): void {
		if (!this.isPreviewable()) return;
		this.isPreviewMode = !this.isPreviewMode;
		this.updateViewModeUI();
	}

	private updateViewModeUI(): void {
		const previewable = this.isPreviewable();

		if (!previewable) {
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
				this.renderPreview();
			}
		} else {
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

	private renderPreview(): void {
		if (!this.previewEl || !this.file) return;
		this.previewEl.empty();

		const ext = this.file.extension?.toLowerCase() ?? "";
		const rawContent = this.getViewData();

		if (ext === "svg") {
			this.renderSvgPreview(rawContent);
		} else if (ext === "html" || ext === "htm") {
			this.renderHtmlPreview(rawContent);
		} else if (ext === "mjml") {
			void this.renderMjmlPreview(rawContent);
		}
	}

	private renderSvgPreview(content: string): void {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText("Empty SVG file");
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
					text: "SVG syntax error",
				});
				const iconSpan = title.createSpan({
					cls: "hidden-files-preview-error-icon",
				});
				setIcon(iconSpan, "alert-triangle");
				errBox.createDiv({
					cls: "hidden-files-preview-error-msg",
					text: parserError.textContent || "Unable to parse SVG",
				});
				return;
			}

			const svgElement = doc.documentElement;
			if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
				const errBox = this.previewEl.createDiv({
					cls: "hidden-files-preview-error",
				});
				errBox.setText("No root <svg> element found.");
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
				`Failed to render SVG: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	private renderHtmlPreview(content: string): void {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText("Empty HTML file");
			return;
		}

		const container = this.previewEl.createDiv({
			cls: "hidden-files-html-container",
		});
		const iframe = container.createEl("iframe", {
			cls: "hidden-files-html-iframe",
		});

		// allow-same-origin is essential so Chromium can load app://local/... images and stylesheets
		iframe.setAttribute(
			"sandbox",
			"allow-scripts allow-forms allow-modals allow-same-origin allow-popups",
		);

		if (this.file) {
			const fileUrl = this.app.vault.getResourcePath(this.file);
			const cleanUrl = fileUrl.split("?")[0] ?? fileUrl;
			const baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf("/") + 1);

			// Remove any existing <base> tags so the local vault directory takes precedence
			let htmlContent = content.replace(/<base\b[^>]*>/gi, "");

			// Inject <base href="..."> so relative paths (images, styles, scripts) resolve to the local vault folder
			const baseTag = `<base href="${baseUrl}">`;
			if (/<head\b[^>]*>/i.test(htmlContent)) {
				htmlContent = htmlContent.replace(/<head\b[^>]*>/i, `$&${baseTag}`);
			} else {
				htmlContent = `${baseTag}${htmlContent}`;
			}

			iframe.srcdoc = htmlContent;
		} else {
			iframe.srcdoc = content;
		}
	}

	private async renderMjmlPreview(content: string): Promise<void> {
		if (!this.previewEl) return;

		const trimmed = content.trim();
		if (!trimmed) {
			const emptyMsg = this.previewEl.createDiv({
				cls: "hidden-files-preview-empty",
			});
			emptyMsg.setText("Empty file");
			return;
		}

		try {
			const mjmlFn =
				typeof mjml2html === "function"
					? mjml2html
					: (mjml2html as { default?: typeof mjml2html }).default ?? mjml2html;

			const result = await mjmlFn(trimmed, {
				validationLevel: "soft",
				minify: false,
			});

			if (!this.previewEl || !this.isPreviewMode) return;

			if (!result || !result.html) {
				const errBox = this.previewEl.createDiv({
					cls: "hidden-files-preview-error",
				});
				errBox.setText("Compilation produced no output.");
				return;
			}

			this.renderHtmlPreview(result.html);
		} catch (e) {
			if (!this.previewEl || !this.isPreviewMode) return;
			this.previewEl.empty();
			const errBox = this.previewEl.createDiv({
				cls: "hidden-files-preview-error",
			});
			const title = errBox.createDiv({
				cls: "hidden-files-preview-error-title",
				text: "MJML compilation error",
			});
			const iconSpan = title.createSpan({
				cls: "hidden-files-preview-error-icon",
			});
			setIcon(iconSpan, "alert-triangle");
			errBox.createDiv({
				cls: "hidden-files-preview-error-msg",
				text: e instanceof Error ? e.message : String(e),
			});
		}
	}
}

/* ── Plugin ────────────────────────────────────────────────── */

export default class VaultCodePlugin extends Plugin {
	settings!: VaultCodeSettings;
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
	settingsTab: VaultCodeSettingTab | null = null;

	async onload() {
		this.registerView(
			VIEW_TYPE_DOTFILE,
			(leaf) => new DotfileView(leaf, this),
		);

		await this.loadSettings();

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
		await this.reloadAllIgnoreRules();

		this.previousShowUnsupportedFiles =
			(this.app.vault.getConfig("showUnsupportedFiles") as boolean) ??
			false;

		this.applyShowAllFileTypes();

		this.patchWorkspaceLeaf();
		this.patchViewRegistry();
		this.patchTFileGetNewPath();
		this.patchFileManagerPrompt();

		this.registerDomEvent(window, "input", this.onInputCapture, true);

		// Watch for ignore file changes at vault root
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				void this.handleIgnoreFileEvent(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				void this.handleIgnoreFileEvent(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				void this.handleIgnoreFileEvent(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.handleIgnoreFileEvent(file.path);
				void this.handleIgnoreFileEvent(oldPath);
			}),
		);

		this.app.workspace.onLayoutReady(async () => {
			this.patchFileExplorer();
			this.applyFileExplorerFiltering();
			if (this.settings.showHiddenFiles) {
				this.patchAdapter();
				this.suppressDotfileWarning();
				await this.rescanVault();
			}

			// Seamlessly restore code editor leaves on launch or after plugin update/reload
			await this.reloadCodeEditorLeaves();
			this.updateAllLeafHeaderActions();
		});

		if (this.app.workspace.layoutReady) {
			void this.reloadCodeEditorLeaves();
		}

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.patchFileExplorer();
				this.applyFileExplorerFiltering();
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
									.setIcon("document-code");

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
	}

	private async reloadCodeEditorLeaves(): Promise<void> {
		const leavesToReload: WorkspaceLeaf[] = [];

		this.app.workspace.iterateAllLeaves((leaf) => {
			const viewState = leaf.getViewState();
			if (viewState && viewState.type === VIEW_TYPE_DOTFILE) {
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
		});
	}

	/* ── editability & extension handling ──────────────────── */

	getCustomExtensionsSet(): Set<string> {
		const raw = this.settings.customFileExtensions || "";
		const set = new Set<string>();
		for (const item of raw.split(/[\s,;]+/)) {
			const cleaned = item.trim().replace(/^\.+/, "").toLowerCase();
			if (cleaned.length > 0) {
				set.add(cleaned);
			}
		}
		return set;
	}

	isMarkdownFile(file: TFile): boolean {
		if (!file || !(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension ? file.extension.toLowerCase() : "";
		return ext === "md" || ext === "markdown";
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

		if (!isMarkdown) {
			if (existingBtn) {
				existingBtn.remove();
			}
			return;
		}

		const isCodeEditor = view instanceof DotfileView;

		if (existingBtn) {
			existingBtn.toggleClass("is-active", isCodeEditor);
			existingBtn.setAttribute(
				"aria-label",
				isCodeEditor
					? t("viewToggleTooltip")
					: t("contextEditInCodeEditor"),
			);
			return;
		}

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

		const moreBtn =
			(view as unknown as { moreOptionsButtonEl?: HTMLElement })
				.moreOptionsButtonEl ??
			actionsEl.querySelector(
				".clickable-icon[aria-label*='options' i], .clickable-icon:last-child",
			);

		if (moreBtn && moreBtn.parentElement === actionsEl) {
			actionsEl.insertBefore(btn, moreBtn);
		} else {
			actionsEl.appendChild(btn);
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
			return this.getCustomExtensionsSet().has(ext);
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
			return this.getCustomExtensionsSet().has(ext);
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
			const origType = origGetType ? origGetType(extension) : undefined;
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
				const origRegistered = origIsRegistered(extension);
				if (origRegistered && origGetType && origGetType(extension) === VIEW_TYPE_DOTFILE) {
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
					if (plugin.settings.preventAutoOpenUnsupported) {
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
				}

				// If this active leaf is a dirty code file and auto-save is disabled,
				// do NOT replace it! Open the clicked file in a new tab instead.
				if (
					plugin.settings.disableAutoSave &&
					this.view instanceof DotfileView &&
					this.view.isDirty()
				) {
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

				if (
					this.view instanceof DotfileView &&
					file instanceof TFile &&
					plugin.isMarkdownFile(file) &&
					!plugin.isFileEditable(file)
				) {
					const stateObj =
						openState && typeof openState === "object"
							? (openState as Record<string, unknown>)
							: {};
					const innerState =
						stateObj.state && typeof stateObj.state === "object"
							? { ...(stateObj.state as Record<string, unknown>) }
							: {};
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
					return;
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

		// Ensure newly supported default extensions are available even with an existing saved configuration
		if (loaded && typeof loaded.customFileExtensions === "string") {
			const existingSet = new Set(
				loaded.customFileExtensions
					.split(/[\s,;]+/)
					.map((s) => s.trim().toLowerCase().replace(/^\./, ""))
					.filter(Boolean),
			);
			const defaultList = DEFAULT_EXTENSIONS
				.split(/[\s,;]+/)
				.map((s) => s.trim().toLowerCase().replace(/^\./, ""))
				.filter(Boolean);
			let updated = false;
			for (const ext of defaultList) {
				if (!existingSet.has(ext)) {
					existingSet.add(ext);
					updated = true;
				}
			}
			if (updated) {
				this.settings.customFileExtensions = Array.from(existingSet).sort().join(", ");
				void this.saveSettings();
			}
		}

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

	/* ── show hidden files — adapter monkey-patch ──────────── */

	private adapter(): PrivateAdapter {
		return this.app.vault.adapter as unknown as PrivateAdapter;
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
				this.cachedObsidianIgnoreRules = [];
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

		// Never ignore the ignore files themselves at vault root
		if (normalized === ".obsidianignore" || normalized === ".gitignore") {
			return false;
		}

		const isDir =
			isDirectory ??
			(this.app.vault.getAbstractFileByPath(normalized) instanceof TFolder);

		const matchRule = (rule: IgnoreRule): boolean => {
			if (rule.dirOnly) {
				if (rule.exactRegex.test(normalized)) {
					return isDir;
				}
				if (rule.childRegex.test(normalized)) {
					return true;
				}
				return false;
			}
			return rule.fullRegex.test(normalized);
		};

		let ignored = false;

		// 1. Check .gitignore rules if enabled
		if (this.settings.useGitIgnore && this.cachedGitIgnoreRules.length > 0) {
			for (const rule of this.cachedGitIgnoreRules) {
				if (matchRule(rule)) {
					ignored = !rule.negate;
				}
			}
		}

		// 2. Check .obsidianignore rules if enabled (takes precedence over .gitignore)
		if (
			this.settings.useObsidianIgnore &&
			this.cachedObsidianIgnoreRules.length > 0
		) {
			for (const rule of this.cachedObsidianIgnoreRules) {
				if (matchRule(rule)) {
					ignored = !rule.negate;
				}
			}
		}

		return ignored;
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
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const view = leaf.view as unknown as {
				fileItems?: Record<
					string,
					{ el?: HTMLElement; file?: TAbstractFile }
				>;
			};
			if (view?.fileItems) {
				for (const [path, item] of Object.entries(view.fileItems)) {
					if (!item.el) continue;
					const isDir = item.file instanceof TFolder;
					const isIgnored = this.isPathIgnored(path, isDir);
					item.el.toggleClass("is-ignored-hidden", isIgnored);
				}
			}
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
				if (this.isPathIgnored(path)) {
					this.hiddenPaths.delete(path);
					return origReconcileDeletion(realPath, path);
				}

				if (isDotPath(path)) {
					// File exists on disk — re-register it instead of deleting
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

	/** Trigger a full vault rescan so all dotfiles and dotfolders across root and subfolders are revealed. */
	async rescanVault(): Promise<void> {
		const adapter = this.adapter();
		if (!adapter.listRecursive) return;

		// 1. Scan root directory first
		try {
			await adapter.listRecursive("");
		} catch {
			// Ignore read error on root
		}

		// 2. Scan all subfolders in the vault to reveal hidden dotfiles and dotfolders inside them
		const scanned = new Set<string>(["", "/"]);
		let queue = this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder && !scanned.has(f.path),
			);

		while (queue.length > 0) {
			const current = queue;
			queue = [];

			for (const folder of current) {
				if (scanned.has(folder.path)) continue;
				scanned.add(folder.path);

				if (this.isPathIgnored(folder.path, true)) {
					continue;
				}

				try {
					await adapter.listRecursive(folder.path);
				} catch {
					// Ignore unreadable folders
				}
			}

			// Check for newly discovered folders created during this pass
			const allFolders = this.app.vault
				.getAllLoadedFiles()
				.filter((f): f is TFolder => f instanceof TFolder);

			for (const f of allFolders) {
				if (!scanned.has(f.path)) {
					if (!this.isPathIgnored(f.path, true)) {
						queue.push(f);
					}
				}
			}
		}

		this.applyFileExplorerFiltering();
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

		try {
			await this.app.fileManager.renameFile(file, newPath);
		} catch {
			await this.app.vault.adapter.rename(file.path, newPath);
		}

		if (
			newName.startsWith(".") ||
			isDotPath(newPath)
		) {
			await this.registerHiddenPath(newPath);
		}
	}

	/** Enable hidden files — patch + rescan. */
	async enableHiddenFiles(): Promise<void> {
		this.patchAdapter();
		this.suppressDotfileWarning();
		await this.rescanVault();
	}

	/** Disable hidden files — hide all revealed files + restore. */
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

	/* ── inline rename & path resolution patches ────────── */

	private patchTFileGetNewPath(): void {
		if (this.originalTFileGetNewPath) return;

		const proto = TFile.prototype as unknown as {
			getNewPathAfterRename?: (newName: string) => string;
		};
		if (!proto.getNewPathAfterRename) return;

		this.originalTFileGetNewPath = proto.getNewPathAfterRename;

		proto.getNewPathAfterRename = function (
			this: TFile,
			newName: string,
		): string {
			// eslint-disable-next-line no-control-regex -- Needed to strip control characters from filename
			let cleanName = newName.replace(/[\x00-\x1F]/g, " ").trim();
			if (!cleanName) return "";

			// Check if cleanName has an explicit extension or is a dotfile
			const lastDot = cleanName.lastIndexOf(".");
			const hasExtension = lastDot > 0 && lastDot < cleanName.length - 1;
			const isDotfile = cleanName.startsWith(".");

			// If it does not have an explicit extension and is not a dotfile,
			// preserve the file's current extension (e.g. .md, .canvas, .json)
			if (!hasExtension && !isDotfile && this.extension) {
				cleanName = `${cleanName}.${this.extension}`;
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
					patchItem(this);
					plugin.applyFileExplorerFiltering();
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
		if (!fileExplorerView) return;

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

						// Display the full filename in innerEl
						this.innerEl.setText(file.name);

						// Pre-select only the basename if the file has an extension
						const dotIndex = file.name.lastIndexOf(".");
						const textNode = this.innerEl.firstChild;
						if (
							textNode &&
							textNode.nodeType === Node.TEXT_NODE &&
							textNode.textContent
						) {
							const len = textNode.textContent.length;
							const selectEnd =
								dotIndex > 0 ? Math.min(dotIndex, len) : len;
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
	plugin: VaultCodePlugin;
	updateButtonState?: () => Promise<void>;

	constructor(app: App, plugin: VaultCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
						this.display();
					});
			});

		// Group 1: File explorer
		new Setting(containerEl)
			.setName(t("settingsGroupFileExplorer"))
			.setHeading();

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
			.setName(t("settingsPreventAutoOpenName"))
			.setDesc(t("settingsPreventAutoOpenDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.preventAutoOpenUnsupported)
					.onChange(async (value) => {
						this.plugin.settings.preventAutoOpenUnsupported = value;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.preventAutoOpenUnsupported) {
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
		}

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
		// Group 2: Code editor
		new Setting(containerEl)
			.setName(t("settingsGroupCodeEditor"))
			.setHeading();

		const callout = containerEl.createDiv({
			cls: "callout hidden-files-security-callout",
		});
		callout.setAttribute("data-callout", "warning");
		const calloutContent = callout.createDiv({ cls: "callout-content" });
		calloutContent.createEl("p", {
			text: t("settingsSecurityWarning"),
		});

		new Setting(containerEl)
			.setName(t("settingsAllowEditDotfilesName"))
			.setDesc(t("settingsAllowEditDotfilesDesc"))
			.addToggle((toggle) =>
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

		let extensionsTextArea: TextAreaComponent | null = null;

		new Setting(containerEl)
			.setName(t("settingsCustomExtensionsName"))
			.setDesc(t("settingsCustomExtensionsDesc"))
			.setClass("hidden-files-extensions-setting")
			.addTextArea((text) => {
				extensionsTextArea = text;
				text
					.setPlaceholder(t("settingsCustomExtensionsPlaceholder"))
					.setValue(this.plugin.settings.customFileExtensions)
					.onChange(async (value) => {
						this.plugin.settings.customFileExtensions = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass("hidden-files-extensions-textarea");
				text.inputEl.rows = 4;
				text.inputEl.cols = 35;
			})
			.addButton((button) =>
				button
					.setButtonText(t("settingsButtonResetDefault"))
					.setTooltip(t("settingsTooltipResetExtensions"))
					.onClick(async () => {
						this.plugin.settings.customFileExtensions = DEFAULT_EXTENSIONS;
						await this.plugin.saveSettings();
						if (extensionsTextArea) {
							extensionsTextArea.setValue(DEFAULT_EXTENSIONS);
						}
						new Notice(t("noticeExtensionsReset"));
					}),
			);

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
			.setName(t("settingsDisableAutoSaveName"))
			.setDesc(t("settingsDisableAutoSaveDesc"));

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
						this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
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
						this.display();
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
}
