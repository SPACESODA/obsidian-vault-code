import { setIcon } from "obsidian";
import { t } from "./i18n";

const MATCH_LIMIT = 5000;
const ALL = "vault-code-page-find";
const CURRENT = "vault-code-page-find-current";
export const PREVIEW_SEARCH_STYLE = `<style>::highlight(${ALL}){background-color:#ffe066;color:#151515}::highlight(${CURRENT}){background-color:#ff9f43;color:#151515}</style>`;
interface Segment { node: Text; start: number; end: number }
interface HighlightRuntime {
	Highlight?: new (...ranges: Range[]) => unknown;
	CSS?: { highlights?: { set(name: string, value: unknown): void; delete(name: string): void } };
}

/** Literal, case-insensitive search; rendered whitespace can span inline elements. */
export function findPreviewText(text: string, query: string): { start: number; end: number }[] {
	const parts = query.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return [];
	const pattern = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
	const regex = new RegExp(pattern, "giu");
	const matches: { start: number; end: number }[] = [];
	let match: RegExpExecArray | null;
	while (matches.length <= MATCH_LIMIT && (match = regex.exec(text))) matches.push({ start: match.index, end: match.index + match[0].length });
	return matches;
}

/** Index visible text without inserting marks or changing the page's original nodes. */
export function previewText(doc: Document): { text: string; segments: Segment[] } {
	const segments: Segment[] = [];
	const win = doc.defaultView;
	if (!doc.body || !win) return { text: "", segments };
	const styles = new Map<Element, CSSStyleDeclaration>();
	const style = (element: Element) => {
		let value = styles.get(element);
		if (!value) { value = win.getComputedStyle(element); styles.set(element, value); }
		return value;
	};
	const walker = doc.createTreeWalker(doc.body, 5, {
		acceptNode(node) {
			if (node.nodeType === 1) return node.nodeName === "BR" && (node as Element).getClientRects().length ? 1 : 3;
			const parent = node.parentElement;
			if (!parent || !node.textContent || parent.closest("script,style,noscript,template,textarea,input,select,[hidden],[inert]")) return 2;
			if (!parent.getClientRects().length || style(parent).visibility !== "visible") return 2;
			return 1;
		},
	});
	let text = "";
	let previousBlock: Element | null = null;
	let node: Node | null;
	while ((node = walker.nextNode())) {
		if (node.nodeType === 1) { text += "\n"; continue; }
		let block = node.parentElement;
		while (block && block !== doc.body && ["inline", "contents"].includes(style(block).display)) block = block.parentElement;
		if (previousBlock && block !== previousBlock) text += "\n";
		previousBlock = block;
		const value = node.textContent ?? "";
		segments.push({ node: node as Text, start: text.length, end: text.length + value.length });
		text += value;
	}
	return { text, segments };
}

function rangeFor(doc: Document, segments: Segment[], start: number, end: number): Range | null {
	const locate = (position: number) => {
		let left = 0, right = segments.length - 1;
		while (left <= right) {
			const middle = (left + right) >>> 1;
			const segment = segments[middle]!;
			if (position < segment.start) right = middle - 1;
			else if (position >= segment.end) left = middle + 1;
			else return segment;
		}
		return undefined;
	};
	const first = locate(start), last = locate(end - 1);
	if (!first || !last) return null;
	const range = doc.createRange();
	range.setStart(first.node, start - first.start);
	range.setEnd(last.node, end - last.start);
	return range;
}

