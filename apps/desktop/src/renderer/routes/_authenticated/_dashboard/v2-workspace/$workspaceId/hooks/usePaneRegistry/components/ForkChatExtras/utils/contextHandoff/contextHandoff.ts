import type { ChatTransport } from "@superset/chat/client";
import { userMessageText } from "@superset/chat/core";
import type { Cursor, Item, UserMessage } from "@superset/chat/protocol";
import {
	buildChatSessionHandoffPrompt,
	TERMINAL_HANDOFF_MAX_CHARS,
} from "@superset/shared/terminal-session-handoff";

export async function contextHandoff(
	transport: Pick<ChatTransport, "getItems">,
	sessionId: string,
	agentLabel: string,
): Promise<string> {
	const items = new Map<string, Item>();
	let before: Cursor | undefined;
	let omitted = false;
	let transcript = "";
	do {
		const page = await transport.getItems({
			sessionId,
			limit: 500,
			...(before ? { before } : {}),
		});
		if (!page.ok) throw new Error("session_unavailable");
		for (const envelope of [...page.envelopes].reverse()) {
			if (envelope.event.type !== "item") continue;
			const item = envelope.event.item;
			if (
				(item.kind === "user_message" || item.kind === "agent_message") &&
				!items.has(item.id)
			)
				items.set(item.id, item);
		}
		transcript = [...items.values()]
			.sort((a, b) => a.startedAtMs - b.startedAtMs)
			.map((item) => {
				if (item.kind === "user_message")
					return `User: ${userMessageText(item as UserMessage)}`;
				if (item.kind === "agent_message") return `${agentLabel}: ${item.text}`;
				return "";
			})
			.filter(Boolean)
			.join("\n\n");
		if (transcript.length >= TERMINAL_HANDOFF_MAX_CHARS) {
			omitted = page.nextBefore !== null;
			break;
		}
		const next = page.nextBefore;
		if (next && before && next.epoch === before.epoch && next.seq >= before.seq)
			throw new Error("invalid_history_cursor");
		before = next ?? undefined;
	} while (before);
	return buildChatSessionHandoffPrompt({
		transcript: `${omitted ? "[earlier output omitted]\n" : ""}${transcript}`,
		sourceAgentLabel: agentLabel,
	});
}
