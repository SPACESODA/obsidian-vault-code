import { App, FileSystemAdapter, Modal, Notice, Platform, TFolder, type TAbstractFile, type Menu, setIcon } from "obsidian";
import { ExternalFolders, ExternalFolderError, type ExternalFolderCode, type FolderFS, type FolderPath } from "./external-folders";
import { t, type TranslationKey } from "./i18n";

interface IndexedAdapter { getRealPath?(path: string): string; files?: Record<string, { type?: string; realpath?: string } | undefined> }
/** Use Obsidian's existing index, with no synchronous filesystem reads or startup traversal. */
export function indexedShortcutTarget(adapter: IndexedAdapter, path: string): string | null {
	const entry = adapter.files?.[path];
	if (!path || path === "/" || entry?.type !== "folder" || !entry.realpath || !adapter.getRealPath) return null;
	const parts = path.split("/");
	const name = parts.pop()!;
	const parent = adapter.getRealPath(parts.join("/"));
	const normalize = (value: string) => { const normalized = value.replace(/\\/g, "/").replace(/\/$/, ""); return Platform.isWin ? normalized.toLowerCase() : normalized; };
	return normalize(entry.realpath) !== normalize([parent, name].filter(Boolean).join("/")) ? entry.realpath : null;
}
const errors: Record<ExternalFolderCode, TranslationKey> = {
	ignored: "externalFolderIgnored", name: "externalFolderInvalidName", location: "externalFolderInvalidLocation", loop: "externalFolderLoop",
	exists: "externalFolderExists", unavailable: "externalFolderUnavailable",
	cancelled: "externalFolderBusy", large: "externalFolderTooLarge", shortcut: "externalFolderNotShortcut", busy: "externalFolderBusy",
};
function errorText(error: unknown): string {
	if (error instanceof ExternalFolderError) return t(errors[error.code]);
	if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") return t("externalFolderExists");
	return t("externalFolderUnavailable");
}
function isRuntime<T>(value: unknown, methods: string[]): value is T {
	if (typeof value !== "object" || value === null) return false;
	const runtime = value as Record<string, unknown>;
	return methods.every(method => typeof runtime[method] === "function");
}

interface DirectoryDialog { showOpenDialog(options: { title: string; properties: ["openDirectory"] }): Promise<{ canceled: boolean; filePaths: string[] }> }
function nativeDialog(value: unknown): DirectoryDialog | null {
	if (typeof value !== "object" || value === null || !("dialog" in value)) return null;
	const dialog = value.dialog;
	return typeof dialog === "object" && dialog !== null && "showOpenDialog" in dialog && typeof dialog.showOpenDialog === "function" ? dialog as DirectoryDialog : null;
}

export class ExternalFolderFeature {
	private service?: Promise<ExternalFolders>;
	private active = true;
	private pickerOpen = false;
	private targets = new Map<string, string | null>();
	private probeQueue: string[] = [];
	private probing = new Set<string>();
	private versions = new Map<string, number>();
	private probesRunning = 0;
	private decorationTimer: number | null = null;
	private blocked = new Set<string>();
	private invalidTargets = new Set<string>();
	constructor(private app: App, private ignored: (path: string) => boolean, private changed: () => void) {}

	private core(): Promise<ExternalFolders> {
		if (Platform.isDesktop) {
			if (!(this.app.vault.adapter instanceof FileSystemAdapter)) return Promise.reject(new ExternalFolderError("unavailable"));
			return this.service ??= (async () => {
				const win = window as unknown as { require?: (name: string) => unknown };
				const fs: unknown = win.require ? win.require("fs/promises") : await import("fs/promises");
				const path: unknown = win.require ? win.require("path") : await import("path");
				if (!isRuntime<FolderFS>(fs, ["realpath", "lstat", "stat", "opendir", "symlink", "unlink", "readlink"]) ||
					!isRuntime<FolderPath>(path, ["resolve", "relative", "isAbsolute", "join", "basename", "dirname"])) throw new ExternalFolderError("unavailable");
				const adapter = this.app.vault.adapter as FileSystemAdapter;
				return new ExternalFolders(fs, path, adapter.getBasePath(), this.app.vault.configDir, Platform.isWin, this.ignored);
			})().catch((error: unknown) => { this.service = undefined; throw error; });
		}
		return Promise.reject(new ExternalFolderError("unavailable"));
	}

