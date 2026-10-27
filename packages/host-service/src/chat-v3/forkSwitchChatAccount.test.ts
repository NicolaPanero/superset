import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { UserContent } from "@superset/chat/protocol";
import {
	EventQueue,
	type HarnessAdapter,
	type HarnessFactoryOptions,
	type HarnessStartOptions,
} from "@superset/chat-runtime";
import { createTestRuntime } from "@superset/chat-runtime/testing";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import { readRecovery, writeRecovery } from "./forkQuotaRecoveryStore";
import { forkSwitchChatAccount } from "./forkSwitchChatAccount";

const text = (value: string): UserContent[] => [{ type: "text", text: value }];
const flush = async () => {
	for (let index = 0; index < 30; index++) await Promise.resolve();
};
type Bootstrap = "ready" | "dead" | "held" | "mismatch";

class Worker implements HarnessAdapter {
	readonly queue = new EventQueue();
	readonly prompts: UserContent[][] = [];
	private turnId?: string;
	constructor(
		readonly options: HarnessFactoryOptions,
		private readonly trace: string[],
		private readonly nativeId: string,
		private readonly bootstrap: Bootstrap,
	) {}
	start(_options: HarnessStartOptions) {
		if (this.bootstrap === "held") return this.queue.iterable();
		this.queue.push({
			kind: "session",
			session: {
				status: this.bootstrap === "dead" ? "dead" : "idle",
				harnessSessionId:
					this.bootstrap === "mismatch" ? randomUUID() : this.nativeId,
				modelId: "sonnet",
				modeId: "plan",
			},
		});
		return this.queue.iterable();
	}
	prompt(content: UserContent[]) {
		this.prompts.push(content);
		this.turnId = randomUUID();
		this.queue.push({
			kind: "turn",
			turn: { id: this.turnId, status: "running", startedAtMs: 1 },
		});
		this.queue.push({ kind: "session", session: { status: "running" } });
	}
	cancelTurn() {
		this.trace.push("cancel");
		if (this.turnId)
			this.queue.push({
				kind: "turn",
				turn: {
					id: this.turnId,
					status: "interrupted",
					startedAtMs: 1,
					completedAtMs: 2,
				},
			});
		this.queue.push({ kind: "session", session: { status: "idle" } });
	}
	quotaFailure() {
		if (!this.turnId) throw new Error("missing_turn");
		this.queue.push({
			kind: "turn",
			turn: {
				id: this.turnId,
				status: "failed",
				startedAtMs: 1,
				error: { message: "You've hit your limit" },
			},
		});
	}
	respondToApproval() {}
	setMode() {}
	async dispose() {
		this.trace.push("close");
		this.queue.close();
	}
}

async function fixture(queued = true) {
	const trace: string[] = [];
	const workers: Worker[] = [];
	const nativeId = randomUUID();
	const bootstrap = {
		target: "ready" as Bootstrap,
		recovery: "ready" as Bootstrap,
	};
	const runtime = createTestRuntime({
		harnesses: new Map([
			[
				"claude-acp",
				(options: HarnessFactoryOptions) => {
					trace.push(`create:${options.accountSelection}`);
					const state =
						options.accountSelection === "/target"
							? bootstrap.target
							: workers.length > 0
								? bootstrap.recovery
								: "ready";
					const worker = new Worker(options, trace, nativeId, state);
					workers.push(worker);
					return worker;
				},
			],
		]),
	});
	const created = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace",
		terminalId: "terminal",
		harness: "claude-acp",
		cwd: "/tmp/project",
		accountSelection: "/source",
		agentConfigId: "custom-claude",
	});
	await flush();
	const prompt = (value: string) =>
		runtime.commands.prompt({
			commandId: randomUUID(),
			sessionId: created.sessionId,
			clientId: randomUUID(),
			content: text(value),
		});
	prompt("active task");
	await flush();
	if (queued) prompt("queued task");
	const input = {
		workspaceId: "workspace",
		terminalId: "terminal",
		chatSessionId: created.sessionId,
		sessionId: nativeId,
		targetSelection: "/target",
	};
	const sqlite = new Database(":memory:");
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	writeRecovery(db, input.workspaceId, input.terminalId, {
		switchAccounts: false,
		resumeAtReset: false,
		hasSelection: true,
	});
	let time = 0;
	const deps = {
		validateTarget: async () => {
			trace.push("validate");
		},
		move: async () => {
			trace.push("move");
			return { moved: true };
		},
		clearRecovery: () =>
			writeRecovery(db, input.workspaceId, input.terminalId, {
				hasSelection: false,
				accountSelection: null,
			}),
		graceMs: 0,
		readinessMs: 100,
		now: () => time,
		wait: async (ms: number) => {
			time += ms;
			await flush();
		},
	};
	trace.length = 0;
	return { runtime, input, deps, trace, workers, db, sqlite, bootstrap };
}

