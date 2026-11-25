import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles: [output] } = await build({
	entryPoints: ["src/kanban-excerpt.ts"],
	bundle: true,
	write: false,
	platform: "node",
	format: "cjs",
});
const module = { exports: {} };
new Function("module", "exports", output.text)(module, module.exports);
const { cardCover, cardExcerpt, cardExcerptLines, cardInline, replaceCardExcerpt } = module.exports;

test("the card shows every line before the first blank line in a CRLF note", () => {
	const front = "\uFEFF---\r\ntags: [test]\r\n---\r\n\r\n# Title\r\n \t\r\n";
	const opening = "First sentence.  \r\n  Second line.\r\n- A list item";
	const rest = "\r\n \t\r\nKeep this.\r\n\r\n- [ ] Checklist\r\n";
	const note = front + opening + rest;
	const range = cardExcerpt(note);

	assert.equal(note.slice(range.from, range.to), opening);
	assert.equal(replaceCardExcerpt(note, range, "Edited.  \n  New line."), front + "Edited.  \r\n  New line." + rest);
	assert.equal(replaceCardExcerpt(note, range, ""), front + rest);
});

test("blank leading lines and a final newline are outside the excerpt", () => {
	const note = " \t\n\nOne\nTwo\n";
	const { from, to } = cardExcerpt(note);
	assert.equal(note.slice(from, to), "One\nTwo");
	assert.deepEqual(cardExcerpt("- item"), { from: 0, to: 6 });
});

test("the first level-one heading and surrounding blank lines do not consume the description", () => {
	const opening = "This is the first line.\n2nd line";
	for (const title of ["\n# title\n\n", "# title\n", "   # title #\n \t\n\n"]) {
		const source = title + opening + "\n\nLater.";
		const { from, to } = cardExcerpt(source);
		assert.equal(source.slice(from, to), opening);
	}
	for (const firstLine of ["#tag", "## Section", "    # code"]) {
		const source = firstLine + "\n\nLater.";
		const { from, to } = cardExcerpt(source);
		assert.equal(source.slice(from, to), firstLine);
	}
});

test("editing a title-only note keeps the title above the new description", () => {
	const title = "\n# Title";
	assert.equal(replaceCardExcerpt(title, cardExcerpt(title), "Summary"), title + "\nSummary\n");
	const spaced = title + "\n\n";
	assert.equal(replaceCardExcerpt(spaced, cardExcerpt(spaced), "Summary"), spaced + "Summary\n");
});

test("a description can be added to an empty note or a note with only frontmatter", () => {
	assert.equal(replaceCardExcerpt("", cardExcerpt(""), "Summary"), "Summary\n");
	const front = "---\nstatus: draft\n---";
	assert.equal(replaceCardExcerpt(front, cardExcerpt(front), "Summary"), front + "\nSummary\n");
});

test("the cover is the first resolvable image in the opening block", () => {
	const resolve = link => link === "Screenshot with spaces.png" ? "vault-image" : undefined;
	const note = "\n# Card title\r\n\r\n![[Non-image.md]]\r\n![[Screenshot with spaces.png|228]]\r\nCaption.\r\n\r\n![[Image below the cutoff.png]]";
	const { from, to } = cardExcerpt(note);
	assert.deepEqual(cardCover(note.slice(from, to), resolve), {
		text: "![[Non-image.md]]\r\nCaption.",
		image: { src: "vault-image", alt: "" },
		omitted: { from: "![[Non-image.md]]\r\n".length, to: "![[Non-image.md]]\r\n![[Screenshot with spaces.png|228]]\r\n".length },
	});
	const belowCutoff = "Caption.\n\n![[Screenshot with spaces.png]]";
	const range = cardExcerpt(belowCutoff);
	assert.deepEqual(cardCover(belowCutoff.slice(range.from, range.to), resolve), { text: "Caption." });
});

test("covers accept local Markdown images and ignore remote links and inline code", () => {
	const opening = '![[https://example.test/remote.png]]\n`![[code.png]]`\n![Preview](assets/Local%20image.png "Title")';
	const resolved = [];
	const result = cardCover(opening, path => { resolved.push(path); return "local-image"; });
	assert.deepEqual(resolved, ["assets/Local image.png"]);
	assert.deepEqual(result, {
		text: '![[https://example.test/remote.png]]\n`![[code.png]]`',
		image: { src: "local-image", alt: "Preview" },
		omitted: { from: opening.lastIndexOf("\n"), to: opening.length },
	});
});

