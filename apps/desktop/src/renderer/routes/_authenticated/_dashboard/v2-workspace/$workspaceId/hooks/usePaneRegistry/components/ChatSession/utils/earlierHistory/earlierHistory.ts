import type { SessionSnapshot, StoredItem } from "@superset/chat/core";
import type { Item, ToolKind, Turn } from "@superset/chat/protocol";

export type EarlierImage = { mediaType: string; data?: string | undefined };

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
	  }
	| {
			type: "image";
			mediaType: string;
			data?: string | undefined;
			omitted?: boolean | undefined;
	  };

export type EarlierMessage = {
	/** Position in the source chat; pages of the same chat never share one. */
	index?: number | undefined;
	role: "user" | "assistant";
	timestampMs: number;
	blocks: EarlierBlock[];
};

/** Images of an earlier user turn, carried inline because no file backs them. */
export type EarlierUserMessage = Extract<Item, { kind: "user_message" }> & {
	earlierImages?: EarlierImage[];
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
	const add = (item: Item) => {
		if (turnId) items.set(item.id, { item, turnId });
	};
	for (const [position, message] of messages.entries()) {
		const key = message.index ?? position;
		if (message.role === "user" || !turnId) {
			turnId = `earlier-turn-${key}`;
			turns.set(turnId, {
				id: turnId,
				status: "completed",
				startedAtMs: message.timestampMs,
				completedAtMs: message.timestampMs,
			});
		}
		const startedAtMs = message.timestampMs;
		if (message.role === "user") {
			const text = message.blocks
				.flatMap((block) =>
					block.type === "text" && !isAgentMarkup(block.text)
						? [block.text]
						: [],
				)
				.join("\n\n");
			const images = message.blocks.flatMap((block) =>
				block.type === "image"
					? [{ mediaType: block.mediaType, data: block.data }]
					: [],
			);
			if (text || images.length > 0) {
				const item: EarlierUserMessage = {
					id: `earlier-${key}-prompt`,
					kind: "user_message",
					startedAtMs,
					content: text ? [{ type: "text", text }] : [],
					...(images.length > 0 ? { earlierImages: images } : {}),
				};
				add(item);
			}
		}
		for (const [n, block] of message.blocks.entries()) {
			const id = `earlier-${key}-${n}`;
			if (message.role === "user" && block.type !== "tool") continue;
			if (block.type === "text")
				add({ id, kind: "agent_message", startedAtMs, text: block.text });
			else if (block.type === "thinking")
				add({ id, kind: "reasoning", startedAtMs, text: block.text });
			else if (block.type === "tool")
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
