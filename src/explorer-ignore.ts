type DecorateRow = (row: Element, path: string, directory: boolean) => void;

const ROW_SELECTOR = ".nav-file, .nav-folder";

function filterRow(row: Element, ignored: (path: string, directory: boolean) => boolean, decorate?: DecorateRow): void {
	const title = row.querySelector(":scope > [data-path]");
	const path = title?.getAttribute("data-path");
	if (path !== null && path !== undefined) {
		const directory = row.classList.contains("nav-folder");
		row.classList.toggle("is-ignored-hidden", ignored(path, directory));
		decorate?.(row, path, directory);
	}
}

/** Filter only rendered rows; offscreen items are handled when the explorer inserts them. */
export function filterExplorerRows(container: HTMLElement, ignored: (path: string, directory: boolean) => boolean, decorate?: DecorateRow): void {
	for (const row of container.querySelectorAll(ROW_SELECTOR)) filterRow(row, ignored, decorate);
}

/** Mutation callbacks run before paint, including rows rendered by Obsidian's virtualized explorer. */
export function observeExplorerIgnore(container: HTMLElement, ignored: (path: string, directory: boolean) => boolean, decorate?: DecorateRow): () => void {
	const observerWindow = container.win as Window & { MutationObserver: typeof MutationObserver };
	const observer = new observerWindow.MutationObserver((records) => {
		const rows = new Set<Element>();
		for (const record of records) {
			if (record.type === "attributes") {
				const row = (record.target as Element).closest(ROW_SELECTOR);
				if (row) rows.add(row);
			} else {
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1) continue;
					const element = node as Element;
					const row = element.closest(ROW_SELECTOR);
					if (row) rows.add(row);
					for (const child of element.querySelectorAll(ROW_SELECTOR)) rows.add(child);
				}
			}
		}
		for (const row of rows) filterRow(row, ignored, decorate);
	});
	observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-path"] });
	return () => observer.disconnect();
}
