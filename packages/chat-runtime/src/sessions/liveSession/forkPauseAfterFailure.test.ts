import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestRuntime } from "../../testing/testRuntime";
import { fakeHarnessRegistry } from "../../testing/testUtils";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("provider failures preserve queued prompts until the user resumes the queue", async () => {
	const { harnesses } = fakeHarnessRegistry({
		turns: [
			[
				{ kind: "turn", turn: { id: "t1", status: "running", startedAtMs: 1 } },
				{
					kind: "turn",
					turn: {
						id: "t1",
						status: "failed",
						startedAtMs: 1,
						error: {
							message: "Error: RetriableError: [resource_exhausted] Error",
						},
					},
				},
				{ kind: "session", session: { status: "idle" } },
			],
			[
				{ kind: "turn", turn: { id: "t2", status: "running", startedAtMs: 2 } },
				{
					kind: "turn",
					turn: { id: "t2", status: "completed", startedAtMs: 2 },
				},
				{ kind: "session", session: { status: "idle" } },
			],
		],
	});
	const runtime = createTestRuntime({ harnesses });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace",
		harness: "fake",
		cwd: "/tmp",
	});
	const send = (text: string) =>
		runtime.commands.prompt({
			sessionId,
			commandId: randomUUID(),
			clientId: randomUUID(),
			content: [{ type: "text", text }],
		});
	try {
		send("first");
		expect(send("next").queued).toBe(true);
		await tick();
		const live = runtime.live.require(sessionId);
		expect(live.turn?.status).toBe("failed");
		expect(live.queueState).toMatchObject({
			paused: true,
			prompts: [{ content: [{ type: "text", text: "next" }] }],
		});
		live.resumeQueue();
		await tick();
		expect(live.turn?.id).toBe("t2");
		expect(live.queuedCount).toBe(0);
	} finally {
		await runtime.dispose();
	}
});
