import type { ChatTransport } from "@superset/chat/client";

export async function forkRecoveryFailure(
	transport: Pick<ChatTransport, "getItems">,
	sessionId: string,
) {
	try {
		const page = await transport.getItems({ sessionId, limit: 20 });
		if (!page.ok) return null;
		const errors = page.envelopes.flatMap(({ event }) =>
			event.type === "item" &&
			event.item.kind === "notice" &&
			event.item.noticeKind === "error" &&
			typeof event.item.text === "string"
				? [event.item.text.trim().slice(0, 1000)]
				: [],
		);
		const message =
			errors.findLast((text) => !/^acp agent exited/i.test(text)) ??
			errors.at(-1);
		if (!message) return null;
		const kind =
			/Reconnect account|account_selection_unavailable|source_account_unverified|not authenticated|authentication required|run the agent's login/i.test(
				message,
			)
				? "account"
				: /Resource not found|No conversation found with session ID|session_not_found/i.test(
							message,
						)
					? "missing"
					: "other";
		return { kind, message };
	} catch {
		return null;
	}
}
