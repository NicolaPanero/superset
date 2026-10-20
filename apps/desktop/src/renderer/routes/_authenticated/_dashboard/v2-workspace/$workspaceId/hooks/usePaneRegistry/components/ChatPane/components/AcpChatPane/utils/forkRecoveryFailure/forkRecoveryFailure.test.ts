import { describe, expect, test } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { forkRecoveryFailure } from "./forkRecoveryFailure";

function source(messages: string[]) {
	return {
		getItems: async () => ({
			ok: true,
			nextBefore: null,
			envelopes: messages.map((text) => ({
				event: {
					type: "item",
					item: { kind: "notice", noticeKind: "error", text },
				},
			})),
		}),
	} as unknown as Pick<ChatTransport, "getItems">;
}
describe("failed chat resume diagnostics", () => {
	test("keeps the session/load cause when the agent exit follows it", async () => {
		const message = "session/load: Resource not found: native-session";
		expect(
			await forkRecoveryFailure(
				source([message, "acp agent exited (code 0)"]),
				"chat",
			),
		).toEqual({ kind: "missing", message, detail: undefined });
	});
	test("explains the ended Gemini sign-in instead of asking to reconnect", async () => {
		const failure = await forkRecoveryFailure(
			source([
				"authenticate: This client is no longer supported for Gemini Code Assist for individuals.",
			]),
			"chat",
		);
		expect(failure?.kind).toBe("account");
		expect(failure?.detail).toContain("Antigravity");
	});
	test("recognizes a login problem without treating an unknown error as a missing conversation", async () => {
		expect(
			(await forkRecoveryFailure(source(["Reconnect account"]), "chat"))?.kind,
		).toBe("account");
		expect(
			(await forkRecoveryFailure(source(["upstream connection reset"]), "chat"))
				?.kind,
		).toBe("other");
	});
	test("does not turn a configured credential override into a reconnect instruction", async () => {
		expect(
			(
				await forkRecoveryFailure(
					source(["account_environment_override"]),
					"chat",
				)
			)?.kind,
		).toBe("other");
	});

	test("falls back gracefully when the host cannot provide the journal", async () => {
		const transport = {
			getItems: async () => {
				throw new Error("offline");
			},
		};
		expect(await forkRecoveryFailure(transport, "chat")).toBeNull();
	});
});
