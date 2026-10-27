/** Give the preview copy intrinsic dimensions when percentages depend on an unsized parent. */
export function sizeSvgPreview(svg: Element): void {
	const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
	if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2]! <= 0 || viewBox[3]! <= 0) return;
	for (const [name, size] of [["width", viewBox[2]], ["height", viewBox[3]]] as const) {
		const value = svg.getAttribute(name)?.trim();
		if (!value || value === "auto" || /%$/.test(value)) svg.setAttribute(name, String(size));
	}
}
