import type { SessionSnapshot, StoredItem } from "@superset/chat/core";
import type { Item, ToolKind, Turn } from "@superset/chat/protocol";

export type EarlierBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; text: string }
	| {
			type: "tool";
			id: string;
			name: string;
			input: string;
			output: string;
			isError: boolean;
	  };

export type EarlierMessage = {
	role: "user" | "assistant";
	timestampMs: number;
	blocks: EarlierBlock[];
};

const AGENT_MARKUP =
	/^<(external_\w+|environment_context|system-reminder|turn_aborted|user_action|permissions[^>]*|collaboration_mode|local-command-\w+|command-\w+)(\s[^>]*)?>[\s\S]*<\/\1>$/;
const IMAGE_TAG = /^<\/?image\b[^>]*>$/;

/** Text an agent injects under the user role; its own app does not show it. */
export function isAgentMarkup(text: string): boolean {
	const trimmed = text.trim();
	return AGENT_MARKUP.test(trimmed) || IMAGE_TAG.test(trimmed);
}

const TOOL_KINDS: Record<string, ToolKind> = {
	Read: "read",
	Write: "edit",
	Edit: "edit",
	MultiEdit: "edit",
	Bash: "execute",
};

/** Each user message opens a turn; what follows belongs to it until the next one. */
export function earlierHistory(
	messages: readonly EarlierMessage[],
): Pick<SessionSnapshot, "turns" | "items"> {
	const turns = new Map<string, Turn>();
	const items = new Map<string, StoredItem>();
	let turnId: string | null = null;
	let sequence = 0;
	const add = (item: Item) => {
		if (turnId) items.set(item.id, { item, turnId });
	};
	for (const message of messages) {
		if (message.role === "user" || !turnId) {
			turnId = `earlier-turn-${turns.size}`;
			turns.set(turnId, {
				id: turnId,
				status: "completed",
				startedAtMs: message.timestampMs,
				completedAtMs: message.timestampMs,
			});
		}
		for (const block of message.blocks) {
			if (
				message.role === "user" &&
				block.type === "text" &&
				isAgentMarkup(block.text)
			)
				continue;
			const id = `earlier-${sequence++}`;
			const startedAtMs = message.timestampMs;
			if (block.type === "text" && message.role === "user")
				add({
					id,
					kind: "user_message",
					startedAtMs,
					content: [{ type: "text", text: block.text }],
				});
			else if (block.type === "text")
				add({ id, kind: "agent_message", startedAtMs, text: block.text });
			else if (block.type === "thinking")
				add({ id, kind: "reasoning", startedAtMs, text: block.text });
			else
				add({
					id,
					kind: "tool_call",
					startedAtMs,
					completedAtMs: startedAtMs,
					title: block.input ? `${block.name}: ${block.input}` : block.name,
					toolKind: TOOL_KINDS[block.name] ?? "other",
					toolName: block.name,
					status: block.isError ? "failed" : "completed",
					content: block.output ? [{ type: "text", text: block.output }] : [],
					bodyOmitted: false,
				});
		}
	}
	return { turns, items };
}
