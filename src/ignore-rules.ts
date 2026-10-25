export interface IgnoreRule {
	pattern: string;
	rooted: boolean;
	dirOnly: boolean;
	negate: boolean;
	exactRegex: RegExp;
	childRegex: RegExp;
	fullRegex: RegExp;
}

export function parseGitignore(text: string): IgnoreRule[] {
	const rules: IgnoreRule[] = [];
	const lines = text.split(/\r?\n/);
	for (let line of lines) {
		line = line.trim();
		if (!line || line.startsWith("#")) continue;

		let negate = false;
		if (line.startsWith("!")) {
			negate = true;
			line = line.slice(1).trim();
			if (!line) continue;
		}

		let dirOnly = false;
		if (line.endsWith("/")) {
			dirOnly = true;
			line = line.slice(0, -1).trim();
			if (!line) continue;
		}

		const hasSlash = line.includes("/");
		if (line.startsWith("/")) {
			line = line.slice(1);
		}

		let regexStr = "";
		let i = 0;
		while (i < line.length) {
			const c = line[i];
			if (!c) break;
			if (c === "*") {
				if (line[i + 1] === "*") {
					if (line[i + 2] === "/") {
						regexStr += "(?:.*/)?";
						i += 3;
						continue;
					} else {
						regexStr += ".*";
						i += 2;
						continue;
					}
				} else {
					regexStr += "[^/]*";
					i++;
					continue;
				}
			} else if (c === "?") {
				regexStr += "[^/]";
				i++;
				continue;
			} else if (c === "[") {
				// Character class range notation e.g. [a-zA-Z] or [tT]
				const closeIdx = line.indexOf("]", i + 1);
				if (closeIdx > i + 1 && !line.slice(i, closeIdx).includes("/")) {
					const classContent = line.slice(i + 1, closeIdx);
					regexStr += "[" + classContent + "]";
					i = closeIdx + 1;
					continue;
				} else {
					regexStr += "\\[";
					i++;
					continue;
				}
			} else if (/[.+^$(){}|\\]/.test(c)) {
				regexStr += "\\" + c;
				i++;
				continue;
			} else {
				regexStr += c;
				i++;
				continue;
			}
		}

		try {
			let exactRegex: RegExp;
			let childRegex: RegExp;
			let fullRegex: RegExp;

			// Strictly case-sensitive matching matching official .gitignore specification
			if (hasSlash) {
				exactRegex = new RegExp("^" + regexStr + "$");
				childRegex = new RegExp("^" + regexStr + "/.*$");
				fullRegex = new RegExp("^" + regexStr + "(?:/.*)?$");
			} else {
				exactRegex = new RegExp("(?:^|/)" + regexStr + "$");
				childRegex = new RegExp("(?:^|/)" + regexStr + "/.*$");
				fullRegex = new RegExp("(?:^|/)" + regexStr + "(?:/.*)?$");
			}

			rules.push({
				pattern: line,
				rooted: hasSlash,
				dirOnly,
				negate,
				exactRegex,
				childRegex,
				fullRegex,
			});
		} catch {
			// Skip invalid regex pattern
		}
	}
	return rules;
}

export const EMPTY_IGNORE_RULES: readonly IgnoreRule[] = [];

/** Compiled rules and bounded memoization shared by scanning and explorer filtering. */
export class IgnoreMatcher {
	private git: readonly IgnoreRule[] = EMPTY_IGNORE_RULES;
	private obsidian: readonly IgnoreRule[] = EMPTY_IGNORE_RULES;
	private rules: readonly IgnoreRule[] = EMPTY_IGNORE_RULES;
	private cache = new Map<string, boolean>();

	configure(git: readonly IgnoreRule[], obsidian: readonly IgnoreRule[]): void {
		if (this.git === git && this.obsidian === obsidian) return;
		this.git = git; this.obsidian = obsidian;
		this.rules = [...git, ...obsidian];
		this.cache.clear();
	}

	private remember(key: string, value: boolean): boolean {
		if (this.cache.size >= 20000) this.cache.clear();
		this.cache.set(key, value);
		return value;
	}

	ignored(path: string, directory: boolean): boolean {
		if (!path || path === ".gitignore" || path === ".obsidianignore") return false;
		const key = `${directory ? "d" : "f"}:${path}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;
		let ignored = false;
		for (const rule of this.rules) {
			const matches = rule.dirOnly
				? (directory && rule.exactRegex.test(path)) || rule.childRegex.test(path)
				: rule.fullRegex.test(path);
			if (matches) ignored = !rule.negate;
		}
		return this.remember(key, ignored);
	}

	canPrune(path: string): boolean {
		if (!this.ignored(path, true)) return false;
		const key = `p:${path}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;
		// Conservatively retain subtrees that may contain a re-included descendant.
		for (const rule of this.rules) {
			if (!rule.negate) continue;
			if (!rule.rooted) return this.remember(key, false);
			const wildcard = rule.pattern.search(/[*?[]/);
			const prefix = wildcard < 0 ? rule.pattern : rule.pattern.slice(0, wildcard);
			if (path === prefix || prefix.startsWith(path + "/") || path.startsWith(prefix + "/") ||
				(wildcard >= 0 && path.startsWith(prefix))) return this.remember(key, false);
		}
		return this.remember(key, true);
	}
}
