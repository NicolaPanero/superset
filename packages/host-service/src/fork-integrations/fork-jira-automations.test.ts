import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { ForkTask } from "@superset/shared/fork-integrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { forkJiraAutomationRuns, forkJiraAutomations } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import { pollForkJiraAutomations } from "./fork-jira-automations";

function fixture() {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"PRAGMA foreign_keys = ON; CREATE TABLE projects (id text PRIMARY KEY); INSERT INTO projects VALUES ('p'); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	db.insert(forkJiraAutomations)
		.values({
			id: "rule",
			scope: "org",
			connectionId: "jira",
			projectId: "p",
			name: "Work",
			jql: "labels = ready",
			agent: "codex",
			prompt: "Fix it",
			enabled: true,
		})
		.run();
	return { sqlite, db, organizationId: "org" };
}
const task = (id: string) => ({ id, key: `APP-${id}` }) as ForkTask;

test("Jira automations baseline existing matches and start each later match once across polls", async () => {
	const ctx = fixture();
	try {
		const started: string[] = [];
		const launch = async (_rule: unknown, issue: ForkTask) => {
			started.push(issue.id);
		};
		await pollForkJiraAutomations(ctx, {
			search: async () => [task("1")],
			launch,
		});
		expect(started).toEqual([]);
		await Promise.all(
			[1, 2].map(() =>
				pollForkJiraAutomations(ctx, {
					search: async () => [task("1"), task("2")],
					launch,
				}),
			),
		);
		expect(started).toEqual(["2"]);
		expect(ctx.db.select().from(forkJiraAutomationRuns).all()).toHaveLength(2);
	} finally {
		ctx.sqlite.close();
	}
});

test("a failed automation launch stays in history without starting another agent on the next poll", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		let launches = 0;
		const actions = {
			search: async () => [task("3")],
			launch: async () => {
				launches++;
				throw new Error("Agent unavailable");
			},
		};
		await pollForkJiraAutomations(ctx, actions);
		await pollForkJiraAutomations(ctx, actions);
		expect(launches).toBe(1);
		expect(ctx.db.select().from(forkJiraAutomationRuns).get()?.error).toBe(
			"Agent unavailable",
		);
	} finally {
		ctx.sqlite.close();
	}
});

test("pausing a rule while its search is running prevents launches", async () => {
	const ctx = fixture();
	try {
		let launches = 0;
		await pollForkJiraAutomations(ctx, {
			search: async () => {
				ctx.db.update(forkJiraAutomations).set({ enabled: false }).run();
				return [task("4")];
			},
			launch: async () => {
				launches++;
			},
		});
		expect(launches).toBe(0);
		expect(ctx.db.select().from(forkJiraAutomationRuns).all()).toHaveLength(0);
	} finally {
		ctx.sqlite.close();
	}
});

test("automation polls bound launch bursts and leave remaining matches for the next poll", async () => {
	const ctx = fixture();
	try {
		ctx.db.update(forkJiraAutomations).set({ initialized: true }).run();
		const started: string[] = [];
		const actions = {
			search: async () => [1, 2, 3, 4, 5, 6].map((id) => task(String(id))),
			launch: async (_rule: unknown, issue: ForkTask) => {
				started.push(issue.id);
			},
		};
		await pollForkJiraAutomations(ctx, actions);
		expect(started).toHaveLength(5);
		await pollForkJiraAutomations(ctx, actions);
		expect(started).toHaveLength(6);
		ctx.db.delete(forkJiraAutomations).run();
		expect(ctx.db.select().from(forkJiraAutomationRuns).all()).toHaveLength(0);
	} finally {
		ctx.sqlite.close();
	}
});
