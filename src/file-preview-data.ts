import { PreviewError } from "./preview-errors";
export const DATA_PREVIEW_EXTENSIONS = new Set(["csv", "tsv", "json", "jsonl", "ndjson", "mmd", "mermaid", "diff", "patch"]);
export const PREVIEW_LIMITS = { characters: 2_000_000, rows: 500, columns: 100, lines: 5000, branches: 100, nodes: 3000 };
export interface PreviewTable { rows: string[][]; truncated: boolean; }

/** Quoted delimiters, escaped quotes, BOM, CRLF, and multiline cells; stop at the row limit. */
export function parseDelimited(source: string, delimiter: string): PreviewTable {
	const text = source.replace(/^\uFEFF/, "");
	// Strict TSV is line-oriented: quotes and backslashes are literal characters.
	// Do not borrow CSV quoting rules or reinterpret literal \n / \t sequences.
	if (delimiter === "\t") {
		if (/\r(?!\n)/.test(text)) throw new PreviewError("previewTsvLines");
		const lines = text.split(/\r?\n/);
		if (lines[lines.length - 1] === "") lines.pop();
		const rows: string[][] = [];
		let columns = 0, truncated = lines.length > PREVIEW_LIMITS.rows + 1;
		for (const line of lines.slice(0, PREVIEW_LIMITS.rows + 1)) {
			const fields = line.split("\t");
			if (!rows.length) columns = fields.length;
			if (fields.length !== columns) throw new PreviewError("previewTsvFields", rows.length + 1, fields.length, columns);
			if (fields.length > PREVIEW_LIMITS.columns) truncated = true;
			rows.push(fields.slice(0, PREVIEW_LIMITS.columns));
		}
		return { rows, truncated };
	}
	const rows: string[][] = [];
	let row: string[] = [], field = "", quoted = false, closed = false, truncated = false;
	const cell = () => {
		if (row.length < PREVIEW_LIMITS.columns) row.push(field);
		else truncated = true;
		field = ""; closed = false;
	};
	for (let i = 0; i < text.length; i++) {
		const c = text[i]!;
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; }
				else { quoted = false; closed = true; }
			} else field += c;
		} else if (c === delimiter) cell();
		else if (c === "\n" || c === "\r") {
			cell(); rows.push(row); row = [];
			if (c === "\r" && text[i + 1] === "\n") i++;
			if (rows.length >= PREVIEW_LIMITS.rows + 1) return { rows, truncated: truncated || i < text.length - 1 };
		} else if (c === '"' && !field && !closed) quoted = true;
		else {
			if (closed || c === '"') throw new PreviewError("previewUnexpected", rows.length + 1);
			field += c;
		}
	}
	if (quoted) throw new PreviewError("previewUnclosed", rows.length + 1);
	if (field || row.length || closed) { cell(); rows.push(row); }
	return { rows, truncated };
}

export function parseJsonPreview(source: string, lines: boolean): { value: unknown; truncated: boolean } {
	const text = source.replace(/^\uFEFF/, "");
	if (!lines) {
		try { return { value: JSON.parse(text) as unknown, truncated: false }; }
		catch { throw new PreviewError("previewInvalidJson"); }
	}
	const records: unknown[] = [];
	const input = text.split(/\r?\n/);
	for (let i = 0; i < input.length; i++) {
		const line = input[i]!.trim();
		if (!line) continue;
		if (records.length === PREVIEW_LIMITS.rows) return { value: records, truncated: true };
		try { records.push(JSON.parse(line) as unknown); }
		catch { throw new PreviewError("previewInvalidJsonLine", i + 1); }
	}
	return { value: records, truncated: false };
}

/** Only flat record arrays become tables. Nested data keeps its structure in the tree. */
export function jsonRecordTable(value: unknown): PreviewTable | null {
	if (!Array.isArray(value) || !value.length) return null;
	const records: Record<string, unknown>[] = [];
	const keys = new Set<string>();
	for (const item of value.slice(0, PREVIEW_LIMITS.rows) as unknown[]) {
		if (!item || typeof item !== "object" || Array.isArray(item)) return null;
		const record = item as Record<string, unknown>;
		for (const [key, child] of Object.entries(record)) {
			if (child !== null && typeof child === "object") return null;
			keys.add(key);
			if (keys.size > PREVIEW_LIMITS.columns) return null;
		}
		records.push(record);
	}
	if (!keys.size) return null;
	const headers = [...keys];
	return { rows: [headers, ...records.map(record => headers.map(key =>
		Object.prototype.hasOwnProperty.call(record, key) ? JSON.stringify(record[key]) ?? "" : ""))], truncated: value.length > PREVIEW_LIMITS.rows };
}

export interface DiffPreviewLine { text: string; kind: "add" | "remove" | "hunk" | "file" | "context" | "meta"; before?: number; after?: number; }
export function parseDiffPreview(source: string): { lines: DiffPreviewLine[]; truncated: boolean } {
	const input = source.replace(/\r\n/g, "\n").split("\n");
	if (input[input.length - 1] === "") input.pop();
	let before = 0, after = 0, oldLeft = 0, newLeft = 0;
	const lines = input.slice(0, PREVIEW_LIMITS.lines).map(text => {
		const hunk = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
		if (hunk) {
			before = Number(hunk[1]); after = Number(hunk[3]);
			oldLeft = Number(hunk[2] ?? 1); newLeft = Number(hunk[4] ?? 1);
			return { text, kind: "hunk" as const };
		}
		if ((oldLeft || newLeft) && text.startsWith("+") && newLeft) {
			newLeft--; return { text, kind: "add" as const, after: after++ };
		}
		if ((oldLeft || newLeft) && text.startsWith("-") && oldLeft) {
			oldLeft--; return { text, kind: "remove" as const, before: before++ };
		}
		if (text.startsWith(" ") && oldLeft && newLeft) {
			oldLeft--; newLeft--; return { text, kind: "context" as const, before: before++, after: after++ };
		}
		if (/^(diff |--- |\+\+\+ |Index:)/.test(text)) {
			oldLeft = newLeft = 0; return { text, kind: "file" as const };
		}
		return { text, kind: "meta" as const };
	});
	return { lines, truncated: input.length > PREVIEW_LIMITS.lines };
}

/** A fence longer than any input backtick run keeps diagram text inside one code block. */
export function mermaidMarkdown(source: string): string {
	const runs: string[] = source.match(/`+/g) ?? [];
	const fence = "`".repeat(runs.reduce((longest, run) => Math.max(longest, run.length + 1), 3));
	return `${fence}mermaid\n${source}\n${fence}`;
}
