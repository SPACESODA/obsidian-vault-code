import { App, TFile, TFolder, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import type { ChatMessage } from "./ai-chat-view";
import { type AIProvider, type ReasoningEffort, supportsReasoningEffort } from "./ai-service";

import { t } from "./i18n";
import { parseChatTimestamp } from "./ai-chat-dates";
import { escapeChatTurnMarkers, parseChatTurns } from "./ai-chat-turns";
import { CHAT_PROPERTIES, chatProperty, migrateChatProperties } from "./ai-chat-properties";

function chatFrontmatter(content: string): { properties: Record<string, unknown>; body: string } | null {
	const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
	if (!match) return null;
	const parsed: unknown = parseYaml(match[1] ?? "");
	if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("Chat frontmatter must be a YAML mapping.");
	return { properties: (parsed ?? {}) as Record<string, unknown>, body: match[2] ?? "" };
}

export const DEFAULT_AGENT_INSTRUCTIONS = `- Keep a helpful, professional, and concise tone.
- Respond in clear, readable Markdown unless another format is requested.
- Distinguish facts from assumptions. Ask a brief question when missing information would materially affect the result.
- When referencing Markdown notes in the vault, use Obsidian wikilinks such as [[Note Title]]. Use file paths for other file types.
- Preserve each file's language, structure, formatting, and conventions unless the requested change requires otherwise.
- Keep edits focused on the request. Preserve unrelated content, links, metadata, and functionality.
`;

export interface ChatMetadata {
	title: string;
	created: string;
	last_chat?: string;
	provider?: AIProvider;
	model: string;
	reasoning_effort?: ReasoningEffort;
	scope: "active-note" | "vault";
	mode: "safe" | "edit";
	conversationId?: string;
}

export interface ParsedChat {
	metadata: ChatMetadata;
	messages: ChatMessage[];
}

export class AIStorage {
	private app: App;
	private pendingInstructions = new Map<string, Promise<TFile>>();

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Ensures the target folder exists in the vault.
	 */
	public async ensureFolder(folderPath: string): Promise<TFolder> {
		const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		const existing = this.app.vault.getAbstractFileByPath(normalized);

		if (existing instanceof TFolder) {
			return existing;
		}

		if (normalized.length === 0) {
			return this.app.vault.getRoot();
		}

		try {
			return await this.app.vault.createFolder(normalized);
		} catch (error) {
			// Another operation may have created the same folder while we awaited it.
			const created = this.app.vault.getAbstractFileByPath(normalized);
			if (created instanceof TFolder) return created;
			throw error;
		}
	}

	/**
	 * Formats a timestamp into YYYY-MM-DD HH:mm:ss string.
	 */
	public formatDateTime(date = new Date()): string {
		const pad = (n: number) => String(n).padStart(2, "0");
		const year = date.getFullYear();
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hours = pad(date.getHours());
		const mins = pad(date.getMinutes());
		const secs = pad(date.getSeconds());
		return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
	}

	/**
	 * Generates a clean, kebab-case title from the user's first prompt.
	 */
	public slugifyTitle(raw: string): string {
		const cleaned = raw
			.replace(/[\\/:*?"<>|#^[\]]/g, "")
			.trim()
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");

		const words = cleaned.split("-").slice(0, 6).join("-");
		return words || "chat";
	}

	/**
	 * Generates a unique, available file path in the target folder.
	 */
	/**
	 * Generates a unique, available file path in the target folder using local date and 24H time:
	 * YYYY-MM-DD--HHmmss.md (e.g. 2026-10-24--115702.md)
	 */
	public async getAvailablePath(folderPath: string, _baseSlug?: string): Promise<string> {
		const folder = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
		const baseName = `${datePart}--${timePart}`;

		let candidate = folder ? `${folder}/${baseName}.md` : `${baseName}.md`;
		let counter = 1;

		while (await this.app.vault.adapter.exists(candidate)) {
			candidate = folder
				? `${folder}/${baseName}-${counter}.md`
				: `${baseName}-${counter}.md`;
			counter++;
		}

		return candidate;
	}

	/**
	 * Serializes chat metadata and message transcript into a clean Markdown string.
	 * Writes namespaced YAML chat properties (no title H1 in body) and uses '##### You' and '##### Agent' (H5).
	 */
	private formatPropertyDateTime(value: unknown): string | null {
		const timestamp = parseChatTimestamp(value);
		return timestamp === null ? null : this.formatDateTime(new Date(timestamp)).replace(" ", "T");
	}

	public serializeChat(metadata: ChatMetadata, messages: ChatMessage[]): string {
		const lastChat = this.formatPropertyDateTime(metadata.last_chat) ?? this.formatDateTime().replace(" ", "T");
		const created = this.formatPropertyDateTime(metadata.created);
		const yamlLines = [
			"---",
			"type: Agent Chat",
			`title: ${JSON.stringify(metadata.title)}`,
			`chat_created: ${created ?? JSON.stringify(metadata.created)}`,
			`chat_last: ${lastChat}`,
			`chat_scope: ${JSON.stringify(metadata.scope)}`,
			`chat_mode: ${JSON.stringify(metadata.mode)}`,
		];

		if (metadata.provider) {
			yamlLines.push(`chat_provider: ${JSON.stringify(metadata.provider)}`);
		}

		if (metadata.model) {
			yamlLines.push(`chat_model: ${JSON.stringify(metadata.model)}`);
		}

		if (metadata.conversationId) {
			yamlLines.push(`chat_id: ${JSON.stringify(metadata.conversationId)}`);
		}

		if (metadata.reasoning_effort && metadata.reasoning_effort !== "auto") {
			yamlLines.push(`chat_effort: ${JSON.stringify(metadata.reasoning_effort)}`);
		}

		yamlLines.push("---", "");

		for (const msg of messages) {
			if (msg.role === "user") {
				yamlLines.push("<!-- user -->", "##### You", "", escapeChatTurnMarkers(msg.content.trim()), "");
			} else {
				yamlLines.push("<!-- agent -->", "##### Agent", "", escapeChatTurnMarkers(msg.content.trim()), "");
			}
		}

		return yamlLines.join("\n");
	}

	/**
	 * Parses a Markdown chat note back into structured metadata and messages.
	 * Uses explicit role markers for new notes and accepts legacy heading formats.
	 */
	public parseChat(content: string, defaultModel = "gemini-3.8-flash-high"): ParsedChat {
		const nowStr = this.formatDateTime();
		const metadata: ChatMetadata = {
			title: t("aiChatNewChat"),
			created: nowStr,
			last_chat: nowStr,
			model: defaultModel,
			scope: "active-note",
			mode: "safe",
		};

		let bodyContent = content;

		const frontmatter = chatFrontmatter(content);
		if (frontmatter) {
			bodyContent = frontmatter.body;
			const fm = frontmatter.properties;
			if (typeof fm.title === "string") metadata.title = fm.title;
			const created = chatProperty(fm, "created");
			if (typeof created === "string") metadata.created = created;
			else if (created instanceof Date && parseChatTimestamp(created) !== null) metadata.created = this.formatPropertyDateTime(created)!;
			const last = chatProperty(fm, "last_chat");
			if (typeof last === "string") metadata.last_chat = last;
			else if (last instanceof Date && parseChatTimestamp(last) !== null) metadata.last_chat = this.formatDateTime(last).replace(" ", "T");
			const provider = chatProperty(fm, "provider");
			if (typeof provider === "string") metadata.provider = provider as AIProvider;
			const model = chatProperty(fm, "model");
			if (typeof model === "string") metadata.model = model;
			const effort = chatProperty(fm, "reasoning_effort");
			if (effort === "auto" || effort === "low" || effort === "medium" || effort === "high") metadata.reasoning_effort = effort;
			const scope = chatProperty(fm, "scope");
			if (scope === "active-note" || scope === "vault") metadata.scope = scope;
			const mode = chatProperty(fm, "mode");
			if (mode === "safe" || mode === "edit") metadata.mode = mode;
			const id = chatProperty(fm, "conversation_id");
			if (typeof id === "string") metadata.conversationId = id;
		}

		const messages: ChatMessage[] = parseChatTurns(bodyContent).map((turn, index) => ({
			id: `${turn.role}-${Date.now()}-${index}`,
			role: turn.role,
			content: turn.content,
			timestamp: Date.now(),
		}));

		return { metadata, messages };
	}

	/**
	 * Updates the title of an existing chat note in its frontmatter.
	 */
	public async updateChatTitle(file: TFile, newTitle: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			migrateChatProperties(fm);
			fm["title"] = newTitle;
		});
	}

	/**
	 * Updates the mode of an existing chat note in its frontmatter immediately.
	 */
	public async updateChatMode(file: TFile, newMode: "safe" | "edit"): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				migrateChatProperties(fm);
				fm["chat_mode"] = newMode;
			});
		} catch (err) {
			console.error("Vault Code: Failed to update chat mode frontmatter", err);
		}
	}

	/**
	 * Updates the scope of an existing chat note in its frontmatter immediately.
	 */
	public async updateChatScope(file: TFile, newScope: "active-note" | "vault"): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				migrateChatProperties(fm);
				fm["chat_scope"] = newScope;
			});
		} catch (err) {
			console.error("Vault Code: Failed to update chat scope frontmatter", err);
		}
	}

	/**
	 * Updates the provider and optionally model/effort of an existing chat note in its frontmatter immediately.
	 */
	public async updateChatProvider(
		file: TFile,
		newProvider: AIProvider,
		newModel?: string,
		newEffort?: ReasoningEffort,
	): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				migrateChatProperties(fm);
				fm["chat_provider"] = newProvider;
				if (newModel !== undefined) {
					fm["chat_model"] = newModel;
				}
				if (supportsReasoningEffort(newProvider)) {
					if (newEffort !== undefined) {
						fm["chat_effort"] = newEffort;
					}
				} else {
					delete fm["chat_effort"];
				}
			});
		} catch (err) {
			console.error("Vault Code: Failed to update chat provider frontmatter", err);
		}
	}

	/**
	 * Updates the model of an existing chat note in its frontmatter immediately.
	 */
	public async updateChatModel(file: TFile, newModel: string): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				migrateChatProperties(fm);
				fm["chat_model"] = newModel;
			});
		} catch (err) {
			console.error("Vault Code: Failed to update chat model frontmatter", err);
		}
	}

	/**
	 * Updates the reasoning effort of an existing chat note in its frontmatter immediately.
	 */
	public async updateChatEffort(file: TFile, newEffort: ReasoningEffort): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				migrateChatProperties(fm);
				fm["chat_effort"] = newEffort;
			});
		} catch (err) {
			console.error("Vault Code: Failed to update chat reasoning effort frontmatter", err);
		}
	}

	/**
	 * Creates a new chat note in the vault.
	 */
	public async createChatNote(
		folderPath: string,
		title: string,
		messages: ChatMessage[],
		metadata: Omit<ChatMetadata, "title" | "created">,
	): Promise<TFile> {
		await this.ensureFolder(folderPath);

		const baseSlug = this.slugifyTitle(title);
		const filePath = await this.getAvailablePath(folderPath, baseSlug);

		const nowStr = this.formatDateTime();
		const fullMetadata: ChatMetadata = {
			...metadata,
			title,
			created: nowStr,
			last_chat: nowStr,
		};

		const content = this.serializeChat(fullMetadata, messages);
		return await this.app.vault.create(filePath, content);
	}

	/**
	 * Updates an existing chat note with latest messages and metadata.
	 */
	public async updateChatNote(
		file: TFile,
		metadata: ChatMetadata,
		messages: ChatMessage[],
	): Promise<void> {
		const updatedMetadata: ChatMetadata = {
			...metadata,
			last_chat: this.formatDateTime(),
		};
		const serialized = chatFrontmatter(this.serializeChat(updatedMetadata, messages))!;
		await this.app.vault.process(file, current => {
			const previous = chatFrontmatter(current);
			const properties = { ...previous?.properties };
			migrateChatProperties(properties);
			// Preserve user properties and the original creation date while replacing owned metadata.
			for (const key of Object.values(CHAT_PROPERTIES)) delete properties[key];
			Object.assign(properties, serialized.properties);
			const originalCreated = previous ? chatProperty(previous.properties, "created") : undefined;
			if (originalCreated !== undefined) properties.chat_created = this.formatPropertyDateTime(originalCreated) ?? originalCreated;
			return `---\n${stringifyYaml(properties).trimEnd()}\n---\n${serialized.body}`;
		});
	}

	/** Shared by history sorting and its visible date; renaming a note does not count as chatting. */
	public getLastChatTime(file: TFile): number {
		const properties = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		return parseChatTimestamp(chatProperty(properties, "last_chat")) ?? file.stat.mtime;
	}

	/** Lists chat notes by last chat time, newest first; older notes fall back to modification time. */
	public async listChatNotes(folderPath: string): Promise<TFile[]> {
		const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		const allFiles = this.app.vault.getMarkdownFiles();
		const instructionsPath = this.getInstructionsPath(normalized);

		const chatFiles: TFile[] = [];

		for (const file of allFiles) {
			if (file.path === instructionsPath) continue;
			// Keep instruction notes from previous chat folders out of cleanup, while
			// allowing explicitly marked chat histories that happen to use this name.
			if (file.name === "instructions.md") {
				const type: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.type;
				if (type !== "Agent Chat" && type !== "AI Chat") continue;
			}
			const inFolder = normalized.length === 0 || file.path.startsWith(`${normalized}/`);

			if (inFolder) {
				chatFiles.push(file);
				continue;
			}

			// Also match files anywhere that have frontmatter type: Agent Chat or AI Chat
			const cache = this.app.metadataCache.getFileCache(file);
			if (
				cache?.frontmatter &&
				(cache.frontmatter.type === "Agent Chat" || cache.frontmatter.type === "AI Chat")
			) {
				chatFiles.push(file);
			}
		}

		const timestamps = new Map(chatFiles.map(file => [file, this.getLastChatTime(file)]));
		return chatFiles.sort((a, b) => timestamps.get(b)! - timestamps.get(a)! || a.path.localeCompare(b.path));
	}

	/** Returns the path to instructions.md in the specified chat folder. */
	public getInstructionsPath(folderPath: string): string {
		const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		return normalized ? `${normalized}/instructions.md` : "instructions.md";
	}

	/** Ensures instructions.md exists in the chat folder, recreating it with defaults if missing. */
	public async ensureInstructionsFile(folderPath: string): Promise<TFile> {
		const filePath = this.getInstructionsPath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			return existing;
		}
		const pending = this.pendingInstructions.get(filePath);
		if (pending) return pending;
		const task = (async () => {
			try {
				await this.ensureFolder(folderPath);
				const created = this.app.vault.getAbstractFileByPath(filePath);
				if (created instanceof TFile) return created;
				return await this.app.vault.create(filePath, DEFAULT_AGENT_INSTRUCTIONS);
			} catch (error) {
				// Sync or another plugin may have created the note in the meantime.
				const created = this.app.vault.getAbstractFileByPath(filePath);
				if (created instanceof TFile) return created;
				throw error;
			}
		})();
		this.pendingInstructions.set(filePath, task);
		try {
			return await task;
		} finally {
			this.pendingInstructions.delete(filePath);
		}
	}

	/** Loads instructions text, recreating the default note if deleted or missing. */
	public async loadInstructions(folderPath: string): Promise<string> {
		let raw = DEFAULT_AGENT_INSTRUCTIONS;
		try {
			const file = await this.ensureInstructionsFile(folderPath);
			raw = await this.app.vault.read(file);
		} catch {
			// Fall back to the built-in instructions if the note cannot be read.
		}
		return raw
			.replace(/^\uFEFF?---[\t ]*\r?\n(?:[\s\S]*?\r?\n)?---[\t ]*(?:\r?\n|$)/, "")
			// Keep a boundary so removing a comment cannot form a new comment opener.
			.replace(/<!--[\s\S]*?(?:-->|$)/g, "\n")
			.trim();
	}

	/**
	 * Deletes a single chat note, moving it safely to the vault's trash.
	 */
	public async deleteChatNote(file: TFile): Promise<void> {
		await this.app.fileManager.trashFile(file);
	}

	/**
	 * Cleans up old chat notes based on a cutoff age rule.
	 */
	public async cleanupOldChats(
		folderPath: string,
		rule: "7d" | "30d" | "90d" | "all",
	): Promise<number> {
		const files = await this.listChatNotes(folderPath);
		if (files.length === 0) return 0;

		const days = rule === "7d" ? 7 : rule === "30d" ? 30 : 90;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

		let deletedCount = 0;
		for (const file of files) {
			// Recheck actual contents before destructive cleanup; folder membership
			// and cached metadata alone do not prove that a note is a chat.
			let isChat = false;
			try {
				const content = await this.app.vault.read(file);
				const frontmatter = chatFrontmatter(content);
				const type = frontmatter?.properties.type;
				const turns = parseChatTurns(frontmatter?.body ?? content);
				isChat = type === "Agent Chat" || type === "AI Chat"
					|| (type === undefined && turns.some(turn => turn.role === "user") && turns.some(turn => turn.role === "assistant"));
				const lastChat = parseChatTimestamp(chatProperty(frontmatter?.properties ?? {}, "last_chat")) ?? file.stat.mtime;
				if (rule !== "all" && lastChat >= cutoff) isChat = false;
			} catch { /* Unreadable or malformed notes are never cleanup candidates. */ }
			if (!isChat) continue;
			await this.deleteChatNote(file);
			deletedCount++;
		}

		return deletedCount;
	}

	/**
	 * Runs automatic cleanup if configured.
	 */
	public async runAutoCleanup(
		folderPath: string,
		autoCleanRule: "never" | "7d" | "30d" | "90d",
	): Promise<number> {
		if (autoCleanRule === "never") return 0;
		return await this.cleanupOldChats(folderPath, autoCleanRule);
	}
}
