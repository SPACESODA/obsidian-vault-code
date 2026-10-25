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

export function getSafeCodeFence(text: string): string {
	const matches = text.match(/`{3,}/g);
	if (!matches) return "```";
	const maxLen = Math.max(...matches.map((m) => m.length));
	return "`".repeat(Math.max(3, maxLen + 1));
}

export function detectFenceLanguage(path: string, sampleText = ""): string {
	const filename = path.split("/").pop() || "";
	const lower = filename.toLowerCase();

	if (lower === "dockerfile") return "dockerfile";
	if (lower === "makefile" || lower === "gnumakefile") return "makefile";
	if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".dockerignore") return "gitignore";
	if (lower.startsWith(".env")) return "bash";
	if (lower === ".bashrc" || lower === ".zshrc" || lower === ".bash_profile" || lower === ".profile") return "bash";
	if (lower === ".editorconfig" || lower === ".npmrc") return "ini";
	if (lower === ".eslintrc" || lower === ".prettierrc") return "json";

	const lastDot = filename.lastIndexOf(".");
	if (lastDot > 0) {
		const ext = filename.slice(lastDot + 1).toLowerCase();
		const extMap: Record<string, string> = {
			md: "markdown",
			mdown: "markdown",
			markdown: "markdown",
			cjs: "javascript",
			mjs: "javascript",
			jsx: "jsx",
			tsx: "tsx",
			ts: "typescript",
			js: "javascript",
			py: "python",
			rb: "ruby",
			rs: "rust",
			sh: "bash",
			zsh: "bash",
			yml: "yaml",
		};
		return extMap[ext] || ext;
	}

	if (sampleText.startsWith("#!")) {
		const firstLine = sampleText.split("\n")[0] || "";
		if (/python/i.test(firstLine)) return "python";
		if (/bash|zsh|sh/i.test(firstLine)) return "bash";
		if (/node/i.test(firstLine)) return "javascript";
		if (/ruby/i.test(firstLine)) return "ruby";
		if (/perl/i.test(firstLine)) return "perl";
	}

	return "";
}

export function quoteMessage(question: string, quote: SelectionQuote): string {
	const label = selectionLabel(quote).replace(/[\\`*_{}[\]<>!|]/g, "\\$&").replace(/[\r\n]/g, " ");
	const lang = detectFenceLanguage(quote.path, quote.text);
	const fence = getSafeCodeFence(quote.text);
	const quotedLines = quote.text.replace(/\r\n/g, "\n").split("\n");
	const codeBlock = `${fence}${lang}\n${quotedLines.join("\n")}\n${fence}`;
	const blockquoted = codeBlock.split("\n").map((line) => `> ${line}`).join("\n");
	return `${question.trim()}\n\n> **${label}**\n>\n${blockquoted}`;
}
