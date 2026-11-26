import { ItemView, Keymap, Menu, TFile, setIcon, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { t, type TranslationKey } from "./i18n";
import { fullStamp, recentEntries, shortStamp, type RecentEntry, type RecentGroup } from "./recent-files-list";
import { IMAGE_EXTENSIONS } from "./unlinked-media-modal";

export const RECENT_FILES_VIEW = "vault-code-recent-files";

const PAGE = 100;
const GROUP_LABELS: Record<RecentGroup, TranslationKey> = {
	today: "recentToday",
	yesterday: "recentYesterday",
	week: "recentWeek",
	month: "recentMonth",
	earlier: "recentEarlier",
};
const AUDIO = new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac", "3gp", "webm"]);
const VIDEO = new Set(["mp4", "mov", "mkv", "ogv"]);

function fileIcon(file: TFile): string {
	const ext = file.extension.toLowerCase();
	if (ext === "md") return "file-text";
	if (ext === "canvas") return "layout-dashboard";
	if (ext === "base") return "table";
	if (ext === "kanban") return "columns-3";
	if (ext === "pdf") return "file-type";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (VIDEO.has(ext)) return "file-video";
	if (AUDIO.has(ext)) return "file-audio";
	return "file-code";
}

interface DragManager { dragFile(event: DragEvent, file: TFile): unknown; onDragStart(event: DragEvent, data: unknown): void }

/** Files by latest activity (edited, or added when that came later), skipping only what the vault's ignore rules hide. */
export class RecentFilesView extends ItemView {
	private limit = PAGE;
	private listEl?: HTMLElement;
	private rows = new Map<string, HTMLElement>();
	private refreshTimer?: number;
	private renderedDay = "";

	constructor(leaf: WorkspaceLeaf, private isHidden: (file: TFile) => boolean) {
		super(leaf);
	}

	getViewType(): string { return RECENT_FILES_VIEW; }
	getDisplayText(): string { return t("recentTitle"); }
	getIcon(): string { return "history"; }

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("vault-code-recent");
		this.listEl = this.contentEl.createDiv({ cls: "vault-code-recent-list" });
		const queue = (file: TAbstractFile) => { if (file instanceof TFile) this.scheduleRefresh(); };
		this.registerEvent(this.app.vault.on("create", queue));
		this.registerEvent(this.app.vault.on("modify", queue));
		this.registerEvent(this.app.vault.on("delete", queue));
		this.registerEvent(this.app.vault.on("rename", queue));
		this.registerEvent(this.app.workspace.on("file-open", () => this.markActive()));
		// Times are absolute, but the day groups move at midnight, so check once a minute and redraw only then.
		this.registerInterval(window.setInterval(() => this.markActive(), 60_000));
		this.render();
		await Promise.resolve();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = undefined;
		this.rows.clear();
		await Promise.resolve();
	}

	/** Coalesce bursts (sync, git pulls, bulk edits) into one redraw. */
	scheduleRefresh(): void {
		if (this.refreshTimer !== undefined) return;
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = undefined;
			this.render();
		}, 250);
	}

	private render(): void {
		const list = this.listEl;
		if (!list) return;
		const now = Date.now();
		// One extra entry tells whether "Show more" has anything left to show.
		const entries = recentEntries(this.app.vault.getFiles(), now, this.limit + 1, file => !this.isHidden(file));
		const more = entries.length > this.limit;
		if (more) entries.pop();
		const scroll = this.contentEl.scrollTop;
		list.empty();
		this.rows.clear();
		this.renderedDay = new Date(now).toDateString();
		if (!entries.length) {
			list.createDiv({ cls: "vault-code-recent-empty", text: t("recentEmpty") });
			return;
		}
		let group: RecentGroup | undefined;
		for (const entry of entries) {
			if (entry.group !== group) {
				group = entry.group;
				list.createDiv({ cls: "vault-code-recent-group", text: t(GROUP_LABELS[group]) });
			}
			this.renderRow(list, entry, now);
		}
		if (more) {
			const more = list.createEl("button", { cls: "vault-code-recent-more", text: t("recentShowMore") });
			more.addEventListener("click", () => { this.limit += PAGE; this.render(); });
		}
		this.markActive();
		this.contentEl.scrollTop = scroll;
	}

	private renderRow(list: HTMLElement, entry: RecentEntry<TFile>, now: number): void {
		const { file } = entry;
		// Like the file explorer's tooltip, plus the folder, which the one-line row leaves out.
		const tooltip = [file.path, t("recentModifiedAt", fullStamp(file.stat.mtime)), t("recentCreatedAt", fullStamp(file.stat.ctime))].join("\n");
		const row = list.createDiv({ cls: "tree-item-self is-clickable vault-code-recent-item", attr: { draggable: "true", "data-path": file.path, "aria-label": tooltip, "data-tooltip-position": "right", "data-tooltip-delay": "600" } });
		setIcon(row.createSpan({ cls: "vault-code-recent-icon" }), fileIcon(file));
		row.createSpan({ cls: "vault-code-recent-name", text: file.extension.toLowerCase() === "md" ? file.basename : file.name });
		row.createSpan({ cls: "vault-code-recent-time", text: shortStamp(entry.time, entry.group, now) });

		row.addEventListener("click", event => {
			void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file);
		});
		row.addEventListener("auxclick", event => {
			if (event.button === 1) void this.app.workspace.getLeaf("tab").openFile(file);
		});
		row.addEventListener("contextmenu", event => {
			event.preventDefault();
			const menu = new Menu();
			this.app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", this.leaf);
			menu.showAtMouseEvent(event);
		});
		row.addEventListener("mouseover", event => {
			this.app.workspace.trigger("hover-link", { event, source: RECENT_FILES_VIEW, hoverParent: this, targetEl: row, linktext: file.path });
		});
		row.addEventListener("dragstart", event => {
			const drag = (this.app as unknown as { dragManager?: DragManager }).dragManager;
			if (drag) drag.onDragStart(event, drag.dragFile(event, file));
		});
		this.rows.set(file.path, row);
	}

	private markActive(): void {
		if (this.renderedDay && this.renderedDay !== new Date().toDateString()) { this.render(); return; }
		const active = this.app.workspace.getActiveFile()?.path;
		for (const [path, row] of this.rows) row.toggleClass("is-active", path === active);
	}
}
