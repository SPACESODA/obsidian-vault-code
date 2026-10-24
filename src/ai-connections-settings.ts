import { App, Modal, Notice, Setting, setIcon, requireApiVersion } from "obsidian";
import type VaultCodePlugin from "./main";
import { type AIConnection, type APIFormat, type ConnectionKind, CONNECTION_PRESETS, connectionProvider, connectionSecretId, parseModelIds, validateConnection } from "./ai-connections";

export function renderConnectionSettings(container: HTMLElement, plugin: VaultCodePlugin, kind: ConnectionKind): void {
	const section = container.createDiv({ cls: "vault-code-connections" });
	const header = section.createDiv({ cls: "vault-code-agent-title-row" });
	header.createDiv({ cls: "vault-code-agent-section-title", text: kind === "api" ? "API connections" : "Local models" });
	const redraw = () => { section.remove(); renderConnectionSettings(container, plugin, kind); };
	const openAdd = () => new ConnectionModal(plugin.app, plugin, kind, undefined, redraw).open();
	const connections = plugin.settings.aiConnections.filter((c) => c.kind === kind);
	const addLabel = kind === "api" ? "Add provider" : "Add local model";
	if (connections.length) {
		const add = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": addLabel, title: addLabel } });
		setIcon(add, "plus");
		add.addEventListener("click", openAdd);
	} else {
		const empty = section.createDiv({ cls: "vault-code-connections-empty" });
		empty.createDiv({ text: kind === "api" ? "Connect a provider with your API key." : "Connect Ollama, LM Studio, Atomic Chat, or another local server." });
		empty.createEl("button", { cls: "mod-cta", text: addLabel }).addEventListener("click", openAdd);
	}
	for (const connection of connections) {
		const row = section.createDiv({ cls: `vault-code-connection-row${plugin.settings.aiProvider === connectionProvider(connection.id) ? " is-active" : ""}`, attr: { tabindex: "0", role: "button", "aria-label": `Use ${connection.name}`, "aria-pressed": String(plugin.settings.aiProvider === connectionProvider(connection.id)) } });
		const info = row.createDiv({ cls: "vault-code-connection-info" });
		info.createDiv({ cls: "vault-code-agent-card-name", text: connection.name });
		info.createDiv({ cls: "vault-code-connection-models", text: connection.models.join(", "), attr: { title: connection.models.join(", ") } });
		const select = async () => {
			plugin.settings.aiProvider = connectionProvider(connection.id);
			plugin.settings.aiProviderLastModel ||= {};
			plugin.settings.aiProviderLastModel[connectionProvider(connection.id)] ||= connection.models[0] || "default";
			await plugin.saveSettings(); redraw();
		};
		row.addEventListener("click", () => { void select(); });
		row.addEventListener("keydown", (event) => { if (event.target === row && ["Enter", " "].includes(event.key)) { event.preventDefault(); void select(); } });
		const edit = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": `Edit ${connection.name}`, title: "Edit connection" } });
		setIcon(edit, "pencil");
		edit.addEventListener("click", (event) => { event.stopPropagation(); new ConnectionModal(plugin.app, plugin, kind, connection, redraw).open(); });
	}
}

