import { Platform, App, FileSystemAdapter, TFile } from "obsidian";
import type VaultCodePlugin from "./main";
import { t } from "./i18n";

export interface ChildProcessStream {
	on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
}

export interface ChildProcessStdin {
	write(chunk: string): boolean;
	end(): void;
}

export interface SpawnedProcess {
	pid?: number;
	stdout: ChildProcessStream | null;
	stderr: ChildProcessStream | null;
	stdin: ChildProcessStdin | null;
	on(
		event: "close",
		listener: (code: number | null, signal: string | null) => void,
	): this;
	on(event: "error", listener: (err: Error) => void): this;
	kill(signal?: string): boolean;
}

export type SpawnFn = (
	command: string,
	args: readonly string[],
	options: {
		cwd?: string;
		env?: Record<string, string>;
		windowsHide?: boolean;
		shell?: boolean | string;
	},
) => SpawnedProcess;

export type ExecFileFn = (
	file: string,
	args: readonly string[],
	options: {
		cwd?: string;
		timeout?: number;
		maxBuffer?: number;
		windowsHide?: boolean;
		shell?: boolean | string;
		env?: Record<string, string>;
	},
	callback: (
		error: Error | null,
		stdout: string | Uint8Array | null | undefined,
		stderr: string | Uint8Array | null | undefined,
	) => void,
) => void;

interface NodeChildProcess {
	spawn: SpawnFn;
	execFile: ExecFileFn;
}

export type AIProvider =
	| "antigravity"
	| "codex"
	| "claude"
	| "copilot"
	| "cursor"
	| "ollama"
	| "opencode"
	| "pi"
	| "kimi"
	| "grok"
	| "kiro"
	| "hermes";

export interface SendMessageOptions {
	prompt: string;
	provider?: AIProvider;
	model?: string;
	scope: "active-note" | "vault";
	mode: "safe" | "edit";
	conversationId?: string;
	activeFile?: TFile | null;
	activeContent?: string;
	selectedText?: string;
	onInit?: (conversationId: string) => void;
	onDelta?: (delta: string) => void;
	onDone?: (fullText: string) => void;
	onError?: (err: Error) => void;
}

export interface AIProcessHandle {
	kill: () => void;
	conversationId?: string;
}

export type AgyProcessHandle = AIProcessHandle;

export interface AgyModelInfo {
	id: string;
	displayName: string;
}

export type AIModelInfo = AgyModelInfo;

export interface DetectedAgentInfo {
	id: AIProvider;
	name: string;
	binary: string;
	icon: string;
	isInstalled: boolean;
	version: string;
	path: string | null;
	defaultModel: string;
	models: AgyModelInfo[];
}

export const DEFAULT_AGY_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
	{ id: "gemini-3.8-flash-medium", displayName: "Gemini 3.8 Flash (Medium)" },
	{ id: "gemini-3.8-flash-low", displayName: "Gemini 3.8 Flash (Low)" },
	{ id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6 (Thinking)" },
	{ id: "claude-opus-4-6-thinking", displayName: "Claude Opus 4.6 (Thinking)" },
	{ id: "gpt-oss-120b-medium", displayName: "GPT-OSS 120B (Medium)" },
];

export const DEFAULT_CODEX_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "gpt-6.1-sol", displayName: "GPT-6.1-Sol" },
	{ id: "gpt-6-astra", displayName: "GPT-6-Astra" },
	{ id: "gpt-6-sol", displayName: "GPT-6-Sol" },
	{ id: "gpt-6-luna", displayName: "GPT-6-Luna" },
	{ id: "gpt-5.6-sol", displayName: "GPT-5.6-Sol" },
	{ id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra" },
	{ id: "gpt-5.6-luna", displayName: "GPT-5.6-Luna" },
];

export const DEFAULT_CLAUDE_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6 (Thinking)" },
	{ id: "claude-opus-4-6-thinking", displayName: "Claude Opus 4.6 (Thinking)" },
	{ id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5" },
	{ id: "default", displayName: "Agent default" },
];

export const DEFAULT_COPILOT_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "claude-3.7-sonnet", displayName: "Claude 3.7 Sonnet" },
	{ id: "gpt-4o", displayName: "GPT-4o" },
	{ id: "o3-mini", displayName: "o3-mini" },
	{ id: "default", displayName: "Agent default" },
];

export const DEFAULT_CURSOR_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "claude-sonnet-5-thinking-high", displayName: "Claude Sonnet 5 Thinking" },
	{ id: "composer-2.5", displayName: "Composer 2.5" },
	{ id: "gpt-5.4-high", displayName: "GPT-5.4 High" },
	{ id: "gemini-3.7-flash-high", displayName: "Gemini 3.7 Flash" },
	{ id: "cursor-fast", displayName: "Cursor Fast" },
];

