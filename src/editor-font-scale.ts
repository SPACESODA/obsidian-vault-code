/** Percent relative to the existing theme size; never shrink the editor. */
export function normalizeEditorFontScale(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(100, Math.min(150, Math.round(value / 5) * 5)) : 100;
}
