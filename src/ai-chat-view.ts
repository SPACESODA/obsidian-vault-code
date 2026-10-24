import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	MarkdownRenderer,
	Notice,
	TFile,
	ToggleComponent,
	debounce,
} from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";
import type { AgyModelInfo, AgyProcessHandle } from "./ai-service";
import { AIChatHistoryModal } from "./ai-history-modal";
import { createCustomMenu } from "./custom-menu";

export const VIEW_TYPE_AI_CHAT = "vault-code-ai-chat";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

export class AIChatView extends ItemView {
	private plugin: VaultCodePlugin;
	private messages: ChatMessage[] = [];
	private conversationId?: string;
	private selectedModel: string;
	private chatScope: "active-note" | "vault";
	private mode: "safe" | "edit";
	private isGenerating = false;
	private activeProcessHandle: AgyProcessHandle | null = null;
	private availableModels: AgyModelInfo[] = [];

	// Active chat file in vault
	private currentChatFile: TFile | null = null;
	private currentChatTitle = "Untitled Chat";

	// Context pinning state
	private pinnedContextFile: TFile | null = null;
	private isContextPinned = false;
	private contextExcluded = false;

	// UI Elements
	private titleWrapperEl!: HTMLElement;
	private headerTitleEl!: HTMLElement;
	private isEditingTitle = false;
	private messagesContainerEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtnEl!: HTMLElement;
	private modelBtnEl!: HTMLElement;
	private modeBtnEl!: HTMLElement;
	private vaultToggle: ToggleComponent | null = null;
	private vaultToggleWrapper!: HTMLElement;
	private contextChipEl!: HTMLElement;
	private contextPinBtnEl!: HTMLElement;
	private openNoteBtnEl!: HTMLElement;

