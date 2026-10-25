import { expect, test } from "bun:test";
import type { ChatTransport } from "@superset/chat/client";
import { structuredContextHandoff } from "./structuredContextHandoff";

const journal: Pick<ChatTransport, "getItems"> = {
	getItems: async () => ({
		ok: true,
		nextBefore: null,
		envelopes: [
			{
				v: 1,
				ts: 1,
				sessionId: "runtime",
				cursor: { epoch: "epoch", seq: 1 },
				event: {
					type: "item",
					turnId: "turn",
					item: {
						id: "u",
						kind: "user_message",
						startedAtMs: 1,
						content: [{ type: "text", text: "Journal request" }],
					},
				},
			},
		],
	}),
};

test("uses the host selection and reports its counts", async () => {
	const result = await structuredContextHandoff({
		transport: journal,
		chatSessionId: "runtime",
		agentLabel: "Claude",
		structured: async () => ({
			prompt: "host prompt",
			included: 12,
			omitted: 30,
			omittedUnknown: false,
		}),
	});
	expect(result).toEqual({
		prompt: "host prompt",
		coverage: { kind: "counted", included: 12, omitted: 30, atLeast: false },
	});
});

test("a whole session needs no notice", async () => {
	const result = await structuredContextHandoff({
		transport: journal,
		chatSessionId: "runtime",
		agentLabel: "Claude",
		structured: async () => ({
			prompt: "host prompt",
			included: 4,
			omitted: 0,
			omittedUnknown: false,
		}),
	});
	expect(result.coverage).toEqual({ kind: "complete" });
});

test("falls back to the chat journal when the host cannot read the session", async () => {
	const result = await structuredContextHandoff({
		transport: journal,
		chatSessionId: "runtime",
		agentLabel: "Claude",
		structured: async () => {
			throw new Error("helper_unavailable");
		},
	});
	expect(result.prompt).toContain("User: Journal request");
	expect(result.coverage).toEqual({ kind: "complete" });
});
