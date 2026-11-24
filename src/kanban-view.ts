import { App, Component, ItemView, MarkdownRenderer, Modal, Notice, TFile, TFolder, setIcon, type Menu, type ViewStateResult } from "obsidian";
import { getActiveLanguage, t } from "./i18n";
import { createCustomMenu } from "./custom-menu";
import { nameWithoutTooltip } from "./dom-label";
import { cardCover, cardExcerpt, cardExcerptLines, replaceCardExcerpt, type CardExcerptLine } from "./kanban-excerpt";
import { KANBAN_FILENAME, boardRelativePath, readKanbanFile, readKanbanUnsorted, writeKanbanFile, writeKanbanUnsorted, type KanbanOrder, type KanbanOrders, type KanbanUnsorted } from "./kanban-file";

import { IMAGE_EXTENSIONS } from "./unlinked-media-modal";

export const KANBAN_VIEW = "vault-code-kanban";


function childPath(folder: TFolder, name: string): string {
	return folder.isRoot() ? name : folder.path + "/" + name;
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

class CardModal extends Modal {
	private renderer = new Component();
	private generation = 0;
	constructor(app: App, private file: TFile) { super(app); }

	onOpen(): void {
		const generation = ++this.generation;
		this.renderer.load();
		this.setTitle(this.file.basename);
		const button = this.contentEl.createEl("button", { text: t("kanbanOpenNote") });
		button.onclick = () => {
			this.close();
			void this.app.workspace.getLeaf("tab").openFile(this.file);
		};
		const body = this.contentEl.createDiv({ cls: "markdown-rendered vault-code-kanban-note" });
		void this.app.vault.cachedRead(this.file).then(async source => {
			if (generation === this.generation) await MarkdownRenderer.render(this.app, source, body, this.file.path, this.renderer);
		}).catch(() => { if (generation === this.generation) body.setText(t("kanbanFailed")); });
	}

	onClose(): void {
		this.generation++;
		this.renderer.unload();
		this.contentEl.empty();
	}
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
	private columns: Column[] = [];
	private cardTargets = new WeakMap<Element, Drop>();
	private columnTargets = new WeakMap<Element, Column>();
	private refreshFrame?: number;
	private observer?: IntersectionObserver;
	private stopDrag?: () => void;
	private busy = false;
	private inlineEditor?: HTMLTextAreaElement;
	private inlineSave?: Promise<void>;
	private inlineFields = new WeakMap<TFile | TFolder, { title: HTMLButtonElement; excerpt?: HTMLButtonElement }>();
	private excerpts = new WeakMap<HTMLButtonElement, string>();
	private closed = false;
	private modal?: CardModal;

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
			this.scheduleRefresh();
		}));
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.inlineEditor?.blur();
		await this.inlineSave;
		this.stopDrag?.();
		this.modal?.close();
		this.observer?.disconnect();
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
		const hasList = lines.some(line => line.list);
		wrapper?.toggleClass("is-list", hasList);
		if (wrapper && hasList) {
			this.labelEmptyExcerpt(preview);
			this.renderExcerptLists(wrapper, lines, (offset, checkbox) => {
				void this.toggleCardTask(file, value, offset, checkbox);
			});
		} else if (text) {
			preview.removeAttribute("aria-labelledby");
			preview.setText(text);
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
		for (const line of lines) {
			if (!line.list) {
				stack.length = 0;
				content.createDiv({ text: line.text });
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
				nameWithoutTooltip(item, checkbox, line.text || t("kanbanEditDescription"));
				checkbox.onchange = () => toggle(task.offset, checkbox);
			}
			item.createSpan({ text: line.text });
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
			if (elements.title.textContent !== title) {
				elements.title.setText(title);
				elements.label.setText(title);
			}
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
				if (field && field.textContent !== file.basename) field.setText(file.basename);
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
		if (!root) {
			header.addClass("is-draggable");
			this.bindDrag(header, section, { kind: "column", folder });
		}
		const list = section.createDiv({ cls: "vault-code-kanban-list" });
		const footer = section.createDiv({ cls: "vault-code-kanban-column-footer" });
		this.addButton(footer, t("kanbanAddCard"), () => this.compose(footer, t("kanbanCardTitle"), name => this.create(folder, name, true)));
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
		this.bindDrag(grip, card, { kind: "card", file });
		const open = this.iconButton(actions, "external-link", t("kanbanOpenNote"));
		open.addClass("vault-code-kanban-open-note");
		open.onclick = () => this.openCardNote(file);
		// Mouse users can also drag the title. Touch users retain swipe-to-scroll there.
		this.bindDrag(title, card, { kind: "card", file }, true);
		this.cardElements.set(file, card);
		return card;
	}

	private iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
		const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button" } });
		setIcon(button, icon);
		nameWithoutTooltip(button, button, label);
		return button;
	}

	private compose(parent: HTMLElement, label: string, submit: (name: string) => Promise<void>): void {
		if (this.busy || this.stopDrag || !parent.isConnected || this.isEditing()) return;
		this.refreshGeneration++;
		const form = parent.createEl("form", { cls: "vault-code-kanban-compose" });
		const input = form.createEl("input", { attr: { type: "text", placeholder: label, required: "" } });
		nameWithoutTooltip(form, input, label);
		const cancel = form.createEl("button", { text: t("modalButtonCancel"), attr: { type: "button" } });
		form.createEl("button", { cls: "mod-cta", text: t("modalButtonCreate"), attr: { type: "submit" } });
		cancel.onclick = () => {
			if (this.busy) return;
			form.remove();
			this.scheduleRefresh();
		};
		form.onkeydown = event => { if (event.key === "Escape" && !event.isComposing && !this.busy) cancel.click(); };
		form.onsubmit = event => {
			event.preventDefault();
			void this.perform(() => submit(input.value), false).then(saved => { if (saved) form.remove(); });
		};
		input.focus();
		input.select();
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

	private async create(folder: TFolder, value: string, note: boolean): Promise<void> {
		const name = this.name(note ? value.trim().replace(/\.md$/i, "") : value);
		const path = childPath(folder, name + (note ? ".md" : ""));
		this.assertAvailable(path);
		if (note) await this.app.vault.create(path, "");
		else await this.app.vault.createFolder(path);
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
		menu.addItem(item => item.setTitle(t("viewToggleRendered")).setIcon("eye").onClick(() => {
			this.modal?.close();
			this.modal = new CardModal(this.app, file);
			this.modal.open();
		}));
		menu.addItem(item => item.setTitle(t("kanbanOpenNote")).setIcon("external-link").onClick(() => this.openCardNote(file)));
		this.showMenu(menu, event);
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

		const resize = () => {
			input.setCssProps({ "--kanban-editor-height": "0px" });
			input.setCssProps({ "--kanban-editor-height": `${input.scrollHeight}px` });
		};
		const restore = () => {
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
			if (!multiline && !(event as InputEvent).isComposing && input.value.includes("\n")) {
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
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				restore();
				this.scheduleRefresh();
			} else input.blur();
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

	private bindDrag(handle: HTMLElement, source: HTMLElement, drag: Drag, mouseOnly = false): void {
		handle.addEventListener("pointerdown", event => {
			if (this.busy || this.stopDrag || event.button !== 0 || !event.isPrimary || (mouseOnly && event.pointerType !== "mouse") || this.isEditing()) return;
			const targetElement = event.target as Element | null;
			if (drag.kind === "column" && targetElement?.closest(".vault-code-kanban-column-title")) return;
			const win = handle.win;
			let x = event.clientX, y = event.clientY;
			let active = false;
			let frame = 0;
			let marked: Element | undefined;
			let target: Column | Drop | undefined;
			const controller = new AbortController();
			const options = { signal: controller.signal };
			const clearMarker = () => marked?.classList.remove("is-drop-before", "is-drop-after", "is-drop-column");
			const track = () => {
				const rail = this.rail;
				if (!rail || !active) return;
				const hit = handle.doc.elementFromPoint(x, y);
				const section = hit?.closest(".vault-code-kanban-column");
				const column = section ? this.columnTargets.get(section) : undefined;
				const bounds = rail.getBoundingClientRect();
				if (y >= bounds.top && y <= bounds.bottom) {
					if (x < bounds.left + 35) rail.scrollLeft -= 12;
					else if (x > bounds.right - 35) rail.scrollLeft += 12;
				}
				clearMarker();
				target = undefined;
				if (section && column && drag.kind === "card") {
					const card = hit?.closest(".vault-code-kanban-card");
					const match = card ? this.cardTargets.get(card) : undefined;
					const rect = card?.getBoundingClientRect();
					const after = rect !== undefined && y > (rect.top + rect.bottom) / 2;
					target = { column, before: match?.before && after ? column.cards[column.cards.indexOf(match.before) + 1] : match?.before };
					marked = card ?? section;
					marked.classList.add(card ? (after ? "is-drop-after" : "is-drop-before") : "is-drop-column");
					const list = section.querySelector(".vault-code-kanban-list");
					const area = list?.getBoundingClientRect();
					if (list && area && y >= area.top && y <= area.bottom) {
						if (y < area.top + 28) list.scrollTop -= 9;
						else if (y > area.bottom - 28) list.scrollTop += 9;
					}
				} else if (section && column && column.folder !== this.board && drag.kind === "column") {
					const rect = section.getBoundingClientRect();
					const after = x > (rect.left + rect.right) / 2;
					const next = this.columns[this.columns.indexOf(column) + 1];
					target = after ? (next?.folder === this.board ? undefined : next) : column;
					marked = section;
					marked.classList.add(after ? "is-drop-after" : "is-drop-before");
				} else if (drag.kind === "column" && hit?.closest(".vault-code-kanban-add-column")) {
					marked = hit.closest(".vault-code-kanban-add-column") ?? undefined;
					marked?.classList.add("is-drop-before");
				}
				frame = win.requestAnimationFrame(track);
			};
			const cleanup = () => {
				controller.abort();
				win.cancelAnimationFrame(frame);
				clearMarker();
				source.removeClass("is-dragging");
				this.stopDrag = undefined;
			};
			this.stopDrag = cleanup;
			win.addEventListener("pointermove", move => {
				if (move.pointerId !== event.pointerId) return;
				x = move.clientX;
				y = move.clientY;
				if (!active && Math.hypot(x - event.clientX, y - event.clientY) >= 7) {
					active = true;
					source.addClass("is-dragging");
					track();
				}
				if (active) move.preventDefault();
			}, options);
			win.addEventListener("pointerup", up => {
				if (up.pointerId !== event.pointerId) return;
				x = up.clientX;
				y = up.clientY;
				win.cancelAnimationFrame(frame);
				track();
				const accepted = active && (drag.kind === "card" ? target !== undefined : marked?.classList.contains("is-drop-before") || marked?.classList.contains("is-drop-after"));
				cleanup();
				if (!active) return;
				// Suppress the click synthesized after the drag, while preserving keyboard activation.
				handle.addEventListener("click", click => {
					if (click.detail) { click.preventDefault(); click.stopImmediatePropagation(); }
				}, { capture: true, once: true, signal: AbortSignal.timeout(400) });
				if (accepted) this.drop(drag, target);
				else this.scheduleRefresh();
			}, options);
			win.addEventListener("pointercancel", cancel => {
				if (cancel.pointerId === event.pointerId) { cleanup(); this.scheduleRefresh(); }
			}, options);
			win.addEventListener("blur", cleanup, options);
			win.addEventListener("keydown", key => {
				if (key.key === "Escape") { cleanup(); this.scheduleRefresh(); }
			}, options);
		});
	}
}
