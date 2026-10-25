/** Built-in editor support is maintained in code; settings store additions only. */
const builtInExtensions = new Set(
	"asm, astro, bash, bat, bib, c, c3, cc, cjs, cl, clj, cljc, cljs, cls, cmake, cmd, comp, cpp, cs, css, csv, cts, cu, cuh, cxx, dart, diff, dpk, dpr, edn, el, elm, email, eml, erl, ex, exs, f, f03, f08, f77, f90, f95, fish, for, frag, fs, fsi, fsx, fx, fxh, gd, gdshader, gdshaderinc, geom, gleam, glsl, go, gql, gradle, graphql, groovy, gsh, gvy, gy, h, handlebars, hbs, hcl, hh, hlsl, hpp, hrl, hs, htm, html, hxx, ini, java, jl, js, json, json5, jsonc, jsonl, jsx, kt, kts, less, lhs, liquid, lisp, log, lot, lsp, lua, m, make, mdx, mjml, mjs, mk, ml, mli, mm, mmd, mermaid, mts, ndjson, nim, nimble, nims, nix, odin, pas, patch, php, phtml, pine, pl, pm, pp, prisma, proto, ps1, psd1, psm1, py, pyi, pyw, r, rake, rb, rs, s, sass, sbt, sc, scala, scm, scss, sh, sol, sql, ss, sty, svelte, svg, swift, tex, text, tf, tfvars, toml, tres, ts, tscn, tsrx, tsv, tsx, txt, vert, vue, wat, wgsl, xml, xsd, yaml, yml, zig, zon, zsh".split(", "),
);
export const BUILTIN_EXTENSION_COUNT = builtInExtensions.size;
function parseExtensions(value: unknown): string[] {
	return typeof value === "string" ? value.split(/[\s,;]+/).map(item => item.replace(/^\.+/, "").toLowerCase()).filter(Boolean) : [];
}
export function additionalEditorExtensions(value: unknown): string {
	return [...new Set(parseExtensions(value))].filter(extension => !builtInExtensions.has(extension)).join(", ");
}
export function editableEditorExtensions(value: unknown): Set<string> {
	return new Set([...builtInExtensions, ...parseExtensions(value)]);
}
