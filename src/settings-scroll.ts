/** Capture before rebuilding settings, then restore the visible row in its scroll container. */
export function preserveSettingsScroll(container: HTMLElement, anchorSelector?: string): () => void {
	const anchorTop = anchorSelector ? container.querySelector(anchorSelector)?.getBoundingClientRect().top : undefined;
	const scrollers: Array<{ element: HTMLElement; top: number; left: number }> = [];
	for (let element: HTMLElement | null = container; element; element = element.parentElement) {
		if (element === container || element.scrollHeight > element.clientHeight || element.scrollTop || element.scrollLeft) {
			scrollers.push({ element, top: element.scrollTop, left: element.scrollLeft });
		}
	}
	return () => {
		for (const { element, top, left } of scrollers) {
			element.scrollTop = top;
			element.scrollLeft = left;
		}
		const anchor = anchorSelector ? container.querySelector(anchorSelector) : null;
		if (anchor && anchorTop !== undefined) {
			// Adjust the innermost scrolling element when defaults add or remove settings above the row.
			const scroller = scrollers.find(({ element }) => element.scrollHeight > element.clientHeight);
			if (scroller) scroller.element.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
		}
	};
}
