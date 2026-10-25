import { en } from "./i18n/locales/en";

export type PreviewTextKey = Extract<keyof typeof en, `preview${string}`>;

/** Keep parsing/storage independent of Obsidian; translate errors at the UI boundary. */
export class PreviewError extends Error {
	readonly args: (string | number)[];
	constructor(readonly key: PreviewTextKey, ...args: (string | number)[]) {
		super(en[key].replace(/\{(\d+)\}/g, (match, index: string) => args[Number(index)] === undefined ? match : String(args[Number(index)])));
		this.name = "PreviewError";
		this.args = args;
	}
}
