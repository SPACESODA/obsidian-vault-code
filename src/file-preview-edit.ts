import { PreviewError } from "./preview-errors";
import { PREVIEW_LIMITS } from "./file-preview-data";
export interface CellToken { from: number; to: number; value: string; kind: "text" | "string" | "number" | "boolean" | "null"; quoted?: boolean; }
export interface TableEditModel { source: string; extension: string; headers: string[]; cells: (CellToken | null)[][]; }
export interface CellChange { from: number; to: number; insert: string; }
/** CodeMirror stores logical newlines; preserve the file's original uniform byte separator. */
export function previewLineEnding(source: string): "\n" | "\r\n" | null {
	if (/\r(?!\n)/.test(source)) return null;
	const crlf = source.includes("\r\n");
	if (crlf && /(^|[^\r])\n/.test(source)) return null;
	return crlf ? "\r\n" : "\n";
}
export function previewDocumentBytes(document: string, separator: string, prefix = ""): string {
	return prefix + document.replace(/\r\n?/g, "\n").replace(/\n/g, separator);
}
export function decodePreviewBytes(buffer: ArrayBuffer): string {
	if (buffer.byteLength > PREVIEW_LIMITS.characters * 4) throw new PreviewError("previewEditTooLarge");
	let source: string;
	try { source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer); }
	catch { throw new PreviewError("previewUtf8Only"); }
	if (source.includes("\0")) throw new PreviewError("previewUtf8Only");
	return source;
}
const JSON_STRING = /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;

/** Editing is deliberately limited to complete, rectangular, unambiguous small tables. */
export function tableEditModel(source: string, extension: string): TableEditModel | null {
	if (source.length > PREVIEW_LIMITS.characters || source.includes("\0") || !previewLineEnding(source)) return null;
	try {
		if (extension === "csv" || extension === "tsv") {
			const pattern = extension === "csv" ? /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\r|\n|$)/gy : /([^\t\r\n]*)(\t|\r\n|\n|$)/gy;
			const rows: CellToken[][] = [];
			let row: CellToken[] = [], position = source.charCodeAt(0) === 0xfeff ? 1 : 0;
			while (position < source.length) {
				pattern.lastIndex = position;
				const match = pattern.exec(source);
				if (!match || match.index !== position) return null;
				const raw = match[1]!, end = position + raw.length;
				const quoted = extension === "csv" && raw.startsWith('"');
				row.push({ from: position, to: end, kind: "text", quoted, value: quoted ? raw.slice(1, -1).replace(/""/g, '"') : raw });
				if (row.length > PREVIEW_LIMITS.columns) return null;
				position = pattern.lastIndex;
				const separator = match[2]!;
				if (separator === "," || separator === "\t") {
					if (position === source.length) row.push({ from: position, to: position, kind: "text", value: "" });
				} else { rows.push(row); row = []; }
				if (rows.length > PREVIEW_LIMITS.rows + 1) return null;
			}
			if (row.length) rows.push(row);
			const headers = rows.shift()?.map(cell => cell.value) ?? [];
			if (!headers.length || headers.length > PREVIEW_LIMITS.columns || headers.some(key => !key || key.length > 2000) || new Set(headers).size !== headers.length || rows.length > PREVIEW_LIMITS.rows || rows.some(record => record.length !== headers.length)) return null;
			return { source, extension, headers, cells: rows };
		}
		if (extension !== "jsonl" && extension !== "ndjson") return null;
		// JSON Lines forbids a BOM and blank records. NDJSON serialization also
		// requires the last record terminator. Never silently repair existing files.
		if (source.startsWith("\uFEFF") || (extension === "ndjson" && !source.endsWith("\n"))) return null;
		const records: Map<string, CellToken>[] = [];
		const headers = new Set<string>();
		let start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
		while (start < source.length) {
			const newline = source.indexOf("\n", start);
			const end = newline < 0 ? source.length : newline;
			const line = source.slice(start, end);
			if (!line.trim()) return null;
			if (line.trim()) {
				JSON.parse(line) as unknown; // Full syntax validation, including trailing tokens.
				let pos = 0;
				const space = () => { while (/[ \t\r]/.test(line[pos] ?? "!") && pos < line.length) pos++; };
				space(); if (line[pos++] !== "{") return null; space();
				const record = new Map<string, CellToken>();
				while (line[pos] !== "}") {
					JSON_STRING.lastIndex = pos;
					const keyToken = JSON_STRING.exec(line)?.[0];
					if (!keyToken) return null;
					const key = JSON.parse(keyToken) as string;
					if (record.has(key) || key.length > 2000) return null;
					pos += keyToken.length; space(); if (line[pos++] !== ":") return null; space();
					const from = pos;
					let raw: string;
					if (line[pos] === '"') { JSON_STRING.lastIndex = pos; raw = JSON_STRING.exec(line)?.[0] ?? ""; }
					else raw = line.slice(pos).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0] ?? "";
					if (!raw) return null; pos += raw.length;
					const kind = raw[0] === '"' ? "string" : raw === "null" ? "null" : raw === "true" || raw === "false" ? "boolean" : "number";
					record.set(key, { from: start + from, to: start + pos, kind, value: kind === "string" ? JSON.parse(raw) as string : raw });
					headers.add(key); if (headers.size > PREVIEW_LIMITS.columns) return null;
					space(); if (line[pos] === "}") break;
					if (line[pos++] !== ",") return null; space();
				}
				records.push(record); if (records.length > PREVIEW_LIMITS.rows) return null;
			}
			start = newline < 0 ? source.length : newline + 1;
		}
		return headers.size ? { source, extension, headers: [...headers], cells: records.map(record => [...headers].map(key => record.get(key) ?? null)) } : null;
	} catch { return null; }
}

