import { App, Component, FuzzySuggestModal, Menu, Modal, Notice, Platform, TFolder, View, setIcon, type TFile } from "obsidian";
import { t, type TranslationKey } from "./i18n";
import { createCustomMenu } from "./custom-menu";
import { captureWebPage, pageHtmlFilename, WebSaveError, type ExportGuest, type PageDebugger, type WebSaveKind } from "./web-page-export";

interface PageView extends View {
	title?: string;
	moreOptionsButtonEl?: HTMLElement;
	addAction?: (icon: string, title: string, callback: (event: MouseEvent) => void) => HTMLElement;
	saveAsMarkdown?: () => Promise<TFile | null | undefined>;
}
interface GuestElement extends HTMLElement, ExportGuest { getWebContentsId?: () => number }
interface RemoteContents { webContents: { fromId(id: number): { debugger?: unknown } | undefined } }
function hasMethods<T>(value: unknown, methods: string[]): value is T {
	return value !== null && typeof value === "object" && methods.every(key => key in value && typeof (value as Record<string, unknown>)[key] === "function");
}
function inspectorFor(guest: GuestElement): PageDebugger | undefined {
	if (!Platform.isDesktop || !guest.getWebContentsId) return undefined;
	const win = guest.win as unknown as { require?: (name: string) => unknown };
	let remote: unknown;
	try { remote = win.require?.("@electron/remote"); } catch { /* Older Electron may expose remote. */ }
	if (!remote) {
		try { const electron = win.require?.("electron"); if (electron && typeof electron === "object" && "remote" in electron) remote = electron.remote; } catch { /* Source export can be unavailable. */ }
	}
	if (!remote || typeof remote !== "object" || !("webContents" in remote) || !hasMethods<RemoteContents["webContents"]>(remote.webContents, ["fromId"])) return undefined;
	try {
		const debuggerApi = remote.webContents.fromId(guest.getWebContentsId())?.debugger;
		return hasMethods<PageDebugger>(debuggerApi, ["isAttached", "attach", "detach", "sendCommand"]) ? debuggerApi : undefined;
	} catch { return undefined; }
}
function pageGuest(view: View): GuestElement | null {
	const guest = view.containerEl.querySelector<GuestElement>("webview");
	return guest && hasMethods<ExportGuest>(guest, ["getURL", "executeJavaScript"]) ? guest : null;
}
function menuKey(kind: WebSaveKind): TranslationKey { return kind === "dom" ? "webSaveDom" : "webSaveSource"; }
function errorMessage(error: unknown): string {
	if (!(error instanceof WebSaveError)) return t("webSaveFailed");
	const keys: Record<WebSaveError["code"], TranslationKey> = { unavailable: "webSaveUnavailable", source: "webSaveSourceUnavailable", changed: "webSaveChanged", large: "webSaveTooLarge", cancelled: "webSaveUnavailable" };
	return t(keys[error.code]);
}

class SaveFolderModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private choose: (folder: TFolder) => void) { super(app); this.setPlaceholder(t("webSaveFolder")); }
	getItems(): TFolder[] { return this.app.vault.getAllFolders(true); }
	getItemText(folder: TFolder): string { return folder.isRoot() ? this.app.vault.getName() : folder.path; }
	onChooseItem(folder: TFolder): void { this.choose(folder); }
}

