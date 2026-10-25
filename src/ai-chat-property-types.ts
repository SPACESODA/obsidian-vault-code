import { CHAT_PROPERTIES } from "./ai-chat-properties";

interface PropertyTypeManager {
	_loaded?: boolean;
	getAssignedWidget(name: string): string | null;
	setType(name: string, type: "datetime"): Promise<void>;
}
function isPropertyTypeManager(value: unknown): value is PropertyTypeManager {
	return typeof value === "object" && value !== null &&
		"getAssignedWidget" in value && typeof value.getAssignedWidget === "function" &&
		"setType" in value && typeof value.setType === "function";
}

/** Use Obsidian's own persistence; never replace types.json or infer types for unrelated properties. */
export async function ensureChatPropertyTypes(app: unknown): Promise<void> {
	if (typeof app !== "object" || app === null || !("metadataTypeManager" in app)) return;
	const manager = app.metadataTypeManager;
	// This is an internal API: older versions may not expose it, or may still be loading it.
	if (!isPropertyTypeManager(manager) || manager._loaded === false) return;
	for (const name of [CHAT_PROPERTIES.last_chat, CHAT_PROPERTIES.created]) {
		if (manager.getAssignedWidget(name) !== "datetime") await manager.setType(name, "datetime");
	}
}
