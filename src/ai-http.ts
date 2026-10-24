import { Platform, requestUrl } from "obsidian";

export interface AIHttpResponse { status: number; contentType: string; chunks: AsyncIterable<string> }

// Keep the desktop boundary typed even when a review environment lacks Node declarations.
interface HttpIncomingResponse extends AsyncIterable<unknown> {
	statusCode?: number;
	headers: Record<string, string | string[] | undefined>;
}
interface HttpClientRequest {
	on(event: "error", listener: (error: Error) => void): this;
	end(body?: string): void;
}
interface HttpRuntime {
	request(url: string, options: { method: string; headers: Record<string, string>; signal: AbortSignal }, onResponse: (response: HttpIncomingResponse) => void): HttpClientRequest;
}
function isHttpRuntime(value: unknown): value is HttpRuntime {
	return typeof value === "object" && value !== null && "request" in value && typeof value.request === "function";
}

/** Uses desktop Node networking to avoid renderer CORS restrictions and support streaming. */
export async function aiHttpRequest(url: string, headers: Record<string, string>, body: string | undefined, signal: AbortSignal): Promise<AIHttpResponse> {
	if (signal.aborted) throw new Error("Request cancelled.");
	if (!Platform.isDesktop) {
		const response = await requestUrl({ url, method: body ? "POST" : "GET", headers, body, throw: false });
		if (signal.aborted) throw new Error("Request cancelled.");
		return { status: response.status, contentType: response.headers["content-type"] || "application/json", chunks: (async function* () { yield response.text; })() };
	}
	const win = window as unknown as { require?: (name: string) => unknown };
	const protocol = new URL(url).protocol;
	if (protocol !== "http:" && protocol !== "https:") throw new Error("Use an HTTP or HTTPS endpoint.");
	const http: unknown = Platform.isDesktop
		? (typeof win.require === "function" ? win.require(protocol === "https:" ? "https" : "http")
			: protocol === "https:" ? await import("https") : await import("http"))
		: null;
	if (!isHttpRuntime(http)) throw new Error("Desktop HTTP runtime not available.");
	return new Promise((resolve, reject) => {
		const request = http.request(url, { method: body ? "POST" : "GET", headers, signal }, (response) => {
			const decoder = new TextDecoder();
			resolve({ status: response.statusCode || 0, contentType: String(response.headers["content-type"] || ""), chunks: (async function* () {
				for await (const chunk of response) {
					if (signal.aborted) throw new Error("Request cancelled.");
					if (typeof chunk === "string") yield chunk;
					else if (ArrayBuffer.isView(chunk)) yield decoder.decode(chunk, { stream: true });
					else throw new Error("Unsupported HTTP response chunk.");
				}
				yield decoder.decode();
			})() });
		});
		request.on("error", reject);
		request.end(body);
	});
}
