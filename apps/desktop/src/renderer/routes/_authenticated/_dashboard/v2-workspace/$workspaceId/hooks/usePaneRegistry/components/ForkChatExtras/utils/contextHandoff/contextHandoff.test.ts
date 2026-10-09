import { expect, test } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import type { DurableEnvelope, Item } from "@superset/chat/protocol";
import { contextHandoff } from "./contextHandoff";

function envelope(seq: number, item: Item): DurableEnvelope {
	return {
		v: 1,
		ts: seq,
		sessionId: "runtime",
		cursor: { epoch: "epoch", seq },
		event: { type: "item", item, turnId: "turn" },
	};
}
test("explicit context reads older pages, keeps final snapshots and excludes reasoning", async () => {
	const getItems: ChatTransport["getItems"] = async (input) =>
		input.before
			? {
					ok: true,
					nextBefore: null,
					envelopes: [
						envelope(1, {
							id: "u",
							kind: "user_message",
							startedAtMs: 1,
							content: [{ type: "text", text: "First request" }],
						}),
						envelope(2, {
							id: "a",
							kind: "agent_message",
							startedAtMs: 2,
							text: "partial",
						}),
					],
				}
			: {
					ok: true,
					nextBefore: { epoch: "epoch", seq: 3 },
					envelopes: [
						envelope(3, {
							id: "a",
							kind: "agent_message",
							startedAtMs: 2,
							text: "Final reply",
						}),
						envelope(4, {
							id: "r",
							kind: "reasoning",
							startedAtMs: 3,
							text: "Hidden reasoning",
						}),
					],
				};
	const prompt = await contextHandoff({ getItems }, "runtime", "Claude");
	expect(prompt).toContain("User: First request\n\nClaude: Final reply");
	expect(prompt).not.toContain("partial");
	expect(prompt).not.toContain("Hidden reasoning");
	expect(prompt).toContain("read-only historical context");
});
test("context truncation announces omitted history and retains the latest message", async () => {
	let calls = 0;
	const getItems: ChatTransport["getItems"] = async () => {
		calls++;
		return {
			ok: true,
			nextBefore: { epoch: "epoch", seq: 1 },
			envelopes: [
				envelope(2, {
					id: "a",
					kind: "agent_message",
					startedAtMs: 1,
					text: `${"old\n".repeat(10000)}LATEST MESSAGE`,
				}),
			],
		};
	};
	const prompt = await contextHandoff({ getItems }, "runtime", "Codex");
	expect(calls).toBe(1);
	expect(prompt).toContain("earlier output omitted");
	expect(prompt).toContain("LATEST MESSAGE");
	expect(prompt.length).toBeLessThan(38000);
});
test("an invalid pagination cursor fails without looping or launching a chat", async () => {
	const getItems: ChatTransport["getItems"] = async () => ({
		ok: true,
		envelopes: [],
		nextBefore: { epoch: "epoch", seq: 2 },
	});
	await expect(
		contextHandoff({ getItems }, "runtime", "Claude"),
	).rejects.toThrow("invalid_history_cursor");
});
