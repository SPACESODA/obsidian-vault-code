export function cardExcerpt(source: string): { from: number; to: number } {
	const bom = source.startsWith("\uFEFF") ? 1 : 0;
	const frontmatter = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source.slice(bom));
	const bodyStart = bom + (frontmatter?.[0].length ?? 0);
	const blankLines = /(?:[ \t]*\r?\n)*/y;
	blankLines.lastIndex = bodyStart;
	blankLines.exec(source);

	// Skip a leading level-one heading while keeping it in the note.
	const heading = / {0,3}#(?=[ \t\r\n]|$)[^\r\n]*(?:\r?\n|$)/y;
	heading.lastIndex = blankLines.lastIndex;
	const hasTitle = heading.test(source);
	if (hasTitle) {
		blankLines.lastIndex = heading.lastIndex;
		blankLines.exec(source);
	}

	const from = blankLines.lastIndex;
	const trailingWhitespace = /[ \t]*$/y;
	trailingWhitespace.lastIndex = from;
	if (trailingWhitespace.test(source)) {
		const insertion = hasTitle ? from : bodyStart;
		return { from: insertion, to: insertion };
	}
	const separator = /\r?\n(?=[ \t]*(?:\r?\n|$))/g;
	separator.lastIndex = from;
	return { from, to: separator.exec(source)?.index ?? source.length };
}

export function replaceCardExcerpt(source: string, { from, to }: { from: number; to: number }, text: string): string {
	const eol = source.includes("\r\n") ? "\r\n" : "\n";
	const value = text.trim() ? text.replace(/\r\n|\r|\n/g, eol) : "";
	if (from !== to || !value) return source.slice(0, from) + value + source.slice(to);

	const before = source.slice(0, from);
	const after = source.slice(from);
	const prefix = before.replace(/^\uFEFF/, "") && !before.endsWith("\n") ? eol : "";
	return before + prefix + value + (after ? eol + eol : eol) + after;
}

export function cardCover(opening: string, resolve: (link: string) => string | undefined): {
	text: string;
	image?: { src: string; alt: string };
	omitted?: { from: number; to: number };
} {
	const embeds = /(`+)[\s\S]*?\1|!\[\[([^\]\r\n]+)\]\]|!\[([^\]\r\n]*)\]\([ \t]*(?:<([^>\r\n]+)>|([^\s()]+))(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'))?[ \t]*\)/g;
	for (const match of opening.matchAll(embeds)) {
		if (match[1] || opening[match.index - 1] === "\\") continue;
		const wiki = match[2]?.split("|", 2);
		const path = (wiki?.[0] ?? match[4] ?? match[5] ?? "").split("#", 1)[0]?.trim();
		if (!path || /^(?:[a-z][\w+.-]*:|\/\/|\\\\)/i.test(path)) continue;
		let link = path;
		if (!wiki) {
			try { link = decodeURIComponent(path); } catch { /* Keep literal percent signs in file names. */ }
		}
		const src = resolve(link);
		if (!src) continue;
		const alias = wiki?.[1]?.trim() ?? "";
		const alt = wiki ? (/^\d+(?:x\d+)?$/i.test(alias) ? "" : alias) : match[3] ?? "";

		const start = opening.lastIndexOf("\n", match.index - 1) + 1;
		const end = match.index + match[0].length;
		const newline = opening.indexOf("\n", end);
		const lineEnd = newline === -1 ? opening.length : newline;
		const standalone = !opening.slice(start, match.index).trim() && !opening.slice(end, lineEnd).trim();
		const from = !standalone ? match.index : newline === -1 ? opening.slice(0, start).replace(/\r?\n$/, "").length : start;
		const to = !standalone ? end : newline === -1 ? opening.length : newline + 1;
		return { text: opening.slice(0, from) + opening.slice(to), image: { src, alt }, omitted: { from, to } };
	}
	return { text: opening };
}

export type CardExcerptLine = {
	text: string;
	/** "fence" marks an opening or closing ``` line; "line" is a line inside a fenced block. */
	code?: "fence" | "line";
	heading?: number;
	/** A quoted line; the first line of a quote can open a callout such as > [!warning] Title. */
	quote?: { callout?: { type: string; title: string } };
	list?: { indent: number; order?: number; task?: { offset: number; checked: boolean } };
};

function blockLine(content: string, previous?: CardExcerptLine): CardExcerptLine {
	const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(content);
	if (heading) return { text: heading[2] ?? "", heading: heading[1]?.length ?? 1 };
	const quote = /^ {0,3}(?:>[ \t]?)+/.exec(content);
	if (!quote) return { text: content };
	const text = content.slice(quote[0].length);
	const callout = !previous?.quote && /^\[!([^\]\s]+)\][+-]?(?:[ \t]+(.*))?$/.exec(text);
	if (!callout) return { text, quote: {} };
	const type = (callout[1] ?? "note").toLowerCase();
	return { text: "", quote: { callout: { type, title: callout[2]?.trim() || type.charAt(0).toUpperCase() + type.slice(1) } } };
}

