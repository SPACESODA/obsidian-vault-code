/** Read local Obsidian date-times, older space-separated values, and zoned timestamps. */
export function parseChatTimestamp(value: unknown): number | null {
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
	if (typeof value !== "string") return null;
	const normalized = value.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
	const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
	if (!match) return null;
	const [year, month, day, hour, minute, second] = match.slice(1).map(part => Number(part ?? 0));
	const calendar = new Date(0);
	calendar.setUTCFullYear(year!, month! - 1, day!);
	if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month! - 1 || calendar.getUTCDate() !== day || hour! > 23 || minute! > 59 || second! > 59) return null;
	const timestamp = Date.parse(normalized.includes("T") ? normalized : normalized + "T00:00:00");
	return Number.isFinite(timestamp) ? timestamp : null;
}
