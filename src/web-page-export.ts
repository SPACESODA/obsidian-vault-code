export type WebSaveKind = "dom" | "source";
export type WebSaveErrorCode = "unavailable" | "source" | "changed" | "large" | "cancelled";
export class WebSaveError extends Error {
	constructor(public code: WebSaveErrorCode) { super(code); }
}
export interface ExportGuest {
	getURL(): string;
	executeJavaScript(script: string): Promise<unknown>;
	isLoading?: () => boolean;
}
export interface PageDebugger {
	isAttached(): boolean;
	attach(version: string): void;
	detach(): void;
	sendCommand(method: string, params?: Record<string, string>): Promise<unknown>;
}
export interface SavedWebPage { url: string; title: string; html: string }
export const MAX_PAGE_HTML = 20_000_000;

/** Serialize a copy, leaving the live document, its base URL and encoding untouched. */
export const DOM_EXPORT_SCRIPT = `(() => {
 const root=document.documentElement;if(!root)return null;
 if(root.outerHTML.length>${MAX_PAGE_HTML})return {large:true};
 const copy=root.cloneNode(true),head=copy.querySelector('head');
 if(head){
  let base=head.querySelector('base[href]');if(!base){base=document.createElement('base');head.insertBefore(base,head.firstChild)}base.setAttribute('href',document.baseURI);
  for(const meta of head.querySelectorAll('meta[charset],meta[http-equiv]'))if(meta.hasAttribute('charset')||meta.getAttribute('http-equiv')?.toLowerCase()==='content-type')meta.remove();
  const charset=document.createElement('meta');charset.setAttribute('charset','utf-8');head.insertBefore(charset,head.firstChild);
 }
 const type=document.doctype?new XMLSerializer().serializeToString(document.doctype):'<!DOCTYPE html>';
 return {url:location.href,title:document.title,html:type+'\\n'+copy.outerHTML};
})()`;

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}
function httpUrl(value: string): string {
	try { const url = new URL(value); if (/^https?:$/.test(url.protocol)) return url.href; } catch { /* Unsupported URL. */ }
	throw new WebSaveError("unavailable");
}
function sameDocument(left: string, right: string): boolean {
	try { const a = new URL(left), b = new URL(right); a.hash = ""; b.hash = ""; return a.href === b.href; } catch { return false; }
}
async function bounded<T>(promise: Promise<T>, signal: AbortSignal, deadline: number): Promise<T> {
	if (signal.aborted) throw new WebSaveError("cancelled");
	let timer: number | undefined;
	let abort: () => void = () => {};
	try {
		return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
			abort = () => reject(new WebSaveError("cancelled"));
			signal.addEventListener("abort", abort, { once: true });
			timer = window.setTimeout(() => reject(new WebSaveError("unavailable")), Math.max(0, deadline - Date.now()));
		})]);
	} finally { if (timer !== undefined) window.clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

/** Read only the current document. Never fetch the URL again as a source fallback. */
export async function captureWebPage(guest: ExportGuest, kind: WebSaveKind, signal: AbortSignal, inspector?: PageDebugger): Promise<SavedWebPage> {
	if (signal.aborted) throw new WebSaveError("cancelled");
	const url = httpUrl(guest.getURL());
	if (guest.isLoading?.()) throw new WebSaveError("unavailable");
	const deadline = Date.now() + 15_000;
	const read = <T>(task: Promise<T>) => bounded(task, signal, deadline);
	const metadata = record(await read(guest.executeJavaScript(kind === "dom" ? DOM_EXPORT_SCRIPT : "({url:location.href,title:document.title})")));
	if (metadata?.large) throw new WebSaveError("large");
	if (!metadata || metadata.url !== url || guest.getURL() !== url) throw new WebSaveError("changed");
	let html = kind === "dom" && typeof metadata.html === "string" ? metadata.html : "";
	if (kind === "source") {
		// Do not disturb DevTools or another plugin's inspection session.
		if (!inspector || inspector.isAttached()) throw new WebSaveError("source");
		let attached = false;
		try {
			inspector.attach("1.3"); attached = true;
			await read(inspector.sendCommand("Page.enable"));
			const tree = record(await read(inspector.sendCommand("Page.getResourceTree")));
			const frame = record(record(tree?.frameTree)?.frame);
			if (!frame || typeof frame.id !== "string" || typeof frame.url !== "string" || !sameDocument(frame.url, url)) throw new WebSaveError("source");
			if (frame.mimeType !== "text/html" && frame.mimeType !== "application/xhtml+xml") throw new WebSaveError("source");
			const response = record(await read(inspector.sendCommand("Page.getResourceContent", { frameId: frame.id, url: frame.url })));
			if (typeof response?.content !== "string" || response.base64Encoded === true) throw new WebSaveError("source");
			html = response.content;
		} catch (error: unknown) {
			if (error instanceof WebSaveError) throw error;
			throw new WebSaveError("source");
		} finally {
			if (attached) try { if (inspector.isAttached()) inspector.detach(); } catch { /* Page may have closed. */ }
		}
	}
	if (signal.aborted) throw new WebSaveError("cancelled");
	if (guest.getURL() !== url || guest.isLoading?.()) throw new WebSaveError("changed");
	if (!html.trim()) throw new WebSaveError("unavailable");
	if (html.length > MAX_PAGE_HTML) throw new WebSaveError("large");
	// Vault text files use UTF-8. A BOM also makes legacy source charset declarations
	// render correctly, without rewriting the original source markup.
	return { url, title: typeof metadata.title === "string" ? metadata.title : new URL(url).hostname, html: html.startsWith("\uFEFF") ? html : "\uFEFF" + html };
}

export function pageHtmlFilename(title: string): string {
	let name = title.replace(/[\p{Cc}/\\:*?"<>|]/gu, " ").replace(/\s+/g, " ").trim().replace(/\.(?:html?|xhtml)$/i, "");
	const characters = Array.from(name).slice(0, 200);
	while (new TextEncoder().encode(characters.join("")).length > 200) characters.pop();
	name = characters.join("").replace(/[. ]+$/, "");
	if (!name) name = "page";
	if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = "_" + name;
	return name + ".html";
}