	private indexed(path: string): string | null { return this.targets.get(path) ?? indexedShortcutTarget(this.app.vault.adapter as unknown as IndexedAdapter, path); }

	invalidate(path: string): void {
		if (!this.targets.has(path) && !this.probing.has(path)) return;
		for (const key of new Set([...this.targets.keys(), ...this.probing])) {
			if (key === path || key.startsWith(path + "/")) {
				this.targets.delete(key); this.invalidTargets.delete(key); this.versions.set(key, (this.versions.get(key) || 0) + 1);
			}
		}
		this.reconcileConflicts();
	}
	isBlocked(path: string): boolean { return [...this.blocked].some(root => path === root || path.startsWith(root + "/")); }
	private reconcileConflicts(): void {
		const blocked = new Set(this.invalidTargets);
		const changed = [...new Set([...this.blocked, ...blocked])].some(path => this.blocked.has(path) !== blocked.has(path));
		this.blocked = blocked;
		if (changed && this.active) this.scheduleDecorations();
	}
	private scheduleDecorations(): void {
		if (this.decorationTimer === null) this.decorationTimer = window.setTimeout(() => {
			this.decorationTimer = null; if (this.active) this.changed();
		}, 16);
	}
	private discover(path: string): void {
		if (!path || path === "/" || this.targets.has(path) || this.probing.has(path) || !this.active) return;
		this.probing.add(path); this.probeQueue.push(path); this.pumpProbes();
	}
	private pumpProbes(): void {
		while (this.active && this.probesRunning < 4 && this.probeQueue.length) {
			const path = this.probeQueue.shift()!;
			const version = this.versions.get(path) || 0;
			this.probesRunning++;
			void this.core().then(core => core.shortcutTarget(path)).then(target => {
				if (!this.active || version !== (this.versions.get(path) || 0)) return;
				this.targets.set(path, target);
				this.reconcileConflicts();
				if (target) this.scheduleDecorations();
			}).catch((error: unknown) => {
				if (this.active && version === (this.versions.get(path) || 0) && error instanceof ExternalFolderError && error.code === "loop") {
					this.targets.set(path, null); this.invalidTargets.add(path); this.reconcileConflicts();
				}
			}).finally(() => {
				this.probesRunning--; this.probing.delete(path); this.pumpProbes();
			});
		}
	}

	menu(menu: Menu, folder: TFolder): void {
		if (!Platform.isDesktop) return;
		menu.addItem(item => item.setTitle(t("externalFolderAdd")).setIcon("folder-symlink").setSection("action").onClick(() => { void this.choose(folder.path); }));
	}

	async choose(parent: string): Promise<void> {
		if (!this.active || !Platform.isDesktop || this.pickerOpen) return;
		this.pickerOpen = true;
		try {
			const target = await this.pickFolder();
			if (!target || !this.active) return;
			const initialName = target.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
			new AddExternalFolderModal(this.app, parent, target, initialName, async (name, signal) => {
				if (!this.active) throw new ExternalFolderError("unavailable");
				let restore = () => {};
				try {
					const result = await (await this.core()).add(parent, name, target, signal, (logical, real) => { if (!this.active) throw new ExternalFolderError("unavailable"); restore = this.guardIndexing(logical, real); });
					this.targets.set(result.path, result.target);
					const refreshed = await this.refresh(result.path, true);
					new Notice(t(refreshed ? "externalFolderAdded" : "externalFolderRefresh"));
				} finally { restore(); }
			}).open();
		} catch (error: unknown) { new Notice(errorText(error)); }
		finally { this.pickerOpen = false; }
	}

