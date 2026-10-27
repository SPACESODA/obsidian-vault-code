export interface SelectionRect { left: number; right: number; top: number; bottom: number }
const SIZE = 30;
const GAP = 8;

/** Place the Web Viewer action near its selection using host-window coordinates. */
export function selectionActionPosition(rects: readonly SelectionRect[], pane: SelectionRect, viewport: { width: number; height: number }): { left: number; top: number } | null {
	const bounds = { left: Math.max(GAP, pane.left + GAP), right: Math.min(viewport.width - GAP, pane.right - GAP), top: Math.max(GAP, pane.top + GAP), bottom: Math.min(viewport.height - GAP, pane.bottom - GAP) };
	if (!Object.values(bounds).every(Number.isFinite) || bounds.right - bounds.left < SIZE || bounds.bottom - bounds.top < SIZE) return null;
	const visible = rects.filter(rect => [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite) && rect.right > rect.left && rect.bottom > rect.top && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom);
	if (!visible.length) return null;
	const line = (anchor: SelectionRect): SelectionRect => {
		const center = (anchor.top + anchor.bottom) / 2;
		const parts = visible.filter(rect => Math.abs((rect.top + rect.bottom) / 2 - center) < Math.min(rect.bottom - rect.top, anchor.bottom - anchor.top) / 2);
		return { left: Math.min(...parts.map(rect => rect.left)), right: Math.max(...parts.map(rect => rect.right)), top: Math.min(...parts.map(rect => rect.top)), bottom: Math.max(...parts.map(rect => rect.bottom)) };
	};
	const firstRect = visible[0], lastRect = visible[visible.length - 1];
	if (!firstRect || !lastRect) return null;
	const first = line(firstRect), last = line(lastRect);
	const clampX = (x: number) => Math.max(bounds.left, Math.min(x, bounds.right - SIZE));
	const centerY = Math.max(bounds.top, Math.min((first.top + first.bottom) / 2 - SIZE / 2, bounds.bottom - SIZE));
	const candidates = [
		{ left: first.right + GAP, top: centerY },
		{ left: clampX(first.right - SIZE), top: first.top - GAP - SIZE },
		{ left: clampX(last.right - SIZE), top: last.bottom + GAP },
		// A selection can span the whole viewport; use a free left margin if available.
		{ left: first.left - GAP - SIZE, top: centerY },
	];
	return candidates.find(({ left, top }) => left >= bounds.left && left + SIZE <= bounds.right && top >= bounds.top && top + SIZE <= bounds.bottom && !visible.some(rect => left < rect.right + 2 && left + SIZE > rect.left - 2 && top < rect.bottom + 2 && top + SIZE > rect.top - 2)) ?? null;
}
