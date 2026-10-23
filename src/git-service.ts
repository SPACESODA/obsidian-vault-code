import { Platform, App, FileSystemAdapter, TFile, TFolder } from "obsidian";

export interface FileDiffStats {
	additions: number;
	deletions: number;
	isUntracked: boolean;
	isModified: boolean;
}

interface ExecFileError extends Error {
	code?: number;
}

export interface ExecFileResult {
	stdout: string;
	stderr: string;
	code: number;
}

type ExecFileFn = (
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
		error: ExecFileError | null,
		stdout: string | Buffer | null | undefined,
		stderr: string | Buffer | null | undefined,
	) => void,
) => void;

interface NodeChildProcess {
	execFile: ExecFileFn;
}

export class GitService {
	private app: App;
	private repoRootCache: Map<string, string | null> = new Map();
	private cachedCp: NodeChildProcess | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Checks if Git integration can run in the current environment.
	 * Native git requires the desktop Electron runtime.
	 */
	public isAvailable(): boolean {
		return Platform.isDesktop;
	}

	/**
	 * Resolves Node child_process module safely across Electron environments.
	 */
	private async resolveChildProcess(): Promise<NodeChildProcess | null> {
		if (!Platform.isDesktop) return null;
		if (this.cachedCp) return this.cachedCp;

		try {
			const win = window as unknown as {
				require?: (mod: string) => unknown;
			};
			if (typeof win.require === "function") {
				const cpModule = win.require("child_process") as NodeChildProcess | undefined;
				if (cpModule && typeof cpModule.execFile === "function") {
					this.cachedCp = cpModule;
					return this.cachedCp;
				}
			}
		} catch {
			// ignore
		}

		try {
			const cpModule = (await import("child_process")) as unknown as NodeChildProcess;
			if (cpModule && typeof cpModule.execFile === "function") {
				this.cachedCp = cpModule;
				return this.cachedCp;
			}
		} catch {
			// ignore
		}

		return null;
	}

	/**
	 * Normalizes file path slashes to forward slashes.
	 */
	private normalizePath(p: string): string {
		return p.replace(/\\/g, "/").replace(/\/+$/, "");
	}