	private async pickFolder(): Promise<string | null> {
		const win = window as unknown as { require?: (name: string) => unknown };
		let dialog: DirectoryDialog | null = null;
		try { dialog = nativeDialog(win.require?.("@electron/remote")); } catch { /* Older Electron exposes remote on electron. */ }
		if (!dialog) {
			const electron = win.require?.("electron");
			if (typeof electron === "object" && electron !== null && "remote" in electron) dialog = nativeDialog(electron.remote);
		}
		if (!dialog) throw new ExternalFolderError("unavailable");
		const selection = await dialog.showOpenDialog({ title: t("externalFolderAdd"), properties: ["openDirectory"] });
		return selection.canceled ? null : selection.filePaths[0] || null;
	}

	private guardIndexing(logical: string, target: string): () => void {
		const adapter = this.app.vault.adapter as unknown as { listRecursive?: (path: string) => Promise<void> };
		const original = adapter.listRecursive;
		if (!original) return () => {};
		const normalizedTarget = target.replace(/\\/g, "/").replace(/\/$/, "");
		const ignored = this.ignored;
		let active = true;
		const guarded = function (this: typeof adapter, path: string): Promise<void> {
			const normalized = path.replace(/\\/g, "/");
			const virtual = normalized === normalizedTarget || normalized.startsWith(normalizedTarget + "/")
				? logical + normalized.slice(normalizedTarget.length) : normalized;
			return active && ignored(virtual) ? Promise.resolve() : original.call(this, path);
		};
		adapter.listRecursive = guarded;
		return () => { active = false; if (adapter.listRecursive === guarded) adapter.listRecursive = original; };
	}

	private async refresh(path: string, added = false): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter as unknown as {
				reconcileInternalFile?: (path: string) => Promise<void>;
				startWatchPath?: (path: string) => Promise<void>;
				stopWatchPath?: (path: string) => void;
			};
			if (!adapter.reconcileInternalFile) return false;
			await adapter.reconcileInternalFile(path);
			if (added && !this.app.vault.getAbstractFileByPath(path) && adapter.startWatchPath && adapter.stopWatchPath) {
				// Native reconciliation skips overlapping targets unless this logical path has its own watcher.
				// Only retry links just validated and added by this feature, never arbitrary folders or deletions.
				try {
					await adapter.startWatchPath(path);
					await adapter.reconcileInternalFile(path);
				} finally {
					if (!this.app.vault.getAbstractFileByPath(path)) adapter.stopWatchPath(path);
				}
			}
			this.changed();
			return this.app.vault.getAbstractFileByPath(path) !== null;
		} catch { return false; }
	}

	/** Native Delete/Trash on a shortcut root must not walk into the original directory. */
	guardDeletion(): () => void {
		const vault = this.app.vault;
		// eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve identity for restoration; invoked with .call(vault).
		const originalDelete = vault.delete;
		// eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve identity for restoration; invoked with .call(vault).
		const originalTrash = vault.trash;
		const adapter = vault.adapter as unknown as { listRecursive?: (path: string) => Promise<void> };
		const originalScan = adapter.listRecursive;
		const shouldSkip = (path: string) => this.active && this.isBlocked(path);
		const guardedScan = function (this: typeof adapter, path: string): Promise<void> {
			return shouldSkip(path) ? Promise.resolve() : originalScan!.call(this, path);
		};
		if (originalScan) adapter.listRecursive = guardedScan;
		const remove = async (file: TAbstractFile): Promise<boolean> => {
			if (!this.active || !(file instanceof TFolder)) return false;
			const core = await this.core();
			if (!await core.isShortcut(file.path)) {
				if (this.indexed(file.path)) throw new ExternalFolderError("shortcut");
				return false;
			}
			await core.remove(file.path);
			await this.refresh(file.path);
			return true;
		};
		const guardedDelete: typeof vault.delete = async (file, force) => { if (!await remove(file)) await originalDelete.call(vault, file, force); };
		const guardedTrash: typeof vault.trash = async (file, system) => { if (!await remove(file)) await originalTrash.call(vault, file, system); };
		vault.delete = guardedDelete; vault.trash = guardedTrash;
		return () => {
			this.active = false;
			if (this.decorationTimer !== null) window.clearTimeout(this.decorationTimer);
			this.probeQueue = [];
			if (adapter.listRecursive === guardedScan) adapter.listRecursive = originalScan;
			if (vault.delete === guardedDelete) vault.delete = originalDelete;
			if (vault.trash === guardedTrash) vault.trash = originalTrash;
		};
	}

	decorate(row: Element, path: string, directory: boolean): void {
		if (directory && !row.classList.contains("is-ignored-hidden")) this.discover(path);
		const title = row.querySelector(":scope > [data-path]");
		const marker = title?.querySelector(".vault-code-external-folder-marker");
		if (!directory || !this.indexed(path)) { marker?.remove(); return; }
		if (marker) {
			marker.classList.add("nav-file-tag");
			if (marker.textContent !== "SYMLINK") marker.textContent = "SYMLINK";
		} else if (title) {
			title.createSpan({ text: "SYMLINK", cls: "nav-file-tag vault-code-external-folder-marker", attr: { "aria-label": t("externalFolderBadge") } });
		}
	}
}

