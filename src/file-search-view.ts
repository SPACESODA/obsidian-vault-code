import { ItemView, Keymap, Menu, TFile, setIcon, type TAbstractFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { t } from "./i18n";
import { fileSearchPattern, findMatches, looksBinary, type FileSearchMatch, type FileSearchOptions } from "./file-search";

export const FILE_SEARCH_VIEW = "vault-code-file-search";

/** Files above this size are skipped: they are almost always generated, minified or data dumps. */
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_MATCHES = 2000;
const MAX_FILE_MATCHES = 200;
/** Work this long before giving the interface a frame, so typing stays smooth in large vaults. */
const SLICE_MS = 12;

interface FileResult { file: TFile; matches: FileSearchMatch[] }
interface SearchState { query: string; options: FileSearchOptions }

/** Searches the text of every visible file in the vault, not just notes: code, configs and dotfiles too. */
export class FileSearchView extends ItemView {
	private query = "";
	private options: FileSearchOptions = { caseSensitive: false, wholeWord: false, regex: false };
	private pattern?: RegExp;
	private results = new Map<string, FileResult>();
	private collapsed = new Set<string>();
	private generation = 0;
	private searching = false;
	private limited = false;
	private inputEl?: HTMLInputElement;
	private statusEl?: HTMLElement;
	private listEl?: HTMLElement;
	private toggles = new Map<keyof FileSearchOptions, HTMLElement>();
	private inputTimer?: number;
	private renderTimer?: number;
	private changed = new Set<TFile>();
	private changeTimer?: number;

	constructor(leaf: WorkspaceLeaf, private isHidden: (file: TFile) => boolean, private isBinary: (file: TFile) => boolean) {
		super(leaf);
	}

	getViewType(): string { return FILE_SEARCH_VIEW; }
	getDisplayText(): string { return t("fileSearchTitle"); }
	getIcon(): string { return "search-code"; }

	getState(): Record<string, unknown> {
		return { query: this.query, options: { ...this.options } };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const saved = state as Partial<SearchState> | null;
		if (saved && typeof saved.query === "string") this.query = saved.query;
		if (saved?.options) {
			for (const key of ["caseSensitive", "wholeWord", "regex"] as const) {
				if (typeof saved.options[key] === "boolean") this.options[key] = saved.options[key];
			}
		}
		if (this.inputEl && this.inputEl.value !== this.query) this.inputEl.value = this.query;
		this.updateToggles();
		this.search();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("vault-code-file-search");
		const header = this.contentEl.createDiv({ cls: "vault-code-file-search-header" });
		const box = header.createDiv({ cls: "search-input-container" });
		const input = box.createEl("input", { attr: { type: "search", enterkeyhint: "search", spellcheck: "false", placeholder: t("fileSearchPlaceholder"), "aria-label": t("fileSearchTitle") } });
		input.value = this.query;
		this.inputEl = input;
		const clear = box.createDiv({ cls: "search-input-clear-button", attr: { "aria-label": t("fileSearchClear") } });
		clear.addEventListener("click", () => { input.value = ""; this.setQuery(""); input.focus(); });
		input.addEventListener("input", () => {
			if (this.inputTimer !== undefined) window.clearTimeout(this.inputTimer);
			this.inputTimer = window.setTimeout(() => { this.inputTimer = undefined; this.setQuery(input.value); }, 250);
		});
		input.addEventListener("keydown", event => {
			if (event.key !== "Enter" || event.isComposing) return;
			if (this.inputTimer !== undefined) window.clearTimeout(this.inputTimer);
			this.inputTimer = undefined;
			this.setQuery(input.value, true);
		});

		const bar = header.createDiv({ cls: "vault-code-file-search-bar" });
		this.statusEl = bar.createDiv({ cls: "vault-code-file-search-status" });
		const toggles = bar.createDiv({ cls: "vault-code-file-search-toggles" });
		const toggle = (key: keyof FileSearchOptions, icon: string, text: string, label: string) => {
			const button = toggles.createDiv({ cls: "clickable-icon vault-code-file-search-toggle", attr: { role: "button", tabindex: "0", "aria-label": label } });
			setIcon(button, icon);
			// Older icon sets may lack the icon; fall back to a short text label.
			if (!button.querySelector("svg")) button.setText(text);
			button.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); button.click(); } });
			button.addEventListener("click", () => {
				this.options[key] = !this.options[key];
				this.updateToggles();
				this.search();
				void this.app.workspace.requestSaveLayout();
			});
			this.toggles.set(key, button);
		};
		toggle("caseSensitive", "case-sensitive", "Aa", t("searchMatchCase"));
		toggle("wholeWord", "whole-word", "ab", t("searchWholeWord"));
		toggle("regex", "regex", ".*", t("searchRegex"));
		this.updateToggles();

		this.listEl = this.contentEl.createDiv({ cls: "vault-code-file-search-results" });

		const changed = (file: TAbstractFile) => { if (file instanceof TFile) this.queueFile(file); };
		this.registerEvent(this.app.vault.on("create", changed));
		this.registerEvent(this.app.vault.on("modify", changed));
		this.registerEvent(this.app.vault.on("delete", file => { if (this.results.delete(file.path)) this.scheduleRender(); }));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (this.results.delete(oldPath)) this.scheduleRender();
			changed(file);
		}));
		this.search();
		await Promise.resolve();
	}

	async onClose(): Promise<void> {
		this.generation++;
		for (const timer of [this.inputTimer, this.renderTimer, this.changeTimer]) if (timer !== undefined) window.clearTimeout(timer);
		this.inputTimer = this.renderTimer = this.changeTimer = undefined;
		await Promise.resolve();
	}

	/** Puts text in the search box (for example the editor's selection) and focuses it. */
	focusSearch(text?: string): void {
		if (text && !text.includes("\n") && this.inputEl) {
			this.inputEl.value = text;
			this.setQuery(text, true);
		}
		this.inputEl?.focus();
		this.inputEl?.select();
	}

	/** Runs the search again, for example after the ignore rules change. */
	refresh(): void {
		this.search();
	}

	private setQuery(query: string, force = false): void {
		if (query === this.query && !force) return;
		this.query = query;
		this.search();
		void this.app.workspace.requestSaveLayout();
	}

	private updateToggles(): void {
		for (const [key, button] of this.toggles) {
			button.toggleClass("is-active", this.options[key]);
			button.setAttribute("aria-pressed", String(this.options[key]));
		}
	}

	private searchable(file: TFile): boolean {
		return file.stat.size <= MAX_FILE_SIZE && !this.isBinary(file) && !this.isHidden(file);
	}

	private search(): void {
		const generation = ++this.generation;
		this.results.clear();
		this.changed.clear();
		this.limited = false;
		const pattern = fileSearchPattern(this.query, this.options);
		if (!pattern || "error" in pattern) {
			this.pattern = undefined;
			this.searching = false;
			this.render(pattern && "error" in pattern ? t("searchInvalidRegex") : "");
			return;
		}
		this.pattern = pattern;
		this.searching = true;
		this.render();
		void this.scan(generation, pattern);
	}

	private async scan(generation: number, pattern: RegExp): Promise<void> {
		const files = this.app.vault.getFiles().filter(file => this.searchable(file)).sort((a, b) => a.path.localeCompare(b.path));
		let total = 0;
		let sliceStart = performance.now();
		for (const file of files) {
			if (generation !== this.generation) return;
			const matches = await this.searchFile(file, pattern, Math.min(MAX_FILE_MATCHES, MAX_MATCHES - total));
			if (generation !== this.generation) return;
			if (matches.length) {
				this.results.set(file.path, { file, matches });
				total += matches.length;
				if (total >= MAX_MATCHES) { this.limited = true; break; }
			}
			if (performance.now() - sliceStart > SLICE_MS) {
				this.scheduleRender();
				await new Promise(resolve => window.setTimeout(resolve, 0));
				sliceStart = performance.now();
			}
		}
		if (generation !== this.generation) return;
		this.searching = false;
		this.render();
	}

	private async searchFile(file: TFile, pattern: RegExp, limit: number): Promise<FileSearchMatch[]> {
		try {
			const text = await this.app.vault.cachedRead(file);
			return looksBinary(text) ? [] : findMatches(text, pattern, limit);
		} catch {
			return [];
		}
	}

	/** Re-search files that changed while results are showing, a few at a time. */
	private queueFile(file: TFile): void {
		if (!this.pattern) return;
		this.changed.add(file);
		if (this.changeTimer !== undefined) return;
		this.changeTimer = window.setTimeout(() => {
			this.changeTimer = undefined;
			void this.updateChanged();
		}, 300);
	}

	private async updateChanged(): Promise<void> {
		const generation = this.generation;
		const pattern = this.pattern;
		const files = [...this.changed];
		this.changed.clear();
		if (!pattern) return;
		for (const file of files) {
			const searchable = this.app.vault.getAbstractFileByPath(file.path) === file && this.searchable(file);
			const matches = searchable ? await this.searchFile(file, pattern, MAX_FILE_MATCHES) : [];
			if (generation !== this.generation) return;
			if (matches.length) this.results.set(file.path, { file, matches });
			else this.results.delete(file.path);
		}
		this.render();
	}

	private scheduleRender(): void {
		if (this.renderTimer !== undefined) return;
		this.renderTimer = window.setTimeout(() => { this.renderTimer = undefined; this.render(); }, 100);
	}

	private render(error = ""): void {
		const list = this.listEl;
		const status = this.statusEl;
		if (!list || !status) return;
		const scroll = list.scrollTop;
		list.empty();
		const results = [...this.results.values()].sort((a, b) => a.file.path.localeCompare(b.file.path));
		const count = results.reduce((sum, result) => sum + result.matches.length, 0);
		status.toggleClass("is-error", Boolean(error));
		if (error) status.setText(error);
		else if (!this.query) status.setText("");
		else if (this.searching && !count) status.setText(t("fileSearchSearching"));
		else if (!count) status.setText(t("searchNoResults"));
		else {
			const summary = count === 1 ? t("fileSearchSummaryOne", 1) : results.length === 1 ? t("fileSearchSummaryOneFile", count) : t("fileSearchSummary", count, results.length);
			status.setText(this.limited ? `${summary} · ${t("fileSearchLimited", MAX_MATCHES)}` : this.searching ? `${summary} · ${t("fileSearchSearching")}` : summary);
		}
		for (const result of results) this.renderFile(list, result);
		list.scrollTop = scroll;
	}

	private renderFile(list: HTMLElement, { file, matches }: FileResult): void {
		const group = list.createDiv({ cls: "tree-item search-result vault-code-file-search-file" });
		const collapsed = this.collapsed.has(file.path);
		group.toggleClass("is-collapsed", collapsed);
		const title = group.createDiv({ cls: "tree-item-self search-result-file-title is-clickable", attr: { "aria-label": file.path, "data-tooltip-position": "right", "data-tooltip-delay": "600" } });
		const arrow = title.createDiv({ cls: "tree-item-icon collapse-icon" });
		setIcon(arrow, "right-triangle");
		arrow.toggleClass("is-collapsed", collapsed);
		const inner = title.createDiv({ cls: "tree-item-inner" });
		inner.createSpan({ cls: "vault-code-file-search-name", text: file.extension.toLowerCase() === "md" ? file.basename : file.name });
		const folder = file.parent && !file.parent.isRoot() ? file.parent.path : "";
		if (folder) inner.createSpan({ cls: "vault-code-file-search-folder", text: folder });
		title.createDiv({ cls: "tree-item-flair-outer" }).createSpan({ cls: "tree-item-flair", text: String(matches.length) });
		title.addEventListener("click", event => {
			if (Keymap.isModEvent(event)) { void this.openMatch(file, matches[0], event); return; }
			if (this.collapsed.has(file.path)) this.collapsed.delete(file.path);
			else this.collapsed.add(file.path);
			this.render();
		});
		title.addEventListener("contextmenu", event => {
			event.preventDefault();
			const menu = new Menu();
			this.app.workspace.trigger("file-menu", menu, file, "search-view", this.leaf);
			menu.showAtMouseEvent(event);
		});
		if (collapsed) return;
		const children = group.createDiv({ cls: "search-result-file-matches vault-code-file-search-matches" });
		// Size the line-number column for this file's largest number, so the text lines up.
		children.setCssProps({ "--vault-code-line-digits": String(String((matches[matches.length - 1]?.line ?? 0) + 1).length) });
		for (const match of matches) {
			const row = children.createDiv({ cls: "search-result-file-match tappable vault-code-file-search-match" });
			row.createSpan({ cls: "vault-code-file-search-line", text: String(match.line + 1) });
			const text = row.createSpan({ cls: "vault-code-file-search-text" });
			text.appendText(match.text.slice(0, match.start));
			text.createSpan({ cls: "search-result-file-matched-text", text: match.text.slice(match.start, match.end) });
			text.appendText(match.text.slice(match.end));
			row.addEventListener("click", event => void this.openMatch(file, match, event));
			row.addEventListener("auxclick", event => { if (event.button === 1) void this.openMatch(file, match, event, true); });
		}
	}

	private async openMatch(file: TFile, match: FileSearchMatch | undefined, event: MouseEvent, newTab = false): Promise<void> {
		const leaf = this.app.workspace.getLeaf(newTab ? "tab" : Keymap.isModEvent(event));
		if (!match) { await leaf.openFile(file); return; }
		const eState: Record<string, unknown> = { vaultCodeMatch: { from: match.from, to: match.to, line: match.line } };
		if (file.extension.toLowerCase() === "md") {
			// Obsidian's own search hands notes their text and match, so the note scrolls to and highlights it.
			eState.match = { content: await this.app.vault.cachedRead(file), matches: [[match.from, match.to]] };
		}
		const alreadyOpen = (leaf.view as { file?: TFile | null }).file === file;
		await leaf.openFile(file, { active: true, eState });
		// Obsidian skips the match when the tab already shows this file, so hand it over directly.
		if (alreadyOpen) leaf.setEphemeralState(eState);
	}
}
