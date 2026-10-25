import { t } from "./i18n";
import { PreviewError, type PreviewTextKey } from "./preview-errors";
import { Component, MarkdownRenderer, type App } from "obsidian";
import { PREVIEW_LIMITS, parseDelimited, parseJsonPreview, jsonRecordTable, parseDiffPreview, mermaidMarkdown, type PreviewTable } from "./file-preview-data";

import { decodePreviewBytes, tableEditModel, editableToken, changeTableCell, type TableEditModel, type CellChange } from "./file-preview-edit";

export type ApplyCellEdit = (change: CellChange, current: () => boolean) => Promise<void>;

export function formatPreviewError(error: unknown, fallback: PreviewTextKey = "previewUnable"): string {
	if (error instanceof PreviewError) return t(error.key, ...error.args);
	return error instanceof Error ? error.message : t(fallback);
}

let previewLabelId = 0;
/** Obsidian turns aria-label into a hover tooltip; reference a hidden label instead. */
function nameWithoutTooltip(parent: HTMLElement, element: HTMLElement, text: string): void {
	const id = `vault-code-preview-label-${++previewLabelId}`;
	parent.createSpan({ text, attr: { id, hidden: "" } });
	element.setAttribute("aria-labelledby", id);
}

function notice(parent: HTMLElement, text: string, error = false): void {
	parent.createDiv({ cls: error ? "hidden-files-preview-error" : "vault-code-preview-note", text });
}
function shortText(text: string): string { return text.length > 2000 ? text.slice(0, 2000) + "…" : text; }

interface CellEditing {
	model: TableEditModel;
	apply: ApplyCellEdit;
	current: () => boolean;
	activate: (cancel: () => void) => void;
}
function makeEditable(cell: HTMLTableCellElement, row: number, column: number, editing: CellEditing): void {
	const token = editing.model.cells[row]?.[column];
	if (!editableToken(token)) return;
	cell.classList.add("is-editable");
	cell.tabIndex = 0;
	const begin = () => {
		if (!editing.current() || cell.querySelector("input,textarea,select")) return;
		const original = cell.textContent ?? "";
		let busy = false;
		const cancel = () => { cell.empty(); cell.textContent = original; cell.classList.remove("is-editing"); };
		editing.activate(cancel);
		cell.empty(); cell.classList.add("is-editing");
		const input = token.kind === "boolean" ? cell.createEl("select") : token.kind === "number" ? cell.createEl("input", { attr: { type: "text", inputmode: "decimal" } }) : cell.createEl("textarea", { attr: { rows: "3" } });
		nameWithoutTooltip(cell, input, editing.model.headers[column] ?? t("previewCellValue"));
		input.setAttribute("spellcheck", "false");
		if (input.tagName === "SELECT") {
			for (const value of ["true", "false"]) input.createEl("option", { value, text: value });
		}
		input.value = token.value;
		const controls = cell.createDiv({ cls: "vault-code-preview-cell-actions" });
		const apply = controls.createEl("button", { text: t("previewApply"), attr: { type: "button", "aria-keyshortcuts": "Control+Enter Meta+Enter" } });
		const dismiss = controls.createEl("button", { text: t("modalButtonCancel"), attr: { type: "button" } });
		const error = cell.createDiv({ cls: "vault-code-preview-cell-error", attr: { role: "alert" } });
		const commit = async () => {
			if (busy || !editing.current()) return;
			try {
				const change = changeTableCell(editing.model, row, column, input.value);
				if (!change) { cancel(); cell.focus(); return; }
				busy = true; apply.disabled = dismiss.disabled = input.disabled = true;
				await editing.apply(change, editing.current);
			} catch (reason: unknown) {
				if (!editing.current()) return;
				error.setText(formatPreviewError(reason, "previewApplyFailed"));
				busy = false; apply.disabled = dismiss.disabled = input.disabled = false;
				input.focus();
			}
		};
		apply.addEventListener("click", () => { void commit(); });
		dismiss.addEventListener("click", () => { if (!busy) { cancel(); cell.focus(); } });
		input.addEventListener("keydown", (rawEvent) => {
			const event = rawEvent as KeyboardEvent;
			if (event.isComposing) return;
			if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); cancel(); cell.focus(); }
			if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void commit(); }
		});
		input.focus();
	};
	cell.addEventListener("dblclick", begin);
	// A touch tap opens only a draft; Apply remains mandatory before any change.
	cell.addEventListener("pointerup", event => { if (event.pointerType === "touch") begin(); });
	cell.addEventListener("keydown", event => { if (event.target === cell && event.key === "Enter") { event.preventDefault(); begin(); } });
}

