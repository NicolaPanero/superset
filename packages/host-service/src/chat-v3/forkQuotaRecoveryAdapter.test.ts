import { expect, test } from "bun:test";
import type { UserContent } from "@superset/chat/protocol";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "@superset/chat-runtime";
import { createAcpAdapter, EventQueue } from "@superset/chat-runtime";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
import type { UsageAccount } from "../trpc/router/usage/types";
import {
	ForkQuotaRecoveryAdapter,
	type RecoveryDependencies,
} from "./forkQuotaRecoveryAdapter";
import {
	isClaudeQuotaFailure,
	suggestedRecoveryAccount,
} from "./forkQuotaRecoveryPolicy";
import type {
	RecoverySettings,
	RecoveryStatus,
} from "./forkQuotaRecoveryStore";

const NOW = 1_800_000_000_000;
function quota(
	selection: string | null,
	used: number,
	patch: Partial<UsageAccount> = {},
): UsageAccount {
	return {
		agent: "claude",
		selection,
		credentialKind: "subscription",
		accountKey: selection ?? "standard",
		sourceLabel: selection ?? "standard",
		email: `${selection ?? "standard"}@example.test`,
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent: used,
				resetsAt: new Date(NOW + 300_000),
			},
		],
		creditsBalance: null,
		extraUsage: null,
		isDefault: false,
		fetchedAt: new Date(NOW),
		...patch,
	};
}
class Worker implements HarnessAdapter {
	queue = new EventQueue();
	starts: HarnessStartOptions[] = [];
	prompts: UserContent[][] = [];
	disposed = false;
	start(options: HarnessStartOptions) {
		this.starts.push(options);
		if (options.resume)
			this.queue.push({
				kind: "item",
				turnId: "replay",
				item: {
					id: "old",
					kind: "agent_message",
					text: "old history",
					startedAtMs: NOW,
				},
			});
		this.queue.push({
			kind: "session",
			session: {
				status: "idle",
				harnessSessionId: "native-id",
				modelId: options.modelId,
			},
		});
		return this.queue.iterable();
	}
	prompt(content: UserContent[]) {
		this.prompts.push(content);
		this.queue.push({
			kind: "turn",
			turn: {
				id: `turn-${this.prompts.length}`,
				status: "running",
				startedAtMs: NOW,
			},
		});
	}
	fail(
		message = "session/prompt: Internal error: You've hit your limit · resets 5pm",
	) {
		this.queue.push({
			kind: "turn",
			turn: {
				id: "turn-1",
				status: "failed",
				error: { message },
				startedAtMs: NOW,
				completedAtMs: NOW + 1,
			},
		});
		this.queue.push({ kind: "session", session: { status: "idle" } });
	}
	finish() {
		this.queue.push({
			kind: "turn",
			turn: {
				id: "turn-1",
				status: "completed",
				startedAtMs: NOW,
				completedAtMs: NOW + 2,
			},
		});
		this.queue.push({ kind: "session", session: { status: "idle" } });
	}
	cancelTurn() {}
	respondToApproval() {}
	setMode() {}
	async dispose() {
		this.disposed = true;
		this.queue.close();
	}
}
async function until(predicate: () => boolean) {
	for (let i = 0; i < 200; i++) {
		if (predicate()) return;
		await Promise.resolve();
	}
	throw new Error("condition not reached");
}
function fixture(
	prefs: RecoverySettings = { switchAccounts: true, resumeAtReset: false },
	extra: Partial<RecoveryDependencies> = {},
) {
	const workers: Worker[] = [],
		events: AdapterEvent[] = [],
		statuses: RecoveryStatus[] = [],
		moves: (string | null)[] = [],
		selected: (string | null)[] = [];
	let account: SessionAccount = {
		agent: "claude",
		selection: null,
		credentialKind: "subscription",
		identity: "identity",
		email: "standard@example.test",
	};
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			create: (selection) => {
				account = {
					...account,
					selection: selection ?? null,
					email: `${selection ?? "standard"}@example.test`,
				};
				const worker = new Worker();
				workers.push(worker);
				return worker;
			},
			settings: () => prefs,
			account: () => account,
			quota: async () => [quota(null, 100), quota("/a", 80), quota("/b", 15)],
			move: async (_id, target) => {
				moves.push(target);
			},
			selected: (target) => selected.push(target),
			status: (status) => statuses.push(status),
			now: () => NOW,
			...extra,
		},
		null,
	);
	const stream = adapter.start({
		cwd: "/tmp/repo",
		modelId: "sonnet",
		modeId: "plan",
	});
	const pump = (async () => {
		for await (const event of stream) events.push(event);
	})();
	return {
		adapter,
		workers,
		events,
		statuses,
		moves,
		selected,
		prefs,
		worker: (index: number) => {
			const worker = workers[index];
			if (!worker) throw new Error("missing worker");
			return worker;
		},
		close: async () => {
			await adapter.dispose();
			await pump;
		},
	};
}
test("quota failure classification rejects transport, login, 429 and model prose", () => {
	expect(isClaudeQuotaFailure("session/prompt: You've hit your limit")).toBe(
		true,
	);
	for (const message of [
		"session/prompt: HTTP 429 rate_limit_error",
		"Please run /login",
		"Example: You've hit your limit",
		"connection lost",
		"context window full",
	])
		expect(isClaudeQuotaFailure(message)).toBe(false);
});
test("official ACP runtime preserves Claude JSON-RPC quota errors for recovery", async () => {
	const events: AdapterEvent[] = [];
	const adapter = createAcpAdapter({
		command: "fake-claude-acp",
		createTransport: (_options, handlers) => ({
			close: async () => undefined,
			send: (line) => {
				const frame = JSON.parse(line) as { id?: number; method?: string };
				if (frame.id === undefined || !frame.method) return;
				queueMicrotask(() =>
					handlers.onLine(
						JSON.stringify({
							jsonrpc: "2.0",
							id: frame.id,
							...(frame.method === "session/prompt"
								? {
										error: {
											code: -32603,
											message:
												"Internal error: You've hit your limit · resets 5pm",
										},
									}
								: {
										result:
											frame.method === "initialize"
												? { protocolVersion: 1, agentCapabilities: {} }
												: frame.method === "session/new"
													? { sessionId: "native-id" }
													: null,
									}),
						}),
					),
				);
			},
		}),
	});
	const pump = (async () => {
		for await (const e of adapter.start({ cwd: "/tmp" })) events.push(e);
	})();
	try {
		await until(() =>
			events.some((e) => e.kind === "session" && e.session.status === "idle"),
		);
		adapter.prompt([{ type: "text", text: "test" }]);
		await until(() =>
			events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		const failure = events.find(
			(e) => e.kind === "turn" && e.turn.status === "failed",
		);
		expect(failure?.kind === "turn" && failure.turn.error?.message).toBe(
			"session/prompt: Internal error: You've hit your limit · resets 5pm",
		);
		expect(
			failure?.kind === "turn" &&
				isClaudeQuotaFailure(failure.turn.error?.message ?? ""),
		).toBe(true);
	} finally {
		await adapter.dispose();
		await pump;
	}
});
test("suggested account excludes API, stale, duplicate logins, model exhaustion and blocked profiles", () => {
	const rows = [
		quota(null, 100),
		quota("/a", 10, { email: "standard@example.test" }),
		quota("/api", 0, { credentialKind: "api_key" }),
		quota("/old", 0, { fetchedAt: new Date(NOW - 360_000) }),
		quota("/sonnet", 1, {
			windows: [
				{ id: "five_hour", label: "Session", usedPercent: 1, resetsAt: null },
				{
					id: "seven_day_sonnet",
					label: "Sonnet",
					usedPercent: 100,
					resetsAt: null,
				},
			],
		}),
		quota("/blocked", 5),
		quota("/ok", 35),
	];
	expect(
		suggestedRecoveryAccount(
			rows,
			null,
			"sonnet",
			new Map([["/blocked", NOW + 1]]),
			NOW,
		)?.selection,
	).toBe("/ok");
});
test("switches once to the best verified quota, resumes strictly and preserves turn, model and history", async () => {
	const f = fixture();
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "original task" }]);
		await until(() => f.events.some((e) => e.kind === "turn"));
		f.worker(0).fail();
		await until(() => f.workers[1]?.prompts.length === 1);
		expect(f.moves).toEqual(["/b"]);
		expect(f.selected).toEqual(["/b"]);
		expect(f.worker(1).starts[0]).toMatchObject({
			resume: { harnessSessionId: "native-id" },
			strictResume: true,
			modelId: "sonnet",
			modeId: "plan",
		});
		expect(f.worker(1).prompts[0]).not.toEqual([
			{ type: "text", text: "original task" },
		]);
		expect(f.events.some((e) => e.kind === "item" && e.item.id === "old")).toBe(
			false,
		);
		expect(
			f.events
				.filter((e) => e.kind === "turn")
				.every((e) => e.kind === "turn" && e.turn.id === "turn-1"),
		).toBe(true);
		f.worker(1).finish();
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "completed"),
		);
	} finally {
		await f.close();
	}
});
test("no continuation with options off, an API source, or an ordinary rate limit", async () => {
	for (const mode of ["off", "api", "429"]) {
		const f = fixture(
			{ switchAccounts: mode !== "off", resumeAtReset: false },
			mode === "api"
				? {
						account: () => ({
							agent: "claude",
							selection: null,
							credentialKind: "api_key",
							identity: "api-env",
						}),
					}
				: {},
		);
		try {
			await until(() => f.events.length > 0);
			f.adapter.prompt([{ type: "text", text: "task" }]);
			f.worker(0).fail(
				mode === "429"
					? "session/prompt: HTTP 429 rate_limit_error"
					: undefined,
			);
			await until(() =>
				f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
			);
			expect(f.workers).toHaveLength(1);
		} finally {
			await f.close();
		}
	}
});
test("independent reset wait uses new verified quota and respects Retry-After", async () => {
	let time = NOW,
		calls = 0;
	const waits: number[] = [];
	const f = fixture(
		{ switchAccounts: false, resumeAtReset: true },
		{
			now: () => time,
			quota: async () => {
				calls++;
				return [
					quota(null, calls === 1 ? 100 : 10, {
						fetchedAt: new Date(time),
						retryAt: new Date(NOW + 600_000),
						windows: [
							{
								id: "five_hour",
								label: "Session",
								usedPercent: calls === 1 ? 100 : 10,
								resetsAt: new Date(time + 300_000),
							},
						],
					}),
				];
			},
			wait: async (ms) => {
				waits.push(ms);
				time += ms;
			},
		},
	);
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() => f.workers[1]?.prompts.length === 1);
		expect(waits).toEqual([600_000]);
		expect(f.moves).toEqual([]);
		expect(f.selected).toEqual([null]);
	} finally {
		await f.close();
	}
});
test("Stop cancels a pending wait without sending any continuation", async () => {
	const f = fixture(
		{ switchAccounts: false, resumeAtReset: true },
		{
			quota: async () => [quota(null, 100)],
			wait: async (_ms, signal) => {
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			},
		},
	);
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() => f.statuses.some((s) => s.phase === "waiting"));
		f.adapter.cancelTurn();
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.workers).toHaveLength(1);
		expect(f.worker(0).prompts).toHaveLength(1);
	} finally {
		await f.close();
	}
});
test("disabled options stop the wait, and disposal cancels without a late prompt", async () => {
	for (const action of ["disable", "dispose"]) {
		const f = fixture(
			{ switchAccounts: false, resumeAtReset: true },
			{
				quota: async () => [quota(null, 100)],
				wait: async (_ms, signal) => {
					await new Promise<void>((resolve) =>
						signal.addEventListener("abort", () => resolve(), { once: true }),
					);
				},
			},
		);
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() => f.statuses.some((s) => s.phase === "waiting"));
		if (action === "disable") {
			f.prefs.resumeAtReset = false;
			f.adapter.changed();
			await until(() =>
				f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
			);
		}
		await f.close();
		expect(f.workers).toHaveLength(1);
	}
});
test("all exhausted accounts stay put without an opt-in reset wait", async () => {
	const f = fixture(undefined, {
		quota: async () => [quota(null, 100), quota("/a", 100)],
	});
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.moves).toEqual([]);
	} finally {
		await f.close();
	}
});

