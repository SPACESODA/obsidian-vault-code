import { App, Modal, TFile, setIcon, Notice } from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";
import { createCustomMenu } from "./custom-menu";


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

		// Search box (no magnifying glass icon)
		const searchWrapper = contentEl.createDiv({ cls: "vault-code-history-search-wrapper" });

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
		});
		const cleanIcon = cleanupBtn.createSpan({ cls: "vault-code-history-cleanup-icon" });
		setIcon(cleanIcon, "trash-2");
		cleanupBtn.createSpan({ text: t("aiChatHistoryCleanupBtn") });
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
		const folder = this.plugin.settings.aiChatFolder || "agent-chats";
		this.files = await this.plugin.aiStorage.listChatNotes(folder);
		this.filterAndRender();
	}

	private filterAndRender(): void {
		if (!this.searchQuery) {
			this.filteredFiles = [...this.files];
		} else {
			this.filteredFiles = this.files.filter((f) => {
				const title = this.getDisplayTitle(f).toLowerCase();
				return (
					title.includes(this.searchQuery) ||
					f.basename.toLowerCase().includes(this.searchQuery)
				);
			});
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

		const mainEl = itemEl.createDiv({ cls: "vault-code-history-item-main", attr: { role: "button", tabindex: "0" } });

		const fileIcon = mainEl.createSpan({ cls: "vault-code-history-item-icon" });
		setIcon(fileIcon, "message-square");

		const textEl = mainEl.createDiv({ cls: "vault-code-history-item-text" });
		textEl.createDiv({
			cls: "vault-code-history-item-title",
			text: this.getDisplayTitle(file),
		});

		const metaEl = textEl.createDiv({ cls: "vault-code-history-item-meta" });
		metaEl.createSpan({
			cls: "vault-code-history-item-date",
			text: this.formatDate(file),
		});

		// Clicking row selects and loads this chat
		const select = () => {
			this.onSelectChat(file);
			this.close();
		};
		mainEl.addEventListener("click", select);
		mainEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
		});

		// Hover action buttons
		const actionsEl = itemEl.createDiv({ cls: "vault-code-history-item-actions" });

		// 1. Open as Note button (always open as new tab)
		const openNoteBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-history-action-btn",
			attr: { "aria-label": t("aiChatOpenAsNote") },
		});
		setIcon(openNoteBtn, "file-text");
		openNoteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.openAsNote(file);
		});

		// 2. Delete button (red background, white icon)
		const deleteBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-history-action-btn vault-code-btn-danger",
			attr: { "aria-label": t("aiChatDeleteChat") },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.deleteChat(file, itemEl);
		});
	}

	private getDisplayTitle(file: TFile): string {
		const cache = this.app.metadataCache.getFileCache(file);
		const fmTitle = typeof cache?.frontmatter?.title === "string" ? cache.frontmatter.title.trim() : "";
		if (fmTitle) return fmTitle;

		const cleaned = file.basename.replace(/--(\d{2})(\d{2})(\d{2})$/, " $1:$2:$3");
		return cleaned || t("aiChatNewChat");
	}

	private formatDate(file: TFile): string {
		return this.plugin.aiStorage.formatDateTime(new Date(this.plugin.aiStorage.getLastChatTime(file))).replace(" ", "  ");
	}

	private updateCount(): void {
		this.countEl.setText(
			t("aiChatHistoryCount").replace("{0}", String(this.filteredFiles.length)),
		);
	}

	private openAsNote(file: TFile): void {
		const leaf = this.app.workspace.getLeaf("tab");
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
		const menu = createCustomMenu();

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
		const folder = this.plugin.settings.aiChatFolder || "agent-chats";
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
