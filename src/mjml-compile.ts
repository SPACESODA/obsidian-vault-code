import { t } from "./i18n";

/** Compile the source as-is: never inline resources, execute HTML, or write a file. */
export async function compileMjmlHtml(source: string): Promise<string> {
	if (!source.trim()) throw new Error(t("previewEmpty"));
	const { default: compiler } = await import("mjml-browser");
	const compile = typeof compiler === "function" ? compiler : (compiler as { default?: typeof compiler }).default ?? compiler;
	const result = await compile(source, { validationLevel: "strict", minify: false });
	if (!result?.html?.trim()) throw new Error(t("previewNoOutput"));
	return result.html;
}