test("failed transcript copy restores the original worker without sending a continuation", async () => {
	const f = fixture(undefined, {
		move: async () => {
			throw new Error("session_not_found");
		},
	});
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(
			() =>
				f.workers.length === 2 &&
				f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.selected).toEqual([]);
		expect(f.worker(1).prompts).toEqual([]);
		expect(f.worker(1).starts[0]?.strictResume).toBe(true);
	} finally {
		await f.close();
	}
});
test("repeated quota hits never cycle back through blocked logins", async () => {
	const f = fixture();
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() => f.workers[1]?.prompts.length === 1);
		f.worker(1).fail();
		await until(() => f.workers[2]?.prompts.length === 1);
		f.worker(2).fail();
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.moves).toEqual(["/b", "/a"]);
		expect(f.workers).toHaveLength(3);
	} finally {
		await f.close();
	}
});
test("live background tools prevent automatic worker replacement", async () => {
	const f = fixture();
	try {
		await until(() => f.events.length > 0);
		f.worker(0).queue.push({
			kind: "session",
			session: {
				backgroundTasks: [
					{
						id: "task",
						kind: "process",
						name: "server",
						startedAtMs: NOW,
						canStop: true,
					},
				],
			},
		});
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.workers).toHaveLength(1);
	} finally {
		await f.close();
	}
});

