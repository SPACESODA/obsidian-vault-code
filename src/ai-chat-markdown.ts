import { Component, MarkdownRenderer, type App } from "obsidian";

interface RenderState {
	component?: Component;
}

const renders = new WeakMap<HTMLElement, RenderState>();

/** Render offscreen so a slow Markdown postprocessor cannot overwrite a newer delta. */
export async function renderChatMarkdown(app: App, markdown: string, body: HTMLElement, sourcePath: string, owner: Component): Promise<void> {
	const previous = renders.get(body);
	const state: RenderState = { component: previous?.component };
	renders.set(body, state);
	const content = body.createDiv();
	content.detach();
	content.className = "vault-code-chat-markdown markdown-rendered";
	const component = owner.addChild(new Component());
	let unloaded = false;
	component.register(() => { unloaded = true; });
	try {
		await MarkdownRenderer.render(app, markdown, content, sourcePath, component);
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
		wrapper.setAttribute("aria-label", "Table");
	}
	body.replaceChildren(content);
	if (state.component) owner.removeChild(state.component);
	state.component = component;
}
