import type { App } from "obsidian";

/** The parts of the Iconize plugin's public API (`obsidian-icon-folder`) used to draw its `:LiCopy:` shortcodes. */
interface IconizeEvents {
	on(type: "allIconsLoaded", listener: () => void): void;
	off(type: "allIconsLoaded", listener: () => void): void;
}
interface IconizePlugin {
	api?: {
		getIconByName?(name: string): { svgElement?: string } | null;
		getIconNameByPath?(path: string): string | undefined;
		getEventEmitter?(): IconizeEvents;
	};
	getSettings?(): { iconIdentifier?: string; iconsInNotesEnabled?: boolean; rules?: IconizeRule[] };
	getData?(): Record<string, unknown>;
	getIconColor?(path: string): string | undefined;
}

interface IconizeRule { rule: string; icon: string; color?: string; for?: "everything" | "files" | "folders"; order?: number; useFilePath?: boolean }

const ICONIZE_ID = "obsidian-icon-folder";

function iconize(app: App): IconizePlugin | undefined {
	const plugins = (app as unknown as { plugins?: { getPlugin?(id: string): unknown } }).plugins;
	return plugins?.getPlugin?.(ICONIZE_ID) as IconizePlugin | undefined ?? undefined;
}

/** Calls `listener` whenever Iconize finishes loading its icon packs. Returns the unsubscribe function. */
export function onIconizeLoaded(app: App, listener: () => void): () => void {
	const events = iconize(app)?.api?.getEventEmitter?.();
	if (!events) return () => {};
	events.on("allIconsLoaded", listener);
	return () => events.off("allIconsLoaded", listener);
}

/** Matches Iconize's own shortcode rule: the identifier, a name of word characters, the identifier again. */
export function iconShortcodes(text: string, identifier = ":"): Array<{ index: number; length: number; name: string }> {
	if (!identifier) return [];
	const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`${escaped}(\\w{1,64})${escaped}`, "g");
	return [...text.matchAll(pattern)].map(match => ({ index: match.index, length: match[0].length, name: match[1] ?? "" }));
}

function parseIcon(doc: Document, markup: string): SVGSVGElement | undefined {
	const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
	if (parsed.localName !== "svg" || parsed.getElementsByTagName("parsererror").length) return undefined;
	// Icon packs are files in the vault, so keep only drawing markup.
	for (const element of [parsed, ...Array.from(parsed.querySelectorAll("*"))]) {
		if (["script", "foreignObject", "iframe"].includes(element.localName)) { element.remove(); continue; }
		for (const { name, value } of Array.from(element.attributes)) {
			if (/^on/i.test(name) || (/href$/i.test(name) && !value.startsWith("#"))) element.removeAttribute(name);
		}
	}
	parsed.removeAttribute("width");
	parsed.removeAttribute("height");
	return doc.importNode(parsed, true) as unknown as SVGSVGElement;
}

function iconSvg(api: NonNullable<IconizePlugin["api"]>, doc: Document, name: string): SVGSVGElement | undefined {
	let markup: string | undefined;
	try { markup = api.getIconByName?.(name)?.svgElement; } catch { return undefined; }
	return markup ? parseIcon(doc, markup) : undefined;
}

/** Iconize's custom rule test: a regular expression, or plain text when the rule isn't one, against the name or full path. */
export function iconRuleMatches(rule: { rule: string; useFilePath?: boolean }, path: string): boolean {
	const target = rule.useFilePath ? path : path.split("/").pop() ?? path;
	try { return new RegExp(rule.rule).test(target); } catch { return target.includes(rule.rule); }
}

/**
 * The icon (and colour) Iconize gives a file or folder: its own choice first, then the first matching custom rule.
 * Released Iconize versions have no lookup for this in their API, so it follows Iconize's own lookup.
 */
export function pathIcon(app: App, path: string, folder: boolean): { name: string; color?: string } | undefined {
	const plugin = iconize(app);
	if (!plugin?.api) return undefined;
	try {
		const color = (value: unknown) => typeof value === "string" && value ? value : undefined;
		const own = plugin.getData?.()[path];
		const ownName = typeof own === "string" ? own : (own as { iconName?: unknown } | undefined)?.iconName;
		if (typeof ownName === "string" && ownName) return { name: ownName, color: color(plugin.getIconColor?.(path)) };
		const rules = [...plugin.getSettings?.().rules ?? []].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		const rule = rules.find(rule => rule.icon && (rule.for === "everything" || rule.for === (folder ? "folders" : "files")) && iconRuleMatches(rule, path));
		return rule ? { name: rule.icon, color: color(rule.color) } : undefined;
	} catch { return undefined; }
}

/** Draws an Iconize icon, or an emoji Iconize stores as plain text, at the start of `parent`. */
export function prependPathIcon(app: App, parent: HTMLElement, icon: { name: string; color?: string }): void {
	const api = iconize(app)?.api;
	if (!api) return;
	const span = createSpan({ cls: "vault-code-kanban-icon", attr: { "aria-hidden": "true", "data-icon": icon.name } });
	const svg = iconSvg(api, parent.doc, icon.name);
	if (svg) span.appendChild(svg);
	else if (/^\p{Extended_Pictographic}/u.test(icon.name)) span.setText(icon.name);
	else return;
	if (icon.color) span.setCssProps({ color: icon.color });
	parent.prepend(span);
}

/**
 * Replaces Iconize shortcodes in `root`'s text with the icons Iconize knows, the way it does in notes.
 * Does nothing when Iconize is missing, disabled, or has "icons in notes" turned off. Code stays literal.
 */
export function renderIconShortcodes(app: App, root: HTMLElement): void {
	const plugin = iconize(app);
	const api = plugin?.api;
	if (!plugin || !api?.getIconByName) return;
	const settings = plugin.getSettings?.();
	if (settings?.iconsInNotesEnabled === false) return;
	const identifier = settings?.iconIdentifier ?? ":";
	const doc = root.doc;
	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: node => node.parentElement?.closest("code, pre") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
	});
	const texts: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
	for (const text of texts) {
		// Right to left, so earlier offsets stay valid while splitting.
		for (const { index, length, name } of iconShortcodes(text.data, identifier).reverse()) {
			const svg = iconSvg(api, doc, name);
			if (!svg) continue;
			const rest = text.splitText(index);
			rest.data = rest.data.slice(length);
			const span = createSpan({ cls: "vault-code-kanban-icon", attr: { "aria-hidden": "true", "data-icon": name } });
			span.appendChild(svg);
			text.after(span);
		}
	}
}