export class SaveWebPageModal extends Modal {
	private controller = new AbortController();
	private closed = false;
	private folder: TFolder;
	private busy = false;
	private folderPicker?: SaveFolderModal;
	private focusTimer?: number;
	constructor(app: App, private kind: WebSaveKind, private title: string, folder: TFolder,
		private savePage: (path: string, signal: AbortSignal) => Promise<TFile>, private finished: (file: TFile) => void) {
		super(app); this.folder = folder;
	}
	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		const root = this.contentEl;
		root.addClass("hidden-files-form-modal");
		root.createEl("h3", { text: t(menuKey(this.kind)) });
		root.createEl("p", { cls: "vault-code-web-save-desc", text: t(this.kind === "dom" ? "webSaveDomDesc" : "webSaveSourceDesc") });
		const folder = root.createEl("button", { cls: "hidden-files-modal-destination vault-code-web-save-folder", attr: { type: "button", "aria-label": t("webSaveFolder") } });
		const icon = folder.createSpan({ cls: "hidden-files-modal-dest-icon" }); setIcon(icon, "folder");
		const label = folder.createSpan({ cls: "hidden-files-modal-dest-path" });
		const showFolder = () => label.setText(this.folder.isRoot() ? this.app.vault.getName() : this.folder.path);
		showFolder();
		folder.addEventListener("click", () => {
			if (this.busy) return;
			this.folderPicker = new SaveFolderModal(this.app, selected => { if (!this.closed) { this.folder = selected; showFolder(); } });
			this.folderPicker.open();
		});
		const input = root.createDiv({ cls: "hidden-files-modal-input-container" }).createEl("input", { type: "text", cls: "hidden-files-modal-input", value: pageHtmlFilename(this.title), attr: { "aria-label": t("webSaveFilename") } });
		const error = root.createDiv({ cls: "hidden-files-modal-error", attr: { role: "alert" } }); error.hide();
		const buttons = root.createDiv({ cls: "hidden-files-modal-buttons" });
		buttons.createEl("button", { text: t("modalButtonCancel") }).addEventListener("click", () => this.close());
		const save = buttons.createEl("button", { cls: "mod-cta", text: t("saveChanges") });
		const submit = async () => {
			if (this.busy || this.closed) return;
			const name = input.value.trim();
			if (!name) { error.setText(t("modalCreateFileEmptyError")); error.show(); return; }
			if (/[\p{Cc}/\\:*?"<>|]/u.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
				error.setText(t("webSaveInvalidName")); error.show(); return;
			}
			const filename = /\.html?$/i.test(name) ? name : name + ".html";
			if (new TextEncoder().encode(filename).length > 255) { error.setText(t("webSaveInvalidName")); error.show(); return; }
			const path = this.folder.isRoot() ? filename : `${this.folder.path}/${filename}`;
			this.busy = true; input.disabled = true; folder.disabled = true; save.disabled = true; save.setText(t("webSaveSaving")); error.hide();
			try {
				if (await this.app.vault.adapter.exists(path)) { error.setText(t("modalCreateFileExistsError", filename)); error.show(); return; }
				if (this.closed) return;
				const file = await this.savePage(path, this.controller.signal);
				if (!this.closed) { this.finished(file); this.close(); }
			} catch (failure: unknown) {
				if (!this.closed) { error.setText(errorMessage(failure)); error.show(); }
			} finally {
				this.busy = false;
				if (!this.closed) { input.disabled = false; folder.disabled = false; save.disabled = false; save.setText(t("saveChanges")); }
			}
		};
		save.addEventListener("click", () => { void submit(); });
		input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void submit(); } });
		input.focus();
		// Apply selection after Obsidian finishes its own modal autofocus.
		const initialName = input.value;
		this.focusTimer = this.contentEl.win.setTimeout(() => {
			this.focusTimer = undefined;
			if (this.closed || this.busy || this.folderPicker || input.value !== initialName) return;
			input.focus(); input.setSelectionRange(0, input.value.length - 5);
		}, 50);
	}
	onClose(): void {
		this.closed = true;
		if (this.focusTimer !== undefined) this.contentEl.win.clearTimeout(this.focusTimer);
		this.focusTimer = undefined;
		this.controller.abort(); this.folderPicker?.close(); this.contentEl.empty();
	}
}

