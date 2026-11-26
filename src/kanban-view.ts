import { ItemView, Notice, Platform, Scope, TFile, TFolder, getAllTags, setIcon, type Menu, type ViewStateResult } from "obsidian";
import { getActiveLanguage, t } from "./i18n";
import { createCustomMenu } from "./custom-menu";
import { nameWithoutTooltip } from "./dom-label";
import { cardCover, cardExcerpt, cardExcerptLines, cardInline, replaceCardExcerpt, type CardExcerptLine, type CardInline } from "./kanban-excerpt";
import { KANBAN_FILENAME, boardRelativePath, readKanbanFile, readKanbanUnsorted, writeKanbanFile, writeKanbanUnsorted, type KanbanOrder, type KanbanOrders, type KanbanUnsorted } from "./kanban-file";
import { onIconizeLoaded, pathIcon, prependPathIcon, renderIconShortcodes } from "./iconize";
import { IMAGE_EXTENSIONS } from "./unlinked-media-modal";

export const KANBAN_VIEW = "vault-code-kanban";

function childPath(folder: TFolder, name: string): string {
	return folder.isRoot() ? name : folder.path + "/" + name;
}

const INLINE_TAGS = { strong: "strong", em: "em", del: "del", mark: "mark" } as const;

/** Builds inline card text as plain DOM nodes, so note content is never parsed as HTML. */
function appendInline(parent: HTMLElement, nodes: CardInline[]): void {
	for (const node of nodes) {
		if ("children" in node) appendInline(parent.createEl(INLINE_TAGS[node.kind]), node.children);
		else if (node.kind === "text") parent.appendText(node.text);
		else if (node.kind === "code") parent.createEl("code", { text: node.text });
		else parent.createSpan({ cls: `vault-code-kanban-${node.kind}`, text: node.text });
	}
}

function inlineText(nodes: CardInline[]): string {
	return nodes.map(node => "children" in node ? inlineText(node.children) : node.text).join("");
}

// Obsidian's built-in callout types and aliases, mapped to theme colours (their default callout colours) and icons.
const CALLOUTS: Record<string, [color: string, icon: string]> = {};
for (const [color, icon, types] of [
	["var(--color-blue)", "pencil", "note"],
	["var(--color-cyan)", "clipboard-list", "abstract summary tldr"],
	["var(--color-blue)", "info", "info"],
	["var(--color-blue)", "check-circle-2", "todo"],
	["var(--color-cyan)", "flame", "tip hint important"],
	["var(--color-green)", "check", "success check done"],
	["var(--color-orange)", "help-circle", "question help faq"],
	["var(--color-orange)", "alert-triangle", "warning caution attention"],
	["var(--color-red)", "x", "failure fail missing"],
	["var(--color-red)", "zap", "danger error"],
	["var(--color-red)", "bug", "bug"],
	["var(--color-purple)", "list", "example"],
	["var(--text-muted)", "quote", "quote cite"],
] as const) {
	for (const type of types.split(" ")) CALLOUTS[type] = [color, icon];
}