test("task offsets point to the original Markdown after a cover is removed", () => {
	const opening = "![[Cover.png]]\r\n- Bullet\r\n  - [X] Nested\r\n3. [ ] Ordered";
	const { text, omitted } = cardCover(opening, () => "vault-image");
	const lines = cardExcerptLines(text, omitted);
	assert.deepEqual(lines.map(line => line.text), ["Bullet", "Nested", "Ordered"]);
	assert.equal(lines[1].list.indent, 2);
	assert.equal(lines[2].list.order, 3);
	assert.equal(opening[lines[1].list.task.offset], "X");
	assert.equal(opening[lines[2].list.task.offset], " ");
	assert.equal(lines[1].list.task.checked, true);
	assert.equal(lines[2].list.task.checked, false);
});

test("list syntax inside a fenced block stays as plain text", () => {
	const source = ["```text", "- [ ] Example", "```", "- [ ] Real task"].join("\n");
	const lines = cardExcerptLines(source);
	assert.equal(lines[1].list, undefined);
	assert.equal(lines[3].list.task.checked, false);
});

test("fenced code lines are marked so the card can draw a code block", () => {
	const lines = cardExcerptLines(["Intro", "```html", "<div>test</div>", "- not a list", "```", "After"].join("\n"));
	assert.deepEqual(lines.map(line => line.code), [undefined, "fence", "line", "line", "fence", undefined]);
	assert.equal(lines[3].list, undefined);
});

test("inline Markdown becomes code, links, tags and emphasis nodes", () => {
	const text = (value) => ({ kind: "text", text: value });
	assert.deepEqual(cardInline("test `code` display"), [text("test "), { kind: "code", text: "code" }, text(" display")]);
	assert.deepEqual(cardInline("``a ` b`` end"), [{ kind: "code", text: "a ` b" }, text(" end")]);
	assert.deepEqual(cardInline("`` `tick` ``"), [{ kind: "code", text: "`tick`" }]);
	assert.deepEqual(cardInline("no `closing"), [text("no `closing")]);
	assert.deepEqual(cardInline("\\`not code` and \\*plain\\*"), [text("`not code` and *plain*")]);
	assert.deepEqual(cardInline("**bold** and *it* ~~old~~ ==hi=="), [
		{ kind: "strong", children: [text("bold")] }, text(" and "),
		{ kind: "em", children: [text("it")] }, text(" "),
		{ kind: "del", children: [text("old")] }, text(" "),
		{ kind: "mark", children: [text("hi")] },
	]);
	assert.deepEqual(cardInline("***both***"), [{ kind: "strong", children: [{ kind: "em", children: [text("both")] }] }]);
	assert.deepEqual(cardInline("snake_case_name stays"), [text("snake_case_name stays")]);
	assert.deepEqual(cardInline("2 * 3 * 4"), [text("2 * 3 * 4")]);
	assert.deepEqual(cardInline("See [[Folder/Note#Part|the note]], [[Plan#Goals]] and [site](https://x.dev)"), [
		text("See "), { kind: "link", text: "the note" }, text(", "),
		{ kind: "link", text: "Plan > Goals" }, text(" and "), { kind: "link", text: "site" },
	]);
	assert.deepEqual(cardInline("#bug fix, issue #42 and a#b"), [{ kind: "tag", text: "#bug" }, text(" fix, issue #42 and a#b")]);
	assert.deepEqual(cardInline("`#notatag` **`code`**"), [{ kind: "code", text: "#notatag" }, text(" "), { kind: "strong", children: [{ kind: "code", text: "code" }] }]);
	assert.deepEqual(cardInline(""), []);
});

test("headings, quotes and callouts are recognised outside code", () => {
	const lines = cardExcerptLines(["## Plan ##", "> [!warning]- Watch out", "> body", "", "> plain", "> [!tip] not a callout", "```", "> code", "```"].join("\n"));
	assert.deepEqual(lines[0], { text: "Plan", heading: 2 });
	assert.deepEqual(lines[1].quote, { callout: { type: "warning", title: "Watch out" } });
	assert.deepEqual(lines[2], { text: "body", quote: {} });
	assert.deepEqual(lines[4], { text: "plain", quote: {} });
	assert.deepEqual(lines[5], { text: "[!tip] not a callout", quote: {} });
	assert.equal(lines[7].quote, undefined);
	assert.deepEqual(cardExcerptLines("> [!NOTE]")[0].quote, { callout: { type: "note", title: "Note" } });
	assert.deepEqual(cardExcerptLines("#tag line")[0], { text: "#tag line" });
});