export const DEFAULT_OLLAMA_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "llama3.3", displayName: "Llama 3.3" },
	{ id: "qwen2.5-coder", displayName: "Qwen 2.5 Coder" },
	{ id: "deepseek-r1", displayName: "DeepSeek R1" },
	{ id: "mistral", displayName: "Mistral" },
	{ id: "default", displayName: "Agent default" },
];

export const DEFAULT_KIMI_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "kimi-k3", displayName: "Kimi K3" },
	{ id: "kimi-k2.7-code", displayName: "Kimi K2.7 Code" },
	{ id: "default", displayName: "Agent default" },
];

export const DEFAULT_GROK_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "grok-4.7", displayName: "Grok 4.7" },
	{ id: "grok-4.6", displayName: "Grok 4.6" },
	{ id: "default", displayName: "Agent default" },
];

export const DEFAULT_GENERIC_MODELS: AgyModelInfo[] = [
	{ id: "auto", displayName: "Auto (Recommended)" },
	{ id: "default", displayName: "Agent default" },
];

export function resolveOptimalModel(provider: AIProvider): string {
	switch (provider) {
		case "antigravity":
			return "gemini-3.8-flash-high";
		case "claude":
			return "claude-sonnet-4-6";
		case "codex":
			return "gpt-6.1-sol";
		case "copilot":
			return "claude-3.7-sonnet";
		case "cursor":
			return "auto";
		case "ollama":
			return "llama3.3";
		case "kimi":
			return "kimi-k3";
		case "grok":
			return "grok-4.7";
		case "opencode":
		case "pi":
		case "kiro":
		case "hermes":
		default:
			return "default";
	}
}

export const ALL_AGENT_DEFS: Array<{
	id: AIProvider;
	name: string;
	binary: string;
	icon: string;
	versionArgs: string[];
	defaultModel: string;
	models: AgyModelInfo[];
}> = [
	{
		id: "claude",
		name: "Claude Code",
		binary: "claude",
		icon: "sun",
		versionArgs: ["--version"],
		defaultModel: "claude-sonnet-4-6",
		models: DEFAULT_CLAUDE_MODELS,
	},
	{
		id: "codex",
		name: "Codex",
		binary: "codex",
		icon: "zap",
		versionArgs: ["--version"],
		defaultModel: "gpt-6.1-sol",
		models: DEFAULT_CODEX_MODELS,
	},
	{
		id: "copilot",
		name: "GitHub Copilot",
		binary: "copilot",
		icon: "bot",
		versionArgs: ["version"],
		defaultModel: "claude-3.7-sonnet",
		models: DEFAULT_COPILOT_MODELS,
	},
	{
		id: "cursor",
		name: "Cursor Agent",
		binary: "agent",
		icon: "compass",
		versionArgs: ["--version"],
		defaultModel: "auto",
		models: DEFAULT_CURSOR_MODELS,
	},
	{
		id: "ollama",
		name: "Ollama",
		binary: "ollama",
		icon: "server",
		versionArgs: ["--version"],
		defaultModel: "auto",
		models: DEFAULT_OLLAMA_MODELS,
	},
	{
		id: "opencode",
		name: "OpenCode",
		binary: "opencode",
		icon: "box",
		versionArgs: ["-v"],
		defaultModel: "default",
		models: DEFAULT_GENERIC_MODELS,
	},
	{
		id: "pi",
		name: "Pi",
		binary: "pi",
		icon: "cpu",
		versionArgs: ["--version"],
		defaultModel: "default",
		models: DEFAULT_GENERIC_MODELS,
	},
	{
		id: "antigravity",
		name: "Antigravity CLI",
		binary: "agy",
		icon: "sparkles",
		versionArgs: ["--version"],
		defaultModel: "gemini-3.8-flash-high",
		models: DEFAULT_AGY_MODELS,
	},
	{
		id: "kimi",
		name: "Kimi Code",
		binary: "kimi",
		icon: "moon",
		versionArgs: ["--version"],
		defaultModel: "auto",
		models: DEFAULT_KIMI_MODELS,
	},
	{
		id: "grok",
		name: "Grok Build",
		binary: "grok",
		icon: "zap",
		versionArgs: ["--version"],
		defaultModel: "auto",
		models: DEFAULT_GROK_MODELS,
	},
	{
		id: "kiro",
		name: "Kiro",
		binary: "kiro",
		icon: "ghost",
		versionArgs: ["--version"],
		defaultModel: "default",
		models: DEFAULT_GENERIC_MODELS,
	},
	{
		id: "hermes",
		name: "Hermes Agent",
		binary: "hermes",
		icon: "terminal",
		versionArgs: ["--version"],
		defaultModel: "default",
		models: DEFAULT_GENERIC_MODELS,
	},
];

