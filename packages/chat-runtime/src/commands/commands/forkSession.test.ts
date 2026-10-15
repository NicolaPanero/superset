import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { FakeHarness } from "../../harness/fake";
import type { HarnessFactoryOptions } from "../../sessions";
import { createTestRuntime } from "../../testing/testRuntime";
import { waitFor } from "../../testing/testUtils";

test("point forks keep launch credentials, deduplicate retries and preserve the original journal", async () => {
	const launches: HarnessFactoryOptions[] = [];
	const points: unknown[] = [];
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"fake",
				(options) => {
					launches.push(options);
					return Object.assign(
						new FakeHarness({
							start: [
								{
									kind: "session",
									session: { status: "idle", forkAtMessage: true },
								},
							],
							turns: [],
						}),
						{
							forkOptions: () => ({
								accountSelection: "account-after-recovery",
							}),
							fork: async (point: unknown) => {
								points.push(point);
								return "native-fork";
							},
						},
					);
				},
			],
		]),
	});
	try {
		const source = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "ws",
			harness: "fake",
			cwd: "/project",
			modeId: "saved-mode",
			modelId: "saved-model",
			agentConfigId: "configured",
			accountSelection: "account-2",
			terminalId: "terminal",
		});
		await waitFor(
			() => runtime.live.require(source.sessionId).state.status === "idle",
		);
		runtime.journal.append(source.sessionId, {
			type: "item",
			turnId: "t1",
			item: {
				id: "u1",
				kind: "user_message",
				startedAtMs: 1,
				content: [{ type: "text", text: "first" }],
			},
		});
		runtime.journal.append(source.sessionId, {
			type: "item",
			turnId: "t1",
			item: {
				id: "a1",
				kind: "agent_message",
				nativeMessageId: "native-1",
				startedAtMs: 2,
				text: "reply",
			},
		});
		runtime.journal.append(source.sessionId, {
			type: "item",
			turnId: "t2",
			item: {
				id: "u2",
				kind: "user_message",
				startedAtMs: 3,
				content: [{ type: "text", text: "second" }],
			},
		});
		const command = {
			commandId: randomUUID(),
			sessionId: source.sessionId,
			cwd: "/project",
			fromItemId: "u2",
		};
		const [first, retry] = await Promise.all([
			runtime.commands.forkSession(command),
			runtime.commands.forkSession(command),
		]);
		expect(first).toEqual(retry);
		expect(points).toEqual([{ messageId: "native-1" }]);
		expect(launches.at(-1)).toMatchObject({
			agentConfigId: "configured",
			accountSelection: "account-after-recovery",
			terminalId: "terminal",
			modeId: "saved-mode",
			modelId: "saved-model",
			strictResume: true,
			resume: { harnessSessionId: "native-fork" },
		});
		expect(
			runtime.commands.getOutline({ sessionId: source.sessionId }).ok,
		).toBe(true);
		expect(runtime.live.get(source.sessionId)).not.toBeNull();
		const fresh = await runtime.commands.forkSession({
			...command,
			commandId: randomUUID(),
			fromItemId: "u1",
		});
		expect(fresh?.sessionId).not.toBe(first?.sessionId);
		expect(launches.at(-1)?.resume).toBeUndefined();
		expect(points).toHaveLength(1);
		await runtime.commands.closeSession({ sessionId: source.sessionId });
		expect(await runtime.commands.forkSession(command)).toEqual(first);
	} finally {
		await runtime.dispose();
	}
});

test("an unsupported agent declines point forks without invoking its whole-session fork", async () => {
	let called = false;
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"fake",
				() =>
					Object.assign(
						new FakeHarness({
							start: [{ kind: "session", session: { status: "idle" } }],
							turns: [],
						}),
						{
							fork: async () => {
								called = true;
								return "whole";
							},
						},
					),
			],
		]),
	});
	try {
		const source = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "ws",
			harness: "fake",
			cwd: "/project",
		});
		await waitFor(
			() => runtime.live.require(source.sessionId).state.status === "idle",
		);
		expect(
			await runtime.commands.forkSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
				cwd: "/project",
				fromItemId: "u1",
			}),
		).toBeNull();
		expect(called).toBe(false);
	} finally {
		await runtime.dispose();
	}
});

test("a running agent cannot be rewound while it is changing the session", async () => {
	let called = false;
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"fake",
				() =>
					Object.assign(
						new FakeHarness({
							start: [
								{
									kind: "session",
									session: { status: "running", forkAtMessage: true },
								},
							],
							turns: [],
						}),
						{
							fork: async () => {
								called = true;
								return "whole";
							},
						},
					),
			],
		]),
	});
	try {
		const source = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "ws",
			harness: "fake",
			cwd: "/project",
		});
		await waitFor(
			() => runtime.live.require(source.sessionId).state.status === "running",
		);
		await expect(
			runtime.commands.forkSession({
				commandId: randomUUID(),
				sessionId: source.sessionId,
				cwd: "/project",
				fromItemId: "u1",
			}),
		).rejects.toThrow("Wait for the agent");
		expect(called).toBe(false);
	} finally {
		await runtime.dispose();
	}
});
