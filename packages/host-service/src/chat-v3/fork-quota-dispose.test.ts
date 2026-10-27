import { expect, test } from "bun:test";
import type { UserContent } from "@superset/chat/protocol";
import {
	type AdapterEvent,
	EventQueue,
	type HarnessAdapter,
	type HarnessStartOptions,
} from "@superset/chat-runtime";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
import type { UsageAccount } from "../trpc/router/usage/types";
import { ForkQuotaRecoveryAdapter } from "./forkQuotaRecoveryAdapter";

const NOW = 1_800_000_000_000;

class Worker implements HarnessAdapter {
	readonly queue = new EventQueue();
	stops = 0;
	constructor(private readonly stop: () => Promise<void>) {}
	start(_options: HarnessStartOptions) {
		this.queue.push({
			kind: "session",
			session: { status: "idle", harnessSessionId: "native-id" },
		});
		return this.queue.iterable();
	}
	prompt(_content: UserContent[]) {}
	cancelTurn() {}
	respondToApproval() {}
	setMode() {}
	async dispose() {
		this.stops += 1;
		await this.stop();
		this.queue.close();
	}
	fail() {
		this.queue.push({
			kind: "turn",
			turn: {
				id: "turn-1",
				status: "failed",
				startedAtMs: NOW,
				completedAtMs: NOW + 1,
				error: {
					message: "session/prompt: You've hit your limit · resets 5pm",
				},
			},
		});
	}
}

function quota(selection: string, usedPercent: number): UsageAccount {
	return {
		agent: "claude",
		selection,
		credentialKind: "subscription",
		accountKey: selection,
		sourceLabel: selection,
		email: `${selection}@example.test`,
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent,
				resetsAt: new Date(NOW + 300_000),
			},
		],
		creditsBalance: null,
		extraUsage: null,
		isDefault: false,
		fetchedAt: new Date(NOW),
	};
}

function fixture(
	options: { stop?: () => Promise<void>; move?: () => Promise<void> } = {},
) {
	const workers: Worker[] = [];
	const events: AdapterEvent[] = [];
	let moves = 0;
	let account: SessionAccount = {
		agent: "claude",
		selection: "/source",
		credentialKind: "subscription",
		identity: "source-identity",
		email: "/source@example.test",
	};
	const adapter = new ForkQuotaRecoveryAdapter(
		{
			create: (selection) => {
				account = { ...account, selection: selection ?? null };
				const worker = new Worker(options.stop ?? (async () => {}));
				workers.push(worker);
				return worker;
			},
			settings: () => ({ switchAccounts: true, resumeAtReset: false }),
			account: () => account,
			quota: async () => [quota("/source", 100), quota("/target", 0)],
			move: async () => {
				moves += 1;
				await options.move?.();
			},
			selected: () => {},
			status: () => {},
			now: () => NOW,
		},
		"/source",
	);
	const stream = adapter.start({
		cwd: "/tmp/recovery",
		resume: { harnessSessionId: "native-id" },
	});
	const pump = (async () => {
		for await (const event of stream) events.push(event);
	})();
	const worker = workers[0];
	if (!worker) throw new Error("source worker was not created");
	return { adapter, worker, workers, events, pump, moves: () => moves };
}

async function until(predicate: () => boolean) {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (predicate()) return;
		await Promise.resolve();
	}
	throw new Error("condition not reached");
}

test("disposal during automatic worker shutdown does not create a replacement", async () => {
	const stop = Promise.withResolvers<void>();
	const f = fixture({ stop: () => stop.promise });
	const worker = f.worker;
	worker.fail();
	await until(() => worker.stops === 1);
	const closing = f.adapter.dispose();
	stop.resolve();
	await closing;
	await f.pump;
	expect(worker.stops).toBe(1);
	expect(f.workers.length).toBe(1);
	expect(f.moves()).toBe(0);
});

test("disposal waits for an automatic move already in progress without restoring a worker", async () => {
	const move = Promise.withResolvers<void>();
	const f = fixture({ move: () => move.promise });
	f.worker.fail();
	await until(() => f.moves() === 1);
	const closing = f.adapter.dispose();
	let stopped = false;
	void closing.then(() => {
		stopped = true;
	});
	await Promise.resolve();
	await Promise.resolve();
	expect(stopped).toBe(false);
	move.resolve();
	await closing;
	await f.pump;
	expect(f.workers.length).toBe(1);
});

test("automatic recovery does not start another writer when the original worker fails to stop", async () => {
	const f = fixture({
		stop: async () => {
			throw new Error("exit unconfirmed");
		},
	});
	f.worker.fail();
	await until(() =>
		f.events.some(
			(event) => event.kind === "turn" && event.turn.status === "failed",
		),
	);
	expect(f.workers.length).toBe(1);
	expect(f.moves()).toBe(0);
	await expect(f.adapter.dispose()).rejects.toThrow("exit unconfirmed");
	expect(f.worker.stops).toBe(1);
});
