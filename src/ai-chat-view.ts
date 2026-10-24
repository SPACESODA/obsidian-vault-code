import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	MarkdownRenderer,
	Menu,
	Notice,
	TFile,
	debounce,
} from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";
import type { AgyModelInfo, AgyProcessHandle } from "./ai-service";
import { AIChatHistoryModal } from "./ai-history-modal";

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

	// UI Elements
	private messagesContainerEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtnEl!: HTMLElement;
	private modelBtnEl!: HTMLElement;
	private scopeBtnEl!: HTMLElement;
	private modeBtnEl!: HTMLElement;
	private contextBannerEl!: HTMLElement;
	private openNoteBtnEl!: HTMLElement;

	// Streaming render queue
	private currentStreamingMsgEl: HTMLElement | null = null;
	private renderRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultCodePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.selectedModel = plugin.settings.aiModel || "gemini-3.8-flash-high";
		this.chatScope = plugin.settings.aiScope || "active-note";
		this.mode = plugin.settings.aiMode || "safe";
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
		const container = this.containerEl.children[1] as HTMLElement;
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

		// Listen to active note changes to update context banner
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateContextBanner();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.updateContextBanner();
			}),
		);

		this.updateContextBanner();
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

		const titleWrapper = headerEl.createDiv({ cls: "vault-code-chat-header-title" });
		const iconEl = titleWrapper.createSpan({ cls: "vault-code-chat-header-icon" });
		setIcon(iconEl, "sparkles");
		titleWrapper.createSpan({ text: t("aiChatViewTitle") });

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

		// 4. Delete Chat button
		const deleteBtn = actionsEl.createEl("button", {
			cls: "clickable-icon vault-code-chat-header-btn mod-warning",
			attr: { "aria-label": t("aiChatDeleteChat") },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", () => {
			void this.confirmDeleteActiveChat();
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

		// Context banner (shows active note name)
		this.contextBannerEl = footerEl.createDiv({ cls: "vault-code-chat-context-banner" });

		// Input box container
		const inputWrapper = footerEl.createDiv({ cls: "vault-code-chat-input-wrapper" });
		this.inputEl = inputWrapper.createEl("textarea", {
			cls: "vault-code-chat-input",
			attr: {
				placeholder: t("aiChatPlaceholder"),
				rows: "2",
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
			}, 50, true),
		);

		// Controls row
		const controlsRow = footerEl.createDiv({ cls: "vault-code-chat-controls-row" });
		const pillsGroup = controlsRow.createDiv({ cls: "vault-code-chat-pills-group" });

		// 1. Model Button
		this.modelBtnEl = pillsGroup.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-model",
			attr: { "aria-label": t("settingsAIDefaultModelName") },
		});
		this.modelBtnEl.addEventListener("click", (e) => this.showModelMenu(e));

		// 2. Scope Button
		this.scopeBtnEl = pillsGroup.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-scope",
			attr: { "aria-label": t("settingsAIDefaultScopeName") },
		});
		this.scopeBtnEl.addEventListener("click", (e) => this.showScopeMenu(e));

		// 3. Permission Mode Button
		this.modeBtnEl = pillsGroup.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-mode",
			attr: { "aria-label": t("settingsAIDefaultModeName") },
		});
		this.modeBtnEl.addEventListener("click", (e) => this.showModeMenu(e));

		// Send / Stop button
		this.sendBtnEl = controlsRow.createEl("button", {
			cls: "vault-code-chat-send-btn mod-cta",
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

		this.updateModelBtnLabel();
		this.updateScopeBtnLabel();
		this.updateModeBtnLabel();
	}

	private autoResizeTextarea(): void {
		if (!this.inputEl) return;
		const newHeight = Math.min(Math.max(this.inputEl.scrollHeight, 40), 160);
		this.inputEl.setCssProps({ "--chat-input-height": `${newHeight}px` });
	}

	private updateModelBtnLabel(): void {
		if (!this.modelBtnEl) return;
		this.modelBtnEl.empty();
		const iconSpan = this.modelBtnEl.createSpan({ cls: "vault-code-pill-icon" });
		setIcon(iconSpan, "sparkles");

		const found = this.availableModels.find((m) => m.id === this.selectedModel);
		const label = found ? found.displayName.replace(/\s*\(.*?\)/, "") : this.selectedModel;
		this.modelBtnEl.createSpan({ text: label });
	}

	private updateScopeBtnLabel(): void {
		if (!this.scopeBtnEl) return;
		this.scopeBtnEl.empty();
		const iconSpan = this.scopeBtnEl.createSpan({ cls: "vault-code-pill-icon" });

		if (this.chatScope === "active-note") {
			setIcon(iconSpan, "file-text");
			this.scopeBtnEl.createSpan({ text: t("aiChatScopeActiveNote") });
			this.scopeBtnEl.removeClass("is-vault-scope");
		} else {
			setIcon(iconSpan, "folder");
			this.scopeBtnEl.createSpan({ text: t("aiChatScopeVault") });
			this.scopeBtnEl.addClass("is-vault-scope");
		}
		this.updateContextBanner();
	}

	private updateModeBtnLabel(): void {
		if (!this.modeBtnEl) return;
		this.modeBtnEl.empty();
		const iconSpan = this.modeBtnEl.createSpan({ cls: "vault-code-pill-icon" });

		if (this.mode === "safe") {
			setIcon(iconSpan, "shield");
			this.modeBtnEl.createSpan({ text: t("aiChatModeSafe") });
			this.modeBtnEl.removeClass("is-mode-edit");
			this.modeBtnEl.addClass("is-mode-safe");
		} else {
			setIcon(iconSpan, "zap");
			this.modeBtnEl.createSpan({ text: t("aiChatModeEdit") });
			this.modeBtnEl.removeClass("is-mode-safe");
			this.modeBtnEl.addClass("is-mode-edit");
		}
	}

	private updateContextBanner(): void {
		if (!this.contextBannerEl) return;
		this.contextBannerEl.empty();

		if (this.chatScope === "vault") {
			this.contextBannerEl.hide();
			return;
		}

		this.contextBannerEl.show();
		const activeFile = this.app.workspace.getActiveFile();
		const iconSpan = this.contextBannerEl.createSpan({ cls: "vault-code-context-icon" });

		if (activeFile) {
			setIcon(iconSpan, "file-code");
			const nameSpan = this.contextBannerEl.createSpan({
				cls: "vault-code-context-text",
				text: t("aiChatContextActiveNote").replace("{0}", activeFile.name),
			});
			nameSpan.title = activeFile.path;
		} else {
			setIcon(iconSpan, "file-question");
			this.contextBannerEl.createSpan({
				cls: "vault-code-context-text is-empty",
				text: t("aiChatContextNoActiveNote"),
			});
		}
	}

	private showModelMenu(event: MouseEvent): void {
		const menu = new Menu();

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

	private showScopeMenu(event: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("aiChatScopeActiveNote"));
			item.setIcon("file-text");
			item.setChecked(this.chatScope === "active-note");
			item.onClick(() => {
				this.chatScope = "active-note";
				this.updateScopeBtnLabel();
			});
		});

		menu.addItem((item) => {
			item.setTitle(t("aiChatScopeVault"));
			item.setIcon("folder");
			item.setChecked(this.chatScope === "vault");
			item.onClick(() => {
				this.chatScope = "vault";
				this.updateScopeBtnLabel();
			});
		});

		menu.showAtMouseEvent(event);
	}

	private showModeMenu(event: MouseEvent): void {
		const menu = new Menu();

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
			const leaf = this.app.workspace.getLeaf(false);
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

			this.updateModelBtnLabel();
			this.updateScopeBtnLabel();
			this.updateModeBtnLabel();
			this.openNoteBtnEl?.show();

			this.renderMessages();
			this.inputEl.focus();
		} catch (e) {
			console.error("Vault Code: Failed to load chat note", e);
			new Notice(t("aiChatNoticeDeleteFailed"));
		}
	}

	private async confirmDeleteActiveChat(): Promise<void> {
		if (this.currentChatFile) {
			const file = this.currentChatFile;
			try {
				await this.plugin.aiStorage.deleteChatNote(file);
				new Notice(t("aiChatNoticeDeleted").replace("{0}", file.basename));
			} catch (e) {
				console.error("Vault Code: Failed to delete active chat note", e);
			}
		}
		this.startNewChat();
	}

	public startNewChat(): void {
		this.stopGenerating();
		this.currentChatFile = null;
		this.currentChatTitle = "Untitled Chat";
		this.conversationId = undefined;
		this.messages = [];
		this.openNoteBtnEl?.hide();
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
			const found = this.availableModels.find((m) => m.id === this.selectedModel);
			const label = found ? found.displayName : "Antigravity CLI";
			roleWrapper.createSpan({ text: label });

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
		}

		const bodyEl = bubbleEl.createDiv({ cls: "vault-code-chat-msg-body" });
		void MarkdownRenderer.render(
			this.app,
			msg.content || (this.isGenerating ? "..." : ""),
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

		// Add placeholder assistant message
		const assistantMsg: ChatMessage = {
			id: `asst-${Date.now()}`,
			role: "assistant",
			content: "",
			timestamp: Date.now(),
		};
		this.messages.push(assistantMsg);
		const asstBubbleEl = this.renderMessageBubble(assistantMsg);
		const asstBodyEl = asstBubbleEl.querySelector(".vault-code-chat-msg-body") as HTMLElement;
		this.currentStreamingMsgEl = asstBubbleEl;

		this.isGenerating = true;
		this.updateSendButtonState();
		this.scrollToBottom();

		// Gather context if active-note scope is active
		let activeFile: TFile | null = null;
		let activeContent = "";
		let selectedText = "";

		if (this.chatScope === "active-note") {
			activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				try {
					activeContent = await this.app.vault.read(activeFile);
				} catch {
					// ignore
				}
				const editor = this.app.workspace.activeEditor?.editor;
				if (editor) {
					selectedText = editor.getSelection();
				}
			}
		}

		// Auto-create chat note on first turn if not yet saved
		if (!this.currentChatFile) {
			this.currentChatTitle = text.slice(0, 50);
			const folder = this.plugin.settings.aiChatFolder || "AI Chats";
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
				assistantMsg.content += delta;
				if (asstBodyEl) {
					this.scheduleStreamingRender(assistantMsg, asstBodyEl);
				}
			},
			onDone: (fullText: string) => {
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
		this.finishGenerating();
	}

	private finishGenerating(): void {
		this.isGenerating = false;
		this.activeProcessHandle = null;
		this.currentStreamingMsgEl = null;
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
		} else {
			setIcon(this.sendBtnEl, "send");
			this.sendBtnEl.setAttribute("aria-label", t("aiChatSend"));
			this.sendBtnEl.removeClass("is-generating");
		}
	}
}
