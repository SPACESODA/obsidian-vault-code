import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	...obsidianmd.configs.recommendedWithLocalesEn,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"obsidianmd/ui/sentence-case-locale-module": [
				"warn",
				{
					ignoreWords: ["Aa", "Antigravity", "CLI", "Agent", "AI"],
				},
			],
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					ignoreWords: ["Aa", "Antigravity", "CLI", "GPT-OSS", "120b", "Agent", "AI"],
				},
			],
		},
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
