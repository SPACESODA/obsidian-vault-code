import { App, Component, Platform, View, setIcon, type TFile, type WorkspaceLeaf } from "obsidian";
import { captureReadingSelection, type SelectionQuote } from "./ai-selection";
import { t } from "./i18n";
interface ReadingView extends View { file?: TFile; getMode?: () => string }

/** DOM selections in native Reading view are independent of CodeMirror selections. */
export class ReadingSelectionChat extends Component {
	private leaf: WorkspaceLeaf | null = null;
	private button: HTMLButtonElement | null = null;
	private quote: SelectionQuote | null = null;
	private pressed: SelectionQuote | null = null;
	private pointers = new Set<number>();
	private revision = 0;
	private timer: number | undefined;
	private win: Window | null = null;
	private unbind: () => void = () => {};
	constructor(private app: App, private enabled: () => boolean, private onQuote: (quote: SelectionQuote) => void) { super(); }
	refresh(): void { this.bind(); }
	onload(): void {
		if (!Platform.isDesktop) return;
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.bind()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.bind()));
		this.bind();
	}
	private hide(): void {
		this.revision++;
		if (this.timer !== undefined) this.win?.clearTimeout(this.timer);
		this.timer = undefined;
		if (this.pressed) return;
		if (this.button) this.button.hidden = true;
		this.quote = null;
	}
	private bind(): void {
		const leaf = this.app.workspace.getActiveViewOfType(View)?.leaf ?? null;
		const view: ReadingView | undefined = leaf?.view;
		const eligible = this.enabled() && view?.getViewType() === "markdown" && view.getMode?.() === "preview" && !!view.file;
		if (eligible && this.leaf === leaf) return;
		this.pressed = null; this.hide(); this.unbind(); this.unbind = () => {}; this.button?.remove(); this.button = null; this.quote = null; this.pointers.clear();
		this.leaf = eligible ? leaf : null;
		if (!this.leaf || !view) return;
		const doc = view.containerEl.doc;
		this.win = view.containerEl.win;
		const button = this.button = doc.body.createEl("button", { cls: "clickable-icon vault-code-selection-agent", attr: { type: "button", "aria-label": t("askAI") } });
		button.hidden = true; setIcon(button, "sparkles");
		button.addEventListener("pointerdown", event => { event.preventDefault(); if (event.button === 0) this.pressed = this.quote; });
		button.addEventListener("click", () => {
			const quote = this.pressed ?? this.quote; this.pressed = null; this.hide();
			if (quote && this.enabled() && view.containerEl.isConnected && view.file?.path === quote.path && view.getMode?.() === "preview") this.onQuote(quote);
		});
		const schedule = () => this.schedule();
		const down = (event: PointerEvent) => { if (event.composedPath().includes(button)) return; this.pressed = null; this.pointers.add(event.pointerId); this.hide(); };
		const up = (event: PointerEvent) => { this.pointers.delete(event.pointerId); if (event.type === "pointercancel" || !event.composedPath().includes(button)) { this.pressed = null; this.schedule(); } };
		const blur = () => { this.pressed = null; this.pointers.clear(); this.hide(); };
		doc.addEventListener("selectionchange", schedule); doc.addEventListener("pointerdown", down, true); doc.addEventListener("pointerup", up, true); doc.addEventListener("pointercancel", up, true);
		view.containerEl.addEventListener("scroll", schedule, true); this.win.addEventListener("resize", schedule); this.win.addEventListener("blur", blur);
		const win = this.win;
		this.unbind = () => { doc.removeEventListener("selectionchange", schedule); doc.removeEventListener("pointerdown", down, true); doc.removeEventListener("pointerup", up, true); doc.removeEventListener("pointercancel", up, true); view.containerEl.removeEventListener("scroll", schedule, true); win.removeEventListener("resize", schedule); win.removeEventListener("blur", blur); };
		this.schedule();
	}
	private schedule(): void {
		this.hide();
		if (this.pointers.size || this.pressed || !this.enabled() || !this.leaf || !this.win) return;
		const revision = this.revision;
		this.timer = this.win.setTimeout(() => { this.timer = undefined; void this.measure(revision); }, 300);
	}
	private async measure(revision: number): Promise<void> {
		const view: ReadingView | undefined = this.leaf?.view;
		if (!view?.file || !this.enabled() || view.getMode?.() !== "preview" || revision !== this.revision || this.pointers.size) return;
		const root = view.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
		const selection = view.containerEl.doc.getSelection();
		if (!root?.getClientRects().length || !selection || selection.isCollapsed || !selection.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
		if (selection.anchorNode?.parentElement?.closest("input,textarea,select,[contenteditable]")) return;
		const range = selection.getRangeAt(0), text = selection.toString(), file = view.file;
		const rect = range.getClientRects()[0] ?? range.getBoundingClientRect(), box = root.getBoundingClientRect();
		if (!text.trim() || rect.bottom < box.top || rect.top > box.bottom) return;
		try {
			const source = await this.app.vault.cachedRead(file);
			if (revision !== this.revision || !this.enabled() || this.leaf?.view !== view || view.file !== file || view.getMode?.() !== "preview" || this.pointers.size || selection.toString() !== text || !this.button || !this.win) return;
			this.quote = captureReadingSelection(file.path, source, text);
			if (!this.quote) return;
			this.button.setCssProps({ "--selection-agent-left": `${Math.max(8, Math.min(box.right - 56, this.win.innerWidth - 40))}px`, "--selection-agent-top": `${Math.max(8, Math.min((rect.top + rect.bottom) / 2 - 15, this.win.innerHeight - 38))}px` });
			this.button.hidden = false;
		} catch { this.hide(); }
	}
	onunload(): void { this.pressed = null; this.hide(); this.unbind(); this.button?.remove(); this.leaf = null; }
}
