import { App, Modal, TFile, setIcon, Menu, Notice } from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";

export class AIChatHistoryModal extends Modal {
	private plugin: VaultCodePlugin;
	private onSelectChat: (file: TFile) => void;
	private files: TFile[] = [];
	private filteredFiles: TFile[] = [];
	private searchQuery = "";

	private listContainerEl!: HTMLElement;
	private countEl!: HTMLElement;

	constructor(app: App, plugin: VaultCodePlugin, onSelectChat: (file: TFile) => void) {
		super(app);
		this.plugin = plugin;
		this.onSelectChat = onSelectChat;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("vault-code-history-modal");

		// Header
		const headerEl = contentEl.createDiv({ cls: "vault-code-history-header" });
		const titleEl = headerEl.createEl("h3", {
			cls: "vault-code-history-title",
			text: t("aiChatHistoryTitle"),
		});
		const titleIcon = titleEl.createSpan({ cls: "vault-code-history-title-icon" });
		setIcon(titleIcon, "history");
		titleEl.prepend(titleIcon);

		// Search box
		const searchWrapper = contentEl.createDiv({ cls: "vault-code-history-search-wrapper" });
		const searchIcon = searchWrapper.createSpan({ cls: "vault-code-history-search-icon" });
		setIcon(searchIcon, "search");

		const searchInput = searchWrapper.createEl("input", {
			type: "search",
			cls: "vault-code-history-search-input",
			attr: {
				placeholder: t("aiChatHistorySearchPlaceholder"),
				spellcheck: "false",
			},
		});

		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value.trim().toLowerCase();
			this.filterAndRender();
		});

		// Scrollable list container
		this.listContainerEl = contentEl.createDiv({ cls: "vault-code-history-list" });

		// Footer
		const footerEl = contentEl.createDiv({ cls: "vault-code-history-footer" });
		this.countEl = footerEl.createDiv({ cls: "vault-code-history-count" });

		const cleanupBtn = footerEl.createEl("button", {
			cls: "vault-code-history-cleanup-btn",
			text: t("aiChatHistoryCleanupBtn"),
		});
		cleanupBtn.addEventListener("click", (e) => this.showCleanupMenu(e));

		// Load files
		await this.loadFiles();
		window.setTimeout(() => searchInput.focus(), 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async loadFiles(): Promise<void> {
		const folder = this.plugin.settings.aiChatFolder || "Agent chats";
		this.files = await this.plugin.aiStorage.listChatNotes(folder);
		this.filterAndRender();
	}

	private filterAndRender(): void {
		if (!this.searchQuery) {
			this.filteredFiles = [...this.files];
		} else {
			this.filteredFiles = this.files.filter((f) =>
				f.basename.toLowerCase().includes(this.searchQuery) ||
				f.name.toLowerCase().includes(this.searchQuery),
			);
		}

		this.renderList();
		this.updateCount();
	}

	private renderList(): void {
		this.listContainerEl.empty();

		if (this.filteredFiles.length === 0) {
			const emptyEl = this.listContainerEl.createDiv({
				cls: "vault-code-history-empty",
			});
			const iconSpan = emptyEl.createDiv({ cls: "vault-code-history-empty-icon" });
			setIcon(iconSpan, "messages-square");
			emptyEl.createEl("p", { text: t("aiChatHistoryNoChats") });
			return;
		}

		for (const file of this.filteredFiles) {
			this.renderItem(file);
		}
	}

	private renderItem(file: TFile): void {
		const itemEl = this.listContainerEl.createDiv({
			cls: "vault-code-history-item",
		});

		const mainEl = itemEl.createDiv({ cls: "vault-code-history-item-main" });

		const titleWrapper = mainEl.createDiv({ cls: "vault-code-history-item-title" });
		const fileIcon = titleWrapper.createSpan({ cls: "vault-code-history-item-icon" });
		setIcon(fileIcon, "message-square");
		titleWrapper.createSpan({ text: this.formatTitle(file.basename) });

		const metaEl = mainEl.createDiv({ cls: "vault-code-history-item-meta" });
		metaEl.createSpan({
			cls: "vault-code-history-item-date",
			text: this.formatDate(file.stat.mtime),
		});

		// Clicking row selects and loads this chat
		mainEl.addEventListener("click", () => {
			this.onSelectChat(file);
			this.close();
		});

		// Hover action buttons
		const actionsEl = itemEl.createDiv({ cls: "vault-code-history-item-actions" });

		// 1. Open as Note button
		const openNoteBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-history-action-btn",
			attr: { "aria-label": t("aiChatOpenAsNote") },
		});
		setIcon(openNoteBtn, "file-text");
		openNoteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.openAsNote(file);
		});

		// 2. Delete button
		const deleteBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-history-action-btn mod-warning",
			attr: { "aria-label": t("aiChatDeleteChat") },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.deleteChat(file, itemEl);
		});
	}

	private formatTitle(basename: string): string {
		// Strip date prefix if present (e.g. 2026-10-24-my-chat -> my-chat)
		const stripped = basename.replace(/^\d{4}-\d{2}-\d{2}-/, "");
		// Capitalize words
		return stripped
			.split("-")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}

	private formatDate(mtime: number): string {
		const now = Date.now();
		const diffMs = now - mtime;
		const diffMins = Math.floor(diffMs / (60 * 1000));
		const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
		const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

		if (diffMins < 1) return t("aiChatTimeJustNow");
		if (diffMins < 60) return t("aiChatTimeMinsAgo").replace("{0}", String(diffMins));
		if (diffHours < 24) return t("aiChatTimeHoursAgo").replace("{0}", String(diffHours));
		if (diffDays === 1) return t("aiChatTimeYesterday");
		if (diffDays < 7) return t("aiChatTimeDaysAgo").replace("{0}", String(diffDays));

		const date = new Date(mtime);
		return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}

	private updateCount(): void {
		this.countEl.setText(
			t("aiChatHistoryCount").replace("{0}", String(this.filteredFiles.length)),
		);
	}

	private openAsNote(file: TFile): void {
		const leaf = this.app.workspace.getLeaf(false);
		void leaf.openFile(file);
		this.close();
	}

	private async deleteChat(file: TFile, itemEl: HTMLElement): Promise<void> {
		try {
			await this.plugin.aiStorage.deleteChatNote(file);
			this.files = this.files.filter((f) => f.path !== file.path);
			this.filteredFiles = this.filteredFiles.filter((f) => f.path !== file.path);
			itemEl.remove();
			this.updateCount();
			new Notice(t("aiChatNoticeDeleted").replace("{0}", file.basename));

			if (this.filteredFiles.length === 0) {
				this.renderList();
			}
		} catch (e) {
			console.error("Vault Code: Failed to delete chat", e);
			new Notice(t("aiChatNoticeDeleteFailed"));
		}
	}

	private showCleanupMenu(event: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("aiChatCleanupOlder7d"));
			item.setIcon("calendar");
			item.onClick(() => {
				void this.executeBatchCleanup("7d");
			});
		});

		menu.addItem((item) => {
			item.setTitle(t("aiChatCleanupOlder30d"));
			item.setIcon("calendar");
			item.onClick(() => {
				void this.executeBatchCleanup("30d");
			});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle(t("aiChatCleanupAll"));
			item.setIcon("trash-2");
			item.setWarning(true);
			item.onClick(() => {
				void this.executeBatchCleanup("all");
			});
		});

		menu.showAtMouseEvent(event);
	}

	private async executeBatchCleanup(rule: "7d" | "30d" | "90d" | "all"): Promise<void> {
		const folder = this.plugin.settings.aiChatFolder || "Agent chats";
		try {
			const count = await this.plugin.aiStorage.cleanupOldChats(folder, rule);
			new Notice(t("aiChatNoticeCleanedCount").replace("{0}", String(count)));
			await this.loadFiles();
		} catch (e) {
			console.error("Vault Code: Failed to clean up chats", e);
			new Notice(t("aiChatNoticeDeleteFailed"));
		}
	}
}
