import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import {
	forkAutomationAttempts,
	forkAutomationSettings,
	forkJiraAutomationRuns,
	forkJiraAutomations,
} from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import {
	type ForkAutomationDeps,
	forkAutomationRule,
	forkRecoverAutomations,
	forkRunAutomationTick,
	forkSaveAutomationOptions,
} from "./fork-automation-engine";
import { forkAutomationLifecycle } from "./fork-automation-lifecycle";
import { forkJiraEvents } from "./fork-automation-sources";

function fixture() {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"PRAGMA foreign_keys = ON; CREATE TABLE projects (id text PRIMARY KEY); INSERT INTO projects VALUES ('p'), ('q'); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	const rule = (id: string, projectId = "p") =>
		db
			.insert(forkJiraAutomations)
			.values({
				id,
				scope: "org",
				connectionId: "jira",
				projectId,
				name: "Work",
				jql: "labels = ready",
				agent: "codex",
				prompt: "Fix it",
				enabled: true,
			})
			.run();
	rule("rule");
	return { sqlite, db, organizationId: "org", rule };
}
type Fixture = ReturnType<typeof fixture>;

const task = (id: string, statusId = "1") =>
	({
		id,
		key: `APP-${id}`,
		title: `Task ${id}`,
		url: `https://example.test/browse/APP-${id}`,
		status: { id: statusId, name: "Ready", category: "new" },
	}) as ForkTask;

function deps(
	_ctx: Fixture,
	tasks: () => ForkTask[],
	options: {
		now?: () => number;
		launch?: ForkAutomationDeps["launch"];
	} = {},
) {
	const launched: string[] = [];
	const value: ForkAutomationDeps = {
		now: options.now ?? (() => 1_000_000),
		sources: {
			jira: async (rule) => forkJiraEvents(rule, tasks()),
		},
		launch:
			options.launch ??
			(async (_rule, attempt) => {
				launched.push(attempt.target ?? attempt.eventKey);
				return {
					workspaceId: attempt.workspaceId ?? "w",
					terminalId: `t-${attempt.id}`,
				};
			}),
	};
	return { value, launched };
}

const attempts = (ctx: Fixture) =>
	ctx.db.select().from(forkAutomationAttempts).all();

const done = (ctx: Fixture) =>
	ctx.db
		.update(forkAutomationAttempts)
		.set({ state: "agent_done" })
		.where(eq(forkAutomationAttempts.state, "running"))
		.run();

test("the first scan records existing issues and later issues start once", async () => {
	const ctx = fixture();
	try {
		let list = [task("1")];
		const d = deps(ctx, () => list);
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual([]);
		list = [task("1"), task("2")];
		await Promise.all([
			forkRunAutomationTick(ctx, d.value),
			forkRunAutomationTick(ctx, d.value),
		]);
		expect(d.launched).toEqual(["2"]);
		expect(attempts(ctx)).toHaveLength(1);
		expect(ctx.db.select().from(forkJiraAutomationRuns).all()).toHaveLength(2);
	} finally {
		ctx.sqlite.close();
	}
});

test("runs wait in the queue beyond the global limit", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		ctx.db
			.insert(forkAutomationSettings)
			.values({ scope: "org", maxRunning: 2, maxPerProject: 5 })
			.run();
		const d = deps(ctx, () => ["1", "2", "3", "4"].map((id) => task(id)));
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual(["1", "2"]);
		expect(attempts(ctx).filter((a) => a.state === "queued")).toHaveLength(2);
		done(ctx);
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual(["1", "2", "3", "4"]);
	} finally {
		ctx.sqlite.close();
	}
});

test("one run per project at a time by default", async () => {
	const ctx = fixture();
	try {
		ctx.rule("other", "q");
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		const d = deps(ctx, () => [task("1"), task("2")]);
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toHaveLength(2);
		const projects = attempts(ctx)
			.filter((a) => a.state === "running")
			.map((a) => a.ruleId)
			.sort();
		expect(projects).toEqual(["other", "rule"]);
	} finally {
		ctx.sqlite.close();
	}
});

test("a scan queues at most five new runs and keeps the rest for the next scan", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		const d = deps(
			ctx,
			() => [1, 2, 3, 4, 5, 6].map((id) => task(String(id))),
			{ launch: async () => new Promise(() => {}) },
		);
		ctx.db
			.insert(forkAutomationSettings)
			.values({ scope: "org", maxRunning: 0, maxPerProject: 0 })
			.run();
		await forkRunAutomationTick(ctx, d.value);
		expect(attempts(ctx)).toHaveLength(5);
		await forkRunAutomationTick(ctx, d.value);
		expect(attempts(ctx)).toHaveLength(6);
	} finally {
		ctx.sqlite.close();
	}
});

