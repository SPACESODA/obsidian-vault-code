/** Desktop filesystem operations, injected so importing the plugin stays safe on mobile. */
export type FolderFS = Pick<typeof import("fs/promises"), "realpath" | "lstat" | "stat" | "opendir" | "symlink" | "unlink" | "readlink">;
export type FolderPath = Pick<typeof import("path"), "resolve" | "relative" | "isAbsolute" | "join" | "basename" | "dirname">;
export type ExternalFolderCode = "name" | "location" | "loop" | "exists" | "unavailable" | "large" | "shortcut" | "busy" | "cancelled" | "ignored";
export class ExternalFolderError extends Error {
	constructor(public code: ExternalFolderCode) { super(code); }
}
function missing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export class ExternalFolders {
	private busy = false;
	constructor(
		private fs: FolderFS,
		private path: FolderPath,
		private vault: string,
		private configDir: string,
		private windows: boolean,
		private ignored: (path: string) => boolean = () => false,
	) {}

	private inside(parent: string, child: string): boolean {
		const relative = this.path.relative(parent, child).replace(/\\/g, "/");
		return relative === "" || (!this.path.isAbsolute(relative) && relative !== ".." && !relative.startsWith("../"));
	}
	private async location(relative: string): Promise<{ root: string; absolute: string }> {
		if (this.path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === "..")) throw new ExternalFolderError("location");
		const root = await this.fs.realpath(this.vault);
		const requested = this.path.resolve(root, relative);
		if (requested === root || !this.inside(root, requested)) throw new ExternalFolderError("location");
		const parent = await this.fs.realpath(this.path.dirname(requested));
		if (!this.inside(root, parent)) throw new ExternalFolderError("location");
		// Resolve parent aliases before checking loops, protected locations, or concurrent changes.
		const absolute = this.path.join(parent, this.path.basename(requested));
		for (const candidate of [requested, absolute]) {
			const segments = this.path.relative(root, candidate).split(/[\\/]/);
			if (segments.includes(".git") || segments.includes(".trash") || this.inside(this.path.resolve(root, this.configDir), candidate)) throw new ExternalFolderError("location");
		}
		return { root, absolute };
	}

	/** Follow each logical route: ignore rules may differ for aliases of the same directory. */
	private async validateTree(root: string, logical: string, destination: string, signal?: AbortSignal): Promise<void> {
		const visiting = new Set<string>();
		let entries = 0;
		let directories = 0;
		const visit = async (directory: string, virtual: string, depth: number): Promise<void> => {
			if (signal?.aborted) throw new ExternalFolderError("cancelled");
			if (visiting.has(directory)) throw new ExternalFolderError("loop");
			if (++directories > 20000 || depth > 256) throw new ExternalFolderError("large");
			visiting.add(directory);
			try {
				const handle = await this.fs.opendir(directory);
				for await (const entry of handle) {
					if (signal?.aborted) throw new ExternalFolderError("cancelled");
					if (++entries > 100000) throw new ExternalFolderError("large");
					const childVirtual = [virtual, entry.name].filter(Boolean).join("/");
					if (this.ignored(childVirtual) || entry.name === ".git" || entry.name === ".trash") continue;
					const child = this.path.join(directory, entry.name);
					if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
					let real: string;
					try {
						if (entry.isSymbolicLink() && !(await this.fs.stat(child)).isDirectory()) continue;
						real = await this.fs.realpath(child);
					} catch (error: unknown) {
						if (missing(error)) continue;
						if (typeof error === "object" && error !== null && "code" in error && error.code === "ELOOP") throw new ExternalFolderError("loop");
						throw error;
					}
					if (this.inside(real, destination)) throw new ExternalFolderError("loop");
					await visit(real, childVirtual, depth + 1);
				}
			} finally { visiting.delete(directory); }
		};
		await visit(root, logical, 0);
	}

	async add(parent: string, name: string, selected: string, signal?: AbortSignal, beforeCreate?: (path: string, target: string) => void): Promise<{ path: string; target: string }> {
		if (this.busy) throw new ExternalFolderError("busy");
		this.busy = true;
		try {
			if (signal?.aborted) throw new ExternalFolderError("cancelled");
			if (!name || name !== name.trim() || /[<>:"/\\|?*]/.test(name) || [...name].some(character => character.charCodeAt(0) < 32) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new ExternalFolderError("name");
			const relative = [parent === "/" ? "" : parent, name].filter(Boolean).join("/");
			const { root, absolute } = await this.location(relative);
			if (this.ignored(relative)) throw new ExternalFolderError("ignored");
			try { await this.fs.lstat(absolute); throw new ExternalFolderError("exists"); }
			catch (error: unknown) { if (!missing(error)) throw error; }
			const target = await this.fs.realpath(selected);
			if (!(await this.fs.stat(target)).isDirectory()) throw new ExternalFolderError("unavailable");
			if (this.inside(target, absolute)) throw new ExternalFolderError("loop");
			await this.validateTree(target, relative, absolute, signal);
			// Revalidate the parent and target after asynchronous inspection. symlink never overwrites.
			const latest = await this.location(relative);
			if (latest.root !== root || latest.absolute !== absolute || await this.fs.realpath(selected) !== target) throw new ExternalFolderError("location");
			if (signal?.aborted) throw new ExternalFolderError("cancelled");
			beforeCreate?.(relative, target);
			await this.fs.symlink(target, absolute, this.windows ? "junction" : "dir");
			return { path: relative, target };
		} finally { this.busy = false; }
	}

	async shortcutTarget(relative: string): Promise<string | null> {
		try {
			const { absolute } = await this.location(relative);
			if (!(await this.fs.lstat(absolute)).isSymbolicLink()) return null;
			let target: string;
			try { target = await this.fs.realpath(absolute); }
			catch { target = this.path.resolve(this.path.dirname(absolute), await this.fs.readlink(absolute)); }
			if (this.inside(target, absolute)) throw new ExternalFolderError("loop");
			return target;
		} catch (error: unknown) { if (error instanceof ExternalFolderError && error.code === "loop") throw error; return null; }
	}

	async isShortcut(relative: string): Promise<boolean> {
		try { const { absolute } = await this.location(relative); return (await this.fs.lstat(absolute)).isSymbolicLink(); }
		catch { return false; }
	}
	async remove(relative: string): Promise<void> {
		if (this.busy) throw new ExternalFolderError("busy");
		this.busy = true;
		try {
			const { absolute } = await this.location(relative);
			const before = await this.fs.lstat(absolute);
			if (!before.isSymbolicLink()) throw new ExternalFolderError("shortcut");
			const current = await this.fs.lstat(absolute);
			if (!current.isSymbolicLink() || current.ino !== before.ino || current.dev !== before.dev) throw new ExternalFolderError("shortcut");
			// Never use recursive deletion or dereference the target, including broken shortcuts.
			await this.fs.unlink(absolute);
		} finally { this.busy = false; }
	}
}
