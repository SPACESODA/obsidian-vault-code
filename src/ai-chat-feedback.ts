import { t } from "./i18n";

export function isChatPermissionError(message: string): boolean {
	return /headless[\s\S]*(?:permission|prompt)|permission[^\n]*(?:auto.denied|headless)|tool required the .* permission/i.test(message);
}

/** Quote every error line so provider messages cannot escape the error block. */
export function chatErrorContent(message: string, mode: "safe" | "edit", partial = ""): string {
	const detail = isChatPermissionError(message)
		? t(mode === "safe" ? "aiChatSafePermissionHelp" : "aiChatPermissionHelp")
		: message;
	const block = [`> ⚠️ **${t("aiChatErrorLabel")}**`, ">", ...detail.split(/\r?\n/).map(line => `> ${line}`)].join("\n");
	return partial.trim() ? `${partial.trimEnd()}\n\n${block}` : block;
}