/** Optional Web Viewer integration; no dependency on AI settings or private core plugins. */
export class WebPageSave extends Component {
	private active = false;
	private hooks = new Map<View, { restore: () => void }>();
	private dialogs = new Set<SaveWebPageModal>();
	private headerButtons = new Map<View, HTMLElement>();
	private saveMenu?: Menu;
	constructor(private app: App) { super(); }
	onload(): void {
		if (!Platform.isDesktop) return;
		this.active = true;
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refresh()));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refresh()));
		this.refresh();
	}
	private refresh(): void {
		if (!this.active) return;
		const views = new Set(this.app.workspace.getLeavesOfType("webviewer").map(leaf => leaf.view));
		for (const [view, hook] of this.hooks) if (!views.has(view)) {
			hook.restore(); this.hooks.delete(view);
			this.headerButtons.get(view)?.remove(); this.headerButtons.delete(view);
		}
		for (const view of views) {
			this.ensureSaveButton(view);
			if (this.hooks.has(view)) continue;
			const original = view.onPaneMenu.bind(view), ownDescriptor = Object.getOwnPropertyDescriptor(view, "onPaneMenu");
			const wrapper: View["onPaneMenu"] = (menu, source) => {
				original(menu, source);
				if (this.active && Platform.isDesktop) this.addMenu(menu, view);
			};
			view.onPaneMenu = wrapper;
			this.hooks.set(view, { restore: () => {
				if (view.onPaneMenu !== wrapper) return;
				if (ownDescriptor) Object.defineProperty(view, "onPaneMenu", ownDescriptor);
				else Reflect.deleteProperty(view, "onPaneMenu");
			} });
		}
	}
	private ensureSaveButton(view: PageView): void {
		let button = this.headerButtons.get(view);
		if (!button?.isConnected && typeof view.addAction === "function") {
			button?.remove();
			button = view.addAction("arrow-down-to-line", t("saveChanges"), event => {
				event.preventDefault(); event.stopPropagation();
				if (button) this.showSaveMenu(view, button);
			});
			button.addClass("vault-code-header-web-save-btn");
			this.headerButtons.set(view, button);
		}
		if (!button) return;
		button.setAttribute("aria-label", t("saveChanges"));
		const more = view.moreOptionsButtonEl;
		if (more?.parentElement && button.parentElement === more.parentElement && button.nextSibling !== more) more.parentElement.insertBefore(button, more);
	}
	private showSaveMenu(view: PageView, button: HTMLElement): void {
		if (!this.active || !Platform.isDesktop || !view.containerEl.isConnected) return;
		this.saveMenu?.hide();
		const menu = createCustomMenu();
		this.saveMenu = menu;
		this.addMenu(menu, view, true);
		menu.onHide(() => { if (this.saveMenu === menu) this.saveMenu = undefined; });
		const rect = button.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, button.doc);
	}
	private async saveNote(view: PageView): Promise<void> {
		if (!this.active || !Platform.isDesktop || !view.containerEl.isConnected || typeof view.saveAsMarkdown !== "function") return;
		try {
			const file = await view.saveAsMarkdown();
			if (file && this.active) await this.app.workspace.getLeaf("tab").openFile(file);
		} catch { if (this.active) new Notice(t("webSaveFailed")); }
	}

	private addMenu(menu: Menu, view: PageView, includeNative = false): void {
		const guest = pageGuest(view);
		let available = false;
		try { available = !!guest && /^https?:$/.test(new URL(guest.getURL()).protocol); } catch { /* Initial or closed viewer. */ }
		for (const kind of ["dom", "source"] as const) menu.addItem(item => item.setTitle(t(menuKey(kind))).setIcon(kind === "dom" ? "file-down" : "file-code")
			.setSection("action").setDisabled(!available).onClick(() => this.open(view, kind)));
		if (includeNative) menu.addItem(item => item.setTitle(t("webSaveToVault")).setIcon("file-text").setSection("action")
			.setDisabled(typeof view.saveAsMarkdown !== "function").onClick(() => { void this.saveNote(view); }));
	}
	private open(view: PageView, kind: WebSaveKind): void {
		if (!this.active || !Platform.isDesktop) return;
		const guest = pageGuest(view);
		if (!guest) return;
		let expected: string;
		try { expected = guest.getURL(); if (!/^https?:$/.test(new URL(expected).protocol) || !view.containerEl.isConnected) return; }
		catch { new Notice(t("webSaveUnavailable")); return; }
		const dialog = new SaveWebPageModal(this.app, kind, view.title || new URL(expected).hostname, this.app.vault.getRoot(), async (path, signal) => {
			if (!this.active || !view.containerEl.isConnected || pageGuest(view) !== guest || guest.getURL() !== expected) throw new WebSaveError("changed");
			const page = await captureWebPage(guest, kind, signal, kind === "source" ? inspectorFor(guest) : undefined);
			if (signal.aborted || !this.active) throw new WebSaveError("cancelled");
			if (!view.containerEl.isConnected || pageGuest(view) !== guest || guest.getURL() !== expected) throw new WebSaveError("changed");
			return this.app.vault.create(path, page.html);
		}, file => { this.dialogs.delete(dialog); new Notice(t("noticeCreated", file.path)); });
		this.dialogs.add(dialog);
		const onClose = dialog.onClose.bind(dialog);
		dialog.onClose = () => { this.dialogs.delete(dialog); onClose(); };
		dialog.open();
	}
	onunload(): void {
		this.active = false;
		this.saveMenu?.hide(); this.saveMenu = undefined;
		for (const button of this.headerButtons.values()) button.remove();
		this.headerButtons.clear();
		for (const dialog of this.dialogs) dialog.close();
		this.dialogs.clear();
		for (const hook of this.hooks.values()) hook.restore();
		this.hooks.clear();
	}
}
