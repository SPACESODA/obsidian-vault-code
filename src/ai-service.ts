import { Platform, App, FileSystemAdapter, TFile } from "obsidian";
import type VaultCodePlugin from "./main";

export interface ChildProcessStream {
	on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
}

export interface ChildProcessStdin {
	write(chunk: string): boolean;
	end(): void;
}

export interface SpawnedProcess {
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

export interface SendMessageOptions {
	prompt: string;
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

export interface AgyProcessHandle {
	kill: () => void;
	conversationId?: string;
}

export interface AgyModelInfo {
	id: string;
	displayName: string;
}

export const DEFAULT_AGY_MODELS: AgyModelInfo[] = [
	{ id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
	{ id: "gemini-3.8-flash-medium", displayName: "Gemini 3.8 Flash (Medium)" },
	{ id: "gemini-3.8-flash-low", displayName: "Gemini 3.8 Flash (Low)" },
	{ id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6 (Thinking)" },
	{ id: "claude-opus-4-6-thinking", displayName: "Claude Opus 4.6 (Thinking)" },
	{ id: "gpt-oss-120b-medium", displayName: "GPT-OSS 120B (Medium)" },
];

export class AIService {
	private app: App;
	private plugin?: VaultCodePlugin;
	private cachedCp: NodeChildProcess | null = null;
	private cachedAgyPath: string | null = null;

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
		const customPath = [
			"/opt/homebrew/bin",
			"/opt/homebrew/sbin",
			"/usr/local/bin",
			"/usr/bin",
			"/bin",
			"/usr/sbin",
			"/sbin",
			procEnv.PATH || "",
		].join(":");

		return {
			...procEnv,
			PATH: customPath,
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

	public async detectAgyPath(customOverride?: string): Promise<string | null> {
		if (customOverride && customOverride.trim().length > 0) {
			this.cachedAgyPath = customOverride.trim();
			return this.cachedAgyPath;
		}

		if (this.cachedAgyPath) return this.cachedAgyPath;

		const cp = await this.resolveChildProcess();
		if (!cp) return null;

		const env = this.getEnv();
		const checkCommand = Platform.isWin ? "where" : "which";
		const binaryName = "agy";

		const detected = await new Promise<string | null>((resolve) => {
			cp.execFile(
				checkCommand,
				[binaryName],
				{ env, timeout: 3000 },
				(err, stdout) => {
					if (!err && stdout) {
						const firstLine = stdout.toString().split("\n")[0]?.trim();
						if (firstLine && firstLine.length > 0) {
							resolve(firstLine);
							return;
						}
					}
					// Fallback to well-known homebrew path on macOS
					if (Platform.isMacOS) {
						resolve("/opt/homebrew/bin/agy");
						return;
					}
					resolve(null);
				},
			);
		});

		this.cachedAgyPath = detected;
		return detected;
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

	public sendMessage(options: SendMessageOptions): AgyProcessHandle {
		let isKilled = false;
		let spawned: SpawnedProcess | null = null;
		let activeConversationId = options.conversationId;

		const handle: AgyProcessHandle = {
			kill: () => {
				isKilled = true;
				if (spawned) {
					try {
						spawned.kill("SIGTERM");
					} catch {
						// ignore
					}
				}
			},
			get conversationId() {
				return activeConversationId;
			},
		};

		void (async () => {
			const agyPath = await this.detectAgyPath();
			if (!agyPath) {
				options.onError?.(new Error("Antigravity CLI (agy) not found on system"));
				return;
			}

			const cp = await this.resolveChildProcess();
			if (!cp) {
				options.onError?.(new Error("Desktop child_process runtime not available"));
				return;
			}

			const vaultPath = this.getVaultPath() || "";
			const env = this.getEnv();

			// Construct effective prompt with context
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

			const args: string[] = [
				"-p",
				effectivePrompt,
				"--output-format",
				"stream-json",
			];

			if (options.model && options.model.trim().length > 0) {
				args.push("--model", options.model.trim());
			}

			if (options.mode === "safe") {
				args.push("--sandbox");
			} else {
				args.push("--mode", "accept-edits");
				args.push("--dangerously-skip-permissions");
			}

			if (options.conversationId && options.conversationId.trim().length > 0) {
				args.push("--conversation", options.conversationId.trim());
			}

			try {
				spawned = cp.spawn(agyPath, args, {
					cwd: vaultPath,
					env,
					windowsHide: true,
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

				try {
					const parsed = JSON.parse(line) as {
						event?: string;
						conversation_id?: string;
						step_update?: {
							step_type?: string;
							text_delta?: string;
						};
						result?: {
							status?: string;
							response?: string;
						};
					};

					if (parsed.event === "init" && parsed.conversation_id) {
						activeConversationId = parsed.conversation_id;
						options.onInit?.(parsed.conversation_id);
					} else if (
						parsed.event === "step_update" &&
						parsed.step_update?.text_delta
					) {
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
					// Fallback for non-JSON lines (e.g. CLI warnings or standard text)
					if (!line.startsWith("{")) {
						accumulatedText += line + "\n";
						options.onDelta?.(line + "\n");
					}
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
					const errMsg = stderrOutput.trim() || `Antigravity CLI exited with code ${code}`;
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
