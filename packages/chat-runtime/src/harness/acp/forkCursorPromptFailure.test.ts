import { expect, test } from "bun:test";
import type { AdapterEvent } from "../types";
import { AcpAdapter } from "./acpAdapter";
import { ForkCursorPromptFailure } from "./forkCursorPromptFailure";
import type { AcpTransportHandlers } from "./rpcClient";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const PING = "\n\nError: RetriableError: [unavailable] PING timed out";
const RESOURCE = "\n\nError: RetriableError: [resource_exhausted] Error";

test("only a terminal Cursor error frame becomes a failed prompt", () => {
	const failure = new ForkCursorPromptFailure();
	for (const chunk of [
		`Example: ${PING}`,
		`\`\`\`${PING}\n\`\`\``,
		`${PING}\nExplanation follows.`,
	]) {
		failure.capture("turn", chunk);
		expect(() => failure.assertSucceeded("turn")).not.toThrow();
	}
	failure.capture("turn", PING);
	failure.capture("turn", "This is an example error.");
	expect(() => failure.assertSucceeded("turn")).not.toThrow();
	failure.capture("old", PING);
	expect(() => failure.assertSucceeded("next")).not.toThrow();
});

test.each([
	PING,
	RESOURCE,
])("Cursor's successful ACP result cannot hide %s", async (error) => {
	let handlers!: AcpTransportHandlers,
		promptId = 0,
		prompts = 0;
	const events: AdapterEvent[] = [];
	const configOptions = [
		{
			id: "model",
			name: "Model",
			category: "model",
			type: "select",
			currentValue: "gemini-4-argon",
			options: [{ value: "gemini-4-argon", name: "Gemini 4 Argon" }],
		},
	];
	const adapter = new AcpAdapter({
		command: "fake-cursor",
		forkCursorModelSelection: true,
		createTransport: (_options, target) => {
			handlers = target;
			return {
				close: async () => {},
				send(line) {
					const frame = JSON.parse(line);
					if (frame.method === "session/prompt") {
						promptId = frame.id;
						prompts++;
						return;
					}
					const result =
						frame.method === "initialize"
							? { protocolVersion: 1 }
							: { sessionId: "cursor-session", configOptions };
					if (frame.id !== undefined)
						queueMicrotask(() =>
							handlers.onLine(
								JSON.stringify({ jsonrpc: "2.0", id: frame.id, result }),
							),
						);
				},
			};
		},
	});
	const pump = (async () => {
		for await (const event of adapter.start({ cwd: "/tmp" }))
			events.push(event);
	})();
	const chunk = (text: string) =>
		handlers.onLine(
			JSON.stringify({
				jsonrpc: "2.0",
				method: "session/update",
				params: {
					sessionId: "cursor-session",
					update: {
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text },
					},
				},
			}),
		);
	try {
		await tick();
		adapter.prompt([{ type: "text", text: "Write a long answer" }]);
		await tick();
		const prefix = "Testo già generato.\n".repeat(2000);
		chunk(prefix);
		chunk(error);
		handlers.onLine(
			JSON.stringify({
				jsonrpc: "2.0",
				id: promptId,
				result: { stopReason: "end_turn" },
			}),
		);
		await tick();
		expect(events.filter((e) => e.kind === "turn").at(-1)).toMatchObject({
			kind: "turn",
			turn: { status: "failed", error: { message: error.trimStart() } },
		});
		expect(
			events
				.filter((e) => e.kind === "item" && e.item.kind === "agent_message")
				.at(-1),
		).toMatchObject({ item: { text: prefix + error } });
		expect(
			events
				.filter((e) => e.kind === "item" && e.item.kind === "notice")
				.at(-1),
		).toMatchObject({ item: { noticeKind: "error", text: error.trimStart() } });
		expect(prompts).toBe(1);
	} finally {
		await adapter.dispose();
		await pump;
	}
});
