import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { FakeHarness } from "../../harness/fake";
import { createTestRuntime } from "../../testing/testRuntime";

class ClosingHarness extends FakeHarness {
	constructor(private readonly close: () => Promise<void>) {
		super({ turns: [] });
	}

	async dispose(): Promise<void> {
		await this.close();
		await super.dispose();
	}
}

function createSession(runtime: ReturnType<typeof createTestRuntime>) {
	return runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: "closing-fake",
		cwd: "/tmp/workspace",
	}).sessionId;
}

test("a session remains registered until concurrent closes confirm disposal", async () => {
	const stop = Promise.withResolvers<void>();
	let calls = 0;
	const stopped: string[] = [];
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"closing-fake",
				() =>
					new ClosingHarness(() => {
						calls += 1;
						return stop.promise;
					}),
			],
		]),
		observer: {
			started: () => {},
			published: () => {},
			stopped: (sessionId) => {
				stopped.push(sessionId);
			},
		},
	});
	const sessionId = createSession(runtime);
	const first = runtime.commands.closeSession({ sessionId });
	const second = runtime.commands.closeSession({ sessionId });
	expect(runtime.live.get(sessionId)).not.toBeNull();
	expect(stopped).toEqual([]);
	stop.resolve();
	await Promise.all([first, second]);
	expect(calls).toBe(1);
	expect(runtime.live.get(sessionId)).toBeNull();
	expect(stopped).toEqual([sessionId]);
	await runtime.dispose();
});

test("failed disposal stays registered and retries cannot start a replacement writer", async () => {
	let created = 0;
	let disposed = 0;
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"closing-fake",
				() => {
					created += 1;
					return new ClosingHarness(async () => {
						disposed += 1;
						throw new Error("writer has not exited");
					});
				},
			],
		]),
	});
	const sessionId = createSession(runtime);
	const session = runtime.live.require(sessionId);
	const disposal = session.dispose();
	expect(session.dispose()).toBe(disposal);
	await expect(disposal).rejects.toThrow("writer has not exited");
	await expect(runtime.commands.closeSession({ sessionId })).rejects.toThrow(
		"writer has not exited",
	);
	await expect(runtime.commands.closeSession({ sessionId })).rejects.toThrow(
		"writer has not exited",
	);
	expect(runtime.live.get(sessionId)).toBe(session);
	expect(() =>
		runtime.live.create({
			sessionId,
			scopeId: "workspace-1",
			harness: "closing-fake",
			cwd: "/tmp/workspace",
		}),
	).toThrow("already running");
	expect(created).toBe(1);
	expect(disposed).toBe(1);
	await expect(runtime.dispose()).rejects.toThrow("writer has not exited");
});

test("scope disposal retains failed sessions and removes the ones that stopped", async () => {
	let created = 0;
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"closing-fake",
				() => {
					created += 1;
					return new ClosingHarness(
						created === 1
							? async () => {
									throw new Error("writer has not exited");
								}
							: async () => {},
					);
				},
			],
		]),
	});
	const failed = createSession(runtime);
	const closed = createSession(runtime);
	await expect(runtime.commands.closeScope("workspace-1")).rejects.toThrow(
		"writer has not exited",
	);
	expect(runtime.live.get(failed)).not.toBeNull();
	expect(runtime.live.get(closed)).toBeNull();
	await expect(
		runtime.commands.closeSession({ sessionId: failed }),
	).rejects.toThrow("writer has not exited");
	await expect(runtime.dispose()).rejects.toThrow("writer has not exited");
});
