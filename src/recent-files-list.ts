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

/** One timeline of the latest files, newest first. Ties keep a stable order by path. */
export function recentEntries<T extends RecentSource>(files: Iterable<T>, now: number, limit: number): RecentEntry<T>[] {
	const entries: RecentEntry<T>[] = [];
	for (const file of files) {
		const { mtime, ctime } = file.stat;
		const time = Math.max(mtime || 0, ctime || 0);
		if (!time) continue;
		entries.push({ file, time, group: "earlier" });
	}
	entries.sort((a, b) => b.time - a.time || (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0));
	const latest = entries.slice(0, Math.max(0, limit));
	for (const entry of latest) entry.group = recentGroup(entry.time, now);
	return latest;
}
