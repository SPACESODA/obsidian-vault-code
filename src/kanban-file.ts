export const KANBAN_FILENAME = "obsidian.kanban";

export type KanbanOrder = { columns: string[]; cards: Record<string, string[]> };
export type KanbanOrders = Record<string, KanbanOrder>;
export type KanbanUnsorted = { position: "first" | "last" | "hidden"; name?: string };

export function boardRelativePath(board: string, path: string): string {
	return board === "/" || board === "" ? path : path === board ? "" : path.slice(board.length + 1);
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(entry => typeof entry === "string");
}

export function readKanbanFile(source: string): ({ version: 1 } & KanbanOrder & Record<string, unknown>) | null {
	try {
		const value: unknown = JSON.parse(source.replace(/^\uFEFF/, ""));
		if (!record(value) || value.version !== 1 || !stringList(value.columns) || !record(value.cards)) return null;
		const cards: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
		for (const [key, entries] of Object.entries(value.cards)) {
			if (!stringList(entries)) return null;
			cards[key] = entries;
		}
		return { ...value, version: 1, columns: value.columns, cards };
	} catch { return null; }
}

export function writeKanbanFile(order: KanbanOrder, previous?: Record<string, unknown>): string {
	return JSON.stringify({ ...previous, version: 1, columns: order.columns, cards: order.cards }, null, 2) + "\n";
}

export function readKanbanUnsorted(value: unknown): KanbanUnsorted {
	if (!record(value)) return { position: "last" };
	const position = value.position === "first" || value.position === "hidden" ? value.position : "last";
	const name = typeof value.name === "string" ? value.name.trim() || undefined : undefined;
	return { position, name };
}

export function writeKanbanUnsorted(board: KanbanOrder & Record<string, unknown>, change: Partial<KanbanUnsorted>): string {
	const unsorted = record(board.unsorted) ? board.unsorted : {};
	return writeKanbanFile(board, { ...board, unsorted: { ...unsorted, ...change } });
}

export function relativeKanbanOrder(board: string, order?: KanbanOrder): KanbanOrder {
	if (!order) return { columns: [], cards: {} };
	const contains = (path: string) => !board || board === "/" || path === board || path.startsWith(board + "/");
	const relative = (path: string) => boardRelativePath(board, path);
	return {
		columns: order.columns.filter(contains).map(relative),
		cards: Object.fromEntries(Object.entries(order.cards).filter(([path]) => contains(path)).map(([path, cards]) => [relative(path), cards.filter(contains).map(relative)])),
	};
}