	/**
	 * Gets the filesystem directory for the vault root.
	 */
	public getVaultPath(): string | null {
		if (!this.isAvailable()) return null;
		const adapter = this.app.vault.adapter as unknown as {
			getBasePath?: () => string;
			basePath?: string;
		};
		if (typeof adapter?.getBasePath === "function") {
			return this.normalizePath(adapter.getBasePath());
		}
		if (typeof adapter?.basePath === "string" && adapter.basePath.length > 0) {
			return this.normalizePath(adapter.basePath);
		}
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			return this.normalizePath(this.app.vault.adapter.getBasePath());
		}
		return null;
	}

	/**
	 * Executes a git command safely across Electron environments.
	 */
	private async execGit(
		args: string[],
		cwd: string,
		timeoutMs = 8000,
	): Promise<ExecFileResult> {
		if (!Platform.isDesktop) {
			return { stdout: "", stderr: "Not supported on mobile", code: -1 };
		}

		try {
			const cp = await this.resolveChildProcess();
			if (!cp || typeof cp.execFile !== "function") {
				return { stdout: "", stderr: "child_process not available", code: -1 };
			}
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

			return await new Promise<ExecFileResult>((resolve) => {
				cp.execFile(
					"git",
					args,
					{
						cwd,
						timeout: timeoutMs,
						maxBuffer: 10 * 1024 * 1024,
						windowsHide: true,
						env: {
							...procEnv,
							PATH: customPath,
						},
					},
					(
						error: ExecFileError | null,
						stdout: string | Buffer | null | undefined,
						stderr: string | Buffer | null | undefined,
					) => {
						const code =
							error && typeof error.code === "number"
								? error.code
								: error
									? 1
									: 0;
						resolve({
							stdout: typeof stdout === "string" ? stdout : stdout ? stdout.toString() : "",
							stderr: typeof stderr === "string" ? stderr : stderr ? stderr.toString() : "",
							code,
						});
					},
				);
			});
		} catch (e: unknown) {
			return {
				stdout: "",
				stderr: e instanceof Error ? e.message : String(e),
				code: -1,
			};
		}
	}

	/**
	 * Finds the root directory of the git repo containing the vault.
	 */
	public async getRepoRoot(vaultPath?: string): Promise<string | null> {
		const targetPath = vaultPath ?? this.getVaultPath();
		if (!targetPath) return null;

		if (this.repoRootCache.has(targetPath)) {
			return this.repoRootCache.get(targetPath) ?? null;
		}

		const res = await this.execGit(["rev-parse", "--show-toplevel"], targetPath);
		if (res.code === 0 && res.stdout.trim().length > 0) {
			const root = this.normalizePath(res.stdout.trim());
			this.repoRootCache.set(targetPath, root);
			return root;
		}

		this.repoRootCache.set(targetPath, null);
		return null;
	}

	/**
	 * Checks if the vault is part of a git repository.
	 */
	public async isGitRepo(vaultPath?: string): Promise<boolean> {
		const root = await this.getRepoRoot(vaultPath);
		return root !== null;
	}

	/**
	 * Synchronously returns whether the vault was detected as a git repo from cache.
	 */
	public isCachedGitRepo(vaultPath?: string): boolean {
		const targetPath = vaultPath ?? this.getVaultPath();
		if (!targetPath) return false;
		return Boolean(this.repoRootCache.get(targetPath));
	}

	/**
	 * Returns whether the repo status has been checked at least once.
	 */
	public hasCheckedRepo(vaultPath?: string): boolean {
		const targetPath = vaultPath ?? this.getVaultPath();
		if (!targetPath) return false;
		return this.repoRootCache.has(targetPath);
	}

	/**
	 * Gets the current active Git branch name (e.g. "main").
	 */
	public async getCurrentBranch(vaultPath?: string): Promise<string | null> {
		const root = await this.getRepoRoot(vaultPath);
		if (!root) return null;

		const res = await this.execGit(["rev-parse", "--abbrev-ref", "HEAD"], root);
		if (res.code === 0) {
			const branch = res.stdout.trim();
			return branch.length > 0 ? branch : null;
		}
		return null;
	}

	/**
	 * Converts an Obsidian vault-relative file path to a git repo-relative path.
	 */
	public async getGitRelativePath(vaultRelPath: string): Promise<string | null> {
		const vaultPath = this.getVaultPath();
		if (!vaultPath) return null;
		const repoRoot = await this.getRepoRoot(vaultPath);
		if (!repoRoot) return null;

		const cleanRel = vaultRelPath.replace(/^[/\\]+/, "");
		if (vaultPath === repoRoot) {
			return cleanRel;
		}

		if (vaultPath.startsWith(repoRoot + "/")) {
			const subDir = vaultPath.slice(repoRoot.length + 1);
			return `${subDir}/${cleanRel}`;
		}

		return cleanRel;
	}

	/**
	 * Computes diff statistics for a specific file compared to Git HEAD.
	 * Automatically handles untracked files by counting their non-empty lines.
	 */
	public async getFileDiffStats(vaultRelPath: string): Promise<FileDiffStats> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) {
			return { additions: 0, deletions: 0, isUntracked: false, isModified: false };
		}

		const gitRel = await this.getGitRelativePath(vaultRelPath);
		if (!gitRel) {
			return { additions: 0, deletions: 0, isUntracked: false, isModified: false };
		}

		const statusRes = await this.execGit(
			["status", "--porcelain=v1", "-uall", "--", gitRel],
			repoRoot,
		);

		const statusOutput = statusRes.stdout.trim();
		if (!statusOutput) {
			// No changes vs HEAD
			return { additions: 0, deletions: 0, isUntracked: false, isModified: false };
		}

		const isUntracked = statusOutput.startsWith("??");

		if (isUntracked) {
			let content = "";
			try {
				content = await this.app.vault.adapter.read(vaultRelPath);
			} catch {
				// Failed to read (e.g. binary file or permission error)
			}

			// If empty file (0 bytes), it has 0 additions and is not modified
			if (!content || content.length === 0) {
				return { additions: 0, deletions: 0, isUntracked: true, isModified: false };
			}

			const lineCount = content.split("\n").length;
			return { additions: lineCount, deletions: 0, isUntracked: true, isModified: true };
		}

		// Tracked file: compute diff against HEAD
		const numstatRes = await this.execGit(
			["diff", "--numstat", "HEAD", "--", gitRel],
			repoRoot,
		);

		if (numstatRes.code === 0 && numstatRes.stdout.trim()) {
			const parts = numstatRes.stdout.trim().split(/\s+/);
			const additions = parseInt(parts[0] ?? "0", 10) || 0;
			const deletions = parseInt(parts[1] ?? "0", 10) || 0;
			return {
				additions,
				deletions,
				isUntracked: false,
				isModified: additions > 0 || deletions > 0,
			};
		}

		return { additions: 0, deletions: 0, isUntracked: false, isModified: false };
	}

	/**
	 * Gets the content of a file at Git HEAD.
	 * Returns empty string if file is newly created or untracked.
	 */
	public async getHeadContent(vaultRelPath: string): Promise<string> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) return "";

		const gitRel = await this.getGitRelativePath(vaultRelPath);
		if (!gitRel) return "";

		const res = await this.execGit(["show", `HEAD:${gitRel}`], repoRoot);
		if (res.code === 0) {
			return res.stdout;
		}

		// File does not exist in HEAD (e.g. untracked or newly added)
		return "";
	}

	/**
	 * Discards working tree changes to a file, reverting it back to Git HEAD.
	 * For untracked files, moves them safely to Obsidian trash.
	 */
	public async discardFileChanges(vaultRelPath: string): Promise<boolean> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) return false;

		const gitRel = await this.getGitRelativePath(vaultRelPath);
		if (!gitRel) return false;

		// 1. Check if untracked
		const statusRes = await this.execGit(["status", "--porcelain=v1", "-uall", "--", gitRel], repoRoot);
		if (statusRes.stdout.startsWith("??")) {
			// Untracked file: move safely to Obsidian trash instead of permanent deletion
			const tfile = this.app.vault.getAbstractFileByPath(vaultRelPath);
			if (tfile instanceof TFile) {
				await this.app.fileManager.trashFile(tfile);
				return true;
			}
			return false;
		}

		// 2. Checkout HEAD
		const checkoutRes = await this.execGit(["checkout", "HEAD", "--", gitRel], repoRoot);
		return checkoutRes.code === 0;
	}

	/**
	 * Stages and commits changes for a specific file.
	 */
	public async commitFile(vaultRelPath: string, message: string): Promise<{ success: boolean; error?: string }> {
		const repoRoot = await this.getRepoRoot();
		if (!repoRoot) return { success: false, error: "Not a git repository" };

		const gitRel = await this.getGitRelativePath(vaultRelPath);
		if (!gitRel) return { success: false, error: "Could not resolve file path" };

		const addRes = await this.execGit(["add", "--", gitRel], repoRoot);
		if (addRes.code !== 0) {
			return { success: false, error: addRes.stderr || "Git add failed" };
		}

		const commitRes = await this.execGit(["commit", "-m", message, "--", gitRel], repoRoot);
		if (commitRes.code !== 0) {
			return { success: false, error: commitRes.stderr || "Git commit failed" };
		}

		return { success: true };
	}

	/**
	 * Gets the list of all modified or untracked vault-relative file paths.
	 * Automatically expands directories via -uall and filters out folders and 0-byte untracked files.
	 */
	public async getModifiedVaultFiles(): Promise<Set<string>> {
		const modifiedSet = new Set<string>();
		const repoRoot = await this.getRepoRoot();
		const vaultPath = this.getVaultPath();
		if (!repoRoot || !vaultPath) return modifiedSet;

		const res = await this.execGit(["status", "--porcelain=v1", "-uall"], repoRoot);
		if (res.code !== 0 || !res.stdout) return modifiedSet;

		const vaultSubDir =
			vaultPath === repoRoot
				? ""
				: vaultPath.startsWith(repoRoot + "/")
					? vaultPath.slice(repoRoot.length + 1)
					: null;

		const lines = res.stdout.split("\n");
		for (const line of lines) {
			if (line.length < 4) continue;
			let rawPath = line.substring(3).trim().replace(/^"|"$/g, "");
			if (rawPath.includes(" -> ")) {
				rawPath =
					rawPath.split(" -> ").pop()?.trim().replace(/^"|"$/g, "") ??
					rawPath;
			}
			const filePathInRepo = this.normalizePath(rawPath);
			if (filePathInRepo.endsWith("/")) continue;

			let vaultRelPath: string | null = null;
			if (vaultSubDir === "") {
				vaultRelPath = filePathInRepo;
			} else if (vaultSubDir && filePathInRepo.startsWith(vaultSubDir + "/")) {
				vaultRelPath = filePathInRepo.slice(vaultSubDir.length + 1);
			}

			if (!vaultRelPath) continue;

			// Verify it is not a directory in Obsidian vault
			const abstractItem = this.app.vault.getAbstractFileByPath(vaultRelPath);
			if (abstractItem instanceof TFolder) continue;

			// If untracked, verify it is not an empty 0-byte file
			if (line.startsWith("??")) {
				if (abstractItem instanceof TFile && abstractItem.stat.size === 0) {
					continue; // Exclude empty 0-byte untracked files
				}
			}

			modifiedSet.add(vaultRelPath);
		}

		return modifiedSet;
	}
}
