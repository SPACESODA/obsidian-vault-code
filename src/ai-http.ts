import { Platform, requestUrl } from "obsidian";

export interface AIHttpResponse { status: number; contentType: string; chunks: AsyncIterable<string> }
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
	const http = (Platform.isDesktop ? (win.require ? win.require(protocol === "https:" ? "https" : "http") : protocol === "https:" ? await import("https") : await import("http")) : null) as typeof import("http");
	return new Promise((resolve, reject) => {
		const request = http.request(url, { method: body ? "POST" : "GET", headers, signal }, (response) => {
			const decoder = new TextDecoder();
			resolve({ status: response.statusCode || 0, contentType: String(response.headers["content-type"] || ""), chunks: (async function* () {
				for await (const chunk of response) {
					if (signal.aborted) throw new Error("Request cancelled.");
					yield decoder.decode(chunk as Uint8Array, { stream: true });
				}
				yield decoder.decode();
			})() });
		});
		request.on("error", reject);
		request.end(body);
	});
}
