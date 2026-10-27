type ChatTurn = { role: "user" | "assistant"; content: string };

/** Reserve marker lines while preserving literal examples, including existing escapes. */
export function escapeChatTurnMarkers(content: string): string {
	return content.replace(/^(\\*<!-- (?:user|agent) -->[\t ]*)(\r?)$/gm, (_, line: string, ending: string) => `\\${line}${ending}`);
}

/** New histories use explicit boundaries; old histories retain their heading parser. */
export function parseChatTurns(body: string): ChatTurn[] {
	const lines = body.split(/\r?\n/);
	if (!/^<!-- (?:user|agent) -->[\t ]*$/.test(lines.find(line => line.trim()) ?? "")) return parseLegacyChatTurns(body);
	const turns: ChatTurn[] = [];
	let current: { role: ChatTurn["role"]; lines: string[] } | undefined;
	const finish = () => {
		if (!current) return;
		let content = current.lines.join("\n").trim();
		const heading = current.role === "user" ? "##### You" : "##### Agent";
		if (content.split("\n", 1)[0]?.trimEnd() === heading) content = content.slice(heading.length).trim();
		content = content.replace(/^\\(\\*<!-- (?:user|agent) -->[\t ]*)$/gm, "$1");
		if (content) turns.push({ role: current.role, content });
	};
	for (const line of lines) {
		const marker = line.match(/^<!-- (user|agent) -->[\t ]*$/);
		if (marker) {
			finish();
			current = { role: marker[1] === "user" ? "user" : "assistant", lines: [] };
		} else current?.lines.push(line);
	}
	finish();
	return turns;
}

/** Legacy Markdown chat boundaries must be complete role headings outside code fences. */
function parseLegacyChatTurns(body: string): ChatTurn[] {
	const turns: { role: "user" | "assistant"; content: string }[] = [];
	let current: { role: "user" | "assistant"; lines: string[] } | undefined;
	let fence: { character: string; length: number } | undefined;
	const finish = () => {
		const content = current?.lines.join("\n").trim();
		if (current && content) turns.push({ role: current.role, content });
	};
	for (const line of body.split(/\r?\n/)) {
		const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
		if (fence) {
			current?.lines.push(line);
			if (marker && marker[1]![0] === fence.character && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
			continue;
		}
		if (marker) {
			fence = { character: marker[1]![0]!, length: marker[1]!.length };
			current?.lines.push(line);
			continue;
		}
		const heading = line.match(/^#{2,5}[ \t]+(?:(?:👤|✨|✦)[ \t]*)?(You|Agent|Assistant)[ \t]*(?:#+[ \t]*)?$/i);
		if (heading) {
			finish();
			current = { role: heading[1]!.toLowerCase() === "you" ? "user" : "assistant", lines: [] };
		} else current?.lines.push(line);
	}
	finish();
	return turns;
}
