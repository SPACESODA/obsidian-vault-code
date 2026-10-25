import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	Notice,
	TFile,
	ToggleComponent,
	debounce,
	SuggestModal,
	App,
} from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";
import type { AgyModelInfo, AIProcessHandle, AIProvider, ReasoningEffort } from "./ai-service";
import {
	DEFAULT_AGY_MODELS,
	ALL_AGENT_DEFS,
	getAgentDisplayName,
	resolveOptimalModel,
	supportsReasoningEffort,
} from "./ai-service";
import { AIChatHistoryModal } from "./ai-history-modal";
import { createCustomMenu } from "./custom-menu";
import { isConnectionProvider, connectionProvider, extractEditProposal } from "./ai-connections";
import { AIEditReviewModal } from "./ai-edit-review";
import { renderChatMarkdown } from "./ai-chat-markdown";
import { type SelectionQuote, selectionLabel, quoteMessage } from "./ai-selection";

export const VIEW_TYPE_AI_CHAT = "vault-code-ai-chat";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

export class ModelSuggestModal extends SuggestModal<AgyModelInfo> {
	private models: AgyModelInfo[];
	private selectedModelId: string;
	private onSelect: (model: AgyModelInfo) => void;

	constructor(
		app: App,
		models: AgyModelInfo[],
		selectedModelId: string,
		onSelect: (model: AgyModelInfo) => void,
	) {
		super(app);
		this.models = models;
		this.selectedModelId = selectedModelId;
		this.onSelect = onSelect;
		this.setPlaceholder(t("aiChatSearchModelPlaceholder"));
	}

	getSuggestions(query: string): AgyModelInfo[] {
		const q = query.toLowerCase().trim();
		if (!q) return this.models;
		return this.models.filter(
			(m) =>
				m.displayName.toLowerCase().includes(q) ||
				m.id.toLowerCase().includes(q),
		);
	}

	renderSuggestion(model: AgyModelInfo, el: HTMLElement): void {
		el.empty();
		el.addClass("vault-code-model-suggest-item");

		const isSelected = model.id === this.selectedModelId;
		if (isSelected) {
			el.addClass("is-selected");
		}

		const textWrapper = el.createDiv({ cls: "vault-code-model-suggest-text" });
		const titleEl = textWrapper.createDiv({
			cls: "vault-code-model-suggest-title",
			text: model.displayName,
		});
		titleEl.setAttribute("title", model.displayName);

		if (model.id !== model.displayName) {
			textWrapper.createDiv({
				cls: "vault-code-model-suggest-id",
				text: model.id,
			});
		}

		if (isSelected) {
			const checkSpan = el.createSpan({ cls: "vault-code-model-suggest-check" });
			setIcon(checkSpan, "check");
		}
	}

	onChooseSuggestion(model: AgyModelInfo): void {
		this.onSelect(model);
	}
}

export class AIChatView extends ItemView {
	public plugin: VaultCodePlugin;
	private messages: ChatMessage[] = [];
	private conversationId?: string;
	private selectedProvider: AIProvider;
	private selectedModel: string;
	private selectedReasoningEffort: ReasoningEffort = "auto";
	private chatScope: "active-note" | "vault";
	private mode: "safe" | "edit";
	private isGenerating = false;
	private activeProcessHandle: AIProcessHandle | null = null;
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
	private providerBtnEl!: HTMLElement;
	private modelBtnEl!: HTMLElement;
	private effortBtnEl!: HTMLElement;
	private modeBtnEl!: HTMLElement;
	private vaultToggle: ToggleComponent | null = null;
	private vaultToggleWrapper!: HTMLElement;
	private contextChipEl!: HTMLElement;
	private quoteContainerEl!: HTMLElement;
	private pendingQuote: SelectionQuote | null = null;
	private contextPinBtnEl!: HTMLElement;
	private openNoteBtnEl!: HTMLElement;

