import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				createEl: "readonly",
				createDiv: "readonly",
				createSpan: "readonly",
				createSvg: "readonly",
				createFragment: "readonly",
				activeDocument: "readonly",
				activeWindow: "readonly",
			},
			parserOptions: {
				project: "./tsconfig.eslint.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["manifest.json"],
	},
	{
		files: ["LICENSE"],
	},
	{
		ignores: [
			"main.js",
			"node_modules/",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"dist/",
		],
	},
);
