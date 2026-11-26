/** Pure search logic for "Find in files": building the pattern and finding matches in one file's text. */

export interface FileSearchOptions {
	caseSensitive: boolean;
	wholeWord: boolean;
	regex: boolean;
}

export interface FileSearchMatch {
	/** Offsets of the match in the whole text. */
	from: number;
	to: number;
	/** Zero-based line of the match start. */
	line: number;
	/** The line around the match, trimmed to a readable length, and where the match sits in it. */
	text: string;
	start: number;
	end: number;
}

/** Longest line excerpt shown for one match, so minified files stay readable. */
const CONTEXT = 40;

/** Builds the search pattern, or returns the error text for an invalid regular expression. */
export function fileSearchPattern(query: string, options: FileSearchOptions): RegExp | { error: string } | undefined {
	if (!query) return undefined;
	const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const flags = `gm${options.caseSensitive ? "" : "i"}`;
	// Unicode mode makes whole words work for any script, but it rejects some loose regex syntax (like "\-").
	// Fall back to plain mode, where word boundaries cover ASCII words only.
	const attempts: Array<[string, string]> = options.wholeWord
		? [[`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, flags + "u"], [`(?<!\\w)(?:${source})(?!\\w)`, flags]]
		: [[source, flags + "u"], [source, flags]];
	let failure: unknown;
	for (const [pattern, mode] of attempts) {
		try { return new RegExp(pattern, mode); } catch (error) { failure ??= error; }
	}
	return { error: failure instanceof Error ? failure.message : String(failure) };
}

/** Text that looks binary (a NUL byte near the start) is not searched. */
export function looksBinary(text: string): boolean {
	return text.slice(0, 8000).includes("\u0000");
}

/** Finds up to `limit` matches in `text`. Empty matches (such as `^` in a regex) are skipped. */
export function findMatches(text: string, pattern: RegExp, limit: number): FileSearchMatch[] {
	const matches: FileSearchMatch[] = [];
	if (limit <= 0) return matches;
	const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
	let line = 0;
	let lineStart = 0;
	let scanned = 0;
	for (let match = regex.exec(text); match; match = regex.exec(text)) {
		if (!match[0].length) {
			regex.lastIndex = match.index + (text.codePointAt(match.index)! > 0xffff ? 2 : 1);
			if (regex.lastIndex > text.length) break;
			continue;
		}
		const from = match.index;
		const to = from + match[0].length;
		// Count lines incrementally instead of rescanning from the top for every match.
		for (let index = text.indexOf("\n", scanned); index !== -1 && index < from; index = text.indexOf("\n", index + 1)) {
			line++;
			lineStart = index + 1;
		}
		scanned = from;
		const lineEnd = text.indexOf("\n", from);
		const end = Math.min(lineEnd === -1 ? text.length : lineEnd, to);
		matches.push({ from, to, line, ...excerpt(text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).replace(/\r$/, ""), from - lineStart, end - lineStart) });
		if (matches.length >= limit) break;
	}
	return matches;
}

function excerpt(line: string, start: number, end: number): { text: string; start: number; end: number } {
	end = Math.min(end, line.length);
	let before = Math.max(0, start - CONTEXT);
	// Start a cut line at a word, not halfway through one.
	if (before > 0) {
		const space = line.slice(before, start).search(/\s/);
		if (space !== -1) before += space + 1;
	}
	const after = Math.min(line.length, end + CONTEXT * 2);
	let text = line.slice(before, after);
	let offset = before;
	// Drop leading indentation when the match is near the start of the line.
	const indent = /^\s+/.exec(text)?.[0].length ?? 0;
	if (indent && indent <= start - before) { text = text.slice(indent); offset += indent; }
	const head = before > 0 ? "…" : "";
	const tail = after < line.length ? "…" : "";
	return { text: head + text.trimEnd() + tail, start: head.length + start - offset, end: head.length + end - offset };
}
