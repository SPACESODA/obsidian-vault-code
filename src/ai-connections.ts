import { t } from "./i18n";

/** Direct model connections. Secrets are stored separately through Obsidian SecretStorage. */
export type ConnectionKind = "api" | "local";
export type APIFormat = "chat-completions" | "responses" | "anthropic";
export interface AIConnection {
	id: string;
	name: string;
	kind: ConnectionKind;
	baseUrl: string;
	format: APIFormat;
	models: string[];
	headers?: Record<string, string>;
}
export interface ConnectionPreset {
	id: string; name: string; kind: ConnectionKind; baseUrl: string; format: APIFormat;
}
// Presets only fill editable fields; they never limit providers or model IDs.
export const CONNECTION_PRESETS: ConnectionPreset[] = [
	{ id: "openai", name: "OpenAI", kind: "api", baseUrl: "https://api.openai.com/v1", format: "responses" },
	{ id: "anthropic", name: "Anthropic", kind: "api", baseUrl: "https://api.anthropic.com/v1", format: "anthropic" },
	{ id: "gemini", name: "Gemini", kind: "api", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", format: "chat-completions" },
	{ id: "openrouter", name: "OpenRouter", kind: "api", baseUrl: "https://openrouter.ai/api/v1", format: "chat-completions" },
	{ id: "deepseek", name: "DeepSeek", kind: "api", baseUrl: "https://api.deepseek.com", format: "chat-completions" },
	{ id: "qwen", name: "Qwen", kind: "api", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", format: "chat-completions" },
	{ id: "kimi", name: "Kimi / Moonshot", kind: "api", baseUrl: "https://api.moonshot.ai/v1", format: "chat-completions" },
	{ id: "glm", name: "GLM / Z.ai", kind: "api", baseUrl: "https://api.z.ai/api/paas/v4", format: "chat-completions" },
	{ id: "minimax", name: "MiniMax", kind: "api", baseUrl: "https://api.minimax.io/v1", format: "chat-completions" },
	{ id: "siliconflow", name: "SiliconFlow", kind: "api", baseUrl: "https://api.siliconflow.com/v1", format: "chat-completions" },
	{ id: "custom-api", name: "Custom", kind: "api", baseUrl: "", format: "chat-completions" },
	{ id: "ollama", name: "Ollama", kind: "local", baseUrl: "http://127.0.0.1:11434/v1", format: "chat-completions" },
	{ id: "atomic", name: "Atomic Chat", kind: "local", baseUrl: "http://127.0.0.1:1337/v1", format: "chat-completions" },
	{ id: "lmstudio", name: "LM Studio", kind: "local", baseUrl: "http://127.0.0.1:1234/v1", format: "chat-completions" },
	{ id: "ccswitch", name: "CC Switch", kind: "local", baseUrl: "http://127.0.0.1:15721/v1", format: "chat-completions" },
	{ id: "custom-local", name: "Custom", kind: "local", baseUrl: "", format: "chat-completions" },
];
export const isConnectionProvider = (provider: string): provider is `connection:${string}` => provider.startsWith("connection:");
export const connectionProvider = (id: string): `connection:${string}` => `connection:${id}`;
export const connectionSecretId = (id: string): string => `vault-code-ai-${id}`;
export function parseModelIds(text: string): string[] {
	return [...new Set(text.split(/[\n,]/).map((m) => m.trim()).filter(Boolean))];
}
export function endpointUrl(baseUrl: string, path: string): string {
	const url = new URL(baseUrl.trim());
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || [...url.searchParams.keys()].some((key) => /^(?:key|api[-_]?key|token|access_token|authorization)$/i.test(key))) throw new Error("Use an HTTP or HTTPS base URL without embedded credentials.");
	url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;
	return url.toString();
}
export function validateConnection(connection: AIConnection): void {
	if (!/^[a-z0-9-]+$/.test(connection.id)) throw new Error("Invalid connection ID.");
	if (!connection.name.trim()) throw new Error("Enter a name.");
	if (!connection.models.length || connection.models.some((m) => !m.trim() || /[\r\n]/.test(m))) throw new Error("Enter at least one model ID.");
	endpointUrl(connection.baseUrl, "models");
	if (!["chat-completions", "responses", "anthropic"].includes(connection.format)) throw new Error("Choose a supported API format.");
	for (const [header, value] of Object.entries(connection.headers || {})) {
		if (/authorization|key|token|secret|cookie/i.test(header)) throw new Error("Use the API key field for credentials, not custom headers.");
		if (!/^[a-z0-9-]+$/i.test(header) || /[\r\n]/.test(value) || ["host", "content-length", "connection"].includes(header.toLowerCase())) throw new Error("Invalid custom header.");
	}
}
/** Load metadata defensively, retaining only supported non-secret fields. */
export function normalizeConnections(value: unknown): AIConnection[] {
	if (!Array.isArray(value)) return [];
	const result: AIConnection[] = [];
	for (const item of value as unknown[]) {
		if (!item || typeof item !== "object") continue;
		const raw = item as Record<string, unknown>;
		if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.baseUrl !== "string" || !["api", "local"].includes(String(raw.kind)) || !Array.isArray(raw.models)) continue;
		const models = raw.models.filter((model): model is string => typeof model === "string").map((m) => m.trim()).filter(Boolean);
		const connection: AIConnection = { id: raw.id, name: raw.name.trim(), kind: raw.kind as ConnectionKind, baseUrl: raw.baseUrl, format: raw.format as APIFormat, models: [...new Set(models)] };
		if (raw.headers && typeof raw.headers === "object" && !Array.isArray(raw.headers)) connection.headers = Object.fromEntries(Object.entries(raw.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
		try { validateConnection({ ...connection, models: ["validation"] }); } catch { continue; }
		if (!result.some((c) => c.id === connection.id)) result.push(connection);
	}
	return result;
}

export interface DirectMessage { role: "user" | "assistant"; content: string }
export interface DirectRequest { url: string; headers: Record<string, string>; body: Record<string, unknown> }
export function buildDirectRequest(connection: AIConnection, model: string, key: string | null, messages: DirectMessage[], system: string, stream: boolean): DirectRequest {
	validateConnection(connection);
	if (!model || model === "default" || !connection.models.includes(model)) throw new Error("Choose a configured model.");
	const headers: Record<string, string> = { ...connection.headers, "Content-Type": "application/json" };
	if (key) headers[connection.format === "anthropic" ? "x-api-key" : "Authorization"] = connection.format === "anthropic" ? key : `Bearer ${key}`;
	if (connection.format === "anthropic") {
		headers["anthropic-version"] = "2023-06-01";
		return { url: endpointUrl(connection.baseUrl, "messages"), headers, body: { model, system, messages, max_tokens: 4096, stream } };
	}
	if (connection.format === "responses") return { url: endpointUrl(connection.baseUrl, "responses"), headers, body: { model, instructions: system, input: messages, stream, store: false } };
	return { url: endpointUrl(connection.baseUrl, "chat/completions"), headers, body: { model, messages: [{ role: "system", content: system }, ...messages], stream } };
}
interface ModelReply {
	type?: string; message?: string; error?: { message?: string }; response?: { error?: { message?: string } };
	stop_reason?: string;
	choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; finish_reason?: string }>;
	delta?: string | { type?: string; text?: string; stop_reason?: string }; content?: Array<{ type?: string; text?: string }>;
	output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; output_text?: string;
}
export function modelReplyText(data: ModelReply): string {
	const stopReason = data.stop_reason ?? (typeof data.delta === "object" ? data.delta.stop_reason : undefined);
	if (data.choices?.[0]?.finish_reason === "length" || stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") throw new Error("The response reached the model’s output limit. Ask for a shorter response.");
	if (data.error || data.type === "error" || data.type === "response.failed" || data.type === "response.incomplete") throw new Error(data.error?.message || data.response?.error?.message || data.message || "The model request did not complete.");
	if (data.type === "response.output_text.delta" && typeof data.delta === "string") return data.delta;
	if (typeof data.delta === "object") return data.delta.text || "";
	return data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || data.output_text ||
		(data.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("") ||
		(data.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text || "").join("");
}
/** Handles arbitrary network chunk boundaries and multiline SSE data fields. */
export class ModelEventParser {
	private buffer = "";
	constructor(private onText: (text: string) => void) {}
	push(chunk: string): void {
		this.buffer += chunk;
		let match: RegExpExecArray | null;
		while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
			const event = this.buffer.slice(0, match.index);
			this.buffer = this.buffer.slice(match.index + match[0].length);
			this.event(event);
		}
	}
	finish(): void { if (this.buffer.trim()) this.event(this.buffer); this.buffer = ""; }
	private event(event: string): void {
		const data = event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
		if (!data || data.trim() === "[DONE]") return;
		const parsed = JSON.parse(data) as ModelReply;
		// Final Responses events repeat the text already received as deltas.
		if (parsed.type === "response.completed") return;
		const text = modelReplyText(parsed);
		if (text) this.onText(text);
	}
}
export interface EditProposal { content: string; explanation: string }
export function extractEditProposal(text: string): EditProposal | null {
	const match = /^```vault-code-edit\s*\r?\n([\s\S]*?)^```[ \t]*$/m.exec(text);
	if (!match) return null;
	try {
		const data = JSON.parse(match[1] || "") as { content?: unknown };
		return typeof data.content === "string" ? { content: data.content, explanation: text.replace(match[0], "").trim() } : null;
	} catch { return null; }
}
export function reviewedContent(current: string, original: string, proposed: string): string {
	if (current !== original) throw new Error(t("aiEditConflict"));
	return proposed;
}
