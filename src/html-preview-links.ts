/** Forward explicit app-link clicks without granting preview scripts a protocol bridge. */
export function forwardPreviewAppLink(event: MouseEvent, open: (url: string) => void): void {
	if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	// The target belongs to the iframe's realm, so avoid the host's instanceof Element.
	const link = (event.target as Element | null)?.closest?.("a[href], area[href]");
	if (!link || link.hasAttribute("download")) return;
	const href = link.getAttribute("href")?.trim();
	if (!href || !/^obsidian:\/\//i.test(href)) return;
	let url: URL;
	try { url = new URL(href); } catch { return; }
	if (url.protocol !== "obsidian:") return;
	event.preventDefault();
	open(url.href);
}
