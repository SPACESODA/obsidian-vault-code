let labelId = 0;
/** Obsidian turns aria-label into a hover tooltip; reference a hidden label instead. */
export function nameWithoutTooltip(parent: HTMLElement, element: HTMLElement, text: string): HTMLSpanElement {
	const id = `vault-code-label-${++labelId}`;
	const label = parent.createSpan({ text, attr: { id, hidden: "" } });
	element.setAttribute("aria-labelledby", id);
	return label;
}