function ordered<T extends TFile | TFolder>(files: T[], saved: string[], board: TFolder): T[] {
	const ranks = new Map(saved.map((path, index) => [path, index]));
	return files.sort((a, b) => (ranks.get(boardRelativePath(board.path, a.path)) ?? Infinity) - (ranks.get(boardRelativePath(board.path, b.path)) ?? Infinity) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function remapKanbanOrders(orders: KanbanOrders, from: string, to?: string): KanbanOrders {
	const remap = (path: string) => path === from || path.startsWith(from + "/") ? (to === undefined ? undefined : to + path.slice(from.length)) : path;
	const result: KanbanOrders = Object.create(null) as KanbanOrders;
	for (const [path, order] of Object.entries(orders)) {
		const board = remap(path);
		if (board === undefined) continue;
		const cards: KanbanOrder["cards"] = Object.create(null) as KanbanOrder["cards"];
		for (const [folder, entries] of Object.entries(order.cards)) {
			const key = remap(folder);
			if (key !== undefined) cards[key] = entries.map(remap).filter(value => value !== undefined);
		}
		result[board] = { columns: order.columns.map(remap).filter(value => value !== undefined), cards };
	}
	return result;
}

type Column = { folder: TFolder; cards: TFile[] };
type ColumnElements = { section: HTMLElement; title: HTMLButtonElement; label: HTMLSpanElement; count: HTMLSpanElement; list: HTMLElement };
type Drop = { column: Column; before?: TFile };
type Drag = { kind: "card"; file: TFile } | { kind: "column"; folder: TFolder };

export class KanbanView extends ItemView {
	private path = "";
	private markerPath = KANBAN_FILENAME;
	private board?: TFolder;
	private marker?: TFile;
	private markerSource?: string;
	private refreshGeneration = 0;
	private refreshAfterTitle = false;
	private renamed: Array<{ from: string; to: string }> = [];
	private order: KanbanOrder = { columns: [], cards: {} };
	private unsorted: KanbanUnsorted = { position: "last" };
	private rail?: HTMLElement;
	private addColumn?: HTMLElement;
	private renderedLanguage = "";
	private columnElements = new Map<TFolder, ColumnElements>();
	private cardElements = new Map<TFile, HTMLElement>();
	private previewFiles = new WeakMap<HTMLButtonElement, TFile>();
	private excerptLoads = new WeakMap<HTMLButtonElement, object>();
	private dirtyExcerpts = new Set<TFile>();
	// Quick search filters cards by title and note text; note text is read on demand and dropped on edit.
	private query = "";
	private searchText = new Map<TFile, string>();
	private searchLoad?: object;
	// The Escape scope of a focused search field; released if the field goes away without a blur.
	private searchScope?: Scope;
	// Tag filter (lower-case tags with "#"): a card shows when it has any selected tag, like Trello labels.
	private tagFilter = new Set<string>();
	private filterEl?: HTMLElement;
	private columns: Column[] = [];
	private cardTargets = new WeakMap<Element, Drop>();
	private columnTargets = new WeakMap<Element, Column>();
	private refreshFrame?: number;
	private observer?: IntersectionObserver;
	// Pinned "Add card" rows sit just under their header, whose height varies with wrapped names.
	private headerSizes?: ResizeObserver;
	private stopDrag?: () => void;
	private busy = false;
	private inlineEditor?: HTMLTextAreaElement;
	private inlineSave?: Promise<void>;
	private inlineFields = new WeakMap<TFile | TFolder, { title: HTMLButtonElement; excerpt?: HTMLButtonElement }>();
	private excerpts = new WeakMap<HTMLButtonElement, string>();
	private titleKeys = new WeakMap<HTMLButtonElement, string>();
	private closed = false;

	constructor(leaf: ConstructorParameters<typeof ItemView>[0], private updateHeaderActions: (view: KanbanView) => void) {
		super(leaf);
	}

	getViewType(): string { return KANBAN_VIEW; }
	getIcon(): string { return "columns-3"; }
	get boardFile(): TFile | undefined { return this.marker; }
	getDisplayText(): string { return this.marker?.basename ?? this.markerPath.split("/").pop()?.replace(/\.kanban$/i, "") ?? t("kanbanTitle"); }
	getState(): Record<string, unknown> { return { path: this.path, markerPath: this.markerPath }; }

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		this.path = typeof state === "object" && state !== null && "path" in state && typeof state.path === "string" ? state.path : "";
		this.markerPath = typeof state === "object" && state !== null && "markerPath" in state && typeof state.markerPath === "string"
			? state.markerPath : this.path ? this.path + "/" + KANBAN_FILENAME : KANBAN_FILENAME;
		this.renamed = [];
		this.markerSource = undefined;
		await this.refresh();
	}

	private findBoard(): TFolder | undefined {
		const folder = this.path ? this.app.vault.getAbstractFileByPath(this.path) : this.app.vault.getRoot();
		return folder instanceof TFolder ? folder : undefined;
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		const relevant = (path: string) => !this.path || path === this.path || path.startsWith(this.path + "/") || this.path.startsWith(path + "/");
		this.registerEvent(this.app.vault.on("create", file => { if (relevant(file.path)) this.scheduleRefresh(); }));
		this.registerEvent(this.app.vault.on("delete", file => { if (relevant(file.path)) this.scheduleRefresh(); }));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (this.marker?.extension.toLowerCase() === "kanban" && this.marker.path !== this.markerPath) {
				this.markerPath = this.marker.path;
				const parent = this.marker.parent;
				this.path = !parent || parent.isRoot() ? "" : parent.path;
				this.updateTabTitle();
				void this.app.workspace.requestSaveLayout();
				this.scheduleRefresh();
			}
			const board = this.board;
			const prefix = !board || board.isRoot() ? "" : board.path + "/";
			if (board && file !== board && oldPath.startsWith(prefix) && file.path.startsWith(prefix)) {
				this.renamed.push({ from: oldPath.slice(prefix.length), to: file.path.slice(prefix.length) });
				for (const item of file instanceof TFolder ? file.children : [file]) {
					if (item instanceof TFile && this.cardElements.has(item)) this.dirtyExcerpts.add(item);
				}
			}
			if (relevant(oldPath) || relevant(file.path)) this.scheduleRefresh();
		}));
		this.registerEvent(this.app.vault.on("modify", file => {
			if (!(file instanceof TFile) || !relevant(file.path)) return;
			if (this.cardElements.has(file)) this.dirtyExcerpts.add(file);
			this.searchText.delete(file);
			this.scheduleRefresh();
		}));
		this.registerEvent(this.app.metadataCache.on("changed", file => {
			if (this.cardElements.has(file) && (this.query || this.tagFilter.size)) this.applySearch();
		}));
		// Iconize loads its icon packs after startup; redraw descriptions so their icon shortcodes resolve.
		this.register(onIconizeLoaded(this.app, () => {
			for (const file of this.cardElements.keys()) {
				const preview = this.inlineFields.get(file)?.excerpt;
				if (!preview) continue;
				this.excerpts.delete(preview);
				this.dirtyExcerpts.add(file);
			}
			this.titleKeys = new WeakMap();
			this.scheduleRefresh();
		}));
		// Iconize has no change event, so pick up icons set elsewhere when the board comes back into focus.
		this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => { if (leaf === this.leaf) this.updateTitleIcons(); }));
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.releaseSearchScope();
		this.inlineEditor?.blur();
		await this.inlineSave;
		this.stopDrag?.();
		this.observer?.disconnect();
		this.headerSizes?.disconnect();
		if (this.refreshFrame !== undefined) this.contentEl.win.cancelAnimationFrame(this.refreshFrame);
	}

	scheduleRefresh(): void {
		if (this.refreshFrame !== undefined) return;
		this.refreshFrame = this.contentEl.win.requestAnimationFrame(() => {
			this.refreshFrame = undefined;
			if (this.contentEl.querySelector(".vault-code-kanban-title:focus")) {
				this.refreshAfterTitle = true;
			} else if (!this.busy && !this.stopDrag && !this.isEditing()) void this.refresh();
		});
	}

	private async refresh(): Promise<void> {
		if (this.closed) return;
		this.refreshAfterTitle = false;
		const generation = ++this.refreshGeneration;
		const board = this.findBoard();
		const entry = this.app.vault.getAbstractFileByPath(this.markerPath);
		const marker = entry instanceof TFile && entry.parent === board && entry.extension.toLowerCase() === "kanban" ? entry : undefined;
		const source = marker instanceof TFile ? await this.app.vault.read(marker).catch(() => undefined) : undefined;
		if (generation !== this.refreshGeneration || this.closed) return;
		const order = source === undefined ? null : readKanbanFile(source);
		const unsorted = readKanbanUnsorted(order?.unsorted);
		const language = getActiveLanguage();
		const reuse = board && order && board === this.board && marker === this.marker && this.rail?.isConnected
			&& this.renderedLanguage === language;
		if (source !== this.markerSource || marker !== this.marker) this.renamed = [];
		this.marker = marker;
		this.markerSource = source;
		this.board = board;
		this.unsorted = unsorted;
		this.renderedLanguage = language;
		const left = this.rail?.scrollLeft ?? 0;
		if (!reuse) {
			this.observer?.disconnect();
			this.headerSizes?.disconnect();
			this.releaseSearchScope();
			this.rail = undefined;
			this.addColumn = undefined;
			this.columnElements.clear();
			this.cardElements.clear();
			this.dirtyExcerpts.clear();
			this.contentEl.empty();
			this.contentEl.addClass("vault-code-kanban");
			if (marker) this.renderTitle(marker, order !== null);
		} else {
			const title = this.contentEl.querySelector<HTMLInputElement>(".vault-code-kanban-title");
			if (title && marker && title.value !== marker.basename) title.value = marker.basename;
		}
		this.updateTabTitle();
		this.updateHeaderActions(this);
		if (!board) { this.contentEl.createDiv({ text: t("kanbanMissing") }); return; }
		if (!order) { this.contentEl.createDiv({ cls: "vault-code-kanban-message", text: t("kanbanInvalidFile", this.markerPath.split("/").pop() ?? KANBAN_FILENAME) }); return; }
		this.order = order;
		for (const { from, to } of this.renamed) {
			this.order = remapKanbanOrders({ "": this.order }, from, to)[""] ?? this.order;
		}
		const folders = ordered(board.children.filter((file): file is TFolder => file instanceof TFolder), this.order.columns, board);
		if (this.unsorted.position === "first") folders.unshift(board);
		else if (this.unsorted.position === "last") folders.push(board);
		this.columns = folders.map(folder => ({
			folder,
			cards: ordered(folder.children.filter((file): file is TFile => file instanceof TFile && file.extension.toLowerCase() === "md"), this.order.cards[boardRelativePath(board.path, folder.path)] ?? [], board),
		}));
		if (!this.rail || !this.addColumn) this.createRail(board);
		this.updateColumns(board);
		if (this.query || this.tagFilter.size) this.search(this.query);
		if (this.rail) this.rail.scrollLeft = left;
		const dirty = [...this.dirtyExcerpts];
		this.dirtyExcerpts.clear();
		await Promise.all(dirty.map(async file => {
			const preview = this.inlineFields.get(file)?.excerpt;
			if (preview?.isConnected && (this.excerpts.has(preview) || this.excerptLoads.has(preview))) await this.loadExcerpt(preview, file);
		}));
	}

	private createRail(board: TFolder): void {
		const rail = this.contentEl.createDiv({ cls: "vault-code-kanban-rail" });
		this.rail = rail;
		this.headerSizes = new ResizeObserver(entries => {
			for (const { target } of entries) {
				if (target.instanceOf(HTMLElement)) target.parentElement?.setCssProps({ "--kanban-header-height": `${target.offsetHeight}px` });
			}
		});
		this.observer = new IntersectionObserver(entries => {
			for (const entry of entries) {
				const target = entry.target;
				if (!entry.isIntersecting || !target.instanceOf(HTMLButtonElement)) continue;
				const file = this.previewFiles.get(target);
				if (!file) continue;
				this.observer?.unobserve(target);
				void this.loadExcerpt(target, file);
			}
		}, { root: rail });
		const add = rail.createDiv({ cls: "vault-code-kanban-add-column" });
		this.addColumn = add;
		this.addButton(add, t("kanbanAddColumn"), () => this.compose(add, t("kanbanColumnName"), name => this.create(board, name, false)));
	}

	private async loadExcerpt(preview: HTMLButtonElement, file: TFile): Promise<void> {
		const request = {};
		this.excerptLoads.set(preview, request);
		try {
			const source = await this.app.vault.cachedRead(file);
			if (this.excerptLoads.get(preview) === request && preview.isConnected) this.updateExcerpt(preview, file, source);
		} catch { /* A later vault update can retry the preview. */ }
	}

	private updateExcerpt(preview: HTMLButtonElement, file: TFile, source: string): void {
		const { from, to } = cardExcerpt(source);
		const value = source.slice(from, to);
		if (this.excerpts.get(preview) === value) return;
		this.excerpts.set(preview, value);
		const { text, image, omitted } = cardCover(value, link => {
			const attachment = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
			return attachment && IMAGE_EXTENSIONS.has(attachment.extension.toLowerCase()) ? this.app.vault.getResourcePath(attachment) : undefined;
		});
		this.updateCover(file, image);
		const wrapper = preview.parentElement;
		wrapper?.querySelector(".vault-code-kanban-lists")?.remove();
		const lines = text ? cardExcerptLines(text, omitted) : [];
		// Lists, tasks, code, quotes, headings and inline formatting render as markup; anything else stays plain text.
		const hasList = lines.some(line => line.list || line.code || line.heading || line.quote
			|| cardInline(line.text).some(node => node.kind !== "text" || node.text !== line.text));
		wrapper?.toggleClass("is-list", hasList);
		if (wrapper && hasList) {
			this.labelEmptyExcerpt(preview);
			this.renderExcerptLists(wrapper, lines, (offset, checkbox) => {
				void this.toggleCardTask(file, value, offset, checkbox);
			});
			const lists = wrapper.querySelector<HTMLElement>(":scope > .vault-code-kanban-lists");
			if (lists) renderIconShortcodes(this.app, lists);
		} else if (text) {
			preview.removeAttribute("aria-labelledby");
			preview.setText(text);
			renderIconShortcodes(this.app, preview);
		} else {
			this.labelEmptyExcerpt(preview);
		}
	}

	private labelEmptyExcerpt(preview: HTMLButtonElement): void {
		if (preview.hasAttribute("aria-labelledby")) return;
		preview.empty();
		nameWithoutTooltip(preview, preview, t("kanbanEditDescription"));
	}

	private renderExcerptLists(
		parent: HTMLElement,
		lines: CardExcerptLine[],
		toggle: (offset: number, checkbox: HTMLInputElement) => void,
	): void {
		const content = parent.createDiv({ cls: "vault-code-kanban-lists" });
		const stack: Array<{ indent: number; element: HTMLOListElement | HTMLUListElement; item?: HTMLLIElement }> = [];
		let block: HTMLElement | undefined;
		let quote: HTMLElement | undefined;
		for (const line of lines) {
			if (line.code) {
				stack.length = 0;
				quote = undefined;
				if (line.code === "fence") { block = block ? undefined : content.createEl("pre").createEl("code"); continue; }
				block ??= content.createEl("pre").createEl("code");
				block.appendText((block.childNodes.length ? "\n" : "") + line.text);
				continue;
			}
			block = undefined;
			const inline = cardInline(line.text);
			if (line.quote) {
				stack.length = 0;
				const callout = line.quote.callout;
				if (callout) {
					const [color, icon] = CALLOUTS[callout.type] ?? ["var(--color-blue)", "pencil"];
					quote = content.createDiv({ cls: "vault-code-kanban-callout", attr: { "data-callout": callout.type } });
					quote.setCssProps({ "--kanban-callout": color });
					const title = quote.createDiv({ cls: "vault-code-kanban-callout-title" });
					setIcon(title.createSpan({ cls: "vault-code-kanban-callout-icon" }), icon);
					appendInline(title.createSpan(), cardInline(callout.title));
				} else {
					quote ??= content.createDiv({ cls: "vault-code-kanban-quote" });
					if (line.text.trim()) appendInline(quote.createDiv(), inline);
				}
				continue;
			}
			quote = undefined;
			if (line.heading) {
				stack.length = 0;
				appendInline(content.createDiv({ cls: "vault-code-kanban-heading" }), inline);
				continue;
			}
			if (!line.list) {
				stack.length = 0;
				// A line of only tags becomes a wrapping row of pills, like labels on a card.
				const tagsOnly = inline.some(node => node.kind === "tag") && inline.every(node => node.kind === "tag" || (node.kind === "text" && !node.text.trim()));
				if (tagsOnly) appendInline(content.createDiv({ cls: "vault-code-kanban-tag-row" }), inline.filter(node => node.kind === "tag"));
				else appendInline(content.createDiv(), inline);
				continue;
			}
			const { indent, order, task } = line.list;
			while ((stack[stack.length - 1]?.indent ?? 0) > indent) stack.pop();
			const tag = order === undefined ? "ul" : "ol";
			let current = stack[stack.length - 1];
			if (current?.indent === indent && current.element.localName !== tag) {
				stack.pop();
				current = stack[stack.length - 1];
			}
			if (!current || current.indent < indent) {
				const container = current?.item ?? content;
				const element = container.createEl(tag, order === undefined ? undefined : { attr: { start: String(order) } });
				current = { indent, element };
				stack.push(current);
			}
			const item = current.element.createEl("li", task ? { cls: "vault-code-kanban-task" } : undefined);
			current.item = item;
			if (task) {
				const checkbox = item.createEl("input", { attr: { type: "checkbox", "data-task-offset": String(task.offset) } });
				checkbox.checked = task.checked;
				nameWithoutTooltip(item, checkbox, inlineText(inline) || t("kanbanEditDescription"));
				checkbox.onchange = () => toggle(task.offset, checkbox);
			}
			appendInline(item.createSpan(), inline);
		}
	}

	private async toggleCardTask(file: TFile, excerpt: string, offset: number, checkbox: HTMLInputElement): Promise<void> {
		const checked = checkbox.checked;
		if (this.busy || this.isEditing() || this.app.vault.getAbstractFileByPath(file.path) !== file) {
			checkbox.checked = !checked;
			return;
		}
		const keepFocus = checkbox.doc.activeElement === checkbox;
		const saved = await this.perform(async () => {
			const updated = await this.app.vault.process(file, source => {
				const { from, to } = cardExcerpt(source);
				if (source.slice(from, to) !== excerpt) throw new Error(t("kanbanNoteChanged"));
				const status = from + offset;
				return source.slice(0, status) + (checked ? "x" : " ") + source.slice(status + 1);
			});
			const preview = this.inlineFields.get(file)?.excerpt;
			if (!preview?.isConnected) return;
			this.excerptLoads.delete(preview);
			this.updateExcerpt(preview, file, updated);
			if (keepFocus) preview.parentElement?.querySelector<HTMLInputElement>(`input[data-task-offset="${offset}"]`)?.focus();
		});
		if (!saved) checkbox.checked = !checked;
	}

	private updateCover(file: TFile, cover?: { src: string; alt: string }): void {
		const card = this.cardElements.get(file);
		if (!card) return;
		const previous = card.querySelector<HTMLImageElement>(".vault-code-kanban-cover");
		if (!cover) {
			previous?.remove();
			return;
		}
		if (previous?.getAttribute("src") === cover.src) {
			previous.alt = cover.alt;
			return;
		}
		previous?.remove();
		const image = card.createEl("img", {
			cls: "vault-code-kanban-cover",
			attr: { alt: cover.alt, decoding: "async", loading: "lazy", draggable: "false" },
		});
		card.prepend(image);
		image.onerror = () => image.remove();
		image.src = cover.src;
	}

	private updateTabTitle(): void {
		// Item views do not get the native FileView header refresh on rename.
		const leaf = this.leaf as typeof this.leaf & { updateHeader?: () => void };
		leaf.updateHeader?.();
	}

	private renderTitle(marker: TFile, hasBoardSettings: boolean): void {
		const heading = this.contentEl.createDiv({ cls: "vault-code-kanban-board-heading" });
		const input = heading.createEl("input", {
			cls: "inline-title vault-code-kanban-title",
			attr: { type: "text", value: marker.basename },
		});
		nameWithoutTooltip(heading, input, t("kanbanBoardTitle"));
		this.addSearch(heading);
		this.filterEl = heading.createDiv({ cls: "vault-code-kanban-filter" });
		this.renderTagFilter();
		if (hasBoardSettings) this.addUnsortedSettings(heading);
		const commit = () => {
			if (this.busy || this.closed || !input.isConnected || marker !== this.marker || this.isEditing()) return;
			const title = input.value.trim().replace(/\.kanban$/i, "");
			if (title === marker.basename) {
				input.value = marker.basename;
				if (this.refreshAfterTitle) this.scheduleRefresh();
				return;
			}
			void this.perform(async () => {
				const parent = marker.parent;
				if (!parent || this.app.vault.getAbstractFileByPath(marker.path) !== marker) return;
				const path = childPath(parent, this.name(title) + "." + marker.extension);
				this.assertAvailable(path);
				await this.app.fileManager.renameFile(marker, path);
			});
		};
		input.addEventListener("keydown", event => {
			if (event.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") input.value = marker.basename;
			else commit();
			input.blur();
		});
		input.addEventListener("blur", commit);
	}

	/** A search icon that opens into a field; typing hides cards whose title and note text don't match. */
	private addSearch(parent: HTMLElement): void {
		const search = parent.createDiv({ cls: "vault-code-kanban-search" });
		const button = this.iconButton(search, "search", t("kanbanSearch"));
		const input = search.createEl("input", {
			cls: "vault-code-kanban-search-input",
			attr: { type: "text", placeholder: t("kanbanSearch"), enterkeyhint: "search", spellcheck: "false" },
		});
		nameWithoutTooltip(input, input, t("kanbanSearch"));
		const open = (value: boolean) => {
			search.toggleClass("is-open", value);
			parent.toggleClass("is-search-open", value);
		};
		input.value = this.query;
		open(this.query !== "");
		button.onclick = () => { open(true); input.focus(); };
		input.addEventListener("input", () => this.search(input.value));
		const close = () => {
			input.value = "";
			this.search("");
			open(false);
			input.blur();
		};
		// Obsidian's keymap can take Escape before the field sees it, so a scope also handles it while focused.
		const scope = new Scope(this.app.scope);
		scope.register([], "Escape", () => { close(); return false; });
		input.addEventListener("keydown", event => {
			if (event.isComposing || event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			close();
		});
		input.addEventListener("focus", () => {
			this.releaseSearchScope();
			this.searchScope = scope;
			this.app.keymap.pushScope(scope);
		});
		input.addEventListener("blur", () => {
			this.releaseSearchScope();
			if (!input.value.trim()) open(false);
		});
	}

	private releaseSearchScope(): void {
		if (this.searchScope) this.app.keymap.popScope(this.searchScope);
		this.searchScope = undefined;
	}

	private search(value: string): void {
		this.query = value.trim().toLowerCase();
		this.applySearch();
		if (!this.query) return;
		const missing = [...this.cardElements.keys()].filter(file => !this.searchText.has(file));
		if (!missing.length) return;
		const request = {};
		this.searchLoad = request;
		void Promise.all(missing.map(async file => {
			try { this.searchText.set(file, (await this.app.vault.cachedRead(file)).toLowerCase()); } catch { /* Title-only match. */ }
		})).then(() => { if (this.searchLoad === request) this.applySearch(); });
	}

	/** A card's tags from its body and properties, lower-cased with "#", as Obsidian matches them. */
	private cardTags(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache ? [...new Set((getAllTags(cache) ?? []).map(tag => tag.toLowerCase()))] : [];
	}

	private applySearch(): void {
		const words = this.query.split(/\s+/).filter(Boolean);
		this.contentEl.toggleClass("is-searching", words.length > 0 || this.tagFilter.size > 0);
		// "#tag" matches that tag exactly (and its nested tags, as in Obsidian); other words match title and text.
		const hasTag = (tags: string[], tag: string) => tags.some(entry => entry === tag || entry.startsWith(tag + "/"));
		for (const [file, card] of this.cardElements) {
			const text = file.basename.toLowerCase() + "\n" + (this.searchText.get(file) ?? "");
			const tags = this.cardTags(file);
			const matches = words.every(word => word.length > 1 && word.startsWith("#") ? hasTag(tags, word) : text.includes(word))
				&& (!this.tagFilter.size || [...this.tagFilter].some(tag => hasTag(tags, tag)));
			card.toggleClass("is-search-hidden", !matches);
		}
	}

	/**
	 * The tag filter: a "#" button that turns into a compact chip while filtering ("p1", or "p1 +2"),
	 * so any number of long tags stays on one line. The chip keeps one target: it opens the menu, which can clear.
	 */
	private renderTagFilter(): void {
		const parent = this.filterEl;
		if (!parent) return;
		parent.empty();
		const tags = [...this.tagFilter];
		parent.toggleClass("is-active", tags.length > 0);
		const button = parent.createEl("button", {
			cls: "clickable-icon vault-code-kanban-filter-button",
			attr: { type: "button", "aria-haspopup": "menu" },
		});
		setIcon(button.createSpan({ cls: "vault-code-kanban-filter-icon" }), "hash");
		const [first] = tags;
		if (first) {
			button.createSpan({ cls: "vault-code-kanban-filter-label", text: first.slice(1) });
			if (tags.length > 1) button.createSpan({ cls: "vault-code-kanban-filter-more", text: "+" + String(tags.length - 1) });
		}
		nameWithoutTooltip(button, button, tags.length ? t("kanbanFilterTags") + ": " + tags.join(", ") : t("kanbanFilterTags"));
		button.onclick = event => this.tagMenu(event);
	}

	private setTagFilter(tag: string | undefined, selected: boolean): void {
		if (tag === undefined) this.tagFilter.clear();
		else if (selected) this.tagFilter.add(tag);
		else this.tagFilter.delete(tag);
		this.renderTagFilter();
		this.applySearch();
	}

	private tagMenu(event: MouseEvent): void {
		const counts = new Map<string, number>();
		for (const file of this.cardElements.keys()) {
			for (const tag of this.cardTags(file)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		const menu = createCustomMenu();
		const dom = (target: unknown) => (target as { dom?: HTMLElement }).dom;
		// Header: the title, with a quiet "Clear" on the same line while a filter is on.
		menu.addItem(item => {
			item.setTitle(createFragment(fragment => {
				fragment.createSpan({ cls: "vault-code-kanban-menu-label", text: t("kanbanFilterTags") });
				if (!this.tagFilter.size) return;
				const clear = fragment.createEl("button", { cls: "vault-code-kanban-menu-clear", text: t("kanbanClearFilter"), attr: { type: "button" } });
				clear.addEventListener("click", event => {
					event.stopPropagation();
					menu.hide();
					this.setTagFilter(undefined, false);
				});
			})).setIsLabel(true);
			dom(item)?.addClass("vault-code-kanban-menu-header");
		});
		const tags = [...new Set([...counts.keys(), ...this.tagFilter])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
		if (!tags.length) menu.addItem(item => item.setTitle(t("kanbanNoTags")).setDisabled(true));
		const rows: HTMLElement[] = [];
		for (const tag of tags) {
			const selected = this.tagFilter.has(tag);
			menu.addItem(item => {
				item
					.setTitle(createFragment(fragment => {
						fragment.createSpan({ cls: "vault-code-kanban-menu-tag", text: tag.slice(1) });
						fragment.createSpan({ cls: "vault-code-kanban-menu-count", text: String(counts.get(tag) ?? 0) });
					}))
					.setChecked(selected)
					.onClick(() => this.setTagFilter(tag, !selected));
				const row = dom(item);
				if (row) rows.push(row);
			});
		}
		const menuEl = dom(menu);
		menuEl?.addClass("vault-code-kanban-tag-menu");
		const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
		if (!trigger || Platform.isPhone) this.showMenu(menu, event);
		else {
			const rect = trigger.getBoundingClientRect();
			menu.showAtPosition({ x: rect.right, y: rect.bottom + 4, left: true });
		}
		// Only the tag rows scroll; the header stays put above them.
		const first = rows[0];
		if (!menuEl || !first?.parentElement) return;
		const list = createDiv({ cls: "vault-code-kanban-menu-list" });
		first.parentElement.insertBefore(list, first);
		list.append(...rows);
	}

	private updateTitleIcons(): void {
		const board = this.board;
		for (const [folder, { title, label }] of this.columnElements) {
			if (folder !== board && this.setTitle(title, folder.name, folder.path, true)) label.setText(folder.name);
		}
		for (const file of this.cardElements.keys()) {
			const title = this.inlineFields.get(file)?.title;
			if (title) this.setTitle(title, file.basename, file.path);
		}
	}

	/** Sets a column or card title, led by the icon Iconize gives that folder or note. Returns whether anything changed. */
	private setTitle(button: HTMLButtonElement, text: string, path?: string, folder = false): boolean {
		const icon = path ? pathIcon(this.app, path, folder) : undefined;
		const key = JSON.stringify([text, icon?.name, icon?.color]);
		if (this.titleKeys.get(button) === key) return false;
		this.titleKeys.set(button, key);
		button.setText(text);
		if (icon) prependPathIcon(this.app, button, icon);
		return true;
	}

	private addButton(parent: HTMLElement, label: string, action: () => void): void {
		const button = parent.createEl("button", { cls: "vault-code-kanban-add", attr: { type: "button" } });
		setIcon(button.createSpan(), "plus");
		button.createSpan({ text: label });
		button.onclick = action;
	}

	private updateColumns(board: TFolder): void {
		const rail = this.rail;
		if (!rail || !this.addColumn) return;
		const folders = new Set<TFolder>();
		const files = new Set<TFile>();
		const sections: HTMLElement[] = [];
		for (const column of this.columns) {
			const folder = column.folder;
			folders.add(folder);
			const title = folder === board ? this.unsorted.name ?? t("kanbanUnsorted") : folder.name;
			const elements = this.columnElements.get(folder) ?? this.createColumn(rail, folder, board, title);
			const { section, list } = elements;
			sections.push(section);
			this.columnTargets.set(section, column);
			if (this.setTitle(elements.title, title, folder === board ? undefined : folder.path, true)) elements.label.setText(title);
			const count = String(column.cards.length);
			if (elements.count.textContent !== count) elements.count.setText(count);
			list.dataset.path = folder.path;
			const top = list.scrollTop;
			let next = list.firstElementChild;
			for (const file of column.cards) {
				files.add(file);
				const card = this.cardElements.get(file) ?? this.createCard(list, file);
				this.cardTargets.set(card, { column, before: file });
				const field = this.inlineFields.get(file)?.title;
				if (field) this.setTitle(field, file.basename, file.path);
				if (card !== next) list.insertBefore(card, next);
				next = card.nextElementSibling;
			}
			if (list.scrollTop !== top) list.scrollTop = top;
		}
		for (const [file, card] of this.cardElements) {
			if (files.has(file)) continue;
			const preview = this.inlineFields.get(file)?.excerpt;
			if (preview) this.observer?.unobserve(preview);
			card.remove();
			this.cardElements.delete(file);
			this.searchText.delete(file);
		}
		for (const [folder, { section }] of this.columnElements) {
			if (folders.has(folder)) continue;
			section.remove();
			this.columnElements.delete(folder);
		}
		let next = this.addColumn;
		for (const section of sections.reverse()) {
			if (section.nextElementSibling !== next) rail.insertBefore(section, next);
			next = section;
		}
	}

	private createColumn(rail: HTMLElement, folder: TFolder, board: TFolder, name: string): ColumnElements {
		const root = folder === board;
		const section = rail.createEl("section", { cls: "vault-code-kanban-column" });
		const label = nameWithoutTooltip(section, section, name);
		const header = section.createDiv({ cls: "vault-code-kanban-header" });
		const heading = header.createEl("h2");
		const title = heading.createEl("button", { cls: "vault-code-kanban-column-title", text: name, attr: { type: "button" } });
		this.inlineFields.set(folder, { title });
		title.onclick = root ? () => this.editUnsortedName(board) : () => this.editColumnName(folder);
		const count = header.createSpan({ cls: "vault-code-kanban-count" });
		const addTop = this.iconButton(header, "plus", t("kanbanAddCard"));
		addTop.addClass("vault-code-kanban-add-top");
		if (!root) {
			header.addClass("is-draggable");
			this.bindDrag(header, section, { kind: "column", folder });
		}
		const list = section.createDiv({ cls: "vault-code-kanban-list" });
		const footer = section.createDiv({ cls: "vault-code-kanban-column-footer" });
		addTop.onclick = () => this.compose(section, t("kanbanCardTitle"), name => this.create(folder, name, true, "first"), form => {
			form.addClass("is-top");
			list.before(form);
		});
		this.addButton(footer, t("kanbanAddCard"), () => this.compose(footer, t("kanbanCardTitle"), name => this.create(folder, name, true, "last")));
		this.headerSizes?.observe(header);
		const elements = { section, title, label, count, list };
		this.columnElements.set(folder, elements);
		return elements;
	}

	private createCard(list: HTMLElement, file: TFile): HTMLElement {
		const card = list.createDiv({ cls: "vault-code-kanban-card" });
		const body = card.createDiv({ cls: "vault-code-kanban-card-body" });
		const title = body.createEl("button", {
			cls: "vault-code-kanban-card-title",
			text: file.basename,
			attr: { type: "button" },
		});
		const editTitle = () => this.editCardTitle(file);
		title.onclick = editTitle;

		const description = body.createDiv({ cls: "vault-code-kanban-description" });
		const preview = description.createEl("button", {
			cls: "vault-code-kanban-excerpt",
			attr: { type: "button" },
		});
		nameWithoutTooltip(preview, preview, t("kanbanEditDescription"));
		const editDescription = () => this.editCardExcerpt(file);
		this.inlineFields.set(file, { title, excerpt: preview });
		preview.onclick = editDescription;
		this.previewFiles.set(preview, file);
		this.observer?.observe(preview);

		const actions = card.createDiv({ cls: "vault-code-kanban-card-actions" });
		const grip = this.iconButton(actions, "grip-vertical", t("kanbanCardActions"));
		grip.addClass("vault-code-kanban-grip");
		grip.onclick = event => this.cardMenu(event, file, editTitle, editDescription);
		const open = this.iconButton(actions, "external-link", t("kanbanOpenNote"));
		open.addClass("vault-code-kanban-open-note");
		open.onclick = () => this.openCardNote(file);
		// Mouse users drag from anywhere on the card; touch users drag from the grip or long-press the card.
		this.bindDrag(card, card, { kind: "card", file });
		this.cardElements.set(file, card);
		return card;
	}

	private iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
		const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button" } });
		setIcon(button, icon);
		nameWithoutTooltip(button, button, label);
		return button;
	}

	/**
	 * Inline composer. It stays open after each Enter so several cards can be added in a row,
	 * reveals what it created, and closes on Escape, Cancel, or when focus leaves it empty.
	 */
	private compose(
		parent: HTMLElement,
		label: string,
		submit: (name: string) => Promise<TFile | void>,
		place?: (form: HTMLFormElement) => void,
	): void {
		if (this.busy || this.stopDrag || !parent.isConnected || this.isEditing()) return;
		this.refreshGeneration++;
		const form = parent.createEl("form", { cls: "vault-code-kanban-compose" });
		parent.addClass("is-composing");
		place?.(form);
		const input = form.createEl("input", { attr: { type: "text", placeholder: label, required: "", enterkeyhint: "done" } });
		nameWithoutTooltip(form, input, label);
		const cancel = form.createEl("button", { text: t("modalButtonCancel"), attr: { type: "button" } });
		form.createEl("button", { cls: "mod-cta", text: t("modalButtonCreate"), attr: { type: "submit" } });
		const close = () => {
			if (this.busy || !form.isConnected) return;
			form.remove();
			if (!parent.querySelector(":scope > .vault-code-kanban-compose")) parent.removeClass("is-composing");
			this.scheduleRefresh();
		};
		cancel.onclick = close;
		form.onkeydown = event => { if (event.key === "Escape" && !event.isComposing) close(); };
		form.addEventListener("focusout", event => {
			const next = event.relatedTarget;
			if (next instanceof Node && form.contains(next)) return;
			if (!input.value.trim()) close();
		});
		form.onsubmit = event => {
			event.preventDefault();
			let created: TFile | void = undefined;
			void this.perform(async () => { created = await submit(input.value); }, false).then(saved => {
				if (!saved || !form.isConnected) return;
				input.value = "";
				input.focus();
				const card = created ? this.cardElements.get(created) : undefined;
				card?.scrollIntoView({ block: "nearest", inline: "nearest" });
				form.scrollIntoView({ block: "nearest", inline: "nearest" });
			});
		};
		input.focus();
		input.select();
		form.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	private name(value: string): string {
		const name = value.trim();
		// eslint-disable-next-line no-control-regex -- Control characters are invalid in card and column names.
		if (!name || name.startsWith(".") || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || name.endsWith(".")) throw new Error(t("kanbanInvalidName"));
		return name;
	}

	private assertAvailable(path: string): void {
		if (this.app.vault.getAbstractFileByPath(path)) throw new Error(t("kanbanNameExists"));
	}

	private async create(folder: TFolder, value: string, note: boolean, at: "first" | "last" = "last"): Promise<TFile | void> {
		const name = this.name(note ? value.trim().replace(/\.md$/i, "") : value);
		const path = childPath(folder, name + (note ? ".md" : ""));
		this.assertAvailable(path);
		if (!note) {
			await this.app.vault.createFolder(path);
			// New columns join the end of the board (Unsorted keeps its own slot) rather than sorting by name.
			await this.placeColumn(folder, path).catch(() => undefined);
			return;
		}
		const file = await this.app.vault.create(path, "");
		// The card exists either way; if the order can't be saved it falls back to name order.
		await this.placeCard(folder, file, at).catch(() => undefined);
		return file;
	}

	private async placeColumn(board: TFolder, path: string): Promise<void> {
		if (board !== this.board) return;
		const relative = (entry: string) => boardRelativePath(board.path, entry);
		const columns = this.columns.map(column => column.folder).filter(entry => entry !== board).map(entry => relative(entry.path));
		await this.saveOrder(board, { ...this.order, columns: [...columns, relative(path)] });
	}

	/** Saves a card's position in its column: first, last, or right after another card. */
	private async placeCard(folder: TFolder, file: TFile, at: "first" | "last" | TFile): Promise<void> {
		const board = this.board;
		if (!board) return;
		const relative = (path: string) => boardRelativePath(board.path, path);
		const column = (this.columns.find(entry => entry.folder === folder)?.cards ?? []).filter(card => card !== file);
		const after = typeof at === "string" ? -1 : column.indexOf(at);
		column.splice(at === "first" ? 0 : after >= 0 ? after + 1 : column.length, 0, file);
		const cards = Object.assign(Object.create(null) as KanbanOrder["cards"], this.order.cards);
		cards[relative(folder.path)] = column.map(card => relative(card.path));
		await this.saveOrder(board, { ...this.order, cards });
	}

	private async perform(action: () => Promise<void>, refreshOnError = true): Promise<boolean> {
		if (this.busy) return false;
		this.busy = true;
		this.refreshGeneration++;
		try {
			await action();
			await this.refresh();
			return true;
		} catch (error) {
			new Notice(error instanceof Error ? error.message : t("kanbanFailed"));
			if (refreshOnError) await this.refresh();
			return false;
		} finally {
			this.busy = false;
			if (this.dirtyExcerpts.size) this.scheduleRefresh();
		}
	}

	private addUnsortedSettings(parent: HTMLElement): void {
		const button = parent.createEl("button", {
			cls: "clickable-icon vault-code-kanban-unsorted-settings",
			attr: { type: "button", "aria-haspopup": "menu" },
		});
		setIcon(button, "settings");
		nameWithoutTooltip(button, button, t("kanbanUnsortedSettings"));
		button.onclick = event => {
			if (this.busy || this.isEditing()) return;
			const menu = createCustomMenu();
			const heading = createFragment(fragment => {
				fragment.createSpan({ cls: "vault-code-kanban-menu-label", text: t("kanbanUnsorted") });
			});
			menu.addItem(item => item.setTitle(heading).setIsLabel(true));
			const positions = [
				["last", "kanbanUnsortedLast"],
				["first", "kanbanUnsortedFirst"],
				["hidden", "kanbanUnsortedHide"],
			] as const;
			for (const [position, label] of positions) {
				menu.addItem(item => item.setTitle(t(label)).setChecked(this.unsorted.position === position).onClick(() => {
					if (this.unsorted.position !== position) void this.perform(() => this.saveUnsorted({ position }));
				}));
			}
			this.showMenu(menu, event);
		};
	}

	private editUnsortedName(board: TFolder): void {
		this.editInline(board, "title", t("kanbanColumnName"), () => this.unsorted.name ?? t("kanbanUnsorted"),
			value => this.saveUnsorted({ name: value.trim() || undefined }));
	}

	private async saveUnsorted(change: Partial<KanbanUnsorted>): Promise<void> {
		const marker = this.marker;
		if (!marker || marker.parent !== this.board || marker.path !== this.markerPath) throw new Error(t("kanbanFailed"));
		await this.app.vault.process(marker, source => {
			const previous = readKanbanFile(source);
			if (!previous || source !== this.markerSource) throw new Error(t("kanbanFailed"));
			return writeKanbanUnsorted({ ...previous, columns: this.order.columns, cards: this.order.cards }, change);
		});
	}

	private editColumnName(folder: TFolder): void {
		this.editInline(folder, "title", t("kanbanColumnName"), () => folder.name, async value => {
			const board = this.board;
			if (!board || folder.parent !== board || this.app.vault.getAbstractFileByPath(folder.path) !== folder) {
				throw new Error(t("kanbanFailed"));
			}
			const name = this.name(value);
			if (name === folder.name) return;
			await this.renameBoardItem(folder, board, childPath(board, name));
		});
	}

	private async renameBoardItem(item: TFile | TFolder, board: TFolder, path: string): Promise<void> {
		this.assertAvailable(path);
		const from = boardRelativePath(board.path, item.path);
		await this.app.fileManager.renameFile(item, path);
		const to = boardRelativePath(board.path, item.path);
		const markers = board.children.filter((entry): entry is TFile => entry instanceof TFile && entry.extension.toLowerCase() === "kanban");
		const remap = (source: string): string => {
			const previous = readKanbanFile(source);
			if (!previous) return source;
			const next = remapKanbanOrders({ "": previous }, from, to)[""];
			return !next || JSON.stringify(next) === JSON.stringify({ columns: previous.columns, cards: previous.cards })
				? source : writeKanbanFile(next, previous);
		};
		const results = await Promise.allSettled(markers.map(async marker => {
			const source = await this.app.vault.read(marker);
			if (remap(source) !== source) await this.app.vault.process(marker, remap);
		}));
		if (results.some(result => result.status === "rejected")) new Notice(t("kanbanFailed"));
	}

	private editCardTitle(file: TFile): void {
		this.editInline(file, "title", t("kanbanCardTitle"), () => file.basename, async value => {
			const name = this.name(value.trim().replace(/\.md$/i, ""));
			if (name === file.basename) return;
			const folder = file.parent;
			const board = this.board;
			if (!folder || !board || (folder !== board && folder.parent !== board) || this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error(t("kanbanFailed"));
			await this.renameBoardItem(file, board, childPath(folder, name + "." + file.extension));
		});
	}

	private cardMenu(event: MouseEvent, file: TFile, editTitle: () => void, editDescription: () => void): void {
		if (this.isEditing()) return;
		const menu = createCustomMenu();
		menu.addItem(item => item.setTitle(t("modalButtonRename")).setIcon("pencil").onClick(editTitle));
		menu.addItem(item => item.setTitle(t("kanbanEditDescription")).setIcon("align-left").onClick(editDescription));
		menu.addItem(item => item.setTitle(t("kanbanDuplicateCard")).setIcon("copy").onClick(() => this.duplicateCard(file)));
		menu.addItem(item => item.setTitle(t("kanbanOpenNote")).setIcon("external-link").onClick(() => this.openCardNote(file)));
		menu.addSeparator();
		menu.addItem(item => item.setTitle(t("kanbanDeleteCard")).setIcon("trash-2").setWarning(true).onClick(() => {
			// Obsidian's own prompt honours the user's deletion confirmation and trash settings.
			void this.app.fileManager.promptForDeletion(file).catch(() => new Notice(t("kanbanFailed")));
		}));
		this.showMenu(menu, event);
	}

	/** Copies a card next to the original as "Name 1", "Name 2", … and places it right below it. */
	private duplicateCard(file: TFile): void {
		if (this.isEditing()) return;
		void this.perform(async () => {
			const folder = file.parent;
			const board = this.board;
			if (!folder || !board || (folder !== board && folder.parent !== board) || this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error(t("kanbanFailed"));
			let path: string;
			let index = 1;
			do path = childPath(folder, `${file.basename} ${index++}.${file.extension}`);
			while (this.app.vault.getAbstractFileByPath(path));
			// Vault.copy needs Obsidian 1.8.7; reading and creating works on the supported minimum.
			const copy = await this.app.vault.create(path, await this.app.vault.read(file));
			await this.placeCard(folder, copy, file);
		});
	}

	private openCardNote(file: TFile): void {
		void this.app.workspace.getLeaf("tab").openFile(file).catch(() => new Notice(t("kanbanFailed")));
	}

	private isEditing(): boolean {
		return this.inlineEditor !== undefined || this.contentEl.querySelector("form") !== null;
	}

	private editCardExcerpt(file: TFile): void {
		this.editInline(file, "excerpt", t("kanbanEditDescription"), button => {
			const cached = this.excerpts.get(button);
			if (cached !== undefined) return cached;
			return this.app.vault.read(file).then(source => {
				const { from, to } = cardExcerpt(source);
				return source.slice(from, to);
			});
		}, async (value, original) => {
			if (this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error(t("kanbanFailed"));
			const source = await this.app.vault.process(file, current => {
				const range = cardExcerpt(current);
				if (current.slice(range.from, range.to).replace(/\r\n/g, "\n") !== original) throw new Error(t("kanbanNoteChanged"));
				return replaceCardExcerpt(current, range, value);
			});
			const preview = this.inlineFields.get(file)?.excerpt;
			if (preview?.isConnected) {
				this.excerptLoads.delete(preview);
				this.updateExcerpt(preview, file, source);
			}
		});
	}

	private editInline(
		item: TFile | TFolder,
		field: "title" | "excerpt",
		label: string,
		getValue: (button: HTMLButtonElement) => string | Promise<string>,
		save: (value: string, original: string) => Promise<void>,
	): void {
		if (this.inlineSave) {
			void this.inlineSave.then(() => this.editInline(item, field, label, getValue, save));
			return;
		}
		const button = this.inlineFields.get(item)?.[field];
		const parent = button?.parentElement;
		if (!button || !parent || !button.isConnected || this.closed || this.busy || this.stopDrag || this.isEditing()) return;

		this.refreshGeneration++;
		const multiline = field === "excerpt";
		const input = parent.createEl("textarea", {
			cls: [...button.classList, "vault-code-kanban-inline-editor"],
			attr: multiline ? { rows: "1" } : { rows: "1", enterkeyhint: "done" },
		});
		const labelEl = nameWithoutTooltip(parent, input, label);
		button.before(input);
		button.hidden = true;
		this.inlineEditor = input;
		// Obsidian's keymap claims Mod+Enter (and can claim Escape) before the textarea sees them,
		// so route both through a scope that lives only while this editor is open.
		const scope = new Scope(this.app.scope);
		const done = () => { if (this.inlineEditor === input) input.blur(); return false; };
		scope.register(["Mod"], "Enter", done);
		scope.register([], "Escape", done);
		this.app.keymap.pushScope(scope);

		const resize = () => {
			input.setCssProps({ "--kanban-editor-height": "0px" });
			input.setCssProps({ "--kanban-editor-height": `${input.scrollHeight}px` });
		};
		const restore = () => {
			this.app.keymap.popScope(scope);
			this.inlineEditor = undefined;
			input.remove();
			labelEl.remove();
			button.hidden = false;
		};
		let original: string | undefined;
		const load = getValue(button);
		const initialize = (value: string) => {
			if (this.inlineEditor !== input) return;
			input.value = value;
			original = input.value;
			input.readOnly = false;
			resize();
			if (multiline) input.setSelectionRange(input.value.length, input.value.length);
			else input.select();
		};
		if (typeof load === "string") initialize(load);
		else {
			input.readOnly = true;
			void load.then(initialize).catch(() => {
				if (this.inlineEditor !== input) return;
				restore();
				this.scheduleRefresh();
				new Notice(t("kanbanFailed"));
			});
		}
		input.oninput = event => {
			// Names wrap visually. Keep pasted line breaks out of the filename.
			if (!multiline && !("isComposing" in event && event.isComposing) && input.value.includes("\n")) {
				const { selectionStart, selectionEnd } = input;
				input.value = input.value.replace(/\n/g, " ");
				input.setSelectionRange(selectionStart, selectionEnd);
			}
			resize();
		};
		input.onkeydown = event => {
			if (event.isComposing) return;
			const finish = event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey);
			if (event.key !== "Escape" && !finish) return;
			// Escape finishes like Mod+Enter: leave the editor and keep the changes.
			event.preventDefault();
			event.stopPropagation();
			input.blur();
		};
		input.onblur = () => {
			if (this.inlineEditor !== input || this.inlineSave) return;
			const value = multiline ? input.value : input.value.replace(/\n/g, " ");
			if (original === undefined || value === original) {
				restore();
				this.scheduleRefresh();
				return;
			}
			const base = original;
			this.inlineSave = this.perform(() => save(value, base), false).then(saved => {
				this.inlineSave = undefined;
				if (saved || !input.isConnected || this.closed) restore();
				else input.focus();
			});
		};
		input.focus();
	}

	private showMenu(menu: Menu, event: MouseEvent): void {
		const trigger = event.currentTarget as HTMLButtonElement | null;
		if (event.detail === 0 && trigger) {
			const rect = trigger.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		} else menu.showAtMouseEvent(event);
	}

	private drop(drag: Drag, target?: Column | Drop): void {
		if (this.isEditing()) return;
		void this.perform(async () => {
			const board = this.board;
			if (!board || this.findBoard() !== board) return;
			if (drag.kind === "column") {
				const before = target && "folder" in target ? target.folder : undefined;
				if (drag.folder.parent !== board || before === drag.folder || before === board) return;
				const columns = this.columns.map(column => column.folder).filter(folder => folder !== board && folder !== drag.folder && folder.parent === board);
				const index = before ? columns.indexOf(before) : -1;
				columns.splice(index < 0 ? columns.length : index, 0, drag.folder);
				await this.saveOrder(board, { ...this.order, columns: columns.map(folder => boardRelativePath(board.path, folder.path)) });
				return;
			}
			if (!target || !("column" in target) || target.before === drag.file) return;
			const folder = target.column.folder;
			const source = drag.file.parent;
			const validColumn = (candidate: TFolder) => candidate === board || (candidate.parent === board && this.app.vault.getAbstractFileByPath(candidate.path) === candidate);
			if (!source || !validColumn(source) || !validColumn(folder) || this.app.vault.getAbstractFileByPath(drag.file.path) !== drag.file) return;
			const marker = this.marker;
			if (!marker || await this.app.vault.read(marker) !== this.markerSource) throw new Error(t("kanbanFailed"));
			if (source !== folder) {
				const path = childPath(folder, drag.file.name);
				this.assertAvailable(path);
				await this.app.fileManager.renameFile(drag.file, path);
			}
			const relative = (path: string) => boardRelativePath(board.path, path);
			const cards = Object.assign(Object.create(null) as KanbanOrder["cards"], this.order.cards);
			const notes = (column: TFolder) => column.children.filter((file): file is TFile => file instanceof TFile && file.extension.toLowerCase() === "md");
			if (source !== folder) cards[relative(source.path)] = ordered(notes(source), cards[relative(source.path)] ?? [], board).map(file => relative(file.path));
			const destination = ordered(notes(folder).filter(file => file !== drag.file), cards[relative(folder.path)] ?? [], board);
			const index = target.before ? destination.indexOf(target.before) : -1;
			destination.splice(index < 0 ? destination.length : index, 0, drag.file);
			cards[relative(folder.path)] = destination.map(file => relative(file.path));
			await this.saveOrder(board, { ...this.order, cards });
		});
	}

	private async saveOrder(board: TFolder, order: KanbanOrder): Promise<void> {
		const marker = this.marker;
		if (!marker || marker.parent !== board || marker.path !== this.markerPath) throw new Error(t("kanbanInvalidFile", this.markerPath.split("/").pop() ?? KANBAN_FILENAME));
		const relative = (path: string) => boardRelativePath(board.path, path);
		const folders = board.children.filter((entry): entry is TFolder => entry instanceof TFolder);
		const columns = new Set(folders.map(folder => relative(folder.path)));
		const cards = Object.create(null) as KanbanOrder["cards"];
		for (const folder of [board, ...folders]) {
			const path = relative(folder.path);
			const notes = new Set(folder.children.filter(entry => entry instanceof TFile && entry.extension.toLowerCase() === "md").map(entry => relative(entry.path)));
			const saved = order.cards[path]?.filter(entry => notes.has(entry));
			if (saved?.length) cards[path] = saved;
		}
		await this.app.vault.process(marker, source => {
			const previous = readKanbanFile(source);
			if (!previous || source !== this.markerSource) throw new Error(t("kanbanFailed"));
			return writeKanbanFile({ columns: order.columns.filter(entry => columns.has(entry)), cards }, previous);
		});
		this.renamed = [];
	}

	/**
	 * Trello-style pointer dragging: the pressed element stays in the layout as a
	 * placeholder that moves live between siblings (with FLIP animations), while a
	 * tilted clone follows the pointer. The DOM order at release is committed
	 * optimistically, so the board never snaps back while files are renamed.
	 * Mouse drags start after a small movement; touch drags start from the grip or
	 * column header immediately, or from anywhere on a card after a long press.
	 */
	private bindDrag(handle: HTMLElement, source: HTMLElement, drag: Drag): void {
		handle.addEventListener("dragstart", event => event.preventDefault());
		handle.addEventListener("pointerdown", event => {
			if (this.busy || this.stopDrag || event.button !== 0 || !event.isPrimary || this.isEditing()) return;
			const pressed = event.target as Element | null;
			if (drag.kind === "column" && pressed?.closest(".vault-code-kanban-column-title, .vault-code-kanban-add-top")) return;
			if (pressed?.closest("input, textarea, select, [contenteditable='true']")) return;
			const win = handle.win;
			const doc = handle.doc;
			const touch = event.pointerType !== "mouse";
			const immediate = !touch || drag.kind === "column" || !!pressed?.closest(".vault-code-kanban-grip");
			const reduce = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
			const startX = event.clientX, startY = event.clientY;
			let x = startX, y = startY;
			let active = false;
			let frame = 0;
			let timer = 0;
			let ghost: HTMLElement | undefined;
			let origin = { x: 0, y: 0 };
			let grab = { x: 0, y: 0 };
			// The lifted clone leans into horizontal motion and eases back to a slight lean on the last heading.
			let lift: HTMLElement | undefined;
			let tilt = 0, lean = 1, lastX = startX;
			const maxTilt = drag.kind === "card" ? 7 : 3;
			const home = { parent: source.parentElement, next: source.nextElementSibling };
			const animations = new Map<Element, Animation>();
			const controller = new AbortController();
			const options = { signal: controller.signal };
			const blocking = { signal: controller.signal, passive: false, capture: true };

			const place = () => ghost?.setCssProps({
				"--kanban-ghost-x": `${x - grab.x - origin.x}px`,
				"--kanban-ghost-y": `${y - grab.y - origin.y}px`,
			});
			const recount = (list: Element | null) => {
				const count = list?.closest(".vault-code-kanban-column")?.querySelector(".vault-code-kanban-count");
				if (list && count) count.textContent = String(list.querySelectorAll(":scope > .vault-code-kanban-card").length);
			};
			// FLIP: measure siblings, move the placeholder, then animate siblings from their old spot.
			const shift = (containers: Array<Element | null>, mutate: () => void) => {
				const items = [...new Set(containers)].flatMap(container => container ? Array.from(container.children) : []).filter(item => item !== source);
				const first = reduce ? [] : items.map(item => item.getBoundingClientRect());
				for (const item of items) animations.get(item)?.cancel();
				mutate();
				if (reduce) return;
				items.forEach((item, index) => {
					const from = first[index];
					if (!from) return;
					const last = item.getBoundingClientRect();
					const dx = from.left - last.left, dy = from.top - last.top;
					if (!dx && !dy) return;
					animations.set(item, item.animate(
						[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
						{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
					));
				});
			};
			const edge = (position: number, start: number, end: number, zone: number, max: number) => {
				if (position < start + zone) return -Math.ceil(max * Math.min(1, (start + zone - position) / zone));
				if (position > end - zone) return Math.ceil(max * Math.min(1, (position - end + zone) / zone));
				return 0;
			};
			const autoscroll = (rail: HTMLElement) => {
				const bounds = rail.getBoundingClientRect();
				rail.scrollLeft += edge(x, bounds.left, bounds.right, Math.min(90, bounds.width / 4), 22);
				// Desktop scrolls the whole board vertically; phones scroll the column list below.
				if (drag.kind === "card") rail.scrollTop += edge(y, bounds.top, bounds.bottom, Math.min(70, bounds.height / 4), 16);
				const list = drag.kind === "card" ? source.parentElement : null;
				const area = list?.getBoundingClientRect();
				if (list && area && x >= area.left && x <= area.right) list.scrollTop += edge(y, area.top, area.bottom, Math.min(70, area.height / 4), 16);
			};
			const moveCard = () => {
				let section: Element | undefined;
				let distance = Infinity;
				for (const { section: candidate } of this.columnElements.values()) {
					if (!candidate.isConnected) continue;
					const rect = candidate.getBoundingClientRect();
					const gap = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
					if (gap < distance) { section = candidate; distance = gap; }
				}
				const list = section?.querySelector<HTMLElement>(":scope > .vault-code-kanban-list");
				if (!list) return;
				// Layout positions (offsetTop) ignore running FLIP transforms, which keeps targeting stable.
				const top = list.getBoundingClientRect().top + list.clientTop - list.scrollTop;
				let before: Element | null = null;
				for (const card of Array.from(list.children)) {
					if (card === source || !card.instanceOf(HTMLElement) || !card.hasClass("vault-code-kanban-card")) continue;
					if (top + card.offsetTop + card.offsetHeight / 2 > y) { before = card; break; }
				}
				if (source.parentElement === list && source.nextElementSibling === before) return;
				const previous = source.parentElement;
				shift([previous, list], () => list.insertBefore(source, before));
				recount(previous);
				recount(list);
			};
			const moveColumn = (rail: HTMLElement) => {
				const left = rail.getBoundingClientRect().left + rail.clientLeft - rail.scrollLeft;
				const candidates = Array.from(rail.children).filter((item): item is HTMLElement => item !== source && item.instanceOf(HTMLElement)
					&& item.hasClass("vault-code-kanban-column") && this.columnTargets.get(item)?.folder !== this.board);
				if (!candidates.length) return;
				const before = candidates.find(item => left + item.offsetLeft + item.offsetWidth / 2 > x) ?? candidates[candidates.length - 1]?.nextElementSibling ?? null;
				if (before === source || source.nextElementSibling === before) return;
				shift([rail], () => rail.insertBefore(source, before));
			};
			const steer = () => {
				const velocity = x - lastX;
				lastX = x;
				if (Math.abs(velocity) > 0.5) lean = Math.sign(velocity);
				const goal = Math.max(-maxTilt, Math.min(maxTilt, velocity * 0.45 + lean * maxTilt * 0.3));
				tilt += (goal - tilt) * 0.18;
				lift?.setCssProps({ "--kanban-ghost-tilt": `${tilt.toFixed(2)}deg` });
			};
			const track = () => {
				const rail = this.rail;
				if (!active || !rail) return;
				place();
				if (!reduce) steer();
				autoscroll(rail);
				if (drag.kind === "card") moveCard();
				else moveColumn(rail);
				frame = win.requestAnimationFrame(track);
			};
			const activate = () => {
				if (active) return;
				if (!source.isConnected || !this.rail || this.busy || this.isEditing()) { finish(false); return; }
				active = true;
				const rect = source.getBoundingClientRect();
				grab = { x: startX - rect.left, y: startY - rect.top };
				// Desktop columns are as tall as the tallest one; lift only the painted part, down to its footer.
				const footer = drag.kind === "column" ? source.querySelector(".vault-code-kanban-column-footer")?.getBoundingClientRect() : undefined;
				const height = footer ? Math.min(rect.height, footer.bottom - rect.top) : rect.height;
				ghost = this.contentEl.createDiv({ cls: "vault-code-kanban-drag-ghost", attr: { "aria-hidden": "true", inert: "" } });
				ghost.setCssProps({ "--kanban-ghost-width": `${rect.width}px`, "--kanban-ghost-height": `${height}px` });
				lift = ghost.appendChild(source.cloneNode(true) as HTMLElement);
				// Fixed positioning can be offset by a transformed ancestor; measure and compensate.
				const at = ghost.getBoundingClientRect();
				origin = { x: at.left, y: at.top };
				source.addClass("is-drag-placeholder");
				this.contentEl.addClass("is-kanban-dragging");
				win.getSelection()?.removeAllRanges();
				if (touch) win.navigator.vibrate?.(8);
				track();
			};
			const settle = () => {
				const flying = ghost;
				ghost = undefined;
				let done = false;
				const end = () => {
					if (done) return;
					done = true;
					flying?.remove();
					source.removeClass("is-drag-placeholder");
				};
				if (!flying || reduce || !source.isConnected) { end(); return; }
				const rect = source.getBoundingClientRect();
				flying.addClass("is-settling");
				flying.setCssProps({ "--kanban-ghost-x": `${rect.left - origin.x}px`, "--kanban-ghost-y": `${rect.top - origin.y}px` });
				flying.addEventListener("transitionend", transition => { if (transition.target === flying) end(); });
				win.setTimeout(end, 260);
			};
			const finish = (commit: boolean) => {
				if (controller.signal.aborted) return;
				controller.abort();
				win.clearTimeout(timer);
				win.cancelAnimationFrame(frame);
				this.stopDrag = undefined;
				this.contentEl.removeClass("is-kanban-dragging");
				if (!active) return;
				const moved = source.parentElement !== home.parent || source.nextElementSibling !== home.next;
				if (moved && !commit && home.parent?.isConnected) {
					const previous = source.parentElement;
					shift([previous, home.parent], () => home.parent?.insertBefore(source, home.next?.parentElement === home.parent ? home.next : null));
					recount(previous);
					recount(home.parent);
				}
				settle();
				// Suppress the click synthesized after the drag, while preserving keyboard activation.
				win.addEventListener("click", click => {
					if (click.detail) { click.preventDefault(); click.stopImmediatePropagation(); }
				}, { capture: true, once: true, signal: AbortSignal.timeout(400) });
				if (commit && moved) this.drop(drag, this.dropTarget(drag, source));
				else this.scheduleRefresh();
			};

			this.stopDrag = () => finish(false);
			if (!immediate) timer = win.setTimeout(activate, 380);
			win.addEventListener("pointermove", move => {
				if (move.pointerId !== event.pointerId) return;
				x = move.clientX;
				y = move.clientY;
				if (!active) {
					const distance = Math.hypot(x - startX, y - startY);
					// A long-press candidate that moves first is a scroll, not a drag.
					if (immediate && distance >= 5) activate();
					else if (!immediate && distance > 10) finish(false);
				}
				if (active) move.preventDefault();
			}, options);
			// Touch scrolling must be blocked from the first touchmove once a drag is live.
			doc.addEventListener("touchmove", move => { if (active && move.cancelable) move.preventDefault(); }, blocking);
			if (touch) win.addEventListener("contextmenu", menu => { if (active || !immediate) menu.preventDefault(); }, blocking);
			win.addEventListener("pointerup", up => {
				if (up.pointerId !== event.pointerId) return;
				x = up.clientX;
				y = up.clientY;
				finish(true);
			}, options);
			win.addEventListener("pointercancel", cancel => { if (cancel.pointerId === event.pointerId) finish(false); }, options);
			win.addEventListener("blur", () => finish(false), options);
			win.addEventListener("keydown", key => {
				if (key.key === "Escape" && active) { key.preventDefault(); finish(false); }
			}, { signal: controller.signal, capture: true });
		});
	}

	/** Reads the committed position of a dragged card or column from its live DOM placement. */
	private dropTarget(drag: Drag, source: HTMLElement): Column | Drop | undefined {
		const next = source.nextElementSibling;
		if (drag.kind === "column") {
			const column = next ? this.columnTargets.get(next) : undefined;
			return column && column.folder !== this.board ? column : undefined;
		}
		const section = source.closest(".vault-code-kanban-column");
		const column = section ? this.columnTargets.get(section) : undefined;
		return column ? { column, before: next ? this.cardTargets.get(next)?.before : undefined } : undefined;
	}
}