test("model changes cancel a pending continuation", async () => {
	const f = fixture(
		{ switchAccounts: false, resumeAtReset: true },
		{
			quota: async () => [quota(null, 100)],
			wait: async (_ms, signal) => {
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			},
		},
	);
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		f.worker(0).fail();
		await until(() => f.statuses.some((s) => s.phase === "waiting"));
		f.adapter.setConfigOption("model", "opus");
		await until(() =>
			f.events.some((e) => e.kind === "turn" && e.turn.status === "failed"),
		);
		expect(f.workers).toHaveLength(1);
	} finally {
		await f.close();
	}
});

test("the live runtime keeps queued prompts behind the continued turn", async () => {
	const { createTestRuntime } = await import(
		"../../../chat-runtime/src/testing/testRuntime"
	);
	const { randomUUID } = await import("node:crypto");
	const workers: Worker[] = [];
	let account: SessionAccount = {
		agent: "claude",
		selection: null,
		credentialKind: "subscription",
		identity: "identity",
	};
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			create: (selection) => {
				account = {
					...account,
					selection: selection ?? null,
					email: `${selection ?? "standard"}@example.test`,
				};
				const worker = new Worker();
				workers.push(worker);
				return worker;
			},
			settings: () => ({ switchAccounts: true, resumeAtReset: false }),
			account: () => account,
			quota: async () => [quota(null, 100), quota("/b", 10)],
			move: async () => {},
			selected: () => {},
			status: () => {},
			now: () => NOW,
		},
		null,
	);
	const runtime = createTestRuntime({
		harnesses: new Map([["claude-acp", () => adapter]]),
	});
	try {
		const { sessionId } = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace",
			harness: "claude-acp",
			cwd: "/tmp/repo",
		});
		await until(() => runtime.live.get(sessionId)?.state.status === "idle");
		const send = (text: string) =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: text,
				content: [{ type: "text", text }],
			});
		send("original");
		await until(() => runtime.live.get(sessionId)?.turn?.status === "running");
		expect(send("next task").queued).toBe(true);
		const first = workers[0];
		if (!first) throw new Error("worker missing");
		first.fail();
		await until(() => workers[1]?.prompts.length === 1);
		expect(runtime.live.get(sessionId)?.queuedCount).toBe(1);
		const second = workers[1];
		if (!second) throw new Error("worker missing");
		second.finish();
		await until(() => second.prompts.length === 2);
		expect(second.prompts[1]).toEqual([{ type: "text", text: "next task" }]);
	} finally {
		await runtime.dispose();
	}
});

