interface ChatLeafState { type: string; state?: Record<string, unknown>; active?: boolean; }

/** Coordinate startup, reload, and open actions while a leaf is temporarily empty. */
export class ChatLeafManager<Leaf> {
	private pending: Promise<Leaf | null> | null = null;

	ensure(options: {
		enabled: () => boolean;
		leaves: () => Leaf[];
		create: () => Leaf | null;
		state: (leaf: Leaf) => ChatLeafState;
		keep?: (leaf: Leaf) => boolean;
		current: (leaf: Leaf) => boolean;
		active: (leaf: Leaf) => boolean;
		setState: (leaf: Leaf, state: ChatLeafState) => Promise<void>;
		detach: (leaf: Leaf) => void;
		type: string;
	}): Promise<Leaf | null> {
		if (this.pending) return this.pending;
		this.pending = (async () => {
			if (!options.enabled()) return null;
			const leaves = options.leaves();
			// Keep the active healthy tab when repairing duplicate empty placeholders.
			leaves.sort((a, b) => Number(options.active(b)) - Number(options.active(a)) || Number(options.current(b)) - Number(options.current(a)));
			let empty: Leaf | undefined;
			const retained: Leaf[] = [];
			for (const leaf of leaves) {
				const state = options.state(leaf).state as { chatPath?: unknown } | undefined;
				if (!state?.chatPath && !options.keep?.(leaf)) {
					if (empty) { options.detach(leaf); continue; }
					empty = leaf;
				}
				retained.push(leaf);
			}
			for (const leaf of retained) {
				if (!options.enabled()) return null;
				if (options.current(leaf)) continue;
				const state = options.state(leaf);
				const active = options.active(leaf);
				await options.setState(leaf, { type: "empty" });
				if (!options.enabled()) return null;
				await options.setState(leaf, { type: options.type, state: state.state ?? {}, active });
			}
			if (!options.enabled()) return null;
			if (retained.length) return retained[0]!;
			const leaf = options.create();
			if (leaf) await options.setState(leaf, { type: options.type, active: false });
			return options.enabled() ? leaf : null;
		})().finally(() => { this.pending = null; });
		return this.pending;
	}
}