function renderTable(parent: HTMLElement, data: PreviewTable, editing?: CellEditing): void {
	const columns = Math.min(PREVIEW_LIMITS.columns, Math.max(0, ...data.rows.map(row => row.length)));
	if (!columns) return;
	const region = parent.createDiv({ cls: "vault-code-preview-table-scroll", attr: { role: "region", tabindex: "0" } });
	nameWithoutTooltip(region, region, t("previewDataTable"));
	const table = region.createEl("table", { cls: "vault-code-preview-table" });
	const head = table.createEl("thead").createEl("tr");
	const headers = data.rows[0] ?? [];
	let shortened = data.truncated;
	for (let col = 0; col < columns; col++) {
		const text = headers[col] ?? "";
		if (text.length > 2000) shortened = true;
		head.createEl("th", { text: shortText(text), attr: { scope: "col" } });
	}
	const body = table.createEl("tbody");
	const rowLimit = Math.min(PREVIEW_LIMITS.rows, Math.floor(10000 / columns));
	const editable = editing && !data.truncated && data.rows.length <= rowLimit + 1;
	let rowIndex = 0;
	for (const row of data.rows.slice(1, rowLimit + 1)) {
		const tr = body.createEl("tr");
		for (let col = 0; col < columns; col++) {
			const text = row[col] ?? "";
			if (text.length > 2000) shortened = true;
			const cell = tr.createEl("td", { text: shortText(text) });
			if (editable && text.length <= 2000) makeEditable(cell, rowIndex, col, editing);
		}
		rowIndex++;
	}
	if (data.rows.length > rowLimit + 1) shortened = true;
	if (shortened) notice(parent, t("previewShortened"));
}

function renderJsonTree(parent: HTMLElement, value: unknown): void {
	let remaining = PREVIEW_LIMITS.nodes;
	let limited = false;
	const limitNote = () => { if (!limited) { limited = true; notice(parent, t("previewShortened")); } };
	const node = (target: HTMLElement, key: string, item: unknown, depth: number): void => {
		if (remaining-- <= 0) { limitNote(); return; }
		if (item === null || typeof item !== "object") {
			const row = target.createDiv({ cls: "vault-code-preview-json-value" });
			row.createSpan({ cls: "vault-code-preview-json-key", text: shortText(key) });
			const text = JSON.stringify(item) ?? "null";
			row.createSpan({ cls: `vault-code-preview-json-${item === null ? "null" : typeof item}`, text: shortText(text) });
			if (key.length > 2000 || text.length > 2000) limitNote();
			return;
		}
		const array = Array.isArray(item);
		const entries = Object.entries(item);
		const details = target.createEl("details", { cls: "vault-code-preview-json-node" });
		details.createEl("summary", { text: `${shortText(key)} ${array ? `[${entries.length}]` : `{${entries.length}}`}` });
		let built = false;
		const populate = () => {
			if (built || !details.open) return;
			built = true;
			if (depth >= 40) { limitNote(); return; }
			const children = details.createDiv({ cls: "vault-code-preview-json-children" });
			for (const [childKey, child] of entries.slice(0, PREVIEW_LIMITS.branches)) {
				if (remaining <= 0) { limitNote(); break; }
				node(children, array ? `[${childKey}]` : childKey + ":", child, depth + 1);
			}
			if (entries.length > PREVIEW_LIMITS.branches) notice(children, t("previewShortened"));
		};
		details.addEventListener("toggle", populate);
		if (depth === 0) { details.open = true; populate(); }
	};
	node(parent, "$", value, 0);
}