export function getAgentDisplayName(provider: AIProvider): string {
	switch (provider) {
		case "antigravity":
			return t("settingsAIProviderAntigravity");
		case "codex":
			return t("settingsAIProviderCodex");
		case "claude":
			return t("aiChatProviderClaude");
		case "copilot":
			return t("aiChatProviderCopilot");
		case "cursor":
			return t("aiChatProviderCursor");
		case "ollama":
			return t("aiChatProviderOllama");
		case "opencode":
			return t("aiChatProviderOpenCode");
		case "pi":
			return t("aiChatProviderPi");
		case "kimi":
			return t("aiChatProviderKimi");
		case "grok":
			return t("aiChatProviderGrok");
		case "kiro":
			return t("aiChatProviderKiro");
		case "hermes":
			return t("aiChatProviderHermes");
		default:
			return provider;
	}
}

export class AIService {
	private app: App;
	private plugin?: VaultCodePlugin;
	private cachedCp: NodeChildProcess | null = null;
	private cachedPaths = new Map<string, string | null>();
	private detectedAgentsCache: DetectedAgentInfo[] | null = null;

	constructor(app: App, plugin?: VaultCodePlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	public isAvailable(): boolean {
		return Platform.isDesktop;
	}

	private async resolveChildProcess(): Promise<NodeChildProcess | null> {
		if (!Platform.isDesktop) return null;
		if (this.cachedCp) return this.cachedCp;

		try {
			const win = window as unknown as {
				require?: (mod: string) => unknown;
			};
			if (typeof win.require === "function") {
				const cpModule = win.require("child_process") as NodeChildProcess | undefined;
				if (
					cpModule &&
					typeof cpModule.spawn === "function" &&
					typeof cpModule.execFile === "function"
				) {
					this.cachedCp = cpModule;
					return this.cachedCp;
				}
			}
		} catch {
			// ignore
		}

		try {
			const cpModule = (await import("child_process")) as unknown as NodeChildProcess;
			if (
				cpModule &&
				typeof cpModule.spawn === "function" &&
				typeof cpModule.execFile === "function"
			) {
				this.cachedCp = cpModule;
				return this.cachedCp;
			}
		} catch {
			// ignore
		}

		return null;
	}

	private getEnv(): Record<string, string> {
		const proc = (
			window as unknown as { process?: { env?: Record<string, string> } }
		).process;
		const procEnv: Record<string, string> = proc?.env ?? {};
		const home = procEnv.HOME || procEnv.USERPROFILE || "";
		const pathSep = Platform.isWin ? ";" : ":";
		const currentPath = procEnv.PATH ?? "";
		const extraPaths = currentPath.split(pathSep).filter(Boolean);

		if (Platform.isWin) {
			const appData = procEnv.APPDATA || (home ? `${home}\\AppData\\Roaming` : "");
			const localAppData = procEnv.LOCALAPPDATA || (home ? `${home}\\AppData\\Local` : "");
			if (appData) {
				extraPaths.unshift(`${appData}\\npm`);
			}
			if (localAppData) {
				extraPaths.unshift(
					`${localAppData}\\Programs\\OpenCode\\bin`,
					`${localAppData}\\Programs\\Antigravity\\bin`,
				);
			}
			if (home) {
				extraPaths.unshift(`${home}\\.cargo\\bin`, `${home}\\bin`);
			}
		} else {
			if (home) {
				extraPaths.unshift(
					`${home}/.local/bin`,
					`${home}/.nvm/versions/node/v24.13.0/bin`,
					`${home}/.nvm/versions/node/v20.20.0/bin`,
					`${home}/.opencode/bin`,
					`${home}/.cargo/bin`,
					`${home}/bin`,
				);
			}
			extraPaths.unshift(
				"/opt/homebrew/bin",
				"/opt/homebrew/sbin",
				"/usr/local/bin",
				"/usr/bin",
				"/bin",
				"/usr/sbin",
				"/sbin",
			);
		}

		return {
			...procEnv,
			PATH: Array.from(new Set(extraPaths)).join(pathSep),
		};
	}

	public getVaultPath(): string | null {
		if (!this.isAvailable()) return null;
		const adapter = this.app.vault.adapter as unknown as {
			getBasePath?: () => string;
			basePath?: string;
		};
		if (typeof adapter?.getBasePath === "function") {
			return adapter.getBasePath().replace(/\\/g, "/").replace(/\/+$/, "");
		}
		if (typeof adapter?.basePath === "string" && adapter.basePath.length > 0) {
			return adapter.basePath.replace(/\\/g, "/").replace(/\/+$/, "");
		}
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			return this.app.vault.adapter.getBasePath().replace(/\\/g, "/").replace(/\/+$/, "");
		}
		return null;
	}

