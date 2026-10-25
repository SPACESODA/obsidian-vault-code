import { App, Modal, Notice, TFile } from "obsidian";
import { t } from "./i18n";
import { reviewedContent } from "./ai-connections";

export class AIEditReviewModal extends Modal {
	constructor(
		app: App,
		private file: TFile,
		private original: string,
		private proposed: string,
		private onApplied: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("vault-code-edit-review");
		this.contentEl.createEl("h3", { text: `${t("aiEditReview")} · ${this.file.name}` });
		const comparison = this.contentEl.createDiv({ cls: "vault-code-edit-comparison" });
		for (const [label, text] of [[t("aiEditCurrent"), this.original], [t("aiEditProposed"), this.proposed]]) {
			const column = comparison.createDiv();
			column.createEl("h4", { text: label });
			column.createEl("pre", { text });
		}
		const status = this.contentEl.createDiv({ cls: "vault-code-connection-status", attr: { role: "status" } });
		const actions = this.contentEl.createDiv({ cls: "vault-code-connection-actions" });
		const cancel = actions.createEl("button", { text: t("modalButtonCancel") });
		cancel.addEventListener("click", () => this.close());
		const apply = actions.createEl("button", { text: t("previewApply"), cls: "mod-cta" });
		apply.addEventListener("click", () => {
			if (apply.disabled) return;
			apply.disabled = true;
			void (async () => {
				if (this.app.vault.getAbstractFileByPath(this.file.path) !== this.file) {
					throw new Error(t("aiEditMissing"));
				}
				await this.app.vault.process(this.file, current => reviewedContent(current, this.original, this.proposed));
				this.onApplied();
				this.close();
				new Notice(t("aiEditApplied"));
			})().catch((error: unknown) => {
				status.setText(error instanceof Error ? error.message : String(error));
				apply.disabled = false;
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