	// Streaming render queue
	private currentStreamingMsgEl: HTMLElement | null = null;
	private currentTypingIndicatorEl: HTMLElement | null = null;
	private renderRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultCodePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.selectedModel = plugin.settings.aiModel || "gemini-3.8-flash-high";
		this.chatScope = plugin.settings.aiScope || "active-note";
		this.mode = plugin.settings.aiMode || "edit";
	}

	getViewType(): string {
		return VIEW_TYPE_AI_CHAT;
	}

	getDisplayText(): string {
		return t("aiChatViewTitle");
	}

	getIcon(): string {
		return "sparkles";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("vault-code-ai-chat-view");

		this.buildHeader(container);
		this.buildMessageList(container);
		this.buildFooter(container);

		// Fetch available models asynchronously
		void this.plugin.aiService.getAvailableModels().then((models) => {
			this.availableModels = models;
			this.updateModelBtnLabel();
		});

		// Listen to active note changes to update context chip
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateContextChip();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.updateContextChip();
			}),
		);

		this.updateContextChip();
	}

	async onClose(): Promise<void> {
		this.stopGenerating();
		if (this.renderRafId !== null) {
			window.cancelAnimationFrame(this.renderRafId);
			this.renderRafId = null;
		}
	}

	private buildHeader(container: HTMLElement): void {
		const headerEl = container.createDiv({ cls: "vault-code-chat-header" });

		this.titleWrapperEl = headerEl.createDiv({ cls: "vault-code-chat-header-title" });
		const iconEl = this.titleWrapperEl.createSpan({ cls: "vault-code-chat-header-icon" });
		setIcon(iconEl, "sparkles");
		this.headerTitleEl = this.titleWrapperEl.createSpan({
			cls: "vault-code-chat-header-title-text",
			text: t("aiChatViewTitle"),
		});
		this.headerTitleEl.addEventListener("click", () => {
			this.startEditingChatTitle();
		});

		const actionsEl = headerEl.createDiv({ cls: "vault-code-chat-header-actions" });

		// 1. Open as Note button (hidden until note is created)
		this.openNoteBtnEl = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-chat-header-btn",
			attr: { "aria-label": t("aiChatOpenAsNote") },
		});
		setIcon(this.openNoteBtnEl, "file-text");
		this.openNoteBtnEl.addEventListener("click", () => this.openActiveChatAsNote());
		this.openNoteBtnEl.hide();

		// 2. History button
		const historyBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-chat-header-btn",
			attr: { "aria-label": t("aiChatHistoryTitle") },
		});
		setIcon(historyBtn, "history");
		historyBtn.addEventListener("click", () => this.openHistoryModal());

		// 3. New Chat button
		const newChatBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-chat-header-btn",
			attr: { "aria-label": t("aiChatNewChat") },
		});
		setIcon(newChatBtn, "plus");
		newChatBtn.addEventListener("click", () => this.startNewChat());
	}

	private startEditingChatTitle(): void {
		if (this.isEditingTitle || !this.currentChatFile) return;
		this.isEditingTitle = true;

		const currentTitle = this.currentChatTitle;
		this.headerTitleEl.hide();

		const input = this.titleWrapperEl.createEl("input", {
			type: "text",
			cls: "vault-code-chat-title-input",
			value: currentTitle,
		});

		input.focus();
		input.select();

		let finished = false;
		const finish = async (save: boolean) => {
			if (finished) return;
			finished = true;
			this.isEditingTitle = false;

			const newTitle = input.value.trim();
			input.remove();
			this.headerTitleEl.show();

			if (save && newTitle && newTitle !== currentTitle && this.currentChatFile) {
				this.currentChatTitle = newTitle;
				this.headerTitleEl.setText(newTitle);
				this.headerTitleEl.title = `${newTitle} (${t("aiChatRenameChat")})`;
				try {
					await this.plugin.aiStorage.updateChatTitle(this.currentChatFile, newTitle);
				} catch (err) {
					console.error("Vault Code: Failed to update chat title", err);
				}
			}
		};

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void finish(true);
			} else if (e.key === "Escape") {
				e.preventDefault();
				void finish(false);
			}
		});

		input.addEventListener("blur", () => {
			void finish(true);
		});
	}

	private buildMessageList(container: HTMLElement): void {
		this.messagesContainerEl = container.createDiv({
			cls: "vault-code-chat-messages",
		});
		this.renderMessages();
	}

	private buildFooter(container: HTMLElement): void {
		const footerEl = container.createDiv({ cls: "vault-code-chat-footer" });
		const inputCard = footerEl.createDiv({ cls: "vault-code-chat-input-card" });

		// Context chip inside the card (top)
		this.contextChipEl = inputCard.createDiv({ cls: "vault-code-chat-context-chip" });

		// Message entry field row (middle) with send button at top-right corner
		const inputRow = inputCard.createDiv({ cls: "vault-code-chat-input-row" });

		this.inputEl = inputRow.createEl("textarea", {
			cls: "vault-code-chat-input",
			attr: {
				placeholder: t("aiChatPlaceholder"),
				rows: "1",
			},
		});

		this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleSubmit();
			}
		});

		this.inputEl.addEventListener(
			"input",
			debounce(() => {
				this.autoResizeTextarea();
				this.updateSendButtonState();
			}, 50, true),
		);

		// Send / Stop button inside top-right corner of message entry field
		this.sendBtnEl = inputRow.createEl("button", {
			cls: "vault-code-chat-send-btn",
			attr: { "aria-label": t("aiChatSend") },
		});
		setIcon(this.sendBtnEl, "send");
		this.sendBtnEl.addEventListener("click", () => {
			if (this.isGenerating) {
				this.stopGenerating();
			} else {
				void this.handleSubmit();
			}
		});

		// Bottom controls inside the card
		const cardBottom = inputCard.createDiv({ cls: "vault-code-chat-card-bottom" });

		// Row 1: Model Selection
		const topRow = cardBottom.createDiv({ cls: "vault-code-chat-bottom-row-top" });
		this.modelBtnEl = topRow.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-model",
			attr: { "aria-label": t("settingsAIDefaultModelName") },
		});
		this.modelBtnEl.addEventListener("click", (e) => this.showModelMenu(e));

		// Row 2: Mode pill and Entire Vault toggle
		const bottomRow = cardBottom.createDiv({ cls: "vault-code-chat-bottom-row-bottom" });
		this.modeBtnEl = bottomRow.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-mode",
			attr: { "aria-label": t("settingsAIDefaultModeName") },
		});
		this.modeBtnEl.addEventListener("click", (e) => this.showModeMenu(e));

		// Entire Vault toggle (default off)
		this.vaultToggleWrapper = bottomRow.createDiv({ cls: "vault-code-chat-toggle-vault" });
		const toggleLabel = this.vaultToggleWrapper.createSpan({
			cls: "vault-code-toggle-label",
			text: "Entire Vault",
		});
		const toggle = new ToggleComponent(this.vaultToggleWrapper)
			.setValue(this.chatScope === "vault")
			.onChange((checked) => {
				this.chatScope = checked ? "vault" : "active-note";
				this.contextExcluded = false;
				this.updateContextChip();
			});
		this.vaultToggle = toggle;
		toggleLabel.addEventListener("click", () => {
			const newVal = !toggle.getValue();
			toggle.setValue(newVal);
			this.chatScope = newVal ? "vault" : "active-note";
			this.contextExcluded = false;
			this.updateContextChip();
		});

		this.updateModelBtnLabel();
		this.updateModeBtnLabel();
		this.updateVaultToggleState();
		this.updateContextChip();
	}

	private updateVaultToggleState(): void {
		if (this.vaultToggle !== null) {
			this.vaultToggle.setValue(this.chatScope === "vault");
		}
	}

	private autoResizeTextarea(): void {
		if (!this.inputEl) return;
		this.inputEl.setCssProps({ "--chat-input-height": "auto" });
		const newHeight = Math.min(Math.max(this.inputEl.scrollHeight, 28), 160);
		this.inputEl.setCssProps({ "--chat-input-height": `${newHeight}px` });
	}

	private updateModelBtnLabel(): void {
		if (!this.modelBtnEl) return;
		this.modelBtnEl.empty();
		const iconSpan = this.modelBtnEl.createSpan({ cls: "vault-code-pill-icon" });
		setIcon(iconSpan, "sparkles");

		const found = this.availableModels.find((m) => m.id === this.selectedModel);
		const label = found ? found.displayName : this.selectedModel;
		this.modelBtnEl.createSpan({ cls: "vault-code-pill-label", text: label });

		const chevronSpan = this.modelBtnEl.createSpan({ cls: "vault-code-pill-chevron" });
		setIcon(chevronSpan, "chevron-down");
	}

	private updateModeBtnLabel(): void {
		if (!this.modeBtnEl) return;
		this.modeBtnEl.empty();
		const iconSpan = this.modeBtnEl.createSpan({ cls: "vault-code-pill-icon" });

		if (this.mode === "safe") {
			setIcon(iconSpan, "shield");
			this.modeBtnEl.createSpan({ cls: "vault-code-pill-label", text: t("aiChatModeSafe") });
			this.modeBtnEl.removeClass("is-mode-edit");
			this.modeBtnEl.addClass("is-mode-safe");
		} else {
			setIcon(iconSpan, "zap");
			this.modeBtnEl.createSpan({ cls: "vault-code-pill-label", text: t("aiChatModeEdit") });
			this.modeBtnEl.removeClass("is-mode-safe");
			this.modeBtnEl.addClass("is-mode-edit");
		}

		const chevronSpan = this.modeBtnEl.createSpan({ cls: "vault-code-pill-chevron" });
		setIcon(chevronSpan, "chevron-down");
	}

	private updateContextChip(): void {
		if (!this.contextChipEl) return;
		this.contextChipEl.empty();

		const activeFile = (this.isContextPinned && this.pinnedContextFile)
			? this.pinnedContextFile
			: this.app.workspace.getActiveFile();

		const hasAttachedNote = !this.contextExcluded && this.chatScope === "active-note" && activeFile;

		if (hasAttachedNote && activeFile) {
			this.contextChipEl.show();
			this.contextChipEl.removeClass("is-detached");

			const iconSpan = this.contextChipEl.createSpan({ cls: "vault-code-context-chip-icon" });
			setIcon(iconSpan, "file-code");

			const nameSpan = this.contextChipEl.createSpan({
				cls: "vault-code-context-chip-name",
				text: activeFile.name,
			});
			nameSpan.title = activeFile.path;

			// Pin button
			this.contextPinBtnEl = this.contextChipEl.createEl("button", {
				cls: `clickable-icon vault-code-context-chip-btn vault-code-context-pin-btn${this.isContextPinned ? " is-pinned" : ""}`,
				attr: {
					"aria-label": this.isContextPinned
						? t("aiChatContextUnpin")
						: t("aiChatContextPin"),
				},
			});
			setIcon(this.contextPinBtnEl, "pin");
			this.contextPinBtnEl.addEventListener("click", (e) => {
				e.stopPropagation();
				this.togglePinContext(activeFile);
			});

			// Remove button
			const removeBtn = this.contextChipEl.createEl("button", {
				cls: "clickable-icon vault-code-context-chip-btn vault-code-context-remove-btn",
				attr: { "aria-label": t("aiChatContextRemove") },
			});
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.removeContext();
			});
		} else {
			// Detached state: render 1-click re-attach button if an active note exists
			const currentOpen = this.app.workspace.getActiveFile();
			if (currentOpen) {
				this.contextChipEl.show();
				this.contextChipEl.addClass("is-detached");

				const attachBtn = this.contextChipEl.createEl("button", {
					cls: "vault-code-context-attach-btn",
					attr: { "aria-label": t("aiChatAttachActiveNote") },
				});
				const iconSpan = attachBtn.createSpan({ cls: "vault-code-context-attach-icon" });
				setIcon(iconSpan, "paperclip");
				attachBtn.createSpan({
					cls: "vault-code-context-attach-text",
					text: `${t("aiChatAttachActiveNote")}: ${currentOpen.name}`,
				});

				attachBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.attachActiveFile(currentOpen);
				});
			} else {
				this.contextChipEl.hide();
			}
		}
	}

	private attachActiveFile(file: TFile): void {
		this.chatScope = "active-note";
		this.contextExcluded = false;
		this.isContextPinned = false;
		this.pinnedContextFile = null;
		this.updateVaultToggleState();
		this.updateContextChip();
	}

	private togglePinContext(file: TFile): void {
		this.isContextPinned = !this.isContextPinned;
		if (this.isContextPinned) {
			this.pinnedContextFile = file;
		} else {
			this.pinnedContextFile = null;
		}
		this.updateContextChip();
	}

	private removeContext(): void {
		this.contextExcluded = true;
		this.isContextPinned = false;
		this.pinnedContextFile = null;
		this.updateContextChip();
	}

	private showModelMenu(event: MouseEvent): void {
		const menu = createCustomMenu();

		const modelsToUse =
			this.availableModels.length > 0
				? this.availableModels
				: [
						{ id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
						{ id: "gemini-3.8-flash-medium", displayName: "Gemini 3.8 Flash (Medium)" },
						{ id: "gemini-3.8-flash-low", displayName: "Gemini 3.8 Flash (Low)" },
						{ id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6 (Thinking)" },
						{ id: "claude-opus-4-6-thinking", displayName: "Claude Opus 4.6 (Thinking)" },
						{ id: "gpt-oss-120b-medium", displayName: "GPT-OSS 120b (medium)" },
					];

		for (const model of modelsToUse) {
			menu.addItem((item) => {
				item.setTitle(model.displayName);
				item.setChecked(this.selectedModel === model.id);
				item.onClick(() => {
					this.selectedModel = model.id;
					this.updateModelBtnLabel();
				});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private showModeMenu(event: MouseEvent): void {
		const menu = createCustomMenu();

		menu.addItem((item) => {
			item.setTitle(t("aiChatModeSafe"));
			item.setIcon("shield");
			item.setChecked(this.mode === "safe");
			item.onClick(() => {
				this.mode = "safe";
				this.updateModeBtnLabel();
			});
		});

		menu.addItem((item) => {
			item.setTitle(t("aiChatModeEdit"));
			item.setIcon("zap");
			item.setChecked(this.mode === "edit");
			item.onClick(() => {
				this.mode = "edit";
				this.updateModeBtnLabel();
			});
		});

		menu.showAtMouseEvent(event);
	}

	private openActiveChatAsNote(): void {
		if (this.currentChatFile) {
			const leaf = this.app.workspace.getLeaf("tab");
			void leaf.openFile(this.currentChatFile);
		}
	}

	private openHistoryModal(): void {
		new AIChatHistoryModal(this.app, this.plugin, (file) => {
			void this.loadChatFromFile(file);
		}).open();
	}

	public async loadChatFromFile(file: TFile): Promise<void> {
		this.stopGenerating();
		try {
			const content = await this.app.vault.read(file);
			const parsed = this.plugin.aiStorage.parseChat(content, this.selectedModel);
			this.currentChatFile = file;
			this.currentChatTitle = parsed.metadata.title;
			this.conversationId = parsed.metadata.conversationId;
			this.selectedModel = parsed.metadata.model;
			this.chatScope = parsed.metadata.scope;
			this.mode = parsed.metadata.mode;
			this.messages = parsed.messages;

			this.headerTitleEl?.setText(this.currentChatTitle);
			this.headerTitleEl.title = `${this.currentChatTitle} (${t("aiChatRenameChat")})`;
			this.headerTitleEl.addClass("is-editable");
			this.updateModelBtnLabel();
			this.updateVaultToggleState();
			this.updateModeBtnLabel();
			this.updateContextChip();
			this.openNoteBtnEl?.show();

			this.renderMessages();
			this.inputEl.focus();
		} catch (e) {
			console.error("Vault Code: Failed to load chat note", e);
			new Notice(t("aiChatNoticeDeleteFailed"));
		}
	}

	public startNewChat(): void {
		this.stopGenerating();
		this.currentChatFile = null;
		this.currentChatTitle = "Untitled Chat";
		this.conversationId = undefined;
		this.messages = [];
		this.isContextPinned = false;
		this.pinnedContextFile = null;
		this.contextExcluded = false;
		this.headerTitleEl?.setText(t("aiChatViewTitle"));
		this.headerTitleEl?.removeAttribute("title");
		this.headerTitleEl?.removeClass("is-editable");
		this.openNoteBtnEl?.hide();
		this.chatScope = "active-note";
		this.updateVaultToggleState();
		this.updateContextChip();
		this.renderMessages();
		this.inputEl.focus();
	}

	public clearChat(): void {
		this.startNewChat();
	}

	private renderMessages(): void {
		this.messagesContainerEl.empty();

		if (this.messages.length === 0) {
			this.renderWelcome();
			return;
		}

		for (const msg of this.messages) {
			this.renderMessageBubble(msg);
		}

		this.scrollToBottom();
	}

	private renderWelcome(): void {
		const welcomeEl = this.messagesContainerEl.createDiv({
			cls: "vault-code-chat-welcome",
		});

		const iconEl = welcomeEl.createDiv({ cls: "vault-code-chat-welcome-icon" });
		setIcon(iconEl, "sparkles");

		welcomeEl.createEl("h3", {
			cls: "vault-code-chat-welcome-title",
			text: t("aiChatWelcomeTitle"),
		});

		welcomeEl.createEl("p", {
			cls: "vault-code-chat-welcome-subtitle",
			text: t("aiChatWelcomeSubtitle"),
		});
	}

	private renderMessageBubble(msg: ChatMessage): HTMLElement {
		const bubbleEl = this.messagesContainerEl.createDiv({
			cls: `vault-code-chat-msg is-${msg.role}`,
			attr: { "data-msg-id": msg.id },
		});

		const headerEl = bubbleEl.createDiv({ cls: "vault-code-chat-msg-header" });
		const roleWrapper = headerEl.createDiv({ cls: "vault-code-chat-msg-role" });
		const roleIcon = roleWrapper.createSpan({ cls: "vault-code-chat-msg-role-icon" });

		if (msg.role === "user") {
			setIcon(roleIcon, "user");
			roleWrapper.createSpan({ text: "You" });
		} else {
			setIcon(roleIcon, "sparkles");
			roleWrapper.createSpan({ text: "Agent" });
		}

		// Copy button on both user and assistant messages
		const copyBtn = headerEl.createEl("button", {
			cls: "clickable-icon vault-code-chat-msg-copy-btn",
			attr: { "aria-label": t("aiChatCopy") },
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", () => {
			void navigator.clipboard.writeText(msg.content).then(() => {
				setIcon(copyBtn, "check");
				new Notice(t("aiChatCopied"));
				window.setTimeout(() => {
					setIcon(copyBtn, "copy");
				}, 1500);
			});
		});

		const bodyEl = bubbleEl.createDiv({ cls: "vault-code-chat-msg-body" });
		void MarkdownRenderer.render(
			this.app,
			msg.content,
			bodyEl,
			"",
			this,
		);

		return bubbleEl;
	}

	private scheduleStreamingRender(msg: ChatMessage, bodyEl: HTMLElement): void {
		if (this.renderRafId !== null) return;

		this.renderRafId = window.requestAnimationFrame(() => {
			this.renderRafId = null;
			bodyEl.empty();
			void MarkdownRenderer.render(
				this.app,
				msg.content,
				bodyEl,
				"",
				this,
			);
			this.scrollToBottom();
		});
	}

	private scrollToBottom(): void {
		this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
	}

	private async handleSubmit(): Promise<void> {
		if (this.isGenerating) return;

		const text = this.inputEl.value.trim();
		if (!text) return;

		this.inputEl.value = "";
		this.autoResizeTextarea();
		this.updateSendButtonState();

		// Add user message
		const userMsg: ChatMessage = {
			id: `user-${Date.now()}`,
			role: "user",
			content: text,
			timestamp: Date.now(),
		};
		this.messages.push(userMsg);

		// If this is the first message, clear welcome placeholder
		if (this.messages.length === 1) {
			this.messagesContainerEl.empty();
		}
		this.renderMessageBubble(userMsg);

		// Add assistant message with animated typing indicator
		const assistantMsg: ChatMessage = {
			id: `asst-${Date.now()}`,
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};
		this.messages.push(assistantMsg);

		const asstBubbleEl = this.messagesContainerEl.createDiv({
			cls: "vault-code-chat-msg is-assistant",
			attr: { "data-msg-id": assistantMsg.id },
		});
		const asstHeaderEl = asstBubbleEl.createDiv({ cls: "vault-code-chat-msg-header" });
		const roleWrapper = asstHeaderEl.createDiv({ cls: "vault-code-chat-msg-role" });
		const roleIcon = roleWrapper.createSpan({ cls: "vault-code-chat-msg-role-icon" });
		setIcon(roleIcon, "sparkles");
		roleWrapper.createSpan({ text: "Agent" });

		const asstBodyEl = asstBubbleEl.createDiv({ cls: "vault-code-chat-msg-body" });
		this.currentTypingIndicatorEl = asstBodyEl.createDiv({ cls: "vault-code-typing-indicator" });
		this.currentTypingIndicatorEl.createSpan({ cls: "vault-code-typing-dot" });
		this.currentTypingIndicatorEl.createSpan({ cls: "vault-code-typing-dot" });
		this.currentTypingIndicatorEl.createSpan({ cls: "vault-code-typing-dot" });

		this.currentStreamingMsgEl = asstBubbleEl;

		this.isGenerating = true;
		this.updateSendButtonState();
		this.scrollToBottom();

		// Gather context if active-note scope is active
		let activeFile: TFile | null = null;
		let activeContent = "";
		let selectedText = "";

		if (this.chatScope === "active-note" && !this.contextExcluded) {
			activeFile = (this.isContextPinned && this.pinnedContextFile)
				? this.pinnedContextFile
				: this.app.workspace.getActiveFile();
			if (activeFile) {
				try {
					activeContent = await this.app.vault.read(activeFile);
				} catch {
					// ignore
				}
				const editor = this.app.workspace.activeEditor?.editor;
				if (editor && (!this.isContextPinned || this.app.workspace.getActiveFile()?.path === activeFile.path)) {
					selectedText = editor.getSelection();
				}
			}
		}

		// Auto-create chat note on first turn if not yet saved
		if (!this.currentChatFile) {
			this.currentChatTitle = text.slice(0, 50);
			const folder = this.plugin.settings.aiChatFolder || "Agent-Chats";
			try {
				this.currentChatFile = await this.plugin.aiStorage.createChatNote(
					folder,
					this.currentChatTitle,
					this.messages,
					{
						model: this.selectedModel,
						scope: this.chatScope,
						mode: this.mode,
						conversationId: this.conversationId,
					},
				);
				this.headerTitleEl?.setText(this.currentChatTitle);
				this.headerTitleEl.title = `${this.currentChatTitle} (${t("aiChatRenameChat")})`;
				this.headerTitleEl.addClass("is-editable");
				this.openNoteBtnEl?.show();
			} catch (e) {
				console.error("Vault Code: Failed to create chat note", e);
			}
		}

		this.activeProcessHandle = this.plugin.aiService.sendMessage({
			prompt: text,
			model: this.selectedModel,
			scope: this.chatScope,
			mode: this.mode,
			conversationId: this.conversationId,
			activeFile,
			activeContent,
			selectedText,
			onInit: (convId: string) => {
				this.conversationId = convId;
			},
			onDelta: (delta: string) => {
				if (this.currentTypingIndicatorEl) {
					this.currentTypingIndicatorEl.remove();
					this.currentTypingIndicatorEl = null;
				}
				assistantMsg.content += delta;
				if (asstBodyEl) {
					this.scheduleStreamingRender(assistantMsg, asstBodyEl);
				}
			},
			onDone: (fullText: string) => {
				if (this.currentTypingIndicatorEl) {
					this.currentTypingIndicatorEl.remove();
					this.currentTypingIndicatorEl = null;
				}
				assistantMsg.content = fullText;
				if (asstBodyEl) {
					asstBodyEl.empty();
					void MarkdownRenderer.render(
						this.app,
						assistantMsg.content,
						asstBodyEl,
						"",
						this,
					);
				}

				// Add copy button to assistant message
				const copyBtn = asstHeaderEl.createEl("button", {
					cls: "clickable-icon vault-code-chat-msg-copy-btn",
					attr: { "aria-label": t("aiChatCopy") },
				});
				setIcon(copyBtn, "copy");
				copyBtn.addEventListener("click", () => {
					void navigator.clipboard.writeText(assistantMsg.content).then(() => {
						setIcon(copyBtn, "check");
						new Notice(t("aiChatCopied"));
						window.setTimeout(() => setIcon(copyBtn, "copy"), 1500);
					});
				});

				this.finishGenerating();

				// Persist updated transcript to the Markdown chat note
				if (this.currentChatFile) {
					void this.plugin.aiStorage.updateChatNote(
						this.currentChatFile,
						{
							title: this.currentChatTitle,
							created: this.plugin.aiStorage.formatDateTime(),
							model: this.selectedModel,
							scope: this.chatScope,
							mode: this.mode,
							conversationId: this.conversationId,
						},
						this.messages,
					);
				}
			},
			onError: (err: Error) => {
				if (this.currentTypingIndicatorEl) {
					this.currentTypingIndicatorEl.remove();
					this.currentTypingIndicatorEl = null;
				}
				assistantMsg.content = `> ⚠️ **Error**: ${err.message}`;
				if (asstBodyEl) {
					asstBodyEl.empty();
					void MarkdownRenderer.render(
						this.app,
						assistantMsg.content,
						asstBodyEl,
						"",
						this,
					);
				}
				this.finishGenerating();

				if (this.currentChatFile) {
					void this.plugin.aiStorage.updateChatNote(
						this.currentChatFile,
						{
							title: this.currentChatTitle,
							created: this.plugin.aiStorage.formatDateTime(),
							model: this.selectedModel,
							scope: this.chatScope,
							mode: this.mode,
							conversationId: this.conversationId,
						},
						this.messages,
					);
				}
			},
		});
	}

	private stopGenerating(): void {
		if (this.activeProcessHandle) {
			this.activeProcessHandle.kill();
			this.activeProcessHandle = null;
		}
		if (this.currentTypingIndicatorEl) {
			this.currentTypingIndicatorEl.remove();
			this.currentTypingIndicatorEl = null;
		}
		this.finishGenerating();
	}

	private finishGenerating(): void {
		this.isGenerating = false;
		this.activeProcessHandle = null;
		this.currentStreamingMsgEl = null;
		this.currentTypingIndicatorEl = null;
		this.updateSendButtonState();
		this.scrollToBottom();
	}

	private updateSendButtonState(): void {
		if (!this.sendBtnEl) return;
		this.sendBtnEl.empty();

		if (this.isGenerating) {
			setIcon(this.sendBtnEl, "square");
			this.sendBtnEl.setAttribute("aria-label", t("aiChatStop"));
			this.sendBtnEl.addClass("is-generating");
			this.sendBtnEl.removeClass("has-input");
		} else {
			setIcon(this.sendBtnEl, "send");
			this.sendBtnEl.setAttribute("aria-label", t("aiChatSend"));
			this.sendBtnEl.removeClass("is-generating");
			const hasText = (this.inputEl?.value || "").trim().length > 0;
			if (hasText) {
				this.sendBtnEl.addClass("has-input");
			} else {
				this.sendBtnEl.removeClass("has-input");
			}
		}
	}
}
