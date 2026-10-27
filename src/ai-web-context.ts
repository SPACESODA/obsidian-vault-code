import { App, Component, Platform, setIcon, View, type WorkspaceLeaf } from "obsidian";
import { t } from "./i18n";
import type { SelectionQuote } from "./ai-selection";
import { selectionActionPosition, type SelectionRect } from "./ai-selection-position";

export interface WebPageContext { url: string; title: string; text: string }
export interface WebPageTarget { url: string; title: string; read: () => Promise<WebPageContext> }
interface BrowserElement extends HTMLElement {
	executeJavaScript?: (script: string) => Promise<unknown>;
	getURL?: () => string;
}
interface PageView extends View { url?: string; title?: string; mode?: string }
interface PageSelection { text: string; rects: SelectionRect[]; moving: boolean; scroll: number; viewportWidth?: number; viewportHeight?: number; contentWidth?: number }
const LIMIT = 60_000;
export function webUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try { const url = new URL(value); return /^(https?:)$/.test(url.protocol) ? url.href : null; } catch { return null; }
}
export function webPage(value: unknown, expected: string): WebPageContext | null {
	if (!value || typeof value !== "object") return null;
	const data = value as Record<string, unknown>;
	const url = webUrl(data.url);
	if (url !== expected || typeof data.text !== "string" || !data.text.trim()) return null;
	return { url, title: typeof data.title === "string" ? data.title.slice(0, 500) : url, text: data.text.slice(0, LIMIT) };
}
function browser(view: View): BrowserElement | null { return view.containerEl.querySelector<BrowserElement>("webview"); }
async function readBrowser(guest: BrowserElement | null, script: string): Promise<unknown> {
	if (!guest?.executeJavaScript) throw new Error(t("aiChatWebUnavailable"));
	const win = guest.win;
	let timer: number | undefined;
	try {
		return await Promise.race([guest.executeJavaScript(script), new Promise<never>((_resolve, reject) => {
			timer = win.setTimeout(() => reject(new Error(t("aiChatWebUnavailable"))), 3000);
		})]);
	} finally { if (timer !== undefined) win.clearTimeout(timer); }
}
function reader(view: View): HTMLElement | null {
	const element = view.containerEl.querySelector<HTMLElement>(".reader-mode-content");
	return element?.getClientRects().length ? element : null;
}
function urlOf(view: PageView): string | null {
	try { return webUrl(browser(view)?.getURL?.() || view.url); } catch { return webUrl(view.url); }
}
export function pageTarget(view: PageView): WebPageTarget | null {
	if (view.getViewType() !== "webviewer") return null;
	const url = urlOf(view);
	if (!url) return null;
	const title = view.title?.trim() || url;
	return { url, title, read: async () => {
		if (!view.containerEl.isConnected || urlOf(view) !== url) throw new Error(t("aiChatWebUnavailable"));
		const content = reader(view);
		const result: unknown = content ? { url, title, text: content.innerText } : await readBrowser(browser(view),
			`(() => ({url:location.href,title:document.title,text:(document.querySelector('main,article')||document.body)?.innerText?.slice(0,${LIMIT})||''}))()`);
		const page = webPage(result, url);
		if (!page || !view.containerEl.isConnected || urlOf(view) !== url) throw new Error(t("aiChatWebUnavailable"));
		return page;
	} };
}
export function snapshotPage(page: WebPageContext): WebPageTarget { return { ...page, read: () => Promise.resolve(page) }; }

// Read only page text and selection; never fetch a URL separately or inspect cookies/storage.
const SELECTION_SCRIPT = `(() => {
 const key='__vaultCodeSelectionState';
 if(!window[key]) {
  const state={moving:false};
  const down=()=>{state.moving=true},up=()=>{state.moving=false};
  document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);window.addEventListener('blur',up);
  state.dispose=()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',up);delete window[key]};window[key]=state;
 }
 const s=getSelection();if(!s||s.isCollapsed||!s.rangeCount||!document.hasFocus())return null;
 const parent=s.anchorNode?.parentElement;if(parent?.closest('input,textarea,select,[contenteditable]'))return null;
 const rects=Array.from(s.getRangeAt(0).getClientRects()).filter(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight).slice(0,2000).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}));
 return {text:s.toString().slice(0,20000),rects,moving:window[key].moving,scroll:scrollY,viewportWidth:innerWidth,viewportHeight:innerHeight,contentWidth:document.documentElement.clientWidth};
})()`;

