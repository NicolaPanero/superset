import { msg } from "@lingui/core/macro";
import type { ChatTransport } from "@superset/chat/client";
import { i18n } from "@superset/i18n";

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
		if (
			/no longer supported for Gemini Code Assist for individuals/i.test(
				message,
			)
		)
			return {
				kind: "account" as const,
				message,
				detail: i18n._(
					msg({
						message:
							"Google closed Gemini CLI for personal accounts, including Google AI Pro and student plans. Open an Antigravity chat and sign in with the same Google account. A paid Gemini API key still works.",
					}),
				),
			};
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
		return { kind, message, detail: undefined };
	} catch {
		return null;
	}
}
