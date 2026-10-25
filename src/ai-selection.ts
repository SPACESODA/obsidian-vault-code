export interface SelectionQuote {
	path: string;
	text: string;
	from: number;
	to: number;
	startLine: number;
	endLine: number;
	source: string;
}

export function captureSelection(path: string, source: string, from: number, to: number): SelectionQuote | null {
	if (!path || !Number.isInteger(from) || !Number.isInteger(to)) return null;
	const start = Math.min(from, to), end = Math.max(from, to);
	if (start < 0 || end > source.length || start === end) return null;
	const text = source.slice(start, end);
	if (!text.trim()) return null;
	return { path, text, from: start, to: end, source,
		startLine: source.slice(0, start).split("\n").length,
		endLine: source.slice(0, end - 1).split("\n").length };
}

export function selectionLabel(quote: SelectionQuote): string {
	return `${quote.path} · L${quote.startLine}${quote.endLine === quote.startLine ? "" : `–${quote.endLine}`}`;
}

export function quoteMessage(question: string, quote: SelectionQuote): string {
	const label = selectionLabel(quote).replace(/[\\`*_{}[\]<>!|]/g, "\\$&").replace(/[\r\n]/g, " ");
	return `${question.trim()}\n\n> **${label}**\n>\n${quote.text.replace(/\r\n/g, "\n").split("\n").map((line) => `> ${line}`).join("\n")}`;
}
