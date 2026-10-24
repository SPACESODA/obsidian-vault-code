import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { ChatMessage } from "./ai-chat-view";

export interface ChatMetadata {
	title: string;
	created: string;
	last_chat?: string;
	model: string;
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

		return await this.app.vault.createFolder(normalized);
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
	 * Writes YAML properties (no model, no title H1 in body) and uses '##### You' and '##### Agent' (H5).
	 */
	public serializeChat(metadata: ChatMetadata, messages: ChatMessage[]): string {
		const lastChat = metadata.last_chat || this.formatDateTime();
		const yamlLines = [
			"---",
			"type: Agent Chat",
			`title: ${JSON.stringify(metadata.title)}`,
			`created: ${JSON.stringify(metadata.created)}`,
			`last_chat: ${JSON.stringify(lastChat)}`,
			`scope: ${JSON.stringify(metadata.scope)}`,
			`mode: ${JSON.stringify(metadata.mode)}`,
		];

		if (metadata.conversationId) {
			yamlLines.push(`conversation_id: ${JSON.stringify(metadata.conversationId)}`);
		}

		yamlLines.push("---", "");

		for (const msg of messages) {
			if (msg.role === "user") {
				yamlLines.push("##### You", "", msg.content.trim(), "");
			} else {
				yamlLines.push("##### Agent", "", msg.content.trim(), "");
			}
		}

		return yamlLines.join("\n");
	}

	/**
	 * Parses a Markdown chat note back into structured metadata and messages.
	 * Supports '##### You' / '##### Agent' as well as legacy header formats.
	 */
	public parseChat(content: string, defaultModel = "gemini-3.8-flash-high"): ParsedChat {
		const nowStr = this.formatDateTime();
		const metadata: ChatMetadata = {
			title: "Untitled Chat",
			created: nowStr,
			last_chat: nowStr,
			model: defaultModel,
			scope: "active-note",
			mode: "edit",
		};

		let bodyContent = content;

		// Extract Frontmatter
		const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
		if (fmMatch && fmMatch[1]) {
			const fmBlock = fmMatch[1];
			bodyContent = fmMatch[2] ?? "";

			const titleMatch = fmBlock.match(/title:\s*"?([^"\n\r]+)"?/);
			if (titleMatch && titleMatch[1]) metadata.title = titleMatch[1].trim();

			const createdMatch = fmBlock.match(/created:\s*"?([^"\n\r]+)"?/);
			if (createdMatch && createdMatch[1]) metadata.created = createdMatch[1].trim();

			const lastChatMatch = fmBlock.match(/last_chat:\s*"?([^"\n\r]+)"?/);
			if (lastChatMatch && lastChatMatch[1]) metadata.last_chat = lastChatMatch[1].trim();

			const modelMatch = fmBlock.match(/model:\s*"?([^"\n\r]+)"?/);
			if (modelMatch && modelMatch[1]) metadata.model = modelMatch[1].trim();

			const scopeMatch = fmBlock.match(/scope:\s*"?([^"\n\r]+)"?/);
			if (scopeMatch && scopeMatch[1] && (scopeMatch[1] === "active-note" || scopeMatch[1] === "vault")) {
				metadata.scope = scopeMatch[1];
			}

			const modeMatch = fmBlock.match(/mode:\s*"?([^"\n\r]+)"?/);
			if (modeMatch && modeMatch[1] && (modeMatch[1] === "safe" || modeMatch[1] === "edit")) {
				metadata.mode = modeMatch[1];
			}

			const convMatch = fmBlock.match(/conversation_id:\s*"?([^"\n\r]+)"?/);
			if (convMatch && convMatch[1]) metadata.conversationId = convMatch[1].trim();
		}

		// Parse Turns (support ##### You / ##### Agent, #### You / #### Agent, as well as legacy formats)
		const messages: ChatMessage[] = [];
		const turnSections = bodyContent.split(/\n(?=#{2,5}\s+(?:👤|✨|✦\s*)?(?:You|Agent|Assistant))/gi);

		for (let i = 0; i < turnSections.length; i++) {
			const section = turnSections[i]?.trim();
			if (!section) continue;

			const isUser = /^#{2,5}\s+(?:👤\s*)?You/i.test(section);
			const isAssistant = /^#{2,5}\s+(?:✨|✦\s*)?(?:Agent|Assistant)/i.test(section);

			if (isUser) {
				const text = section.replace(/^#{2,5}[^\n]*\n+/i, "").trim();
				if (text) {
					messages.push({
						id: `user-${Date.now()}-${i}`,
						role: "user",
						content: text,
						timestamp: Date.now(),
					});
				}
			} else if (isAssistant) {
				const text = section.replace(/^#{2,5}[^\n]*\n+/i, "").trim();
				if (text) {
					messages.push({
						id: `asst-${Date.now()}-${i}`,
						role: "assistant",
						content: text,
						timestamp: Date.now(),
					});
				}
			}
		}

		return { metadata, messages };
	}

	/**
	 * Updates the title of an existing chat note in its frontmatter.
	 */
	public async updateChatTitle(file: TFile, newTitle: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm["title"] = newTitle;
		});
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
		const content = this.serializeChat(updatedMetadata, messages);
		await this.app.vault.modify(file, content);
	}

	/**
	 * Lists all chat notes in the vault, sorted by last modified (newest first).
	 */
	public async listChatNotes(folderPath: string): Promise<TFile[]> {
		const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
		const allFiles = this.app.vault.getMarkdownFiles();

		const chatFiles: TFile[] = [];

		for (const file of allFiles) {
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

		return chatFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
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

		if (rule === "all") {
			for (const file of files) {
				await this.deleteChatNote(file);
			}
			return files.length;
		}

		const days = rule === "7d" ? 7 : rule === "30d" ? 30 : 90;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

		let deletedCount = 0;
		for (const file of files) {
			if (file.stat.mtime < cutoff) {
				await this.deleteChatNote(file);
				deletedCount++;
			}
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
