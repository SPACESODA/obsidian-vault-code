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
