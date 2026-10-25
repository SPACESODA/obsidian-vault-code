interface RecursiveAdapter {
	listRecursive?: (path: string) => Promise<void>;
}

/** Prune background directory traversal without intercepting reads, writes, or deletion events. */
export function guardIgnoredTraversal(adapter: RecursiveAdapter, shouldPrune: (path: string) => boolean): () => void {
	const original = adapter.listRecursive;
	if (typeof original !== "function") return () => {};
	let active = true;
	const guarded = function (this: RecursiveAdapter, path: string): Promise<void> {
		const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
		if (active && normalized && shouldPrune(normalized)) return Promise.resolve();
		return original.call(this, path);
	};
	adapter.listRecursive = guarded;
	return () => { active = false; if (adapter.listRecursive === guarded) adapter.listRecursive = original; };
}

/** Multiple requests share one scan and at most one pending follow-up for changed rules. */
export class CoalescedScan {
	private running: Promise<void> | null = null;
	private requested = false;
	constructor(private scan: () => Promise<void>) {}
	run(): Promise<void> {
		if (this.running) { this.requested = true; return this.running; }
		this.running = (async () => {
			do { this.requested = false; await this.scan(); } while (this.requested);
		})().finally(() => { this.running = null; });
		return this.running;
	}
}

/** Visit folders once, yielding periodically; never enumerate the entire loaded-file collection. */
export async function scanFolderTree(options: {
	scan: (path: string) => Promise<void>;
	children: (path: string) => readonly string[];
	shouldPrune: (path: string) => boolean;
	active: () => boolean;
	yield: () => Promise<void>;
}): Promise<void> {
	const queue = [""];
	const scheduled = new Set(queue);
	for (let index = 0; index < queue.length && options.active(); index++) {
		const path = queue[index]!;
		if (path && options.shouldPrune(path)) continue;
		try { await options.scan(path); } catch { /* Continue past unreadable folders. */ }
		if (!options.active()) return;
		for (const child of options.children(path)) {
			if (!scheduled.has(child) && !options.shouldPrune(child)) {
				scheduled.add(child); queue.push(child);
			}
		}
		if ((index + 1) % 8 === 0) await options.yield();
	}
}
