import { deriveTimeline, type SessionSnapshot } from "@superset/chat/core";
import type { AgentMessage } from "@superset/chat/protocol";

export function forkMessagePoint(
	snapshot: SessionSnapshot,
	itemId: string,
): { point?: { messageId: string } } {
	const groups = deriveTimeline(snapshot);
	let earlierTurns = false;
	let previous: { messageId: string } | undefined;
	for (const group of groups) {
		const entries = group.entries.filter((entry) => entry.kind === "item");
		for (const entry of entries) {
			const item = entry.item;
			if (item.id !== itemId) continue;
			if (item.kind === "user_message") {
				if (
					entries.find((entry) => entry.item.kind === "user_message")?.item
						.id !== itemId
				)
					throw new Error("Cannot branch within a steered turn");
				if (earlierTurns && !previous)
					throw new Error("Earlier messages have no native fork point");
				return { point: previous };
			}
			if (item.kind !== "agent_message" || group.turn?.status === "running")
				throw new Error("Choose a completed message");
			const point = nativePoint(item as AgentMessage, group.turnId);
			if (!point) throw new Error("This message has no native fork point");
			return { point };
		}
		const hasMessages = entries.some(
			(entry) =>
				entry.item.kind === "user_message" ||
				entry.item.kind === "agent_message",
		);
		if (hasMessages) {
			earlierTurns = true;
			previous = undefined;
		}
		for (const entry of entries) {
			if (entry.item.kind !== "agent_message") continue;
			previous = nativePoint(entry.item as AgentMessage, group.turnId);
		}
	}
	throw new Error("The selected message is not in this session");
}

function nativePoint(
	item: AgentMessage,
	turnId: string,
): { messageId: string } | undefined {
	const prefix = `agent_message:${turnId}:`;
	const messageId =
		item.nativeMessageId ??
		(item.id.startsWith(prefix) ? item.id.slice(prefix.length) : undefined);
	return messageId ? { messageId } : undefined;
}