test("a login that becomes API-billed during launch receives no automatic prompt", async () => {
	let workerCount = 0;
	const workers: Worker[] = [];
	const f = fixture(undefined, {
		create: () => {
			workerCount++;
			const worker = new Worker();
			workers.push(worker);
			return worker;
		},
		account: () => ({
			agent: "claude",
			selection: workerCount === 1 ? null : "/b",
			credentialKind: workerCount === 1 ? "subscription" : "api_key",
			identity: "identity",
			email: workerCount === 1 ? "standard@example.test" : "/b@example.test",
		}),
	});
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		workers[0]?.fail();
		await until(() =>
			f.events.some((e) => e.kind === "session" && e.session.status === "dead"),
		);
		expect(workers[1]?.prompts).toEqual([]);
		expect(f.selected).toEqual([]);
	} finally {
		await f.close();
	}
});

test("Stop during a replacement worker bootstrap prevents a delayed automatic prompt", async () => {
	const workers: Worker[] = [];
	class SlowWorker extends Worker {
		start(options: HarnessStartOptions) {
			this.starts.push(options);
			return this.queue.iterable();
		}
	}
	const f = fixture(undefined, {
		create: () => {
			const worker = workers.length ? new SlowWorker() : new Worker();
			workers.push(worker);
			return worker;
		},
		account: () => ({
			agent: "claude",
			selection: workers.length === 1 ? null : "/b",
			credentialKind: "subscription",
			identity: "identity",
			email: workers.length === 1 ? "standard@example.test" : "/b@example.test",
		}),
	});
	try {
		await until(() => f.events.length > 0);
		f.adapter.prompt([{ type: "text", text: "task" }]);
		workers[0]?.fail();
		await until(() => workers.length === 2);
		f.adapter.cancelTurn();
		workers[1]?.queue.push({
			kind: "session",
			session: { status: "idle", harnessSessionId: "native-id" },
		});
		await until(() =>
			f.events.some(
				(e) => e.kind === "turn" && e.turn.status === "interrupted",
			),
		);
		expect(workers[1]?.prompts).toEqual([]);
	} finally {
		await f.close();
	}
});