	public getMCPConfigSnippet(): string {
		const vaultPath = this.getVaultPath() || "";
		const config = {
			mcpServers: {
				tolaria: {
					command: "/opt/homebrew/bin/node",
					args: ["/Applications/Tolaria.app/Contents/Resources/mcp-server/index.js"],
					env: {
						WS_UI_PORT: "9711",
						VAULT_PATH: vaultPath,
					},
					type: "stdio",
				},
			},
		};
		return JSON.stringify(config, null, 2);
	}

	public async detectBinaryPath(
		binary: string,
		customOverride?: string,
		fallbackCandidates: string[] = [],
	): Promise<string | null> {
		if (customOverride && customOverride.trim().length > 0) {
			return customOverride.trim();
		}

		const cached = this.cachedPaths.get(binary);
		if (cached !== undefined) return cached;

		const cp = await this.resolveChildProcess();
		if (!cp) return null;

		const env = this.getEnv();
		const checkCommand = Platform.isWin ? "where" : "which";

		const detected = await new Promise<string | null>((resolve) => {
			cp.execFile(
				checkCommand,
				[binary],
				{ env, timeout: 3000, shell: Platform.isWin },
				(err, stdout) => {
					if (!err && stdout) {
						const firstLine = stdout.toString().split("\n")[0]?.trim();
						if (firstLine && firstLine.length > 0) {
							resolve(firstLine);
							return;
						}
					}

					// Fallback candidates check via filesystem
					const proc = (
						window as unknown as { process?: { env?: Record<string, string> } }
					).process;
					const home = proc?.env?.HOME || proc?.env?.USERPROFILE || "";
					const win = window as unknown as {
						require?: (mod: string) => { existsSync?: (p: string) => boolean };
					};

					const allFallbacks: string[] = [...fallbackCandidates];
					if (home) {
						allFallbacks.push(
							`${home}/.local/bin/${binary}`,
							`${home}/.nvm/versions/node/v24.13.0/bin/${binary}`,
							`${home}/.nvm/versions/node/v20.20.0/bin/${binary}`,
							`${home}/.opencode/bin/${binary}`,
							`${home}/.cargo/bin/${binary}`,
							`${home}/bin/${binary}`,
						);
						if (Platform.isWin) {
							allFallbacks.push(
								`${home}\\AppData\\Roaming\\npm\\${binary}.cmd`,
								`${home}\\AppData\\Roaming\\npm\\${binary}`,
							);
						}
					}
					if (!Platform.isWin) {
						allFallbacks.push(
							`/opt/homebrew/bin/${binary}`,
							`/usr/local/bin/${binary}`,
							`/usr/bin/${binary}`,
						);
					}

					for (const c of allFallbacks) {
						try {
							if (typeof win.require === "function") {
								const fs = win.require("fs");
								if (fs?.existsSync?.(c)) {
									resolve(c);
									return;
								}
							}
						} catch {
							// ignore
						}
					}
					resolve(null);
				},
			);
		});

		this.cachedPaths.set(binary, detected);
		return detected;
	}

	public async detectAgyPath(customOverride?: string): Promise<string | null> {
		const override = customOverride || this.plugin?.settings.aiCustomPath;
		return await this.detectBinaryPath("agy", override, ["/opt/homebrew/bin/agy", "/usr/local/bin/agy"]);
	}

	public async detectCodexPath(customOverride?: string): Promise<string | null> {
		const override = customOverride || this.plugin?.settings.aiCodexPath;
		return await this.detectBinaryPath("codex", override, [
			"/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
		]);
	}

	public async detectAllAgents(): Promise<DetectedAgentInfo[]> {
		if (this.detectedAgentsCache) return this.detectedAgentsCache;

		const cp = await this.resolveChildProcess();
		const env = this.getEnv();
		const results: DetectedAgentInfo[] = [];

		for (const def of ALL_AGENT_DEFS) {
			let customOverride: string | undefined;
			if (def.id === "antigravity") customOverride = this.plugin?.settings.aiCustomPath;
			if (def.id === "codex") customOverride = this.plugin?.settings.aiCodexPath;

			const binPath = await this.detectBinaryPath(def.binary, customOverride);
			let version = "";
			let isInstalled = false;

			if (binPath && cp) {
				isInstalled = true;
				version = await new Promise<string>((resolve) => {
					cp.execFile(
						binPath,
						def.versionArgs,
						{ env, timeout: 3000, shell: Platform.isWin },
						(err, stdout, stderr) => {
							const text = (stdout || stderr || "").toString().trim();
							const firstLine = text.split("\n")[0]?.trim() || "";
							resolve(firstLine || "Installed");
						},
					);
				});
			}

			results.push({
				id: def.id,
				name: def.name,
				binary: def.binary,
				icon: def.icon,
				isInstalled,
				version,
				path: binPath,
				defaultModel: def.defaultModel,
				models: def.models,
			});
		}

		this.detectedAgentsCache = results;
		return results;
	}