export function editableToken(token: CellToken | null | undefined): token is CellToken {
	return Boolean(token && token.kind !== "null" && !(token.kind === "string" && token.value.includes("\r")) && token.value.length <= 2000 && (token.kind !== "number" || (Number.isFinite(Number(token.value)) && (!Number.isInteger(Number(token.value)) || Number.isSafeInteger(Number(token.value))) && JSON.stringify(Number(token.value)) === token.value)));
}

/** Replace exactly one lexical token. Never serialize or rebuild the file or its records. */
export function changeTableCell(model: TableEditModel, row: number, column: number, value: string): CellChange | null {
	const token = model.cells[row]?.[column];
	if (!editableToken(token)) throw new PreviewError("previewReadOnlyCell");
	if (value === token.value || (token.kind === "text" && value.replace(/\r\n/g, "\n") === token.value.replace(/\r\n/g, "\n"))) return null;
	if (value.length > 2000) throw new PreviewError("previewCellTooLong", 2000);
	let insert = value;
	let expected = value;
	if (token.kind === "text") {
		if (value.includes("\0")) throw new PreviewError("previewNullCharacter");
		if (new TextDecoder().decode(new TextEncoder().encode(value)) !== value) throw new PreviewError("previewInvalidUnicode");
		if (model.extension === "tsv") {
			if (/[\t\r\n\u0085\u2028\u2029]/u.test(value)) throw new PreviewError("previewTsvCellBreak");
			// TSV has no quoting/escaping convention: preserve quotes and backslashes literally.
		} else {
			if (/\r(?!\n)/.test(value)) throw new PreviewError("previewCsvBreak");
			expected = previewDocumentBytes(value, previewLineEnding(model.source) ?? "\n");
			insert = expected;
			if (token.quoted || /[,"\r\n]/.test(expected) || expected.trim() !== expected) insert = '"' + expected.replace(/"/g, '""') + '"';
		}
	} else if (token.kind === "string") {
		if (value.includes("\r")) throw new PreviewError("previewJsonCarriage");
		// Actual line feeds/tabs become JSON escapes. Literal backslash-n stays literal.
		insert = JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
	}
	else if (token.kind === "boolean") {
		if (value !== "true" && value !== "false") throw new PreviewError("previewBoolean");
	} else if (token.kind === "number") {
		if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)) || (Number.isInteger(Number(value)) && !Number.isSafeInteger(Number(value))) || JSON.stringify(Number(value)) !== value) throw new PreviewError("previewNumber");
	}
	const next = model.source.slice(0, token.from) + insert + model.source.slice(token.to);
	const check = tableEditModel(next, model.extension);
	if (!check || JSON.stringify(check.headers) !== JSON.stringify(model.headers) || check.cells.length !== model.cells.length || check.cells[row]?.[column]?.value !== expected) throw new PreviewError("previewStructure");
	for (let r = 0; r < model.cells.length; r++) {
		for (let c = 0; c < model.headers.length; c++) {
			if ((r !== row || c !== column) && model.cells[r]?.[c]?.value !== check.cells[r]?.[c]?.value) throw new PreviewError("previewOtherCell");
		}
	}
	return { from: token.from, to: token.to, insert };
}

/** Compare-and-write through Vault.process; serialize saves and retain the local draft on conflict. */
export class PreviewSaveGuard {
	private pending: Promise<void> = Promise.resolve();
	writing?: string;
	conflicted = false;
	constructor(public expected: string) {}
	acceptReload(incoming: string, document: string): boolean {
		if (incoming === this.expected || incoming === this.writing) return incoming === document;
		if (this.writing !== undefined || document !== this.expected) { this.conflicted = true; return false; }
		this.expected = incoming;
		return true;
	}
	save(document: () => string, process: (update: (disk: string) => string) => Promise<unknown>): Promise<void> {
		const task = this.pending.catch(() => {}).then(async () => {
			const next = document();
			if (next === this.expected) return;
			this.writing = next;
			try {
				await process(disk => {
					if (this.conflicted || disk !== this.expected) { this.conflicted = true; throw new PreviewError("previewConflict"); }
					return next;
				});
				this.expected = next;
			} finally { this.writing = undefined; }
		});
		this.pending = task;
		return task;
	}
}
