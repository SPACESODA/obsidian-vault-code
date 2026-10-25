/** YAML names only. CLI/API protocol fields and in-memory metadata retain their own names. */
export const CHAT_PROPERTIES = {
	created: "chat_created",
	last_chat: "chat_last",
	scope: "chat_scope",
	mode: "chat_mode",
	provider: "chat_provider",
	model: "chat_model",
	conversation_id: "chat_id",
	reasoning_effort: "chat_effort",
} as const;

export function chatProperty(properties: Record<string, unknown>, legacy: keyof typeof CHAT_PROPERTIES): unknown {
	const key = CHAT_PROPERTIES[legacy];
	return Object.prototype.hasOwnProperty.call(properties, key) ? properties[key] : properties[legacy];
}

/** Called only when updating a chat note; never enumerate or rewrite unrelated vault files. */
export function migrateChatProperties(properties: Record<string, unknown>): void {
	for (const [legacy, key] of Object.entries(CHAT_PROPERTIES)) {
		// Once chat_created exists, a separate created property may belong to the user.
		if (legacy === "created" && Object.prototype.hasOwnProperty.call(properties, key)) continue;
		if (!Object.prototype.hasOwnProperty.call(properties, key) && Object.prototype.hasOwnProperty.call(properties, legacy)) properties[key] = properties[legacy];
		delete properties[legacy];
	}
}