test("manual account switch stops the source before moving and keeps queued messages paused", async () => {
	const f = await fixture();
	try {
		const result = await forkSwitchChatAccount(f.runtime, f.input, f.deps);
		await flush();
		expect(result.switched).toBe(true);
		expect(f.trace).toEqual([
			"validate",
			"cancel",
			"close",
			"move",
			"create:/target",
		]);
		expect(f.workers[1]?.options).toMatchObject({
			accountSelection: "/target",
			agentConfigId: "custom-claude",
			modelId: "sonnet",
			modeId: "plan",
			strictResume: true,
			resume: { harnessSessionId: f.input.sessionId },
		});
		expect(
			f.runtime.commands.getQueue({ sessionId: result.sessionId }),
		).toMatchObject({
			live: true,
			paused: true,
			prompts: [{ content: text("queued task") }],
		});
		expect(f.workers[1]?.prompts).toEqual([]);
		expect(
			readRecovery(f.db, f.input.workspaceId, f.input.terminalId),
		).toMatchObject({
			switchAccounts: false,
			resumeAtReset: false,
			hasSelection: false,
		});
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("an unconfirmed stop prevents moving or starting another account", async () => {
	const f = await fixture();
	const stop = spyOn(f.runtime.commands, "closeSession").mockRejectedValue(
		new Error("stop_unconfirmed"),
	);
	try {
		await expect(
			forkSwitchChatAccount(f.runtime, f.input, f.deps),
		).rejects.toThrow("stop_unconfirmed");
		expect(f.trace).toEqual(["validate", "cancel"]);
		expect(f.workers).toHaveLength(1);
	} finally {
		stop.mockRestore();
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("a quota failure can switch manually while automatic continuation stays paused", async () => {
	const f = await fixture(false);
	try {
		f.workers[0]?.quotaFailure();
		await flush();
		expect(f.runtime.live.require(f.input.chatSessionId).state.status).toBe(
			"running",
		);
		const result = await forkSwitchChatAccount(f.runtime, f.input, f.deps);
		await flush();
		expect(result.switched).toBe(true);
		expect(f.workers[1]?.prompts).toEqual([]);
		expect(
			readRecovery(f.db, f.input.workspaceId, f.input.terminalId),
		).toMatchObject({
			switchAccounts: false,
			resumeAtReset: false,
		});
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("a failed copy restores the original account with its queued messages still paused", async () => {
	const f = await fixture();
	try {
		const result = await forkSwitchChatAccount(f.runtime, f.input, {
			...f.deps,
			move: async () => {
				throw new Error("copy_failed");
			},
		});
		await flush();
		expect(result).toMatchObject({
			switched: false,
			moved: false,
			error: "copy_failed",
		});
		expect(f.workers[1]?.options.accountSelection).toBe("/source");
		expect(
			f.runtime.commands.getQueue({ sessionId: result.sessionId }),
		).toMatchObject({
			paused: true,
			prompts: [{ content: text("queued task") }],
		});
		expect(f.workers[1]?.prompts).toEqual([]);
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test.each([
	"dead",
	"held",
	"mismatch",
] as const)("a target bootstrap that is %s stops before restoring the source", async (state) => {
	const f = await fixture();
	f.bootstrap.target = state;
	try {
		const result = await forkSwitchChatAccount(f.runtime, f.input, f.deps);
		expect(result.switched).toBe(false);
		expect(f.trace).toEqual([
			"validate",
			"cancel",
			"close",
			"move",
			"create:/target",
			"close",
			"create:/source",
		]);
		expect(f.runtime.live.require(result.sessionId).state).toMatchObject({
			status: "idle",
			harnessSessionId: f.input.sessionId,
		});
		expect(f.workers[2]?.options.accountSelection).toBe("/source");
		expect(f.workers[2]?.prompts).toEqual([]);
		expect(
			f.runtime.commands.getQueue({ sessionId: result.sessionId }),
		).toMatchObject({
			paused: true,
			prompts: [{ content: text("queued task") }],
		});
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("an unconfirmed target stop never starts the original account again", async () => {
	const f = await fixture();
	f.bootstrap.target = "dead";
	const close = f.runtime.commands.closeSession.bind(f.runtime.commands);
	const stop = spyOn(f.runtime.commands, "closeSession").mockImplementation(
		async (input) => {
			if (input.sessionId !== f.input.chatSessionId)
				throw new Error("target_stop_unconfirmed");
			await close(input);
		},
	);
	try {
		await expect(
			forkSwitchChatAccount(f.runtime, f.input, f.deps),
		).rejects.toThrow("chat_account_stop_unconfirmed");
		expect(f.workers).toHaveLength(2);
		expect(f.trace.filter((entry) => entry === "create:/source")).toEqual([]);
	} finally {
		stop.mockRestore();
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("a failed recovery bootstrap is reported only after closing that worker", async () => {
	const f = await fixture();
	f.bootstrap.target = "dead";
	f.bootstrap.recovery = "held";
	try {
		await expect(
			forkSwitchChatAccount(f.runtime, f.input, f.deps),
		).rejects.toThrow("chat_account_recovery_failed");
		expect(f.trace.at(-1)).toBe("close");
		expect(f.workers).toHaveLength(3);
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("a changed source never interrupts the source", async () => {
	const f = await fixture();
	try {
		await expect(
			forkSwitchChatAccount(
				f.runtime,
				{ ...f.input, workspaceId: "other" },
				f.deps,
			),
		).rejects.toThrow("chat_account_source_changed");
		expect(f.trace).toEqual([]);
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("an unavailable target never interrupts the source", async () => {
	const f = await fixture();
	try {
		await expect(
			forkSwitchChatAccount(f.runtime, f.input, {
				...f.deps,
				validateTarget: async () => {
					throw new Error("target_unavailable");
				},
			}),
		).rejects.toThrow("target_unavailable");
		expect(f.trace).toEqual([]);
	} finally {
		await f.runtime.dispose();
		f.sqlite.close();
	}
});

test("a second switch cannot move the same native conversation concurrently", async () => {
	const f = await fixture();
	let release!: () => void;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	try {
		const first = forkSwitchChatAccount(f.runtime, f.input, {
			...f.deps,
			validateTarget: () => ready,
		});
		await expect(
			forkSwitchChatAccount(f.runtime, f.input, f.deps),
		).rejects.toThrow("account_switch_in_progress");
		release();
		await first;
		expect(f.trace.filter((event) => event === "move")).toHaveLength(1);
	} finally {
		release();
		await f.runtime.dispose();
		f.sqlite.close();
	}
});
