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
		private reposition = () => this.measure();
		constructor(private view: EditorView) {
			this.button = view.dom.doc.body.createEl("button", { cls: "clickable-icon vault-code-selection-agent" });
			this.button.hidden = true;
			setIcon(this.button, "sparkles");
			this.button.addEventListener("pointerdown", (event) => event.preventDefault());
			this.button.addEventListener("click", () => {
				const quote = this.quote;
				if (!quote || !options.enabled()) return;
				this.button.hidden = true;
				options.onQuote(quote);
			});
			view.scrollDOM.addEventListener("scroll", this.reposition);
			view.dom.win.addEventListener("resize", this.reposition);
			this.measure();
		}
		update(update: ViewUpdate): void {
			if (update.selectionSet || update.docChanged || update.focusChanged || update.geometryChanged || update.viewportChanged) this.measure();
		}
		private measure(): void {
			this.view.requestMeasure({ key: this,
				read: (view) => {
					if (this.destroyed || !options.enabled() || (!view.hasFocus && view.dom.doc.activeElement !== this.button) || view.state.selection.main.empty) return null;
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
					if (this.destroyed) return;
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
			this.view.scrollDOM.removeEventListener("scroll", this.reposition);
			this.view.dom.win.removeEventListener("resize", this.reposition);
			this.button.remove();
		}
	});
}