test("a failed launch retries after a delay, then the rule pauses after three failures", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		let now = 1_000_000;
		let launches = 0;
		const d = deps(ctx, () => [task("3")], {
			now: () => now,
			launch: async () => {
				launches++;
				throw new Error("Agent unavailable");
			},
		});
		await forkRunAutomationTick(ctx, d.value);
		expect(launches).toBe(1);
		await forkRunAutomationTick(ctx, d.value);
		expect(launches).toBe(1);
		now += 60_000;
		await forkRunAutomationTick(ctx, d.value);
		expect(launches).toBe(2);
		now += 5 * 60_000;
		await forkRunAutomationTick(ctx, d.value);
		expect(launches).toBe(3);
		const rule = forkAutomationRule(ctx, "rule");
		expect(rule?.options.pausedReason).toContain("Agent unavailable");
		const chain = attempts(ctx).sort((a, b) => a.retryCount - b.retryCount);
		expect(chain.map((a) => a.retryCount)).toEqual([0, 1, 2]);
		expect(chain[1]?.previousAttemptId).toBe(chain[0]?.id ?? "");
		expect(chain[2]?.nextAttemptAt).toBeNull();
	} finally {
		ctx.sqlite.close();
	}
});

test("pausing a rule while its search runs prevents runs", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		const d = deps(ctx, () => {
			ctx.db.update(forkJiraAutomations).set({ enabled: false }).run();
			return [task("4")];
		});
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual([]);
		expect(attempts(ctx)).toEqual([]);
	} finally {
		ctx.sqlite.close();
	}
});

test("a status change starts a new run only when the rule asks for it", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		let status = "1";
		const d = deps(ctx, () => [task("5", status)]);
		await forkRunAutomationTick(ctx, d.value);
		done(ctx);
		status = "2";
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual(["5"]);
		forkSaveAutomationOptions(ctx, "rule", { refire: "status_change" });
		status = "3";
		await forkRunAutomationTick(ctx, d.value);
		expect(d.launched).toEqual(["5", "5"]);
	} finally {
		ctx.sqlite.close();
	}
});

test("a stopped host marks unfinished launches as unknown", () => {
	const ctx = fixture();
	try {
		ctx.db
			.insert(forkAutomationAttempts)
			.values({
				id: "a",
				ruleId: "rule",
				eventKey: "1",
				title: "APP-1",
				prompt: "x",
				state: "launching",
				createdAt: 1,
				updatedAt: 1,
			})
			.run();
		forkRecoverAutomations(ctx, 2);
		expect(attempts(ctx)[0]?.state).toBe("unknown");
	} finally {
		ctx.sqlite.close();
	}
});

test("agent events move the run, and a passing check verifies it", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		const d = deps(ctx, () => [task("6")]);
		await forkRunAutomationTick(ctx, d.value);
		const [run] = attempts(ctx);
		const event = (eventType: "Start" | "PermissionRequest" | "Stop") => ({
			workspaceId: run?.workspaceId ?? "",
			terminalId: run?.terminalId ?? "",
			eventType,
			occurredAt: 5,
		});
		forkAutomationLifecycle(ctx, event("PermissionRequest"));
		expect(attempts(ctx)[0]?.state).toBe("waiting_input");
		forkAutomationLifecycle(ctx, event("Start"));
		expect(attempts(ctx)[0]?.state).toBe("running");
		forkAutomationLifecycle(ctx, event("Stop"));
		expect(attempts(ctx)[0]?.state).toBe("agent_done");
	} finally {
		ctx.sqlite.close();
	}
});

test("after a restart, runs the host can no longer follow stop holding a slot", () => {
	const ctx = fixture();
	try {
		for (const [id, state] of [
			["a", "running"],
			["b", "waiting_input"],
			["c", "verifying"],
			["d", "verified"],
		] as const)
			ctx.db
				.insert(forkAutomationAttempts)
				.values({
					id,
					ruleId: "rule",
					eventKey: id,
					title: id,
					prompt: "x",
					state,
					createdAt: 1,
					updatedAt: 1,
				})
				.run();
		forkRecoverAutomations(ctx, 2);
		expect(
			Object.fromEntries(attempts(ctx).map((a) => [a.id, a.state])),
		).toEqual({ a: "unknown", b: "unknown", c: "unknown", d: "verified" });
	} finally {
		ctx.sqlite.close();
	}
});

test("a rule that just paused starts no more queued runs in the same pass", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		ctx.db
			.insert(forkAutomationSettings)
			.values({ scope: "org", maxRunning: 10, maxPerProject: 10 })
			.run();
		let launches = 0;
		const d = deps(ctx, () => [1, 2, 3, 4, 5].map((id) => task(String(id))), {
			launch: async () => {
				launches++;
				throw new Error("Agent unavailable");
			},
		});
		await forkRunAutomationTick(ctx, d.value);
		expect(launches).toBe(3);
		expect(forkAutomationRule(ctx, "rule")?.options.pausedReason).toBeTruthy();
	} finally {
		ctx.sqlite.close();
	}
});

test("a retried run leaves the attention list and does not use up the target limit", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		forkSaveAutomationOptions(ctx, "rule", { targetLimit: 1 });
		let now = 1_000_000;
		let fail = true;
		const d = deps(ctx, () => [task("8")], {
			now: () => now,
			launch: async (_rule, attempt) => {
				if (fail) throw new Error("Agent unavailable");
				return { workspaceId: attempt.workspaceId ?? "w", terminalId: "t" };
			},
		});
		await forkRunAutomationTick(ctx, d.value);
		fail = false;
		now += 60_000;
		await forkRunAutomationTick(ctx, d.value);
		const states = attempts(ctx)
			.sort((a, b) => a.retryCount - b.retryCount)
			.map((a) => a.state);
		expect(states).toEqual(["retried", "running"]);
	} finally {
		ctx.sqlite.close();
	}
});
