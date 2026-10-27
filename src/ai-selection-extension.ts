import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type Extension } from "@codemirror/state";
import { setIcon } from "obsidian";
import { captureSelection, type SelectionQuote } from "./ai-selection";

interface SelectionOptions {
	enabled: () => boolean;
	filePath: (view: EditorView) => string | null;
	label: () => string;
	onQuote: (quote: SelectionQuote) => void;
}

/** Shared by Obsidian's Markdown editors and Vault Code's CodeMirror editor. */
export function agentSelectionExtension(options: SelectionOptions): Extension {
	return ViewPlugin.fromClass(class {
		private button: HTMLButtonElement;
		private quote: SelectionQuote | null = null;
		private destroyed = false;
		private timer: number | undefined;
		private revision = 0;
		private pointers = new Set<number>();
		private reposition = () => this.schedule();
		private blur = () => { this.pointers.clear(); this.hide(); };
		private pointerDown = (event: PointerEvent) => {
			this.pointers.add(event.pointerId);
			this.hide();
		};
		private pointerEnd = (event: PointerEvent) => {
			if (!this.pointers.delete(event.pointerId)) return;
			this.schedule();
		};
		constructor(private view: EditorView) {
			this.button = view.dom.doc.body.createEl("button", { cls: "clickable-icon vault-code-selection-agent" });
			this.button.hidden = true;
			setIcon(this.button, "sparkles");
			this.button.addEventListener("pointerdown", (event) => event.preventDefault());
			this.button.addEventListener("click", () => {
				const quote = this.quote;
				if (!quote || !options.enabled()) return;
				this.hide();
				options.onQuote(quote);
			});
			view.dom.addEventListener("pointerdown", this.pointerDown, true);
			view.dom.doc.addEventListener("pointerup", this.pointerEnd, true);
			view.dom.doc.addEventListener("pointercancel", this.pointerEnd, true);
			view.dom.doc.addEventListener("vault-code-selection-setting-change", this.reposition);
			view.scrollDOM.addEventListener("scroll", this.reposition);
			view.dom.win.addEventListener("resize", this.reposition);
			view.dom.win.addEventListener("blur", this.blur);
			view.dom.win.addEventListener("focus", this.reposition);
			this.schedule();
		}
		update(update: ViewUpdate): void {
			if (update.selectionSet || update.docChanged || update.focusChanged || update.geometryChanged || update.viewportChanged) this.schedule();
		}
		private hide(): void {
			this.revision++;
			if (this.timer !== undefined) this.view.dom.win.clearTimeout(this.timer);
			this.timer = undefined;
			this.quote = null;
			this.button.hidden = true;
		}
		private schedule(): void {
			this.hide();
			if (this.destroyed || this.pointers.size || this.view.state.selection.main.empty) return;
			this.timer = this.view.dom.win.setTimeout(() => {
				this.timer = undefined;
				if (!this.destroyed && !this.pointers.size) this.measure();
			}, 300);
		}
		private measure(): void {
			const revision = this.revision;
			this.view.requestMeasure({ key: this,
				read: (view) => {
					if (this.destroyed || revision !== this.revision || this.pointers.size || !options.enabled() || (!view.hasFocus && view.dom.doc.activeElement !== this.button) || view.state.selection.main.empty) return null;
					const path = options.filePath(view);
					if (!path) return null;
					const range = view.state.selection.main;
					const rect = view.dom.getBoundingClientRect();
					const coords = view.coordsAtPos(range.from);
					if (!coords || rect.width === 0 || coords.bottom < rect.top || coords.top > rect.bottom) return null;
					return { quote: captureSelection(path, view.state.doc.toString(), range.from, range.to),
						left: Math.max(8, Math.min(rect.right - 56, view.dom.win.innerWidth - 40)),
						top: Math.max(8, Math.min((coords.top + coords.bottom) / 2 - 15, view.dom.win.innerHeight - 38)) };
				},
				write: (result) => {
					if (this.destroyed || revision !== this.revision) return;
					this.quote = result?.quote || null;
					this.button.hidden = !this.quote;
					if (!result || !this.quote) return;
					this.button.setAttribute("aria-label", options.label());
					this.button.setCssProps({ "--selection-agent-left": `${result.left}px`, "--selection-agent-top": `${result.top}px` });
				},
			});
		}
		destroy(): void {
			this.destroyed = true;
			this.hide();
			this.pointers.clear();
			this.view.dom.removeEventListener("pointerdown", this.pointerDown, true);
			this.view.dom.doc.removeEventListener("pointerup", this.pointerEnd, true);
			this.view.dom.doc.removeEventListener("pointercancel", this.pointerEnd, true);
			this.view.dom.doc.removeEventListener("vault-code-selection-setting-change", this.reposition);
			this.view.scrollDOM.removeEventListener("scroll", this.reposition);
			this.view.dom.win.removeEventListener("resize", this.reposition);
			this.view.dom.win.removeEventListener("blur", this.blur);
			this.view.dom.win.removeEventListener("focus", this.reposition);
			this.button.remove();
		}
	});
}
