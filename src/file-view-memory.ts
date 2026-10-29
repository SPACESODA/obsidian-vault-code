/** Session-only, bounded view preferences. Never written to vault or plugin settings. */
export interface ScrollPoint { top: number; left: number }
export interface FileViewPosition {
	preview: boolean;
	code: ScrollPoint;
	page: ScrollPoint;
	frame: ScrollPoint;
	table: ScrollPoint;
}
export function newFileViewPosition(): FileViewPosition {
	return { preview: false, code: { top: 0, left: 0 }, page: { top: 0, left: 0 }, frame: { top: 0, left: 0 }, table: { top: 0, left: 0 } };
}
function copy(value: FileViewPosition): FileViewPosition {
	return { preview: value.preview, code: { ...value.code }, page: { ...value.page }, frame: { ...value.frame }, table: { ...value.table } };
}
export class FileViewMemory {
	private entries = new Map<string, FileViewPosition>();
	constructor(private limit = 200) {}
	get(path: string): FileViewPosition {
		const value = this.entries.get(path);
		return value ? copy(value) : newFileViewPosition();
	}
	set(path: string, value: FileViewPosition): void {
		this.entries.delete(path);
		this.entries.set(path, copy(value));
		while (this.entries.size > this.limit) {
			for (const oldest of this.entries.keys()) { this.entries.delete(oldest); break; }
		}
	}
	forget(path: string): void {
		for (const key of this.entries.keys()) if (key === path || key.startsWith(path + "/")) this.entries.delete(key);
	}
	rename(oldPath: string, newPath: string): void {
		for (const [key, value] of [...this.entries]) {
			if (key === oldPath || key.startsWith(oldPath + "/")) {
				this.entries.delete(key);
				this.set(newPath + key.slice(oldPath.length), value);
			}
		}
	}
}