	public refreshAgentsCache(): void {
		this.detectedAgentsCache = null;
		this.cachedPaths.clear();
	}

	public async getAvailableModels(customOverride?: string): Promise<AgyModelInfo[]> {
		const agyPath = await this.detectAgyPath(customOverride);
		if (!agyPath) return DEFAULT_AGY_MODELS;

		const cp = await this.resolveChildProcess();
		if (!cp) return DEFAULT_AGY_MODELS;

		const env = this.getEnv();
		const vaultPath = this.getVaultPath() || "";

		return await new Promise<AgyModelInfo[]>((resolve) => {
			cp.execFile(
				agyPath,
				["models"],
				{ env, cwd: vaultPath, timeout: 6000 },
				(err, stdout) => {
					if (err || !stdout) {
						resolve(DEFAULT_AGY_MODELS);
						return;
					}
					const text = stdout.toString();
					const lines = text.split("\n");
					const parsed: AgyModelInfo[] = [];

					for (const line of lines) {
						const cleaned = line.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+Fetching available models\.\.\./g, "").trim();
						if (!cleaned) continue;
						const match = cleaned.match(/^([a-z0-9._-]+)\s+(.+)$/i);
						if (match && match[1] && match[2]) {
							parsed.push({
								id: match[1].trim(),
								displayName: match[2].trim(),
							});
						}
					}

					if (parsed.length > 0) {
						resolve(parsed);
					} else {
						resolve(DEFAULT_AGY_MODELS);
					}
				},
			);
		});
	}

	public async getCodexModels(): Promise<AgyModelInfo[]> {
		try {
			const proc = (
				window as unknown as { process?: { env?: Record<string, string> } }
			).process;
			const home = proc?.env?.HOME || proc?.env?.USERPROFILE || "";
			if (home) {
				const win = window as unknown as {
					require?: (mod: string) => {
						readFileSync?: (path: string, enc: string) => string;
						existsSync?: (path: string) => boolean;
					};
				};
				if (typeof win.require === "function") {
					const fs = win.require("fs");
					const sep = Platform.isWin ? "\\" : "/";
					const cacheFile = `${home}${sep}.codex${sep}models_cache.json`;
					if (fs?.existsSync?.(cacheFile) && fs?.readFileSync) {
						const raw = fs.readFileSync(cacheFile, "utf8");
						const data = JSON.parse(raw) as {
							models?: Array<{
								slug?: string;
								display_name?: string;
								visibility?: string;
							}>;
						};
						if (Array.isArray(data?.models) && data.models.length > 0) {
							const filtered = data.models
								.filter((m) => m.visibility !== "hide" && m.slug)
								.map((m) => ({
									id: m.slug as string,
									displayName: m.display_name || (m.slug as string),
								}));
							if (filtered.length > 0) return filtered;
						}
					}
				}
			}
		} catch {
			// ignore
		}
		return DEFAULT_CODEX_MODELS;
	}

	public async getModelsForProvider(provider: AIProvider): Promise<AgyModelInfo[]> {
		if (provider === "codex") {
			return await this.getCodexModels();
		}
		if (provider === "antigravity") {
			return await this.getAvailableModels();
		}
		const found = ALL_AGENT_DEFS.find((d) => d.id === provider);
		return found ? found.models : DEFAULT_GENERIC_MODELS;
	}

	public async getVaultIgnorePatterns(): Promise<string[]> {
		const configDir = this.app.vault.configDir;
		const patterns: string[] = [configDir, ".trash", ".git"].filter(Boolean);
		try {
			if (await this.app.vault.adapter.exists(".obsidianignore")) {
				const content = await this.app.vault.adapter.read(".obsidianignore");
				const lines = content
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter((l) => l.length > 0 && !l.startsWith("#"));
				for (const line of lines) {
					if (!patterns.includes(line)) {
						patterns.push(line);
					}
				}
			}
		} catch {
			// ignore
		}
		try {
			if (await this.app.vault.adapter.exists(".gitignore")) {
				const content = await this.app.vault.adapter.read(".gitignore");
				const lines = content
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter((l) => l.length > 0 && !l.startsWith("#"));
				for (const line of lines) {
					if (!patterns.includes(line)) {
						patterns.push(line);
					}
				}
			}
		} catch {
			// ignore
		}
		return patterns;
	}

	private async buildEffectivePrompt(options: SendMessageOptions): Promise<string> {
		let effectivePrompt = options.prompt.trim();

		if (options.scope === "active-note" && options.activeFile) {
			const contextHeader = [
				`[Context: Active Note "${options.activeFile.path}"]`,
			];
			if (options.selectedText && options.selectedText.trim().length > 0) {
				contextHeader.push(
					"Selected Text snippet:",
					"```",
					options.selectedText.trim(),
					"```",
				);
			} else if (options.activeContent && options.activeContent.trim().length > 0) {
				contextHeader.push(
					"File Content:",
					"```",
					options.activeContent.trim(),
					"```",
				);
			}
			contextHeader.push("--- User Question / Request ---", effectivePrompt);
			effectivePrompt = contextHeader.join("\n");
		} else if (options.scope === "vault") {
			const ignorePatterns = await this.getVaultIgnorePatterns();
			const ignoreListText = ignorePatterns.map((p) => `- ${p}`).join("\n");
			const vaultHeader = [
				"[Context: Entire Vault]",
				"Strict Ignore Rule: You MUST strictly ignore and skip all files and folders matching the following patterns (do NOT read, search, index, list, or modify them under any circumstances):",
				ignoreListText,
				"--- User Question / Request ---",
				effectivePrompt,
			];
			effectivePrompt = vaultHeader.join("\n");
		}

		return effectivePrompt;
	}

	public sendMessage(options: SendMessageOptions): AIProcessHandle {
		let isKilled = false;
		let spawned: SpawnedProcess | null = null;
		let activeConversationId = options.conversationId;

		const handle: AIProcessHandle = {
			kill: () => {
				isKilled = true;
				if (spawned) {
					try {
						if (Platform.isWin && spawned.pid) {
							const win = window as unknown as {
								require?: (mod: string) => { execSync?: (cmd: string) => void };
							};
							const cpSync = win.require?.("child_process");
							cpSync?.execSync?.(`taskkill /pid ${spawned.pid} /T /F`);
						} else {
							spawned.kill("SIGTERM");
							window.setTimeout(() => {
								try {
									spawned?.kill("SIGKILL");
								} catch {
									// ignore
								}
							}, 800);
						}
					} catch {
						try {
							spawned.kill();
						} catch {
							// ignore
						}
					}
				}
			},
			get conversationId() {
				return activeConversationId;
			},
		};

		const provider: AIProvider = options.provider ?? this.plugin?.settings.aiProvider ?? "antigravity";

		void (async () => {
			const cp = await this.resolveChildProcess();
			if (!cp) {
				options.onError?.(new Error("Desktop child_process runtime not available"));
				return;
			}

			const vaultPath = this.getVaultPath() || "";
			const env = this.getEnv();
			const effectivePrompt = await this.buildEffectivePrompt(options);

			let binPath: string | null = null;
			let args: string[] = [];

			if (provider === "antigravity") {
				binPath = await this.detectAgyPath();
				if (!binPath) {
					options.onError?.(new Error("Antigravity CLI (agy) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt, "--output-format", "stream-json"];
				if (options.model && options.model.trim().length > 0) {
					args.push("--model", options.model.trim());
				}
				if (options.mode === "safe") {
					args.push("--sandbox");
				} else {
					args.push("--mode", "accept-edits", "--dangerously-skip-permissions");
				}
				if (options.conversationId && options.conversationId.trim().length > 0) {
					args.push("--conversation", options.conversationId.trim());
				}
			} else if (provider === "codex") {
				binPath = await this.detectCodexPath();
				if (!binPath) {
					options.onError?.(new Error("Codex CLI (codex) not found on system"));
					return;
				}
				const isUuid = !!(options.conversationId && /^[0-9a-fA-F-]{36}$/.test(options.conversationId.trim()));
				if (isUuid && options.conversationId) {
					args.push("exec", "resume", options.conversationId.trim(), "--skip-git-repo-check", "--json", "-C", vaultPath);
				} else {
					args.push("exec", "--skip-git-repo-check", "--json", "-C", vaultPath);
				}
				if (options.model && options.model.trim().length > 0) {
					args.push("-m", options.model.trim());
				}
				if (options.mode === "safe") {
					args.push("-s", "read-only");
				} else {
					args.push("--dangerously-bypass-approvals-and-sandbox");
				}
				args.push(effectivePrompt);
			} else if (provider === "claude") {
				binPath = await this.detectBinaryPath("claude");
				if (!binPath) {
					options.onError?.(new Error("Claude Code CLI (claude) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
				if (options.mode === "edit") {
					args.push("--dangerously-skip-permissions");
				}
				if (options.model && options.model !== "default") {
					args.push("--model", options.model.trim());
				}
				if (options.conversationId && options.conversationId.trim()) {
					args.push("--resume", options.conversationId.trim());
				}
			} else if (provider === "copilot") {
				binPath = await this.detectBinaryPath("copilot");
				if (!binPath) {
					options.onError?.(new Error("GitHub Copilot CLI (copilot) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
				if (options.model && options.model !== "default") {
					args.push("--model", options.model.trim());
				}
			} else if (provider === "opencode") {
				binPath = await this.detectBinaryPath("opencode");
				if (!binPath) {
					options.onError?.(new Error("OpenCode CLI (opencode) not found on system"));
					return;
				}
				args = ["run", effectivePrompt, "--dir", vaultPath];
				if (options.mode === "edit") {
					args.push("--auto");
				}
				if (options.model && options.model !== "default") {
					args.push("-m", options.model.trim());
				}
				if (options.conversationId && options.conversationId.trim()) {
					args.push("-s", options.conversationId.trim());
				}
			} else if (provider === "pi") {
				binPath = await this.detectBinaryPath("pi");
				if (!binPath) {
					options.onError?.(new Error("Pi CLI (pi) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt, "--mode", "text"];
				if (options.model && options.model !== "default") {
					args.push("--model", options.model.trim());
				}
			} else if (provider === "cursor") {
				binPath = await this.detectBinaryPath("agent", undefined, [
					"/Users/anthony/.local/bin/agent",
					"/Users/anthony/.local/bin/cursor-agent",
				]);
				if (!binPath) {
					binPath = await this.detectBinaryPath("cursor-agent");
				}
				if (!binPath) {
					options.onError?.(new Error("Cursor Agent CLI (agent) not found on system"));
					return;
				}
				args = [
					"-p",
					effectivePrompt,
					"--output-format",
					"stream-json",
					"--stream-partial-output",
					"--workspace",
					vaultPath,
				];
				if (options.mode === "safe") {
					args.push("--mode", "ask");
				} else {
					args.push("--force");
				}
				const modelVal = options.model === "auto" ? "auto" : options.model;
				if (modelVal && modelVal !== "default") {
					args.push("--model", modelVal.trim());
				}
				if (options.conversationId && options.conversationId.trim()) {
					args.push("--resume", options.conversationId.trim());
				}
			} else if (provider === "ollama") {
				binPath = await this.detectBinaryPath("ollama", undefined, ["/usr/local/bin/ollama"]);
				if (!binPath) {
					options.onError?.(new Error("Ollama CLI (ollama) not found on system"));
					return;
				}
				const modelToUse =
					!options.model || options.model === "auto" || options.model === "default"
						? "llama3.3"
						: options.model.trim();
				args = ["run", modelToUse, effectivePrompt, "--keepalive", "30m"];
			} else if (provider === "kimi") {
				binPath = await this.detectBinaryPath("kimi");
				if (!binPath) {
					options.onError?.(new Error("Kimi Code CLI (kimi) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
				if (options.model && options.model !== "auto" && options.model !== "default") {
					args.push("--model", options.model.trim());
				}
			} else if (provider === "grok") {
				binPath = await this.detectBinaryPath("grok");
				if (!binPath) {
					options.onError?.(new Error("Grok Build CLI (grok) not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
				if (options.model && options.model !== "auto" && options.model !== "default") {
					args.push("--model", options.model.trim());
				}
			} else if (provider === "kiro") {
				binPath = await this.detectBinaryPath("kiro");
				if (!binPath) {
					options.onError?.(new Error("Kiro CLI not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
			} else if (provider === "hermes") {
				binPath = await this.detectBinaryPath("hermes");
				if (!binPath) {
					options.onError?.(new Error("Hermes Agent CLI not found on system"));
					return;
				}
				args = ["-p", effectivePrompt];
			}

			if (!binPath) {
				options.onError?.(new Error(`Provider '${provider}' executable not found`));
				return;
			}

			try {
				spawned = cp.spawn(binPath, args, {
					cwd: vaultPath,
					env,
					windowsHide: true,
					shell: Platform.isWin,
				});
			} catch (err) {
				options.onError?.(err instanceof Error ? err : new Error(String(err)));
				return;
			}

			let accumulatedText = "";
			let lineBuffer = "";

			const processLine = (rawLine: string) => {
				const line = rawLine.trim();
				if (!line) return;

				if (provider === "antigravity") {
					try {
						const parsed = JSON.parse(line) as {
							event?: string;
							conversation_id?: string;
							step_update?: { text_delta?: string };
							result?: { response?: string };
						};
						if (parsed.event === "init" && parsed.conversation_id) {
							activeConversationId = parsed.conversation_id;
							options.onInit?.(parsed.conversation_id);
						} else if (parsed.event === "step_update" && parsed.step_update?.text_delta) {
							const delta = parsed.step_update.text_delta;
							accumulatedText += delta;
							options.onDelta?.(delta);
						} else if (parsed.event === "result" && parsed.result?.response) {
							if (!accumulatedText) {
								accumulatedText = parsed.result.response;
								options.onDelta?.(accumulatedText);
							}
						}
					} catch {
						if (!line.startsWith("{")) {
							accumulatedText += line + "\n";
							options.onDelta?.(line + "\n");
						}
					}
				} else if (provider === "codex") {
					try {
						const parsed = JSON.parse(line) as {
							type?: string;
							thread_id?: string;
							item?: { type?: string; text?: string };
							error?: { message?: string };
							message?: string;
						};
						if (parsed.type === "thread.started" && parsed.thread_id) {
							activeConversationId = parsed.thread_id;
							options.onInit?.(parsed.thread_id);
						} else if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item?.text) {
							const delta = parsed.item.text;
							accumulatedText += delta;
							options.onDelta?.(delta);
						} else if (parsed.type === "error" && parsed.message) {
							try {
								const inner = JSON.parse(parsed.message) as { error?: { message?: string } };
								if (inner.error?.message) {
									options.onError?.(new Error(inner.error.message));
									return;
								}
							} catch {
								// ignore
							}
						}
					} catch {
						if (!line.startsWith("{")) {
							accumulatedText += line + "\n";
							options.onDelta?.(line + "\n");
						}
					}
				} else if (provider === "cursor") {
					try {
						const parsed = JSON.parse(line) as {
							event?: string;
							type?: string;
							conversation_id?: string;
							chatId?: string;
							text_delta?: string;
							delta?: string;
							content?: string;
							text?: string;
							response?: string;
						};
						const cId = parsed.conversation_id || parsed.chatId;
						if (cId) {
							activeConversationId = cId;
							options.onInit?.(cId);
						}
						const delta =
							parsed.text_delta ||
							parsed.delta ||
							parsed.text ||
							parsed.content ||
							parsed.response;
						if (delta) {
							accumulatedText += delta;
							options.onDelta?.(delta);
						}
					} catch {
						if (!line.startsWith("{")) {
							accumulatedText += line + "\n";
							options.onDelta?.(line + "\n");
						}
					}
				} else {
					// Claude, Copilot, Ollama, OpenCode, Pi, Kimi, Grok, Kiro, Hermes text streaming
					accumulatedText += line + "\n";
					options.onDelta?.(line + "\n");
				}
			};

			spawned.stdout?.on("data", (chunk: Uint8Array | string) => {
				if (isKilled) return;
				const str = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
				lineBuffer += str;

				const lines = lineBuffer.split("\n");
				lineBuffer = lines.pop() ?? "";

				for (const line of lines) {
					processLine(line);
				}
			});

			let stderrOutput = "";
			spawned.stderr?.on("data", (chunk: Uint8Array | string) => {
				if (isKilled) return;
				const str = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
				stderrOutput += str;
			});

			spawned.on("close", (code) => {
				if (isKilled) return;

				if (lineBuffer.trim().length > 0) {
					processLine(lineBuffer);
				}

				if (code === 0 || accumulatedText.length > 0) {
					options.onDone?.(accumulatedText);
				} else {
					const def = ALL_AGENT_DEFS.find((d) => d.id === provider);
					const agentName = def?.name || provider;
					let errMsg = stderrOutput.trim();
					if (!errMsg) {
						errMsg = `${agentName} exited with code ${code}. Please check that the agent is authenticated and up to date.`;
					} else if (/rate.?limit|too many requests|429/i.test(errMsg)) {
						errMsg += "\n\n> 💡 **Tip**: Rate limit reached. You can switch to another agent using the bottom bar or retry in a moment.";
					} else if (/quota|credit|insufficient|balance|token limit|exceeded/i.test(errMsg)) {
						errMsg += "\n\n> 💡 **Tip**: Quota or token limit exceeded for this provider. Switch to an alternate provider in the bottom bar.";
					} else if (/auth|login|unauthorized|401|403|credential/i.test(errMsg)) {
						errMsg += `\n\n> 💡 **Tip**: Authentication required. Run \`${def?.binary || provider} login\` in your terminal to re-authenticate.`;
					}
					options.onError?.(new Error(errMsg));
				}
			});

			spawned.on("error", (err: Error) => {
				if (isKilled) return;
				options.onError?.(err);
			});
		})();

		return handle;
	}
}