/** Optional integration: no core-plugin imports or patches, and no work in background tabs. */
export class WebViewerChat extends Component {
	private leaf: WorkspaceLeaf | null = null;
	private button: HTMLButtonElement | null = null;
	private quote: SelectionQuote | null = null;
	private pressed: { quote: SelectionQuote; leaf: WorkspaceLeaf } | null = null;
	private lastSelection = "";
	private stableSince = 0;
	private busy = false;
	private disposed = false;
	private lastTarget = "";
	private readerDragging = false;
	private instrumented: BrowserElement | null = null;
	private clearHostEvents: () => void = () => {};
	constructor(private app: App, private enabled: () => boolean, private onQuote: (quote: SelectionQuote) => void, private changed: () => void, private selectionEnabled: () => boolean = enabled) { super(); }
	refreshSelectionAction(): void { this.pressed = null; this.hide(); if (!this.selectionEnabled()) this.cleanupBrowser(); }
	get hasPage(): boolean { return this.enabled() && !!this.leaf; }
	get target(): WebPageTarget | null { return this.enabled() && this.leaf ? pageTarget(this.leaf.view) : null; }
	onload(): void {
		if (!Platform.isDesktop) return;
		this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
			if (!leaf || leaf.view.getViewType() === "vault-code-ai-chat") { this.hide(); return; }
			if (leaf.view.getViewType() === "webviewer" || "file" in leaf.view) {
				this.cleanupBrowser(); this.leaf = leaf.view.getViewType() === "webviewer" ? leaf : null; this.refresh();
			}
		}));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refresh()));
		this.leaf = this.app.workspace.getActiveViewOfType(View)?.leaf?.view.getViewType() === "webviewer" ? this.app.workspace.getActiveViewOfType(View)?.leaf ?? null : null;
		this.registerInterval(window.setInterval(() => { void this.tick(); }, 150));
		this.refresh();
	}
	private hide(): void { if (this.pressed) return; if (this.button) this.button.hidden = true; this.quote = null; this.lastSelection = ""; }
	private refresh(): void {
		if (!this.enabled()) this.cleanupBrowser();
		if (this.leaf && !this.app.workspace.getLeavesOfType("webviewer").includes(this.leaf)) { this.cleanupBrowser(); this.leaf = null; }
		const target = this.target, key = target ? `${target.url}\n${target.title}` : "";
		if (key !== this.lastTarget) { this.pressed = null; this.lastTarget = key; this.hide(); this.changed(); }
		if (!target) this.hide();
	}
	private async tick(): Promise<void> {
		if (this.busy || this.disposed) return;
		this.refresh();
		if (!this.selectionEnabled()) { this.refreshSelectionAction(); return; }
		const leaf = this.leaf, target = this.target;
		if (!leaf || !target || this.app.workspace.getActiveViewOfType(View)?.leaf !== leaf || !leaf.view.containerEl.getClientRects().length) { this.hide(); return; }
		this.busy = true;
		try {
			if (!this.button || this.button.doc !== leaf.view.containerEl.doc) this.makeButton(leaf.view);
			const content = reader(leaf.view), host = leaf.view.containerEl.doc;
			let value: unknown;
			if (content) {
				const selection = host.getSelection();
				if (selection?.rangeCount && !selection.isCollapsed && content.contains(selection.anchorNode) && content.contains(selection.focusNode)) {
					const rects = Array.from(selection.getRangeAt(0).getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
					value = { text: selection.toString().slice(0, 20000), rects, moving: this.readerDragging, scroll: content.scrollTop };
				}
			} else {
				this.instrumented = browser(leaf.view);
				value = await readBrowser(this.instrumented, SELECTION_SCRIPT);
			}
			if (this.disposed || this.leaf !== leaf || this.app.workspace.getActiveViewOfType(View)?.leaf !== leaf || this.target?.url !== target.url || !this.enabled() || !this.selectionEnabled()) return;
			if (!value || typeof value !== "object") { this.hide(); return; }
			const data = value as Partial<PageSelection>;
			if (typeof data.text !== "string" || !data.text.trim() || !Array.isArray(data.rects) || data.moving) { this.hide(); return; }
			const key = JSON.stringify(data);
			if (key !== this.lastSelection) { this.hide(); this.lastSelection = key; this.stableSince = Date.now(); return; }
			if (Date.now() - this.stableSince < 300) return;
			if (!this.button || this.button.doc !== host) this.makeButton(leaf.view);
			const box = content ? content.getBoundingClientRect() : browser(leaf.view)?.getBoundingClientRect();
			if (!box || !this.button) return;
			const scaleX = !content && data.viewportWidth && data.viewportWidth > 0 ? box.width / data.viewportWidth : 1;
			const scaleY = !content && data.viewportHeight && data.viewportHeight > 0 ? box.height / data.viewportHeight : 1;
			const rects = data.rects.filter((rect): rect is SelectionRect => !!rect && typeof rect === "object").map(rect => ({ left: rect.left * scaleX + (content ? 0 : box.left), right: rect.right * scaleX + (content ? 0 : box.left), top: rect.top * scaleY + (content ? 0 : box.top), bottom: rect.bottom * scaleY + (content ? 0 : box.top) }));
			const pane = { left: box.left, right: content ? box.left + content.clientWidth : data.contentWidth ? Math.min(box.right, box.left + data.contentWidth * scaleX) : box.right, top: box.top, bottom: box.bottom };
			const position = selectionActionPosition(rects, pane, { width: host.defaultView!.innerWidth, height: host.defaultView!.innerHeight });
			if (!position) { this.hide(); return; }
			this.quote = { path: target.url, text: data.text, source: data.text, from: 0, to: data.text.length, startLine: 0, endLine: 0, web: { url: target.url, title: target.title } };
			this.button.setAttribute("aria-label", t("aiChatQuoteSelection"));
			this.button.setCssProps({ "--selection-agent-left": `${position.left}px`, "--selection-agent-top": `${position.top}px` });
			this.button.hidden = false;
		} catch { this.hide(); } finally { this.busy = false; }
	}
	private makeButton(view: View): void {
		this.clearHostEvents();
		this.button?.remove();
		const doc = view.containerEl.doc;
		this.button = doc.body.createEl("button", { cls: "clickable-icon vault-code-selection-agent", attr: { type: "button" } });
		setIcon(this.button, "sparkles"); this.button.hidden = true;
		this.button.addEventListener("pointerdown", event => {
			event.preventDefault();
			if (event.button === 0 && this.quote && this.leaf) this.pressed = { quote: this.quote, leaf: this.leaf };
		});
		this.button.addEventListener("click", () => this.sendSelection());
		const down = (event: PointerEvent) => { if (this.button && event.composedPath().includes(this.button)) return; this.pressed = null; this.readerDragging = true; this.hide(); };
		const up = (event: PointerEvent) => { this.readerDragging = false; if (!this.button || event.type === "pointercancel" || !event.composedPath().includes(this.button)) { this.pressed = null; this.hide(); } };
		doc.addEventListener("pointerdown", down, true); doc.addEventListener("pointerup", up, true); doc.addEventListener("pointercancel", up, true);
		const blur = () => { this.pressed = null; this.readerDragging = false; this.hide(); };
		doc.defaultView?.addEventListener("blur", blur);
		this.clearHostEvents = () => { doc.removeEventListener("pointerdown", down, true); doc.removeEventListener("pointerup", up, true); doc.removeEventListener("pointercancel", up, true); doc.defaultView?.removeEventListener("blur", blur); };
	}
	private sendSelection(): void {
		// Moving focus from Electron's guest page to this host button can clear its selection.
		// Use the visible action's captured selection, just as the editor action does.
		const quote = this.pressed?.quote ?? this.quote, leaf = this.pressed?.leaf ?? this.leaf;
		this.pressed = null;
		this.hide();
		if (this.disposed || !quote?.web || !leaf || !this.enabled() || !this.selectionEnabled() || !leaf.view.containerEl.isConnected || pageTarget(leaf.view)?.url !== quote.web.url) return;
		this.onQuote(quote);
	}
	private cleanupBrowser(): void {
		this.hide();
		const guest = this.instrumented; this.instrumented = null;
		try { void guest?.executeJavaScript?.("window.__vaultCodeSelectionState?.dispose?.()").catch(() => {}); } catch { /* Viewer may already be closed. */ }
	}
	onunload(): void { this.disposed = true; this.pressed = null; this.cleanupBrowser(); this.clearHostEvents(); this.button?.remove(); this.leaf = null; }
}
