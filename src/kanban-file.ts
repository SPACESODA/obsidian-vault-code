export const KANBAN_FILENAME = "Board.kanban";

export type KanbanOrder = { columns: string[]; cards: Record<string, string[]> };
export type KanbanOrders = Record<string, KanbanOrder>;
export type KanbanUnsorted = { position: "first" | "last" | "hidden"; name?: string };

export function boardRelativePath(board: string, path: string): string {
	return board === "/" || board === "" ? path : path === board ? "" : path.slice(board.length + 1);
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * On disk, each column lists its cards by file name only ("Todo": ["Write.md"]); the column key already says
 * which folder they're in. In memory, cards keep their board-relative path ("Todo/Write.md") so they compare
 * directly with note paths. Older files that wrote the full path still read the same way.
 */
const cardPath = (column: string, entry: string) => column && !entry.includes("/") ? column + "/" + entry : entry;
const cardName = (column: string, entry: string) => column && entry.startsWith(column + "/") ? entry.slice(column.length + 1) : entry;

/**
 * Reads a board's order file. Notes and folders decide what is on the board; this file only orders them,
 * so it is read leniently: an entry that isn't a string, a duplicate, or a list that isn't a list is skipped
 * rather than failing the whole board (agents, sync tools and hand edits can leave such things behind).
 * Names are compared in NFC, as Obsidian normalizes paths, so a sync that rewrites "é" still matches.
 * Only a file that isn't JSON, or is a different version, is refused, and is then never overwritten.
 */
export function readKanbanFile(source: string): ({ version: 1 } & KanbanOrder & Record<string, unknown>) | null {
	let value: unknown;
	try { value = JSON.parse(source.replace(/^\uFEFF/, "")); } catch { return null; }
	if (!record(value) || value.version !== 1) return null;
	const names = (list: unknown) => Array.isArray(list)
		? [...new Set(list.filter((entry): entry is string => typeof entry === "string" && entry !== "").map(entry => entry.normalize("NFC")))]
		: [];
	const cards: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
	for (const [key, entries] of Object.entries(record(value.cards) ? value.cards : {})) {
		const column = key.normalize("NFC");
		cards[column] = [...new Set([...(cards[column] ?? []), ...names(entries).map(entry => cardPath(column, entry))])];
	}
	return { ...value, version: 1, columns: names(value.columns), cards };
}

export function writeKanbanFile(order: KanbanOrder, previous?: Record<string, unknown>): string {
	const cards = Object.fromEntries(Object.entries(order.cards).map(([column, entries]) => [column, entries.map(entry => cardName(column, entry))]));
	return JSON.stringify({ ...previous, version: 1, columns: order.columns, cards }, null, 2) + "\n";
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
