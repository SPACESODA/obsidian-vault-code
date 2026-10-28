import { setIcon } from "obsidian";
import { t } from "./i18n";
import { captureReadingSelection, type SelectionQuote } from "./ai-selection";
import { selectionActionPosition } from "./ai-selection-position";

interface PreviewSelectionOptions {
	enabled: () => boolean;
	source: () => { path: string; text: string } | null;
	onQuote: (quote: SelectionQuote) => void;
}

/** Capture rendered text from the existing preview iframe without modifying its page or source. */
export class HtmlPreviewSelection {
	private frame: HTMLIFrameElement | null = null;
	private doc: Document | null = null;
	private button: HTMLButtonElement;
	private quote: SelectionQuote | null = null;
	private pressed: SelectionQuote | null = null;
	private pointers = new Set<number>();
	private revision = 0;
	private timer: number | undefined;
	private disposed = false;
	private onLoad = () => this.attach();
	private onChange = () => this.schedule();
	private onFrameBlur = () => this.hide();
	private onHostBlur = () => { this.pressed = null; this.pointers.clear(); this.hide(); };
	private onSetting = () => { this.pressed = null; this.attach(); };
	private onDown = (event: PointerEvent) => { this.pressed = null; this.pointers.add(event.pointerId); this.hide(); };
	private onUp = (event: PointerEvent) => {
		this.pointers.delete(event.pointerId);
		if (event.type === "pointercancel" || !event.composedPath().includes(this.button)) { this.pressed = null; this.schedule(); }
	};
	constructor(private host: HTMLElement, private options: PreviewSelectionOptions) {
		this.button = host.doc.body.createEl("button", { cls: "clickable-icon vault-code-selection-agent", attr: { type: "button", "aria-label": t("askAI") } });
		this.button.hidden = true; setIcon(this.button, "sparkles");
		this.button.addEventListener("pointerdown", event => { event.preventDefault(); if (event.button === 0) this.pressed = this.quote; });
		this.button.addEventListener("click", () => {
			const quote = this.pressed ?? this.quote;
			this.pressed = null; this.hide();
			if (quote && this.current() && this.options.source()?.path === quote.path) this.options.onQuote(quote);
		});
		host.doc.addEventListener("pointerup", this.onUp, true);
		host.doc.addEventListener("pointercancel", this.onUp, true);
		host.doc.addEventListener("vault-code-selection-setting-change", this.onSetting);
		host.win.addEventListener("resize", this.onChange);
		host.win.addEventListener("blur", this.onHostBlur);
	}
	setFrame(frame: HTMLIFrameElement | null): void {
		if (this.disposed) return;
		this.frame?.removeEventListener("load", this.onLoad);
		this.detach(); this.frame = frame;
		frame?.addEventListener("load", this.onLoad); this.attach();
	}
	private current(): boolean {
		if (this.disposed || !this.options.enabled() || !this.frame?.isConnected || !this.frame.getClientRects().length) return false;
		try { return !!this.doc && /^about:srcdoc(?:#|$)/.test(this.doc.URL) && this.frame.contentDocument === this.doc; } catch { return false; }
	}
	private attach(): void {
		this.detach();
		if (!this.options.enabled() || this.disposed) return;
		try { this.doc = this.frame?.contentDocument ?? null; } catch { this.doc = null; }
		this.doc?.addEventListener("selectionchange", this.onChange);
		this.doc?.addEventListener("pointerdown", this.onDown, true);
		this.doc?.addEventListener("pointerup", this.onUp, true);
		this.doc?.addEventListener("pointercancel", this.onUp, true);
		this.doc?.addEventListener("scroll", this.onChange, true);
		this.doc?.defaultView?.addEventListener("blur", this.onFrameBlur);
		this.doc?.defaultView?.addEventListener("focus", this.onChange);
		this.doc?.defaultView?.addEventListener("resize", this.onChange);
		this.schedule();
	}
	private detach(): void {
		this.pressed = null; this.pointers.clear(); this.hide();
		this.doc?.removeEventListener("selectionchange", this.onChange);
		this.doc?.removeEventListener("pointerdown", this.onDown, true);
		this.doc?.removeEventListener("pointerup", this.onUp, true);
		this.doc?.removeEventListener("pointercancel", this.onUp, true);
		this.doc?.removeEventListener("scroll", this.onChange, true);
		this.doc?.defaultView?.removeEventListener("blur", this.onFrameBlur);
		this.doc?.defaultView?.removeEventListener("focus", this.onChange);
		this.doc?.defaultView?.removeEventListener("resize", this.onChange);
		this.doc = null;
	}
	private hide(): void {
		this.revision++;
		if (this.timer !== undefined) this.host.win.clearTimeout(this.timer);
		this.timer = undefined;
		if (this.pressed) return;
		this.quote = null; this.button.hidden = true;
	}
	private schedule(): void {
		this.hide();
		if (!this.current() || this.pointers.size || this.pressed) return;
		const revision = this.revision;
		this.timer = this.host.win.setTimeout(() => { this.timer = undefined; if (revision === this.revision) this.measure(); }, 300);
	}
	private measure(): void {
		if (!this.current() || !this.doc?.body || !this.frame || this.pointers.size) return;
		try {
			if (!this.doc.hasFocus() && this.host.doc.activeElement !== this.button) return;
			const selection = this.doc.getSelection();
			if (!selection || selection.isCollapsed || !selection.rangeCount || !this.doc.body.contains(selection.anchorNode) || !this.doc.body.contains(selection.focusNode)) return;
			if ([selection.anchorNode, selection.focusNode].some(node => node?.parentElement?.closest("input,textarea,select,[contenteditable]"))) return;
			const text = selection.toString(), source = this.options.source();
			if (!text.trim() || !source) return;
			const box = this.frame.getBoundingClientRect(), win = this.doc.defaultView;
			if (!win?.innerWidth || !win.innerHeight) return;
			const scaleX = box.width / win.innerWidth, scaleY = box.height / win.innerHeight;
			const rects = Array.from(selection.getRangeAt(0).getClientRects()).map(rect => ({ left: box.left + rect.left * scaleX, right: box.left + rect.right * scaleX, top: box.top + rect.top * scaleY, bottom: box.top + rect.bottom * scaleY }));
			const pane = { left: box.left, right: Math.min(box.right, box.left + this.doc.documentElement.clientWidth * scaleX), top: box.top, bottom: box.bottom };
			const position = selectionActionPosition(rects, pane, { width: this.host.win.innerWidth, height: this.host.win.innerHeight });
			if (!position) return;
			this.quote = captureReadingSelection(source.path, source.text, text);
			if (!this.quote) return;
			this.button.setAttribute("aria-label", t("askAI"));
			this.button.setCssProps({ "--selection-agent-left": `${position.left}px`, "--selection-agent-top": `${position.top}px` });
			this.button.hidden = false;
		} catch { this.pressed = null; this.hide(); }
	}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true; this.frame?.removeEventListener("load", this.onLoad); this.detach(); this.frame = null;
		this.host.doc.removeEventListener("pointerup", this.onUp, true); this.host.doc.removeEventListener("pointercancel", this.onUp, true);
		this.host.doc.removeEventListener("vault-code-selection-setting-change", this.onSetting);
		this.host.win.removeEventListener("resize", this.onChange); this.host.win.removeEventListener("blur", this.onHostBlur); this.button.remove();
	}
}
