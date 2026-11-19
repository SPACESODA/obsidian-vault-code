import { App, Modal, Notice, TFile, TFolder, setIcon } from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";

export const IMAGE_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "tiff", "tif",
]);

export const AUDIO_EXTENSIONS = new Set([
	"mp3", "wav", "m4a", "flac", "aac", "ogg", "wma", "opus",
]);

export const VIDEO_EXTENSIONS = new Set([
	"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
]);

export type MediaType = "all" | "image" | "audio" | "video";

export interface UnlinkedMediaItem {
	file: TFile;
	type: "image" | "audio" | "video";
	size: number;
	mtime: number;
}

export function formatBytes(bytes: number): string {
	if (bytes <= 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1))} ${sizes[i]}`;
}

export function findUnlinkedMedia(
	app: App,
	isPathIgnored: (path: string, isDirectory?: boolean) => boolean,
	folder?: TFolder | null,
): UnlinkedMediaItem[] {
	const linked = new Set<string>();
	const resolved = app.metadataCache.resolvedLinks;
	if (resolved) {
		for (const source in resolved) {
			const targets = resolved[source];
			if (targets) {
				for (const target in targets) {
					linked.add(target);
				}
			}
		}
	}

	const prefix = folder && !folder.isRoot() ? folder.path + "/" : "";
	const items: UnlinkedMediaItem[] = [];

	for (const file of app.vault.getFiles()) {
		if (isPathIgnored(file.path, false)) continue;
		if (prefix && !file.path.startsWith(prefix)) continue;

		const ext = file.extension.toLowerCase();
		let type: "image" | "audio" | "video" | null = null;
		if (IMAGE_EXTENSIONS.has(ext)) type = "image";
		else if (AUDIO_EXTENSIONS.has(ext)) type = "audio";
		else if (VIDEO_EXTENSIONS.has(ext)) type = "video";

		if (!type) continue;
		if (linked.has(file.path)) continue;

		items.push({
			file,
			type,
			size: file.stat?.size ?? 0,
			mtime: file.stat?.mtime ?? 0,
		});
	}

	// Default sort: newest first
	items.sort((a, b) => b.mtime - a.mtime);
	return items;
}

class ConfirmDeleteModal extends Modal {
	constructor(
		app: App,
		private titleText: string,
		private messageText: string,
		private onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("vault-code-confirm-modal");

		contentEl.createEl("h3", { text: this.titleText });
		contentEl.createEl("p", { text: this.messageText, cls: "mod-warning" });

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = buttonContainer.createEl("button", {
			text: t("modalButtonCancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const deleteBtn = buttonContainer.createEl("button", {
			cls: "mod-warning mod-cta",
			text: t("unlinkedMediaDelete"),
		});
		deleteBtn.addEventListener("click", () => {
			deleteBtn.disabled = true;
			void (async () => {
				try {
					await this.onConfirm();
				} finally {
					this.close();
				}
			})();
		});

		deleteBtn.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class UnlinkedMediaModal extends Modal {
	private plugin: VaultCodePlugin;
	private scopeFolder: TFolder | null;
	private items: UnlinkedMediaItem[] = [];
	private filteredItems: UnlinkedMediaItem[] = [];
	private selectedPaths = new Set<string>();

	private activeFilter: MediaType = "all";
	private searchQuery = "";

	private statsEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private filterPillsEl!: HTMLElement;
	private selectAllCheckbox!: HTMLInputElement;
	private selectedCountEl!: HTMLElement;
	private deleteSelectedBtn!: HTMLButtonElement;
	private listContainerEl!: HTMLElement;

	constructor(app: App, plugin: VaultCodePlugin, scopeFolder?: TFolder | null) {
		super(app);
		this.plugin = plugin;
		this.scopeFolder = scopeFolder ?? null;
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("vault-code-unlinked-window");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("vault-code-unlinked-modal");

		// Header
		const headerEl = contentEl.createDiv({ cls: "vault-code-unlinked-header" });
		const titleWrapper = headerEl.createDiv({ cls: "vault-code-unlinked-title-wrapper" });

		const titleEl = titleWrapper.createEl("h3", {
			cls: "vault-code-unlinked-title",
			text: t("unlinkedMediaTitle"),
		});
		const titleIcon = titleEl.createSpan({ cls: "vault-code-unlinked-title-icon" });
		setIcon(titleIcon, "file-search");
		titleEl.prepend(titleIcon);

		const scopeBadge = titleWrapper.createSpan({
			cls: "vault-code-unlinked-scope-badge",
			text: this.scopeFolder && !this.scopeFolder.isRoot()
				? this.scopeFolder.path
				: t("unlinkedMediaScopeVault"),
		});
		if (this.scopeFolder && !this.scopeFolder.isRoot()) {
			scopeBadge.setAttribute("title", this.scopeFolder.path);
		}

		this.statsEl = headerEl.createDiv({ cls: "vault-code-unlinked-stats" });

		// Search & Filter Toolbar
		const toolbarEl = contentEl.createDiv({ cls: "vault-code-unlinked-toolbar" });

		const searchWrapper = toolbarEl.createDiv({ cls: "vault-code-unlinked-search-wrapper" });
		this.searchInput = searchWrapper.createEl("input", {
			type: "search",
			cls: "vault-code-unlinked-search-input",
			attr: {
				placeholder: t("unlinkedMediaSearchPlaceholder"),
				spellcheck: "false",
				autocomplete: "off",
				autocorrect: "off",
				autocapitalize: "off",
				"aria-label": t("unlinkedMediaSearchPlaceholder"),
			},
		});

		this.searchInput.addEventListener("input", () => {
			this.searchQuery = this.searchInput.value.trim().toLowerCase();
			this.applyFilterAndRender();
		});

		this.filterPillsEl = toolbarEl.createDiv({ cls: "vault-code-unlinked-filter-pills" });

		// Batch action bar
		const batchBarEl = contentEl.createDiv({ cls: "vault-code-unlinked-batch-bar" });

		const selectAllLabel = batchBarEl.createEl("label", { cls: "vault-code-unlinked-select-all" });
		this.selectAllCheckbox = selectAllLabel.createEl("input", {
			type: "checkbox",
			cls: "vault-code-unlinked-checkbox",
		});
		selectAllLabel.createSpan({ text: t("unlinkedMediaSelectAll") });

		this.selectAllCheckbox.addEventListener("change", () => {
			const shouldSelect = this.selectAllCheckbox.checked;
			for (const item of this.filteredItems) {
				if (shouldSelect) {
					this.selectedPaths.add(item.file.path);
				} else {
					this.selectedPaths.delete(item.file.path);
				}
			}
			this.updateBatchSelectionUI();
			this.syncRowCheckboxes();
		});

		const batchRight = batchBarEl.createDiv({ cls: "vault-code-unlinked-batch-right" });
		this.selectedCountEl = batchRight.createDiv({ cls: "vault-code-unlinked-selected-count" });

		this.deleteSelectedBtn = batchRight.createEl("button", {
			cls: "vault-code-unlinked-delete-btn is-hidden",
			text: t("unlinkedMediaDeleteSelected"),
		});
		this.deleteSelectedBtn.disabled = true;

		this.deleteSelectedBtn.addEventListener("click", () => {
			this.confirmDeleteSelected();
		});

		// Scrollable list container
		this.listContainerEl = contentEl.createDiv({ cls: "vault-code-unlinked-list" });

		this.loadItems();
	}

	private loadItems(): void {
		this.items = findUnlinkedMedia(
			this.app,
			(p, isDir) => this.plugin.isPathIgnored(p, isDir),
			this.scopeFolder,
		);
		this.selectedPaths.clear();
		this.renderFilterPills();
		this.applyFilterAndRender();
	}

	private renderFilterPills(): void {
		this.filterPillsEl.empty();

		const counts = {
			all: this.items.length,
			image: this.items.filter((i) => i.type === "image").length,
			audio: this.items.filter((i) => i.type === "audio").length,
			video: this.items.filter((i) => i.type === "video").length,
		};

		const availableCategories =
			(counts.image > 0 ? 1 : 0) +
			(counts.audio > 0 ? 1 : 0) +
			(counts.video > 0 ? 1 : 0);

		if (availableCategories <= 1) {
			this.filterPillsEl.addClass("is-hidden");
			this.activeFilter = "all";
			return;
		}

		this.filterPillsEl.removeClass("is-hidden");
		const filters: { id: MediaType; label: string; count: number }[] = [
			{ id: "all", label: t("unlinkedMediaFilterAll"), count: counts.all },
		];
		if (counts.image > 0) {
			filters.push({ id: "image", label: t("unlinkedMediaFilterImages"), count: counts.image });
		}
		if (counts.audio > 0) {
			filters.push({ id: "audio", label: t("unlinkedMediaFilterAudio"), count: counts.audio });
		}
		if (counts.video > 0) {
			filters.push({ id: "video", label: t("unlinkedMediaFilterVideo"), count: counts.video });
		}

		for (const f of filters) {
			const pill = this.filterPillsEl.createEl("button", {
				cls: `vault-code-unlinked-pill${this.activeFilter === f.id ? " is-active" : ""}`,
				text: `${f.label} (${f.count})`,
			});
			pill.addEventListener("click", () => {
				if (this.activeFilter === f.id) return;
				this.activeFilter = f.id;
				this.filterPillsEl
					.querySelectorAll(".vault-code-unlinked-pill")
					.forEach((el) => el.classList.remove("is-active"));
				pill.classList.add("is-active");
				this.applyFilterAndRender();
			});
		}
	}

	private applyFilterAndRender(): void {
		this.filteredItems = this.items.filter((item) => {
			if (this.activeFilter !== "all" && item.type !== this.activeFilter) return false;
			if (this.searchQuery) {
				const q = this.searchQuery;
				const nameMatch = item.file.name.toLowerCase().includes(q);
				const pathMatch = item.file.path.toLowerCase().includes(q);
				if (!nameMatch && !pathMatch) return false;
			}
			return true;
		});

		// Calculate total bytes of filtered
		const totalBytes = this.filteredItems.reduce((acc, curr) => acc + curr.size, 0);
		this.statsEl.setText(t("unlinkedMediaStats", this.filteredItems.length, formatBytes(totalBytes)));

		this.updateBatchSelectionUI();
		this.renderList();
	}

	private updateBatchSelectionUI(): void {
		const selectedCount = this.selectedPaths.size;
		let selectedBytes = 0;
		for (const item of this.items) {
			if (this.selectedPaths.has(item.file.path)) {
				selectedBytes += item.size;
			}
		}

		if (selectedCount > 0) {
			this.selectedCountEl.setText(
				`${selectedCount} / ${this.items.length} (${formatBytes(selectedBytes)})`,
			);
			this.deleteSelectedBtn.disabled = false;
			this.deleteSelectedBtn.addClass("mod-warning");
			this.deleteSelectedBtn.removeClass("is-hidden");
			this.deleteSelectedBtn.setText(`${t("unlinkedMediaDeleteSelected")} (${selectedCount})`);
		} else {
			this.selectedCountEl.setText("");
			this.deleteSelectedBtn.disabled = true;
			this.deleteSelectedBtn.removeClass("mod-warning");
			this.deleteSelectedBtn.addClass("is-hidden");
			this.deleteSelectedBtn.setText(t("unlinkedMediaDeleteSelected"));
		}

		if (this.filteredItems.length > 0) {
			const allFilteredSelected = this.filteredItems.every((i) =>
				this.selectedPaths.has(i.file.path),
			);
			const someFilteredSelected = this.filteredItems.some((i) =>
				this.selectedPaths.has(i.file.path),
			);
			this.selectAllCheckbox.checked = allFilteredSelected;
			this.selectAllCheckbox.indeterminate =
				!allFilteredSelected && someFilteredSelected;
			this.selectAllCheckbox.disabled = false;
		} else {
			this.selectAllCheckbox.checked = false;
			this.selectAllCheckbox.indeterminate = false;
			this.selectAllCheckbox.disabled = true;
		}
	}

	private syncRowCheckboxes(): void {
		const checkboxes = this.listContainerEl.querySelectorAll<HTMLInputElement>(
			".vault-code-unlinked-item-checkbox",
		);
		checkboxes.forEach((cb) => {
			const path = cb.dataset.path;
			if (path) {
				cb.checked = this.selectedPaths.has(path);
			}
		});
	}

	private renderList(): void {
		this.listContainerEl.empty();

		if (this.filteredItems.length === 0) {
			const emptyEl = this.listContainerEl.createDiv({ cls: "vault-code-unlinked-empty" });
			const icon = emptyEl.createDiv({ cls: "vault-code-unlinked-empty-icon" });
			setIcon(icon, "sparkles");
			emptyEl.createDiv({
				cls: "vault-code-unlinked-empty-title",
				text: t("unlinkedMediaEmpty"),
			});
			emptyEl.createDiv({
				cls: "vault-code-unlinked-empty-desc",
				text: t("unlinkedMediaEmptyDesc"),
			});
			return;
		}

		for (const item of this.filteredItems) {
			const row = this.listContainerEl.createDiv({ cls: "vault-code-unlinked-item" });

			// Checkbox
			const checkbox = row.createEl("input", {
				type: "checkbox",
				cls: "vault-code-unlinked-checkbox vault-code-unlinked-item-checkbox",
			});
			checkbox.dataset.path = item.file.path;
			checkbox.checked = this.selectedPaths.has(item.file.path);
			checkbox.addEventListener("change", (e) => {
				e.stopPropagation();
				if (checkbox.checked) {
					this.selectedPaths.add(item.file.path);
				} else {
					this.selectedPaths.delete(item.file.path);
				}
				this.updateBatchSelectionUI();
			});

			// Thumbnail / Icon
			const thumbBox = row.createDiv({ cls: "vault-code-unlinked-thumb" });
			if (item.type === "image") {
				const img = thumbBox.createEl("img", {
					cls: "vault-code-unlinked-thumb-img",
					attr: {
						src: this.app.vault.getResourcePath(item.file),
						alt: item.file.name,
						loading: "lazy",
					},
				});
				img.addEventListener("error", () => {
					img.remove();
					setIcon(thumbBox, "image");
				});
			} else if (item.type === "audio") {
				setIcon(thumbBox, "music");
			} else {
				setIcon(thumbBox, "film");
			}

			// Main text / metadata
			const textEl = row.createDiv({ cls: "vault-code-unlinked-item-text" });
			const titleEl = textEl.createDiv({
				cls: "vault-code-unlinked-item-title",
				text: item.file.name,
			});
			titleEl.setAttribute("title", item.file.path);

			const metaEl = textEl.createDiv({ cls: "vault-code-unlinked-item-meta" });
			const folderPath = item.file.parent && !item.file.parent.isRoot()
				? item.file.parent.path
				: "/";
			metaEl.createSpan({ cls: "vault-code-unlinked-meta-path", text: folderPath });
			metaEl.createSpan({ cls: "vault-code-unlinked-meta-dot", text: "•" });
			metaEl.createSpan({ cls: "vault-code-unlinked-meta-size", text: formatBytes(item.size) });

			if (item.mtime > 0) {
				metaEl.createSpan({ cls: "vault-code-unlinked-meta-dot", text: "•" });
				const dateStr = new Date(item.mtime).toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
				});
				metaEl.createSpan({ cls: "vault-code-unlinked-meta-date", text: dateStr });
			}


			// Action buttons on the right
			const actionsEl = row.createDiv({ cls: "vault-code-unlinked-item-actions" });

			// Open
			const openBtn = actionsEl.createEl("button", {
				cls: "clickable-icon vault-code-unlinked-action-btn",
				attr: { "aria-label": t("unlinkedMediaOpen"), title: t("unlinkedMediaOpen") },
			});
			setIcon(openBtn, "eye");
			openBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.openMediaFile(item.file);
			});

			// Reveal
			const revealBtn = actionsEl.createEl("button", {
				cls: "clickable-icon vault-code-unlinked-action-btn",
				attr: { "aria-label": t("unlinkedMediaReveal"), title: t("unlinkedMediaReveal") },
			});
			setIcon(revealBtn, "folder");
			revealBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.revealFile(item.file);
			});

			// Delete single
			const deleteBtn = actionsEl.createEl("button", {
				cls: "clickable-icon vault-code-unlinked-action-btn vault-code-unlinked-delete-icon-btn",
				attr: { "aria-label": t("unlinkedMediaDelete"), title: t("unlinkedMediaDelete") },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.confirmDeleteSingle(item.file);
			});
		}
	}

	private openMediaFile(file: TFile): void {
		const leaf = this.app.workspace.getLeaf(true);
		void leaf.openFile(file);
	}

	private revealFile(file: TFile): void {
		const leaves = this.app.workspace.getLeavesOfType("file-explorer");
		if (leaves.length > 0) {
			const view = leaves[0]?.view as { revealInFolder?: (f: TFile) => void } | undefined;
			view?.revealInFolder?.(file);
		}
	}

	private confirmDeleteSingle(file: TFile): void {
		new ConfirmDeleteModal(
			this.app,
			t("unlinkedMediaDelete"),
			t("unlinkedMediaDeleteSingleConfirm", file.name),
			async () => {
				await this.deleteFiles([file]);
			},
		).open();
	}

	private confirmDeleteSelected(): void {
		const filesToDelete = this.items
			.filter((i) => this.selectedPaths.has(i.file.path))
			.map((i) => i.file);
		if (filesToDelete.length === 0) return;

		const totalBytes = filesToDelete.reduce((acc, curr) => acc + (curr.stat?.size ?? 0), 0);

		new ConfirmDeleteModal(
			this.app,
			t("unlinkedMediaDeleteConfirmTitle"),
			t("unlinkedMediaDeleteConfirmMsg", filesToDelete.length, formatBytes(totalBytes)),
			async () => {
				await this.deleteFiles(filesToDelete);
			},
		).open();
	}

	private async deleteFiles(files: TFile[]): Promise<void> {
		let count = 0;
		for (const file of files) {
			try {
				await this.app.fileManager.trashFile(file);
				count++;
			} catch (err) {
				console.error("Vault Code: Failed to trash file", file.path, err);
			}
		}

		new Notice(t("unlinkedMediaDeletedNotice", count));
		this.loadItems();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
