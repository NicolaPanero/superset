import { expect, test } from "bun:test";
import { displayText, emptySnapshot, reduceMany } from "@superset/chat/core";
import { type Envelope, isDurableEnvelope } from "@superset/chat/protocol";
import { AcpAdapter } from "./acpAdapter";
import {
	type ForkCheckpointSchedule,
	ForkTextCheckpoint,
} from "./forkTextCheckpoint";
import type { AcpTransportHandlers } from "./rpcClient";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function clock() {
	const pending = new Set<() => void>();
	const delays: number[] = [];
	const schedule: ForkCheckpointSchedule = (callback, delayMs) => {
		pending.add(callback);
		delays.push(delayMs);
		return () => {
			pending.delete(callback);
		};
	};
	return {
		schedule,
		delays,
		pending,
		flush() {
			const batch = [...pending];
			pending.clear();
			for (const callback of batch) callback();
		},
	};
}

test("checkpoints the latest text once per interval and cancels completed messages", () => {
	const time = clock(),
		saved: string[] = [];
	const checkpoints = new ForkTextCheckpoint(time.schedule);
	checkpoints.track("a", 10, () => saved.push("old"));
	checkpoints.track("a", 20, () => saved.push("latest"));
	expect(time.pending.size).toBe(1);
	time.flush();
	expect(saved).toEqual(["latest"]);
	expect(time.pending.size).toBe(0);
	checkpoints.track("a", 2_000_000, () => saved.push("large"));
	expect(time.delays).toEqual([5_000, 30_000]);
	checkpoints.clear();
	time.flush();
	expect(saved).toEqual(["latest"]);
});

test("a long ACP response survives a reconnect and a provider failure without duplication or retry", async () => {
	const time = clock();
	let handlers!: AcpTransportHandlers;
	let promptId = 0,
		prompts = 0,
		seq = 0;
	const envelopes: Envelope[] = [];
	const adapter = new AcpAdapter({
		command: "fake-cursor",
		forkTextCheckpointSchedule: time.schedule,
		createTransport: (_options, target) => {
			handlers = target;
			return {
				close: async () => {},
				send: (line) => {
					const frame = JSON.parse(line);
					if (frame.method === "session/prompt") {
						promptId = frame.id;
						prompts++;
						return;
					}
					const result =
						frame.method === "initialize"
							? { protocolVersion: 1 }
							: frame.method === "session/new"
								? { sessionId: "cursor-session" }
								: {};
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
		for await (const event of adapter.start({ cwd: "/tmp" })) {
			const base = { v: 1 as const, sessionId: "public-session", ts: 1 };
			if (event.kind === "delta")
				envelopes.push({ ...base, delta: event.delta });
			else if (event.kind === "session") continue;
			else
				envelopes.push({
					...base,
					cursor: { epoch: "epoch", seq: ++seq },
					event:
						event.kind === "item"
							? { type: "item", item: event.item, turnId: event.turnId }
							: { type: "turn", turn: event.turn },
				});
		}
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
		const text = "# Risposta lunga\n\nà🚀\n".repeat(4000);
		chunk(text);
		time.flush();
		await tick();
		const checkpoint = envelopes
			.filter(isDurableEnvelope)
			.filter(
				(e) => e.event.type === "item" && e.event.item.kind === "agent_message",
			)
			.at(-1);
		expect(checkpoint).toMatchObject({
			event: { type: "item", item: { text } },
		});
		expect(
			checkpoint?.event.type === "item" && checkpoint.event.item.completedAtMs,
		).toBeUndefined();
		const durable = envelopes.filter(isDurableEnvelope);
		const reopened = reduceMany(emptySnapshot(), durable);
		const id = [...reopened.items.keys()][0];
		if (!id) throw new Error("Missing checkpoint item");
		expect(displayText(reopened, id)).toBe(text);
		const start = envelopes.length;
		chunk("\nUltima parte.");
		handlers.onLine(
			JSON.stringify({
				jsonrpc: "2.0",
				id: promptId,
				error: {
					code: -32603,
					message: "RetriableError: [unavailable] PING timed out",
				},
			}),
		);
		await tick();
		expect(displayText(reduceMany(reopened, envelopes.slice(start)), id)).toBe(
			`${text}\nUltima parte.`,
		);
		expect(
			envelopes
				.filter(isDurableEnvelope)
				.some(
					(e) => e.event.type === "turn" && e.event.turn.status === "failed",
				),
		).toBe(true);
		expect(prompts).toBe(1);
		expect(time.pending.size).toBe(0);
	} finally {
		await adapter.dispose();
		await pump;
	}
});
