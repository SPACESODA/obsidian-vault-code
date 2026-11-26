export type RecentGroup = "today" | "yesterday" | "week" | "month" | "earlier";

export interface RecentSource { path: string; stat: { mtime: number; ctime: number } }

export interface RecentEntry<T extends RecentSource> {
	file: T;
	/** Latest activity: the last edit, or when the file was added if that came later (copies keep old edit times). */
	time: number;
	group: RecentGroup;
}

function dayStart(time: number, daysBack = 0): number {
	const date = new Date(time);
	date.setHours(0, 0, 0, 0);
	date.setDate(date.getDate() - daysBack);
	return date.getTime();
}

export function recentGroup(time: number, now: number): RecentGroup {
	if (time >= dayStart(now)) return "today";
	if (time >= dayStart(now, 1)) return "yesterday";
	if (time >= dayStart(now, 7)) return "week";
	if (time >= dayStart(now, 30)) return "month";
	return "earlier";
}

/**
 * One timeline of the latest files, newest first. Ties keep a stable order by path.
 * `include` runs only on the newest candidates, so a costly filter stays cheap in a large vault.
 */
export function recentEntries<T extends RecentSource>(files: Iterable<T>, now: number, limit: number, include?: (file: T) => boolean): RecentEntry<T>[] {
	const entries: RecentEntry<T>[] = [];
	for (const file of files) {
		const { mtime, ctime } = file.stat;
		const time = Math.max(mtime || 0, ctime || 0);
		if (!time) continue;
		entries.push({ file, time, group: "earlier" });
	}
	entries.sort((a, b) => b.time - a.time || (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0));
	const latest: RecentEntry<T>[] = [];
	for (const entry of entries) {
		if (latest.length >= limit) break;
		if (include && !include(entry.file)) continue;
		entry.group = recentGroup(entry.time, now);
		latest.push(entry);
	}
	return latest;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The file explorer's fixed, language-neutral stamp in local time: "2026-11-25 20:48". */
export function fullStamp(time: number): string {
	const date = new Date(time);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A row's short time: the clock for today and yesterday, the day this year, the full date before that. */
export function shortStamp(time: number, group: RecentGroup, now: number): string {
	const date = new Date(time);
	if (group === "today" || group === "yesterday") return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return date.getFullYear() === new Date(now).getFullYear() ? day : `${date.getFullYear()}-${day}`;
}
