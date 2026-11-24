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
	list?: { indent: number; order?: number; task?: { offset: number; checked: boolean } };
};

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
			lines.push({ text: content });
		}
		if (marker) {
			if (!fence) fence = marker;
			else if (marker.startsWith(fence) && content.trim() === marker) fence = undefined;
		}
		offset += line.length + 1;
	}
	return lines;
}