export class HtmlPreviewSearch {
	private bar: HTMLDivElement;
	private input: HTMLInputElement;
	private count: HTMLSpanElement;
	private previous: HTMLButtonElement;
	private next: HTMLButtonElement;
	private frame: HTMLIFrameElement | null = null;
	private rail: HTMLDivElement | null = null;
	private doc: Document | null = null;
	private observer: MutationObserver | null = null;
	private hostWindow: Window;
	private timer: number | undefined;
	private ranges: Range[] = [];
	private index = -1;
	private truncated = false;
	private lastQuery = "";
	private selectedRange: Range | null = null;
	private onLoad = () => this.attachDocument();
	private onResize = () => { if (this.isOpen) this.schedule(false); };
	private onPageKey = (event: KeyboardEvent) => {
		if (event.isComposing) return;
		if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
			event.preventDefault(); event.stopPropagation(); this.open();
		} else if (event.key === "Escape" && this.isOpen) {
			event.preventDefault(); event.stopPropagation(); this.close(true);
		}
	};
	constructor(container: HTMLElement, before: HTMLElement) {
		this.hostWindow = container.win;
		this.bar = container.createDiv({ cls: "vault-code-preview-find", attr: { role: "search", hidden: "" } });
		before.before(this.bar);
		this.input = this.bar.createEl("input", { type: "search", attr: { placeholder: t("searchFindPlaceholder"), "aria-label": t("searchFindAriaLabel"), spellcheck: "false", maxlength: "1000" } });
		this.count = this.bar.createSpan({ cls: "vault-code-preview-find-count", attr: { role: "status", "aria-live": "polite" } });
		const button = (icon: string, label: string, action: () => void) => {
			const element = this.bar.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label } });
			setIcon(element, icon); element.addEventListener("click", action); return element;
		};
		this.previous = button("chevron-up", t("searchPreviousMatch"), () => this.move(-1));
		this.next = button("chevron-down", t("searchNextMatch"), () => this.move(1));
		button("x", t("modalButtonCancel"), () => this.close(true));
		this.input.addEventListener("input", event => { if (!(event as InputEvent).isComposing) this.schedule(); });
		this.input.addEventListener("compositionend", () => this.schedule());
		this.input.addEventListener("keydown", event => {
			if (event.isComposing) return;
			if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.close(true); }
			else if (event.key === "Enter") {
				event.preventDefault();
				const changed = this.input.value !== this.lastQuery;
				if (this.timer !== undefined) this.search(false);
				if (!changed) this.move(event.shiftKey ? -1 : 1);
			}
		});
		this.updateCount();
	}
	get isOpen(): boolean { return !this.bar.hidden; }
	open(): void {
		this.bar.hidden = false;
		this.observe(); this.search(); this.input.focus(); this.input.select();
	}
	close(focusPage = false): void {
		this.bar.hidden = true;
		this.cancelTimer(); this.observer?.disconnect(); this.observer = null;
		this.clearHighlights(); this.ranges = []; this.index = -1; this.updateCount();
		if (focusPage) this.frame?.contentWindow?.focus();
	}
	reset(): void { this.close(); this.input.value = ""; this.lastQuery = ""; this.setFrame(null); }
	dispose(): void { this.reset(); this.bar.remove(); }
	setFrame(frame: HTMLIFrameElement | null): void {
		this.frame?.removeEventListener("load", this.onLoad);
		this.detachDocument(); this.frame = frame;
		this.rail?.remove();
		this.rail = frame?.parentElement?.createDiv({ cls: "vault-code-preview-find-rail", attr: { "aria-hidden": "true" } }) ?? null;
		frame?.addEventListener("load", this.onLoad);
		this.attachDocument();
	}
	private attachDocument(): void {
		this.detachDocument();
		try { this.doc = this.frame?.contentDocument ?? null; } catch { this.doc = null; }
		this.doc?.addEventListener("keydown", this.onPageKey, true);
		this.doc?.defaultView?.addEventListener("resize", this.onResize);
		if (this.isOpen) { this.observe(); this.search(); }
	}
	private detachDocument(): void {
		this.cancelTimer(); this.observer?.disconnect(); this.observer = null;
		this.clearHighlights();
		this.doc?.removeEventListener("keydown", this.onPageKey, true);
		this.doc?.defaultView?.removeEventListener("resize", this.onResize);
		this.doc = null; this.ranges = []; this.index = -1; this.updateCount();
	}
	private cancelTimer(): void { if (this.timer !== undefined) this.hostWindow.clearTimeout(this.timer); this.timer = undefined; }
	private schedule(scroll = true): void {
		this.cancelTimer();
		this.timer = this.hostWindow.setTimeout(() => { this.timer = undefined; if (this.isOpen) this.search(scroll); }, 150);
	}
	private observe(): void {
		if (this.observer || !this.doc?.body) return;
		const win = this.doc.defaultView as (Window & { MutationObserver: typeof MutationObserver }) | null;
		if (!win) return;
		this.observer = new win.MutationObserver(() => { if (this.timer === undefined) this.schedule(false); });
		this.observer.observe(this.doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "style", "class", "open"] });
	}
	private search(scroll = true): void {
		const query = this.input.value;
		const changed = query !== this.lastQuery;
		const oldRange = this.ranges[this.index], oldIndex = this.index;
		this.lastQuery = query;
		this.cancelTimer(); this.clearHighlights(); this.ranges = []; this.index = -1; this.truncated = false;
		if (this.doc && this.input.value.trim()) {
			const { text, segments } = previewText(this.doc);
			const matches = findPreviewText(text, this.input.value);
			this.truncated = matches.length > MATCH_LIMIT;
			for (const match of matches.slice(0, MATCH_LIMIT)) {
				const range = rangeFor(this.doc, segments, match.start, match.end);
				if (range) this.ranges.push(range);
			}
			if (this.ranges.length) {
				const retained = !changed && oldRange ? this.ranges.findIndex(range => range.startContainer === oldRange.startContainer && range.startOffset === oldRange.startOffset) : -1;
				this.index = changed ? 0 : retained >= 0 ? retained : Math.max(0, Math.min(oldIndex, this.ranges.length - 1));
			}
		}
		this.paint(); this.updateCount();
		if (scroll || changed) this.scrollCurrent();
	}
	private move(direction: number): void {
		if (this.timer !== undefined) this.search(false);
		if (!this.ranges.length) return;
		this.index = (this.index + direction + this.ranges.length) % this.ranges.length;
		this.paint(); this.updateCount(); this.scrollCurrent();
	}
	private runtime(): (Window & HighlightRuntime) | null { return this.doc?.defaultView as (Window & HighlightRuntime) | null; }
	private clearHighlights(): void {
		this.rail?.empty();
		try {
			const highlights = this.runtime()?.CSS?.highlights;
			highlights?.delete(ALL); highlights?.delete(CURRENT);
			const selection = this.doc?.getSelection();
			if (this.selectedRange && selection?.rangeCount === 1 && selection.getRangeAt(0) === this.selectedRange) selection.removeAllRanges();
		} catch {
			// The iframe may have navigated to a different origin since the last search.
		}
		this.selectedRange = null;
	}
	private paint(): void {
		this.paintRail();
		const win = this.runtime(); const range = this.ranges[this.index];
		if (!win || !range) return;
		if (win.Highlight && win.CSS?.highlights) {
			win.CSS.highlights.set(ALL, new win.Highlight(...this.ranges));
			win.CSS.highlights.set(CURRENT, new win.Highlight(range));
		} else {
			// Older mobile webviews still get a visible current match without rewriting DOM.
			const selection = this.doc!.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
			this.selectedRange = range;
		}
	}
	private paintRail(): void {
		const rail = this.rail, doc = this.doc, win = doc?.defaultView;
		if (!rail || !doc || !win) return;
		rail.empty();
		const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, win.innerHeight);
		const bins = Math.max(1, Math.min(1000, Math.floor(rail.clientHeight / 2)));
		const positions = this.ranges.map(range => Math.max(0, Math.min(1, (range.getBoundingClientRect().top + win.scrollY) / height)));
		const occupied = new Set<number>();
		for (const position of positions) {
			const bin = Math.round(position * bins);
			if (occupied.has(bin)) continue;
			occupied.add(bin);
			rail.createSpan({ cls: "vault-code-preview-find-tick" }).setCssProps({ top: `${position * 100}%` });
		}
		const active = positions[this.index];
		if (active !== undefined) rail.createSpan({ cls: "vault-code-preview-find-tick is-current" }).setCssProps({ top: `${active * 100}%` });
	}
	private scrollCurrent(): void {
		const range = this.ranges[this.index]; const win = this.doc?.defaultView;
		if (!range || !win) return;
		let parent = range.startContainer.parentElement;
		while (parent && parent !== this.doc?.body) {
			if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(win.getComputedStyle(parent).overflowY)) {
				const rect = range.getBoundingClientRect(), box = parent.getBoundingClientRect();
				parent.scrollTop += rect.top - box.top - parent.clientHeight / 2;
			}
			parent = parent.parentElement;
		}
		const rect = range.getBoundingClientRect(); win.scrollBy(0, rect.top - win.innerHeight / 2);
	}
	private updateCount(): void {
		if (!this.count) return;
		this.count.textContent = !this.input?.value.trim() || !this.doc ? "" : this.ranges.length ? t("searchCountMatches", this.index + 1, `${this.ranges.length}${this.truncated ? "+" : ""}`) : t("searchNoResults");
		if (this.previous) this.previous.disabled = !this.ranges.length;
		if (this.next) this.next.disabled = !this.ranges.length;
	}
}