class ConnectionModal extends Modal {
	private draft: AIConnection;
	private key = "";
	private clearKey = false;
	private busy = false;
	constructor(app: App, private plugin: VaultCodePlugin, kind: ConnectionKind, private existing: AIConnection | undefined, private onSaved: () => void) {
		super(app);
		const preset = CONNECTION_PRESETS.find((p) => p.kind === kind)!;
		this.draft = existing ? { ...existing, models: [...existing.models], headers: { ...existing.headers } } : {
			id: crypto.randomUUID(), name: preset.name, kind, baseUrl: preset.baseUrl, format: preset.format, models: [],
		};
	}
	onOpen(): void {
		const root = this.contentEl;
		root.empty(); root.addClass("vault-code-connection-modal");
		root.createEl("h3", { text: this.existing ? "Edit connection" : "Add connection" });
		let nameInput: HTMLInputElement;
		let urlInput: HTMLInputElement;
		let formatSelect: HTMLSelectElement;
		if (!this.existing) new Setting(root).setName("Preset").addDropdown((dropdown) => {
			for (const preset of CONNECTION_PRESETS.filter((p) => p.kind === this.draft.kind)) dropdown.addOption(preset.id, preset.name);
			dropdown.onChange((id) => {
				const preset = CONNECTION_PRESETS.find((p) => p.id === id)!;
				this.draft.name = preset.name === "Custom" ? "" : preset.name;
				this.draft.baseUrl = preset.baseUrl; this.draft.format = preset.format;
				nameInput.value = this.draft.name; urlInput.value = this.draft.baseUrl; formatSelect.value = this.draft.format;
				status.setText("");
			});
		});
		new Setting(root).setName("Name").addText((text) => { nameInput = text.inputEl; text.setValue(this.draft.name).onChange((v) => { this.draft.name = v; }); });
		new Setting(root).setName(this.draft.kind === "api" ? "Base URL" : "Server URL").addText((text) => { urlInput = text.inputEl; text.inputEl.placeholder = "Base URL"; text.setValue(this.draft.baseUrl).onChange((v) => { this.draft.baseUrl = v; }); });
		let keyInput: HTMLInputElement;
		const keySetting = new Setting(root).setName("API key").addText((text) => {
			keyInput = text.inputEl;
			text.inputEl.type = "password"; text.inputEl.autocomplete = "off";
			text.setPlaceholder(this.plugin.aiService.getConnectionKey(this.draft.id) ? "Saved key (leave blank to keep)" : "Optional if not required")
				.onChange((v) => { this.key = v.trim(); this.clearKey = false; });
		});
		let modelInput: HTMLTextAreaElement;
		const modelsSetting = new Setting(root).setName("Models").addTextArea((area) => {
			area.inputEl.rows = 3;
			area.setPlaceholder("One model ID per line").setValue(this.draft.models.join("\n")).onChange((v) => { this.draft.models = parseModelIds(v); });
			modelInput = area.inputEl;
		});
		const discover = modelsSetting.controlEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Discover models", title: "Discover models" } });
		setIcon(discover, "refresh-cw");
		const advancedButton = root.createEl("button", { cls: "vault-code-cli-details-button", text: "Advanced", attr: { "aria-expanded": "false" } });
		const advanced = root.createDiv({ cls: "vault-code-connection-advanced" }); advanced.hidden = true;
		advancedButton.addEventListener("click", () => { advanced.hidden = !advanced.hidden; advancedButton.setAttribute("aria-expanded", String(!advanced.hidden)); });
		new Setting(advanced).setName("API format").addDropdown((dropdown) => {
			formatSelect = dropdown.selectEl;
			dropdown.addOption("chat-completions", "OpenAI compatible").addOption("responses", "OpenAI responses").addOption("anthropic", "Anthropic messages")
				.setValue(this.draft.format).onChange((v) => { this.draft.format = v as APIFormat; });
		});
		let headersText = JSON.stringify(this.draft.headers || {}, null, 2);
		new Setting(advanced).setName("Headers").setDesc("Optional JSON. Keep credentials in the API key field.").addTextArea((area) => area.setValue(headersText).onChange((v) => { headersText = v; }));
		if (this.draft.kind === "local") advanced.prepend(keySetting.settingEl);
		if (this.plugin.aiService.getConnectionKey(this.draft.id)) new Setting(advanced).setName("Saved key").addButton((button) => button.setButtonText("Clear on save").onClick(() => { this.clearKey = true; this.key = ""; keyInput.value = ""; keyInput.placeholder = "Key will be removed"; button.setButtonText("Will clear on save"); }));
		const status = root.createDiv({ cls: "vault-code-connection-status", attr: { role: "status" } });
		const actions = root.createDiv({ cls: "vault-code-connection-actions" });
		const test = actions.createEl("button", { text: "Test", attr: { title: "Send a short test request. API charges may apply." } });
		const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
		const keyOverride = () => this.clearKey ? "" : this.key || undefined;
		const prepare = (requireModels = true) => {
			this.draft.name = this.draft.name.trim(); this.draft.baseUrl = this.draft.baseUrl.trim().replace(/\/+$/, "");
			const headers: unknown = JSON.parse(headersText || "{}");
			if (!headers || typeof headers !== "object" || Array.isArray(headers) || Object.values(headers).some((v) => typeof v !== "string")) throw new Error("Headers must be a JSON object with string values.");
			this.draft.headers = headers as Record<string, string>;
			validateConnection(requireModels ? this.draft : { ...this.draft, models: ["discovery"] });
		};
		const run = async (button: HTMLButtonElement, label: string, action: () => Promise<void>) => {
			if (this.busy) return;
			this.busy = true;
			const previous = button.textContent || ""; button.setText(label);
			for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>("input,button,textarea,select")) control.disabled = true;
			status.setText("");
			try { await action(); } catch (error: unknown) { status.setText(error instanceof Error ? error.message : String(error)); }
			finally {
				this.busy = false;
				if (button === discover) { button.empty(); setIcon(button, "refresh-cw"); } else button.setText(previous);
				for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>("input,button,textarea,select")) control.disabled = false;
			}
		};
		discover.addEventListener("click", () => { void run(discover, "…", async () => {
			prepare(false);
			const models = await this.plugin.aiService.discoverConnectionModels(this.draft, keyOverride());
			if (!models.length) throw new Error("No models found. Enter model IDs manually.");
			this.draft.models = [...new Set([...this.draft.models, ...models.map((m) => m.id)])];
			modelInput.value = this.draft.models.join("\n"); status.setText(`${models.length} models found`);
		}); });
		test.addEventListener("click", () => { void run(test, "Testing...", async () => { prepare(); await this.plugin.aiService.testConnection(this.draft, keyOverride()); status.setText("Connected"); }); });
		save.addEventListener("click", () => { void run(save, "Saving...", async () => {
			prepare();
			if (this.key || this.clearKey) {
				if (requireApiVersion("1.11.4")) this.app.secretStorage.setSecret(connectionSecretId(this.draft.id), this.clearKey ? "" : this.key);
				else throw new Error("API key storage requires Obsidian 1.11.4 or newer.");
			}
			const connections = this.plugin.settings.aiConnections.filter((c) => c.id !== this.draft.id);
			this.plugin.settings.aiConnections = [...connections, { ...this.draft }];
			if (this.existing) {
				const target = connectionProvider(this.draft.id);
				const remembered = this.plugin.settings.aiProviderLastModel?.[target];
				if (remembered && !this.draft.models.includes(remembered)) this.plugin.settings.aiProviderLastModel![target] = this.draft.models[0]!;
			}
			await this.plugin.saveSettings(); this.close(); this.onSaved();
		}); });
		if (this.existing) {
			const remove = actions.createEl("button", { text: "Remove" });
			remove.addEventListener("click", () => { void run(remove, "Removing...", async () => {
				this.plugin.settings.aiConnections = this.plugin.settings.aiConnections.filter((c) => c.id !== this.draft.id);
				if (this.plugin.settings.aiProvider === connectionProvider(this.draft.id)) this.plugin.settings.aiProvider = "antigravity";
				if (requireApiVersion("1.11.4")) this.app.secretStorage?.setSecret(connectionSecretId(this.draft.id), "");
				await this.plugin.saveSettings(); this.close(); this.onSaved(); new Notice("Connection removed");
			}); });
		}
	}
	onClose(): void { this.key = ""; this.contentEl.empty(); }
}
