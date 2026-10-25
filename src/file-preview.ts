import { Component, MarkdownRenderer, type App } from "obsidian";
import { PREVIEW_LIMITS, parseDelimited, parseJsonPreview, jsonRecordTable, parseDiffPreview, mermaidMarkdown, type PreviewTable } from "./file-preview-data";

const SHORTENED = "Preview shortened. Open Code to see the full file.";
function notice(parent: HTMLElement, text: string, error = false): void {
	parent.createDiv({ cls: error ? "hidden-files-preview-error" : "vault-code-preview-note", text });
}
function shortText(text: string): string { return text.length > 2000 ? text.slice(0, 2000) + "…" : text; }

function renderTable(parent: HTMLElement, data: PreviewTable): void {
	const columns = Math.min(PREVIEW_LIMITS.columns, Math.max(0, ...data.rows.map(row => row.length)));
	if (!columns) return;
	const region = parent.createDiv({ cls: "vault-code-preview-table-scroll", attr: { role: "region", "aria-label": "Data table", tabindex: "0" } });
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
	for (const row of data.rows.slice(1, rowLimit + 1)) {
		const tr = body.createEl("tr");
		for (let col = 0; col < columns; col++) {
			const text = row[col] ?? "";
			if (text.length > 2000) shortened = true;
			tr.createEl("td", { text: shortText(text) });
		}
	}
	if (data.rows.length > rowLimit + 1) shortened = true;
	if (shortened) notice(parent, SHORTENED);
}

function renderJsonTree(parent: HTMLElement, value: unknown): void {
	let remaining = PREVIEW_LIMITS.nodes;
	let limited = false;
	const limitNote = () => { if (!limited) { limited = true; notice(parent, SHORTENED); } };
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
			if (entries.length > PREVIEW_LIMITS.branches) notice(children, SHORTENED);
		};
		details.addEventListener("toggle", populate);
		if (depth === 0) { details.open = true; populate(); }
	};
	node(parent, "$", value, 0);
}

function renderDiff(parent: HTMLElement, source: string): void {
	const { lines, truncated } = parseDiffPreview(source);
	const region = parent.createDiv({ cls: "vault-code-preview-table-scroll", attr: { role: "region", "aria-label": "Diff preview", tabindex: "0" } });
	const table = region.createEl("table", { cls: "vault-code-preview-diff" });
	const header = table.createEl("thead").createEl("tr");
	for (const text of ["Old", "New", "Changes"]) header.createEl("th", { text, attr: { scope: "col" } });
	const body = table.createEl("tbody");
	for (const line of lines) {
		const row = body.createEl("tr", { cls: `is-${line.kind}` });
		row.createEl("td", { cls: "vault-code-preview-line-number", text: line.before?.toString() ?? "" });
		row.createEl("td", { cls: "vault-code-preview-line-number", text: line.after?.toString() ?? "" });
		row.createEl("td", { cls: "vault-code-preview-diff-text", text: line.text });
	}
	if (truncated) notice(parent, SHORTENED);
}

/** On-demand previews with per-render Markdown lifecycle and bounded data/DOM sizes. */
export class FilePreviewRenderer {
	private component?: Component;
	private generation = 0;
	constructor(private app: App, private owner: Component) { owner.register(() => this.clear()); }
	clear(): void {
		this.generation++;
		if (this.component) { this.owner.removeChild(this.component); this.component = undefined; }
	}
	async render(container: HTMLElement, extension: string, source: string, path: string): Promise<void> {
		this.clear();
		container.empty();
		const generation = this.generation;
		if (!source.trim()) { notice(container, "Nothing to preview."); return; }
		if (source.length > PREVIEW_LIMITS.characters) { notice(container, "File too large to preview. Open Code to view it."); return; }
		const content = container.createDiv({ cls: "vault-code-file-preview" });
		try {
			if (extension === "csv" || extension === "tsv") renderTable(content, parseDelimited(source, extension === "tsv" ? "\t" : ","));
			else if (["json", "jsonl", "ndjson"].includes(extension)) {
				const data = parseJsonPreview(source, extension !== "json");
				const table = jsonRecordTable(data.value);
				if (table) renderTable(content, { rows: table.rows, truncated: table.truncated || data.truncated });
				else { renderJsonTree(content, data.value); if (data.truncated) notice(content, SHORTENED); }
			} else if (extension === "diff" || extension === "patch") renderDiff(content, source);
			else {
				if (source.length > 50000) { notice(content, "Diagram too large to preview. Open Code to view it."); return; }
				content.classList.add("markdown-rendered", "vault-code-preview-mermaid");
				this.component = this.owner.addChild(new Component());
				await MarkdownRenderer.render(this.app, mermaidMarkdown(source), content, path, this.component);
			}
		} catch (error: unknown) {
			if (generation !== this.generation) return;
			content.empty();
			notice(content, error instanceof Error ? error.message : "Unable to preview this file.", true);
		}
	}
}
