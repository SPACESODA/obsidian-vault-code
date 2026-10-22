declare module "mjml-browser" {
	export interface MjmlError {
		line: number;
		message: string;
		tagName?: string;
		formattedMessage?: string;
	}

	export interface MjmlResult {
		html: string;
		errors: MjmlError[];
	}

	export interface MjmlOptions {
		keepComments?: boolean;
		beautify?: boolean;
		minify?: boolean;
		validationLevel?: "strict" | "soft" | "skip";
		filePath?: string;
	}

	type MjmlFunction = (
		mjml: string,
		options?: MjmlOptions,
	) => Promise<MjmlResult> | MjmlResult;

	const mjml2html: MjmlFunction & { default?: MjmlFunction };
	export default mjml2html;
}
