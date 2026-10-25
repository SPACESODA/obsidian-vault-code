import { Component, MarkdownRenderer, type App } from "obsidian";
import { t } from "./i18n";

interface RenderState {
	component?: Component;
	pending?: Component;
}

let tableId = 0;
const renders = new WeakMap<HTMLElement, RenderState>();

/** Render offscreen so a slow Markdown postprocessor cannot overwrite a newer delta. */
export async function renderChatMarkdown(app: App, markdown: string, body: HTMLElement, sourcePath: string, owner: Component): Promise<void> {
	const previous = renders.get(body);
	if (previous?.pending) owner.removeChild(previous.pending);
	const state: RenderState = { component: previous?.component };
	renders.set(body, state);
	const content = body.createDiv();
	content.detach();
	content.className = "vault-code-chat-markdown markdown-rendered";
	const component = owner.addChild(new Component());
	state.pending = component;
	let unloaded = false;
	component.register(() => { unloaded = true; });
	try {
		// A response is message content, never YAML frontmatter. Keep leading rules visible.
		const rendered = /^\uFEFF?(?:[ \t]*\r?\n)*---(?:\r?\n|$)/.test(markdown) ? `<!-- vault-code-message -->\n\n${markdown}` : markdown;
		await MarkdownRenderer.render(app, rendered, content, sourcePath, component);
		if (markdown.trim() && !content.textContent?.trim() && !content.querySelector("img, svg, video, audio, canvas, iframe, hr, input, math, .math, .mermaid")) {
			content.textContent = markdown;
			content.classList.add("is-plain-text");
		}
	} catch {
		// Keep the response readable if an optional Markdown postprocessor fails.
		content.textContent = markdown;
		content.classList.add("is-plain-text");
	}
	if (renders.get(body) !== state || unloaded) {
		owner.removeChild(component);
		return;
	}
	for (const table of content.querySelectorAll("table")) {
		let wrapper = table.parentElement;
		if (!wrapper?.classList.contains("table-wrapper")) {
			wrapper = content.createDiv();
			table.before(wrapper);
			wrapper.append(table);
		}
		wrapper.classList.add("vault-code-chat-table-scroll");
		wrapper.tabIndex = 0;
		wrapper.setAttribute("role", "region");
		const label = content.createSpan({ text: t("previewDataTable"), attr: { hidden: "", id: `vault-code-chat-table-${++tableId}` } });
		wrapper.setAttribute("aria-labelledby", label.id);
	}
	for (const checkbox of content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
		checkbox.disabled = true;
		checkbox.tabIndex = -1;
	}
	body.replaceChildren(content);
	if (state.component) owner.removeChild(state.component);
	state.component = component;
	state.pending = undefined;
}

export function disposeChatMarkdown(body: HTMLElement, owner: Component): void {
	const state = renders.get(body);
	renders.delete(body);
	for (const component of new Set([state?.component, state?.pending])) {
		if (component) owner.removeChild(component);
	}
}