class AddExternalFolderModal extends Modal {
	private controller = new AbortController();
	constructor(app: App, private parent: string, private target: string, private name: string, private add: (name: string, signal: AbortSignal) => Promise<void>) { super(app); }
	onOpen(): void {
		this.containerEl.addClass("hidden-files-modal-container");
		this.modalEl.addClass("hidden-files-modal-window");
		this.contentEl.addClass("hidden-files-form-modal", "vault-code-external-folder-modal");
		const heading = this.contentEl.createEl("h3", { text: t("externalFolderAdd") });
		heading.id = `vault-code-external-title-${crypto.randomUUID()}`;
		this.modalEl.setAttribute("aria-labelledby", heading.id);
		const location = this.contentEl.createDiv({ cls: "hidden-files-modal-destination" });
		const icon = location.createSpan({ cls: "hidden-files-modal-dest-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, "folder");
		location.createSpan({ text: this.parent === "/" || !this.parent ? "/" : this.parent, cls: "hidden-files-modal-dest-path" });
		const wrapper = this.contentEl.createDiv({ cls: "hidden-files-modal-input-container" });
		const input = wrapper.createEl("input", {
			type: "text",
			value: this.name,
			cls: "hidden-files-modal-input",
			placeholder: t("externalFolderName"),
			attr: { "aria-label": t("externalFolderName"), spellcheck: "false" },
		});
		const target = this.contentEl.createDiv({ cls: "hidden-files-modal-destination vault-code-external-folder-target" });
		const linkIcon = target.createSpan({ cls: "hidden-files-modal-dest-icon", attr: { "aria-hidden": "true" } });
		setIcon(linkIcon, "folder-symlink");
		target.createSpan({ text: this.target, cls: "hidden-files-modal-dest-path" });
		const status = this.contentEl.createDiv({ cls: "hidden-files-modal-error", attr: { role: "alert" } });
		const actions = this.contentEl.createDiv({ cls: "hidden-files-modal-buttons" });
		const cancel = actions.createEl("button", { text: t("modalButtonCancel") });
		cancel.addEventListener("click", () => this.close());
		const add = actions.createEl("button", { cls: "mod-cta", text: t("externalFolderConfirm") });
		add.addEventListener("click", () => {
			if (add.disabled) return;
			add.disabled = input.disabled = true;
			add.setText(t("externalFolderAdding")); status.empty();
			void this.add(input.value, this.controller.signal).then(() => this.close()).catch((error: unknown) => {
				status.setText(errorText(error)); add.disabled = input.disabled = false; add.setText(t("externalFolderConfirm"));
			});
		});
		input.addEventListener("keydown", event => {
			if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); add.click(); }
		});
		input.addEventListener("input", () => status.empty());
		input.focus(); input.select();
	}
	onClose(): void { this.controller.abort(); this.contentEl.empty(); }
}