function renderDiff(parent: HTMLElement, source: string): void {
	const { lines, truncated } = parseDiffPreview(source);
	const region = parent.createDiv({ cls: "vault-code-preview-table-scroll", attr: { role: "region", tabindex: "0" } });
	nameWithoutTooltip(region, region, t("previewDiff"));
	const table = region.createEl("table", { cls: "vault-code-preview-diff" });
	const header = table.createEl("thead").createEl("tr");
	for (const text of [t("previewOld"), t("previewNew"), t("previewChanges")]) header.createEl("th", { text, attr: { scope: "col" } });
	const body = table.createEl("tbody");
	for (const line of lines) {
		const row = body.createEl("tr", { cls: `is-${line.kind}` });
		row.createEl("td", { cls: "vault-code-preview-line-number", text: line.before?.toString() ?? "" });
		row.createEl("td", { cls: "vault-code-preview-line-number", text: line.after?.toString() ?? "" });
		row.createEl("td", { cls: "vault-code-preview-diff-text", text: line.text });
	}
	if (truncated) notice(parent, t("previewShortened"));
}

/** On-demand previews with per-render Markdown lifecycle and bounded data/DOM sizes. */
export class FilePreviewRenderer {
	private component?: Component;
	private generation = 0;
	private cancelCell?: () => void;
	constructor(private app: App, private owner: Component) { owner.register(() => this.clear()); }
	clear(): void {
		this.generation++;
		this.cancelCell?.(); this.cancelCell = undefined;
		if (this.component) { this.owner.removeChild(this.component); this.component = undefined; }
	}
	async render(container: HTMLElement, extension: string, source: string, path: string, applyEdit?: ApplyCellEdit, readBytes?: () => Promise<ArrayBuffer>): Promise<void> {
		this.clear();
		container.empty();
		const generation = this.generation;
		if (source.length > PREVIEW_LIMITS.characters) { notice(container, t("previewTooLarge")); return; }
		if (readBytes && ["csv", "tsv", "json", "jsonl", "ndjson"].includes(extension)) {
			try { decodePreviewBytes(await readBytes()); }
			catch (error: unknown) {
				if (generation === this.generation) notice(container, formatPreviewError(error));
				return;
			}
			if (generation !== this.generation) return;
		}
		if (!source.trim()) { notice(container, t("previewEmpty")); return; }
		const content = container.createDiv({ cls: "vault-code-file-preview" });
		try {
			const model = tableEditModel(source, extension);
			const editing: CellEditing | undefined = model && applyEdit ? {
				model, apply: applyEdit, current: () => generation === this.generation,
				activate: cancel => { this.cancelCell?.(); this.cancelCell = cancel; },
			} : undefined;
			if (extension === "csv" || extension === "tsv") renderTable(content, parseDelimited(source, extension === "tsv" ? "\t" : ","), editing);
			else if (["json", "jsonl", "ndjson"].includes(extension)) {
				const data = parseJsonPreview(source, extension !== "json");
				const table = model ? { rows: [model.headers, ...model.cells.map(row => row.map(cell => cell ? cell.value : ""))], truncated: false } : jsonRecordTable(data.value);
				if (table) renderTable(content, { rows: table.rows, truncated: table.truncated || data.truncated }, editing);
				else { renderJsonTree(content, data.value); if (data.truncated) notice(content, t("previewShortened")); }
			} else if (extension === "diff" || extension === "patch") renderDiff(content, source);
			else {
				if (source.length > 50000) { notice(content, t("previewDiagramTooLarge")); return; }
				content.classList.add("markdown-rendered", "vault-code-preview-mermaid");
				this.component = this.owner.addChild(new Component());
				await MarkdownRenderer.render(this.app, mermaidMarkdown(source), content, path, this.component);
			}
		} catch (error: unknown) {
			if (generation !== this.generation) return;
			content.empty();
			notice(content, formatPreviewError(error), true);
		}
	}
}