export function cardExcerptLines(text: string, omitted?: { from: number; to: number }): CardExcerptLine[] {
	const lines: CardExcerptLine[] = [];
	let offset = 0;
	let fence: string | undefined;
	for (const line of text.split("\n")) {
		const content = line.replace(/\r$/, "");
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(content)?.[1];
		const item = !fence && !marker && /^([ \t]*)([-+*]|(\d{1,9})[.)])[ \t]+(.*)$/.exec(content);
		if (item) {
			const [, indent = "", , order, body = ""] = item;
			const task = /^\[([ xX])\](?:[ \t]+|$)/.exec(body);
			const statusOffset = offset + content.length - body.length + 1;
			const originalOffset = omitted && statusOffset >= omitted.from ? statusOffset + omitted.to - omitted.from : statusOffset;
			lines.push({
				text: task ? body.slice(task[0].length) : body,
				list: {
					indent: indent.replace(/\t/g, "    ").length,
					order: order === undefined ? undefined : Number(order),
					task: task ? { offset: originalOffset, checked: task[1] !== " " } : undefined,
				},
			});
		} else {
			lines.push(marker && (!fence || (marker.startsWith(fence) && content.trim() === marker))
				? { text: content, code: "fence" }
				: fence ? { text: content, code: "line" } : blockLine(content, lines[lines.length - 1]));
		}
		if (marker) {
			if (!fence) fence = marker;
			else if (marker.startsWith(fence) && content.trim() === marker) fence = undefined;
		}
		offset += line.length + 1;
	}
	return lines;
}

export type CardInline =
	| { kind: "text" | "code" | "tag" | "link"; text: string }
	| { kind: "strong" | "em" | "del" | "mark"; children: CardInline[] };

const word = String.raw`[\p{L}\p{N}_]`;
// Earliest match wins; at the same position, the earlier rule wins.
const INLINE_RULES: Array<[RegExp, (match: RegExpExecArray) => CardInline]> = [
	[/\\([!-/:-@[-`{-~])/gu, match => ({ kind: "text", text: match[1] ?? "" })],
	[/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/gu, match => {
		const code = match[2] ?? "";
		return { kind: "code", text: /^ [\s\S]* $/.test(code) && code.trim() ? code.slice(1, -1) : code };
	}],
	[/!?\[\[([^\]\r\n]+?)\]\]/gu, match => {
		const [target = "", alias] = (match[1] ?? "").split("|", 2);
		return { kind: "link", text: alias?.trim() || target.replace(/#\^?/g, " > ").trim() };
	}],
	[/!?\[([^\]\r\n]*)\]\([ \t]*(?:<([^>\r\n]*)>|([^\s()]*))(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'))?[ \t]*\)/gu,
		match => ({ kind: "link", text: match[1]?.trim() || match[2] || match[3] || "" })],
	[/(?<![^\s([{])#(?=[\p{L}\p{N}_/-]*[\p{L}_/-])[\p{L}\p{N}_/-]+/gu, match => ({ kind: "tag", text: match[0] })],
	[/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/gu, match => ({ kind: "strong", children: [{ kind: "em", children: cardInline(match[1] ?? "") }] })],
	[/\*\*(?=\S)([\s\S]*?\S)\*\*/gu, match => ({ kind: "strong", children: cardInline(match[1] ?? "") })],
	[new RegExp(String.raw`(?<!${word})__(?=\S)([\s\S]*?\S)__(?!${word})`, "gu"), match => ({ kind: "strong", children: cardInline(match[1] ?? "") })],
	[/~~(?=\S)([\s\S]*?\S)~~/gu, match => ({ kind: "del", children: cardInline(match[1] ?? "") })],
	[/==(?=\S)([\s\S]*?\S)==/gu, match => ({ kind: "mark", children: cardInline(match[1] ?? "") })],
	[/\*(?=[^\s*])([\s\S]*?[^\s*])\*/gu, match => ({ kind: "em", children: cardInline(match[1] ?? "") })],
	[new RegExp(String.raw`(?<!${word})_(?=\S)([\s\S]*?\S)_(?!${word})`, "gu"), match => ({ kind: "em", children: cardInline(match[1] ?? "") })],
];

/** Parses the inline Markdown a card shows: code, links, tags, and emphasis. Everything else is text. */
export function cardInline(text: string): CardInline[] {
	const nodes: CardInline[] = [];
	const pushText = (value: string) => {
		if (!value) return;
		const last = nodes[nodes.length - 1];
		if (last?.kind === "text") last.text += value;
		else nodes.push({ kind: "text", text: value });
	};
	let position = 0;
	while (position < text.length) {
		let best: { match: RegExpExecArray; build: (match: RegExpExecArray) => CardInline } | undefined;
		for (const [rule, build] of INLINE_RULES) {
			rule.lastIndex = position;
			const match = rule.exec(text);
			if (match && (!best || match.index < best.match.index)) best = { match, build };
		}
		if (!best) break;
		pushText(text.slice(position, best.match.index));
		const node = best.build(best.match);
		if (node.kind === "text") pushText(node.text);
		else nodes.push(node);
		position = best.match.index + best.match[0].length;
	}
	pushText(text.slice(position));
	return nodes;
}