	// Streaming render queue
	private currentStreamingMsgEl: HTMLElement | null = null;
	private currentTypingIndicatorEl: HTMLElement | null = null;
	private renderRafId: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultCodePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.selectedProvider = plugin.settings.aiProvider || "antigravity";
		const remembered = plugin.settings.aiProviderLastModel?.[this.selectedProvider];
		this.selectedModel =
			remembered && remembered !== "auto"
				? remembered
				: resolveOptimalModel(this.selectedProvider);
		this.selectedReasoningEffort = plugin.settings.aiReasoningEffort || "auto";
		this.chatScope = plugin.settings.aiScope || "active-note";
		this.mode = plugin.settings.aiMode || "safe";
	}

	getViewType(): string {
		return VIEW_TYPE_AI_CHAT;
	}

	getDisplayText(): string {
		return t("aiChatWithAgent");
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

		// Fetch available models asynchronously for active provider
		void this.loadModelsForProvider(this.selectedProvider);

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

	private async loadModelsForProvider(provider: AIProvider): Promise<void> {
		const models = await this.plugin.aiService.getModelsForProvider(provider);
		if (provider !== this.selectedProvider) return;
		this.availableModels = models.filter((m) => m.id !== "auto");
		if (this.availableModels.length > 0 && !this.availableModels.some((m) => m.id === this.selectedModel)) {
			this.selectedModel = this.availableModels.find((m) => m.id === "default")?.id
				|| this.availableModels[0]?.id || resolveOptimalModel(provider);
			if (!this.plugin.settings.aiProviderLastModel) this.plugin.settings.aiProviderLastModel = {};
			this.plugin.settings.aiProviderLastModel[provider] = this.selectedModel;
			void this.plugin.saveSettings();
			if (this.currentChatFile) {
				void this.plugin.aiStorage.updateChatModel(this.currentChatFile, this.selectedModel);
			}
		}

		this.updateModelBtnLabel();
	}

	override getState(): Record<string, unknown> {
		return {
			chatPath: this.currentChatFile?.path || null,
		};
	}

	override async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
		const superSetState = (ItemView.prototype as unknown as { setState?: (s: unknown, r: unknown) => Promise<void> }).setState;
		if (superSetState) {
			await superSetState.call(this, state, result);
		}
		if (typeof state?.chatPath === "string" && state.chatPath) {
			const file = this.app.vault.getAbstractFileByPath(state.chatPath);
			if (file instanceof TFile) {
				await this.loadChatFromFile(file);
			}
		}
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
			value: currentTitle.slice(0, 70),
			attr: {
				maxlength: "70",
				spellcheck: "false",
				autocomplete: "off",
			},
		});

		input.focus();
		input.select();

		let finished = false;
		const finish = async (save: boolean) => {
			if (finished) return;
			finished = true;
			this.isEditingTitle = false;

			const newTitle = input.value.trim().slice(0, 70);
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
		this.messagesContainerEl.addEventListener("contextmenu", (e: MouseEvent) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const msgEl = target.closest<HTMLElement>(".vault-code-chat-msg");
			const selection = window.getSelection()?.toString()?.trim();
			if (!msgEl && !selection) return;

			e.preventDefault();
			const msgId = msgEl?.getAttribute("data-msg-id");
			const msg = msgId ? this.messages.find((m) => m.id === msgId) : null;

			const menu = createCustomMenu();
			if (selection) {
				menu.addItem((item) => {
					item.setTitle("Copy")
						.setIcon("copy")
						.onClick(() => {
							void navigator.clipboard.writeText(selection).then(() => {
								new Notice(t("aiChatCopied"));
							});
						});
				});
			}
			if (msg) {
				menu.addItem((item) => {
					item.setTitle(t("aiChatCopy"))
						.setIcon("copy")
						.onClick(() => {
							void navigator.clipboard.writeText(msg.content).then(() => {
								new Notice(t("aiChatCopied"));
							});
						});
				});
			}
			menu.showAtMouseEvent(e);
		});
		this.renderMessages();
	}

	private buildFooter(container: HTMLElement): void {
		const footerEl = container.createDiv({ cls: "vault-code-chat-footer" });
		const inputCard = footerEl.createDiv({ cls: "vault-code-chat-input-card" });

		// Context chip inside the card (top)
		this.contextChipEl = inputCard.createDiv({ cls: "vault-code-chat-context-chip" });

		this.quoteContainerEl = inputCard.createDiv({ cls: "vault-code-chat-quote-container" });
		this.renderSelectionQuote();

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

		// Row 1: Provider selection & Model selection
		const topRow = cardBottom.createDiv({ cls: "vault-code-chat-bottom-row-top" });
		this.providerBtnEl = topRow.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-provider",
			attr: { "aria-label": t("aiChatProviderSelect") },
		});
		this.providerBtnEl.addEventListener("click", (e) => {
			void this.showProviderMenu(e);
		});

		this.modelBtnEl = topRow.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-model",
			attr: { "aria-label": t("settingsAIDefaultModelName") },
		});
		this.modelBtnEl.addEventListener("click", (e) => this.showModelMenu(e));

		this.effortBtnEl = topRow.createEl("button", {
			cls: "vault-code-chat-pill vault-code-chat-pill-effort",
			attr: { "aria-label": t("aiChatReasoningEffort") },
		});
		this.effortBtnEl.addEventListener("click", (e) => this.showEffortMenu(e));

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
				this.contextExcluded = false;
				this.setChatScope(checked ? "vault" : "active-note");
			});
		this.vaultToggle = toggle;
		toggleLabel.addEventListener("click", () => {
			const newVal = !toggle.getValue();
			toggle.setValue(newVal);
			this.contextExcluded = false;
			this.setChatScope(newVal ? "vault" : "active-note");
		});

		this.updateProviderBtnLabel();
		this.updateModelBtnLabel();
		this.updateEffortBtn();
		this.updateModeBtnLabel();
		this.updateVaultToggleState();
		this.updateContextChip();
	}

	public setMode(newMode: "safe" | "edit"): void {
		if (this.mode === newMode) return;
		this.mode = newMode;
		this.updateModeBtnLabel();
		if (this.currentChatFile) {
			void this.plugin.aiStorage.updateChatMode(this.currentChatFile, newMode);
		}
	}

	public setChatScope(newScope: "active-note" | "vault"): void {
		if (this.chatScope === newScope) return;
		this.chatScope = newScope;
		this.updateVaultToggleState();
		this.updateContextChip();
		if (this.currentChatFile) {
			void this.plugin.aiStorage.updateChatScope(this.currentChatFile, newScope);
		}
	}

	private updateVaultToggleState(): void {
		if (this.pendingQuote || isConnectionProvider(this.selectedProvider)) {
			if (this.chatScope !== "active-note") {
				this.chatScope = "active-note";
				if (this.currentChatFile) {
					void this.plugin.aiStorage.updateChatScope(this.currentChatFile, "active-note");
				}
			}
			this.vaultToggleWrapper?.hide();
		} else this.vaultToggleWrapper?.show();
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

	private updateProviderBtnLabel(): void {
		if (!this.providerBtnEl) return;
		this.providerBtnEl.empty();
		const def = ALL_AGENT_DEFS.find((d) => d.id === this.selectedProvider);
		const iconSpan = this.providerBtnEl.createSpan({ cls: "vault-code-pill-icon" });
		setIcon(iconSpan, def?.icon || "sparkles");
		this.providerBtnEl.createSpan({
			cls: "vault-code-pill-label",
			text: this.plugin.aiService.getProviderName(this.selectedProvider),
		});
		const chevronSpan = this.providerBtnEl.createSpan({ cls: "vault-code-pill-chevron" });
		setIcon(chevronSpan, "chevron-down");
	}

	private updateModelBtnLabel(): void {
		if (!this.modelBtnEl) return;
		this.modelBtnEl.empty();
		const def = ALL_AGENT_DEFS.find((d) => d.id === this.selectedProvider);
		const iconSpan = this.modelBtnEl.createSpan({ cls: "vault-code-pill-icon" });
		setIcon(iconSpan, def?.icon || "sparkles");

		const found =
			this.availableModels.find((m) => m.id === this.selectedModel) ||
			def?.models.find((m) => m.id === this.selectedModel);
		const label = found ? found.displayName : this.selectedModel;
		this.modelBtnEl.createSpan({ cls: "vault-code-pill-label", text: label });
		this.modelBtnEl.setAttribute("title", label);

		const chevronSpan = this.modelBtnEl.createSpan({ cls: "vault-code-pill-chevron" });
		setIcon(chevronSpan, "chevron-down");
	}

	private updateEffortBtn(): void {
		if (!this.effortBtnEl) return;
		if (!supportsReasoningEffort(this.selectedProvider)) {
			this.effortBtnEl.hide();
			return;
		}
		this.effortBtnEl.show();
		this.effortBtnEl.empty();
		const iconSpan = this.effortBtnEl.createSpan({ cls: "vault-code-pill-icon" });
		setIcon(iconSpan, "brain");

		let labelText = t("aiChatEffortAuto");
		if (this.selectedReasoningEffort === "low") {
			labelText = t("aiChatEffortLow");
		} else if (this.selectedReasoningEffort === "medium") {
			labelText = t("aiChatEffortMedium");
		} else if (this.selectedReasoningEffort === "high") {
			labelText = t("aiChatEffortHigh");
		}

		this.effortBtnEl.createSpan({ cls: "vault-code-pill-label", text: labelText });
		const chevronSpan = this.effortBtnEl.createSpan({ cls: "vault-code-pill-chevron" });
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
		if (this.pendingQuote) { this.contextChipEl.hide(); return; }

		const activeFile = (this.isContextPinned && this.pinnedContextFile)
			? this.pinnedContextFile
			: this.app.workspace.getActiveFile();

		const isIgnored = activeFile && this.plugin ? this.plugin.isPathIgnored(activeFile.path) : false;
		const hasAttachedNote = !this.contextExcluded && !isIgnored && this.chatScope === "active-note" && activeFile;

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
		this.contextExcluded = false;
		this.isContextPinned = false;
		this.pinnedContextFile = null;
		this.setChatScope("active-note");
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

	private selectProvider(provider: AIProvider): void {
		if (this.isGenerating || this.selectedProvider === provider) return;
		this.selectedProvider = provider;
		this.conversationId = undefined;
		const def = ALL_AGENT_DEFS.find((d) => d.id === provider);
		const cached = this.plugin.aiService.getCachedModels?.(provider);
		this.availableModels = (cached && cached.length > 0)
			? cached
			: (def?.models || (provider === "antigravity" ? DEFAULT_AGY_MODELS : []));
		this.plugin.settings.aiProvider = provider;
		const remembered = this.plugin.settings.aiProviderLastModel?.[provider];
		this.selectedModel = remembered && remembered !== "auto" ? remembered : resolveOptimalModel(provider, this.availableModels);
		void this.plugin.saveSettings();
		this.updateProviderBtnLabel(); this.updateModelBtnLabel(); this.updateEffortBtn();
		this.updateVaultToggleState(); this.updateModeBtnLabel(); this.updateContextChip();
		void this.loadModelsForProvider(provider);
		if (this.currentChatFile) {
			void this.plugin.aiStorage.updateChatProvider(
				this.currentChatFile,
				provider,
				this.selectedModel,
				this.selectedReasoningEffort,
			);
		}
	}

	private async showProviderMenu(event: MouseEvent): Promise<void> {
		if (this.isGenerating) return;
		const menu = createCustomMenu();
		menu.addItem((item) => item.setTitle("CLI").setDisabled(true));
		const agents = await this.plugin.aiService.detectAllAgents();
		const installedMap = new Map<string, boolean>();
		for (const a of agents) {
			installedMap.set(a.id, a.isInstalled);
		}

		for (const def of ALL_AGENT_DEFS.filter((d) => d.id !== "ollama")) {
			const label = getAgentDisplayName(def.id);
			const isInstalled = installedMap.get(def.id) ?? false;
			const title = isInstalled ? label : `${label} (${t("settingsAIAgentMissing")})`;

			menu.addItem((item) => {
				item.setTitle(title);
				item.setIcon(def.icon);
				item.setChecked(this.selectedProvider === def.id);
				if (!isInstalled) {
					item.setDisabled(true);
				}
				item.onClick(() => { if (isInstalled) this.selectProvider(def.id); });
			});
		}

		for (const [kind, label] of [["api", "API"], ["local", "Local model"]] as const) {
			menu.addSeparator();
			menu.addItem((item) => item.setTitle(label).setDisabled(true));
			for (const connection of this.plugin.settings.aiConnections.filter((c) => c.kind === kind)) {
				menu.addItem((item) => item.setTitle(connection.name).setIcon(kind === "local" ? "server" : "cloud")
					.setChecked(this.selectedProvider === connectionProvider(connection.id)).onClick(() => this.selectProvider(connectionProvider(connection.id))));
			}
		}

		menu.showAtMouseEvent(event);
	}

	private showModelMenu(event: MouseEvent): void {
		if (this.isGenerating) return;
		const def = ALL_AGENT_DEFS.find((d) => d.id === this.selectedProvider);
		const cached = this.plugin.aiService.getCachedModels?.(this.selectedProvider);
		const rawModels =
			this.availableModels.length > 0
				? this.availableModels
				: (cached && cached.length > 0
					? cached
					: (def?.models || (this.selectedProvider === "antigravity" ? DEFAULT_AGY_MODELS : [])));
		const modelsToUse = rawModels.filter((m) => m.id !== "auto");

		const selectModel = (modelId: string) => {
			this.selectedModel = modelId;
			if (!this.plugin.settings.aiProviderLastModel) {
				this.plugin.settings.aiProviderLastModel = {};
			}
			this.plugin.settings.aiProviderLastModel[this.selectedProvider] = modelId;
			void this.plugin.saveSettings();
			this.updateModelBtnLabel();
			if (this.currentChatFile) {
				void this.plugin.aiStorage.updateChatModel(this.currentChatFile, modelId);
			}
		};

		// If list is large (> 8 models), open searchable SuggestModal directly
		if (modelsToUse.length > 8) {
			new ModelSuggestModal(
				this.app,
				modelsToUse,
				this.selectedModel,
				(selected) => selectModel(selected.id),
			).open();
			return;
		}

		// For short lists (<= 8 models), show compact dropdown menu
		const menu = createCustomMenu();
		for (const model of modelsToUse) {
			menu.addItem((item) => {
				item.setTitle(model.displayName);
				item.setChecked(this.selectedModel === model.id);
				item.onClick(() => selectModel(model.id));
			});
		}

		menu.showAtMouseEvent(event);
	}

	private showEffortMenu(event: MouseEvent): void {
		const menu = createCustomMenu();

		const options: Array<{
			id: ReasoningEffort;
			title: string;
			icon: string;
		}> = [
			{ id: "auto", title: t("aiChatEffortAuto"), icon: "sparkles" },
			{ id: "low", title: t("aiChatEffortLow"), icon: "zap" },
			{ id: "medium", title: t("aiChatEffortMedium"), icon: "sliders" },
			{ id: "high", title: t("aiChatEffortHigh"), icon: "brain" },
		];

		for (const opt of options) {
			menu.addItem((item) => {
				item.setTitle(opt.title);
				item.setIcon(opt.icon);
				item.setChecked(this.selectedReasoningEffort === opt.id);
				item.onClick(() => {
					this.selectedReasoningEffort = opt.id;
					this.plugin.settings.aiReasoningEffort = opt.id;
					void this.plugin.saveSettings();
					this.updateEffortBtn();
					if (this.currentChatFile) {
						void this.plugin.aiStorage.updateChatEffort(this.currentChatFile, opt.id);
					}
				});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private showModeMenu(event: MouseEvent): void {
		if (this.isGenerating) return;
		const menu = createCustomMenu();

		menu.addItem((item) => {
			item.setTitle(t("aiChatModeSafe"));
			item.setIcon("shield");
			item.setChecked(this.mode === "safe");
			item.onClick(() => {
				this.setMode("safe");
			});
		});

		menu.addItem((item) => {
			item.setTitle(t("aiChatModeEdit"));
			item.setIcon("zap");
			item.setChecked(this.mode === "edit");
			item.onClick(() => {
				this.setMode("edit");
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
		this.pendingQuote = null;
		this.renderSelectionQuote();
		try {
			const content = await this.app.vault.read(file);
			const parsed = this.plugin.aiStorage.parseChat(content, this.selectedModel);
			this.currentChatFile = file;
			this.currentChatTitle = parsed.metadata.title;

			// Validate and follow recorded provider, fallback to setting's default if not available
			const recordedProvider = parsed.metadata.provider;
			const isAvailable = recordedProvider
				? await this.plugin.aiService.isProviderAvailable(recordedProvider)
				: false;

			if (recordedProvider && isAvailable) {
				this.selectedProvider = recordedProvider;
				this.selectedModel = parsed.metadata.model || resolveOptimalModel(recordedProvider);
				this.conversationId = parsed.metadata.conversationId;
			} else {
				const fallbackProvider = this.plugin.settings.aiProvider || "antigravity";
				this.selectedProvider = fallbackProvider;
				const remembered = this.plugin.settings.aiProviderLastModel?.[fallbackProvider];
				this.selectedModel =
					remembered && remembered !== "auto"
						? remembered
						: resolveOptimalModel(fallbackProvider);
				this.conversationId = undefined;
				if (recordedProvider && !isAvailable) {
					console.warn(
						`Vault Code: Saved chat provider "${recordedProvider}" is unavailable; falling back to "${fallbackProvider}".`,
					);
				}
			}

			if (parsed.metadata.reasoning_effort) {
				this.selectedReasoningEffort = parsed.metadata.reasoning_effort;
			} else {
				this.selectedReasoningEffort = this.plugin.settings.aiReasoningEffort || "auto";
			}

			if (parsed.metadata.scope) {
				this.chatScope = parsed.metadata.scope;
			} else {
				this.chatScope = this.plugin.settings.aiScope || "active-note";
			}

			if (parsed.metadata.mode) {
				this.mode = parsed.metadata.mode;
			} else {
				this.mode = this.plugin.settings.aiMode || "safe";
			}

			this.messages = parsed.messages;

			if (this.headerTitleEl) {
				this.headerTitleEl.setText(this.currentChatTitle);
				this.headerTitleEl.title = `${this.currentChatTitle} (${t("aiChatRenameChat")})`;
				this.headerTitleEl.addClass("is-editable");
			}
			this.updateProviderBtnLabel();
			this.updateModelBtnLabel();
			this.updateEffortBtn();
			void this.loadModelsForProvider(this.selectedProvider);
			this.updateVaultToggleState();
			this.updateModeBtnLabel();
			this.updateContextChip();
			this.openNoteBtnEl?.show();

			this.renderMessages();
			this.inputEl?.focus();
		} catch (e) {
			console.error("Vault Code: Failed to load chat note", e);
			new Notice(t("aiChatNoticeDeleteFailed"));
		}
	}

	public startNewChat(): void {
		this.stopGenerating();
		this.pendingQuote = null;
		this.renderSelectionQuote();
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
		this.chatScope = this.plugin.settings.aiScope || "active-note";
		this.mode = this.plugin.settings.aiMode || "safe";
		this.selectedProvider = this.plugin.settings.aiProvider || "antigravity";
		const remembered = this.plugin.settings.aiProviderLastModel?.[this.selectedProvider];
		this.selectedModel =
			remembered && remembered !== "auto"
				? remembered
				: resolveOptimalModel(this.selectedProvider);
		this.selectedReasoningEffort = this.plugin.settings.aiReasoningEffort || "auto";
		this.updateProviderBtnLabel();
		this.updateModelBtnLabel();
		this.updateEffortBtn();
		this.updateModeBtnLabel();
		void this.loadModelsForProvider(this.selectedProvider);
		this.updateVaultToggleState();
		this.updateContextChip();
		this.renderMessages();
		this.inputEl.focus();
	}

	public clearChat(): void {
		this.startNewChat();
	}

	public attachSelection(quote: SelectionQuote): void {
		this.pendingQuote = quote;
		this.renderSelectionQuote();
		this.updateVaultToggleState();
		this.updateContextChip();
		this.focusInput();
	}

	private renderSelectionQuote(): void {
		if (!this.quoteContainerEl) return;
		this.quoteContainerEl.empty();
		const quote = this.pendingQuote;
		if (!quote) {
			this.inputEl?.setAttribute("placeholder", t("aiChatPlaceholder"));
			return;
		}
		this.inputEl?.setAttribute("placeholder", t("aiChatSelectionPlaceholder"));
		const row = this.quoteContainerEl.createDiv({ cls: "vault-code-chat-quote-row" });
		const details = row.createEl("details", { cls: "vault-code-chat-quote" });
		const summary = details.createEl("summary");
		const chevron = summary.createSpan({ cls: "vault-code-chat-quote-chevron" });
		setIcon(chevron, "chevron-right");
		const fileIcon = summary.createSpan({ cls: "vault-code-chat-quote-icon" });
		setIcon(fileIcon, "file-text");
		summary.createSpan({
			text: quote.path.split("/").pop() || quote.path,
			cls: "vault-code-chat-quote-file",
			attr: { "aria-label": selectionLabel(quote) },
		});
		summary.createSpan({
			text: `L${quote.startLine}${quote.endLine === quote.startLine ? "" : `–${quote.endLine}`}`,
			cls: "vault-code-chat-quote-lines",
		});
		details.createEl("pre", { cls: "vault-code-chat-quote-preview", text: quote.text });
		const remove = row.createEl("button", {
			cls: "clickable-icon vault-code-chat-quote-remove",
			attr: { "aria-label": t("aiChatRemoveQuote") },
		});
		setIcon(remove, "x");
		remove.addEventListener("click", () => {
			this.pendingQuote = null;
			this.renderSelectionQuote();
			this.updateVaultToggleState();
			this.updateContextChip();
			this.focusInput();
		});
	}

	public focusInput(): void {
		this.inputEl?.focus();
	}

	private renderMessages(): void {
		if (!this.messagesContainerEl) return;
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

		const subtitleEl = welcomeEl.createEl("p", {
			cls: "vault-code-chat-welcome-subtitle",
			text: t("aiChatWelcomeSubtitle"),
		});

		void this.plugin.aiService.detectAllAgents().then((agents) => {
			const anyInstalled = this.plugin.settings.aiConnections.length > 0 || agents.some((a) => a.id !== "ollama" && a.isInstalled);
			if (!anyInstalled) {
				subtitleEl.setText(
					"Connect a CLI agent, API provider, or local model in settings to get started.",
				);
				const btn = welcomeEl.createEl("button", {
					cls: "mod-cta vault-code-welcome-settings-btn",
					text: "Open settings",
				});
				btn.addEventListener("click", () => {
					const appWithSetting = this.app as unknown as {
						setting?: { open: () => void; openTabById: (id: string) => void };
					};
					appWithSetting.setting?.open?.();
					appWithSetting.setting?.openTabById?.("vault-code");
				});
			}
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
		void this.renderMessageBody(msg.role === "assistant" ? extractEditProposal(msg.content)?.explanation || msg.content : msg.content, bodyEl);

		return bubbleEl;
	}

	private renderMessageBody(markdown: string, bodyEl: HTMLElement): Promise<void> {
		return renderChatMarkdown(this.app, markdown, bodyEl, this.currentChatFile?.path || "", this);
	}

	private scheduleStreamingRender(msg: ChatMessage, bodyEl: HTMLElement): void {
		if (this.renderRafId !== null) return;

		this.renderRafId = window.requestAnimationFrame(() => {
			this.renderRafId = null;
			void this.renderMessageBody(extractEditProposal(msg.content)?.explanation || msg.content, bodyEl)
				.then(() => this.scrollToBottom());
		});
	}

	private scrollToBottom(): void {
		if (this.messagesContainerEl) {
			this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
		}
	}

	private async handleSubmit(): Promise<void> {
		if (this.isGenerating) return;

		const text = this.inputEl.value.trim();
		if (!text) return;
		const quote = this.pendingQuote;
		const messageText = quote ? quoteMessage(text, quote) : text;
		this.pendingQuote = null;
		this.renderSelectionQuote();
		this.updateVaultToggleState();
		this.updateContextChip();

		this.inputEl.value = "";
		this.autoResizeTextarea();
		this.updateSendButtonState();

		// Add user message
		const userMsg: ChatMessage = {
			id: `user-${Date.now()}`,
			role: "user",
			content: messageText,
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
		let selectionStart: number | undefined;

		if (quote) {
			const file = this.app.vault.getAbstractFileByPath(quote.path);
			activeFile = file instanceof TFile ? file : null;
			activeContent = quote.source;
			selectedText = quote.text;
			selectionStart = quote.from;
		} else if (this.chatScope === "active-note" && !this.contextExcluded) {
			activeFile = (this.isContextPinned && this.pinnedContextFile)
				? this.pinnedContextFile
				: this.app.workspace.getActiveFile();
			const isIgnored = activeFile && this.plugin ? this.plugin.isPathIgnored(activeFile.path) : false;
			if (activeFile && !isIgnored) {
				try {
					activeContent = await this.app.vault.read(activeFile);
				} catch {
					// ignore
				}
				const editor = this.app.workspace.activeEditor?.editor;
				if (editor && (!this.isContextPinned || this.app.workspace.getActiveFile()?.path === activeFile.path)) {
					selectedText = editor.getSelection();
					selectionStart = editor.posToOffset(editor.getCursor("from"));
				}
			} else {
				activeFile = null;
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
						provider: this.selectedProvider,
						model: this.selectedModel,
						reasoning_effort: supportsReasoningEffort(this.selectedProvider)
							? this.selectedReasoningEffort
							: undefined,
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
			prompt: messageText,
			contextInPrompt: Boolean(quote),
			history: this.messages.slice(0, -2).filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content })),
			provider: this.selectedProvider,
			model: this.selectedModel,
			reasoningEffort: this.selectedReasoningEffort,
			scope: quote ? "active-note" : this.chatScope,
			mode: this.mode,
			conversationId: this.conversationId,
			currentChatPath: this.currentChatFile?.path,
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
				if (this.renderRafId !== null) { window.cancelAnimationFrame(this.renderRafId); this.renderRafId = null; }
				const proposal = isConnectionProvider(this.selectedProvider) ? extractEditProposal(fullText) : null;
				if (proposal && this.mode === "edit" && activeFile) {
					const file = activeFile;
					let proposedContent = proposal.content;
					const validSelection = !selectedText || (selectionStart !== undefined && activeContent.slice(selectionStart, selectionStart + selectedText.length) === selectedText);
					if (selectedText && selectionStart !== undefined) proposedContent = activeContent.slice(0, selectionStart) + proposal.content + activeContent.slice(selectionStart + selectedText.length);
					if (validSelection) {
						const review = asstHeaderEl.createEl("button", { text: "Review edits", cls: "vault-code-cli-details-button" });
						review.addEventListener("click", () => new AIEditReviewModal(this.app, file, activeContent, proposedContent, () => { review.disabled = true; review.setText("Applied"); }).open());
					}
				}
				if (asstBodyEl) {
					void this.renderMessageBody(proposal ? proposal.explanation || "Proposed note update." : assistantMsg.content, asstBodyEl)
						.then(() => this.scrollToBottom());
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
							provider: this.selectedProvider,
							model: this.selectedModel,
							reasoning_effort: supportsReasoningEffort(this.selectedProvider)
								? this.selectedReasoningEffort
								: undefined,
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

				const isModelError = /model.*(?:not found|unknown|deprecated|discontinued|invalid|does not exist|unsupported)/i.test(err.message);
				if (isModelError) {
					const fallback = resolveOptimalModel(this.selectedProvider, this.availableModels);
					if (this.selectedModel !== fallback) {
						this.selectedModel = fallback;
						if (!this.plugin.settings.aiProviderLastModel) {
							this.plugin.settings.aiProviderLastModel = {};
						}
						this.plugin.settings.aiProviderLastModel[this.selectedProvider] = fallback;
						void this.plugin.saveSettings();
						this.updateModelBtnLabel();
						if (this.currentChatFile) {
							void this.plugin.aiStorage.updateChatModel(this.currentChatFile, fallback);
						}
						new Notice(t("aiChatNoticeModelOffShelf", fallback));
					}
				}

				assistantMsg.content = `> ⚠️ **Error**: ${err.message}`;
				if (asstBodyEl) {
					if (this.renderRafId !== null) { window.cancelAnimationFrame(this.renderRafId); this.renderRafId = null; }
					void this.renderMessageBody(assistantMsg.content, asstBodyEl).then(() => this.scrollToBottom());
				}
				this.finishGenerating();

				if (this.currentChatFile) {
					void this.plugin.aiStorage.updateChatNote(
						this.currentChatFile,
						{
							title: this.currentChatTitle,
							created: this.plugin.aiStorage.formatDateTime(),
							provider: this.selectedProvider,
							model: this.selectedModel,
							reasoning_effort: supportsReasoningEffort(this.selectedProvider)
								? this.selectedReasoningEffort
								: undefined,
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
