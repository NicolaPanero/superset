import { deriveQueuedPrompts, type OutboxEntry } from "@superset/chat/core";
import type { UserContent, UserMessage } from "@superset/chat/protocol";
import type { ChatSession } from "@superset/chat/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

export function useForkPromptQueue(session: ChatSession, identity: object) {
	const { pending } = useMemo(
		() => ({
			identity,
			pending: new Map<string, { queued: boolean; startedAtMs: number }>(),
		}),
		[identity],
	);
	const latest = useRef(session);
	latest.current = session;
	useEffect(() => {
		const ids = new Set(session.outbox.map((entry) => entry.clientId));
		for (const id of pending.keys()) if (!ids.has(id)) pending.delete(id);
	}, [session.outbox, pending]);

	const sendPrompt = useCallback(
		(content: UserContent[], steer?: { expectedTurnId: string }) => {
			const current = latest.current;
			const state = current.snapshot.session;
			const busy =
				state?.status === "running" ||
				state?.status === "awaiting_input" ||
				[...current.snapshot.turns.values()].some(
					(turn) => turn.status === "running",
				) ||
				[...pending.keys()].some(
					(id) =>
						current.outbox.find((entry) => entry.clientId === id)?.state !==
						"failed",
				);
			const queued = busy && !steer && state?.awaitingBackground !== true;
			const entry = current.sendPrompt(content, steer);
			pending.set(entry.clientId, { queued, startedAtMs: Date.now() });
			return entry;
		},
		[pending],
	);

	const items = session.snapshot.items;
	const outboxEntries = session.outbox;
	const presentation = useMemo(() => {
		const prompts = deriveQueuedPrompts({ items });
		const echoed = new Set(
			[...items.values()].flatMap(({ item }) =>
				item.kind === "user_message" && item.clientId ? [item.clientId] : [],
			),
		);
		const outbox: OutboxEntry[] = outboxEntries.map((entry) => {
			const intent = pending.get(entry.clientId);
			if (!intent?.queued || entry.state === "failed") return entry;
			if (!echoed.has(entry.clientId))
				prompts.push({
					id: `pending:${entry.clientId}`,
					clientId: entry.clientId,
					kind: "user_message",
					queued: true,
					forkPending: true,
					startedAtMs: intent.startedAtMs,
					content: entry.content,
				} satisfies UserMessage);
			return { ...entry, forkQueued: true };
		});
		return { prompts, outbox };
	}, [items, outboxEntries, pending]);
	return { sendPrompt, ...presentation };
}
