import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { forkAutomationAttempts, forkJiraAutomations } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import {
	type ForkAutomationDeps,
	forkAutomationRule,
	forkRunAutomationTick,
	forkSaveAutomationOptions,
} from "./fork-automation-engine";
import {
	type ForkAutomationEvent,
	forkScheduleEvents,
} from "./fork-automation-sources";

function fixture() {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); INSERT INTO projects VALUES ('p'); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	db.insert(forkJiraAutomations)
		.values({
			id: "rule",
			scope: "org",
			connectionId: "jira",
			projectId: "p",
			name: "Digest",
			jql: "",
			agent: "codex",
			prompt: "Summarize",
			enabled: true,
		})
		.run();
	return { sqlite, db, organizationId: "org" };
}

const at = (iso: string) => Date.parse(iso);

test("a schedule fires on its days once the time has passed", () => {
	const ctx = fixture();
	try {
		forkSaveAutomationOptions(ctx, "rule", {
			sourceKind: "schedule",
			sourceConfig: {
				days: [1, 2, 3, 4, 5],
				time: "09:00",
				timeZone: "Europe/Rome",
			},
		});
		const rule = forkAutomationRule(ctx, "rule");
		if (!rule) throw new Error("missing rule");
		expect(forkScheduleEvents(rule, at("2026-10-30T07:59:00Z"))).toEqual([]);
		const [event] = forkScheduleEvents(rule, at("2026-10-30T08:00:00Z"));
		expect(event?.key).toBe("schedule:2026-10-30");
		expect(forkScheduleEvents(rule, at("2026-10-31T12:00:00Z"))).toEqual([]);
	} finally {
		ctx.sqlite.close();
	}
});

test("a schedule slot missed while the computer slept beyond the window is skipped", async () => {
	const ctx = fixture();
	try {
		forkSaveAutomationOptions(ctx, "rule", {
			sourceKind: "schedule",
			sourceConfig: { days: [5], time: "09:00", timeZone: "Europe/Rome" },
			catchupMinutes: 60,
		});
		let now = at("2026-10-30T12:00:00Z");
		const launched: string[] = [];
		const deps: ForkAutomationDeps = {
			now: () => now,
			sources: {
				schedule: async (rule) => forkScheduleEvents(rule, now),
			},
			launch: async (_rule, attempt) => {
				launched.push(attempt.eventKey);
				return { workspaceId: "w", terminalId: "t" };
			},
		};
		await forkRunAutomationTick(ctx, deps);
		expect(launched).toEqual([]);
		expect(ctx.db.select().from(forkAutomationAttempts).get()?.state).toBe(
			"skipped",
		);
		now = at("2026-11-06T08:30:00Z");
		await forkRunAutomationTick(ctx, deps);
		expect(launched).toEqual(["schedule:2026-11-06"]);
	} finally {
		ctx.sqlite.close();
	}
});

test("new pull request comments run once together, and the per-target limit stops repeats", async () => {
	const ctx = fixture();
	try {
		forkSaveAutomationOptions(ctx, "rule", {
			sourceKind: "pr_comments",
			targetLimit: 2,
		});
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		let comments = ["1", "2"];
		const event = (): ForkAutomationEvent => ({
			key: "pr#7:comments",
			target: "pr#7",
			title: "#7 Fix",
			url: null,
			workspaceId: "w7",
			occurredAt: null,
			context: "Pull request #7",
			items: comments.map((id) => ({
				key: `pr#7:comment:${id}`,
				text: `Comment ${id}`,
			})),
		});
		const prompts: string[] = [];
		const deps: ForkAutomationDeps = {
			now: () => 1,
			sources: { pr_comments: async () => [event()] },
			launch: async (_rule, attempt) => {
				prompts.push(attempt.prompt);
				return {
					workspaceId: attempt.workspaceId ?? "",
					terminalId: `t${prompts.length}`,
				};
			},
		};
		const finish = () =>
			ctx.db.update(forkAutomationAttempts).set({ state: "agent_done" }).run();
		await forkRunAutomationTick(ctx, deps);
		await forkRunAutomationTick(ctx, deps);
		expect(prompts).toHaveLength(1);
		expect(prompts[0]).toContain("Comment 1");
		expect(prompts[0]).toContain("Comment 2");
		finish();
		comments = ["1", "2", "3"];
		await forkRunAutomationTick(ctx, deps);
		expect(prompts).toHaveLength(2);
		expect(prompts[1]).toContain("Comment 3");
		expect(prompts[1]).not.toContain("Comment 1");
		finish();
		comments = ["1", "2", "3", "4"];
		await forkRunAutomationTick(ctx, deps);
		expect(prompts).toHaveLength(2);
		const states = ctx.db
			.select()
			.from(forkAutomationAttempts)
			.all()
			.map((a) => a.state);
		expect(states).toContain("skipped");
	} finally {
		ctx.sqlite.close();
	}
});
