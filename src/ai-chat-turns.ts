/** Legacy Markdown chat boundaries must be complete role headings outside code fences. */
export function parseChatTurns(body: string): { role: "user" | "assistant"; content: string }[] {
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
