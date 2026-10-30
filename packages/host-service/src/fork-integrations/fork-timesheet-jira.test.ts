import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import type { ForkApi } from "./fork-api";
import { ForkJiraProvider } from "./fork-jira";
import { forkDefaultTimesheetSettings } from "./fork-timesheet";
import {
	forkSaveTimesheetSettings,
	forkTimesheetPost,
	forkTimesheetPropose,
} from "./fork-timesheet-jira";

function fixture(issues: Record<string, unknown[]>) {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const calls: string[] = [];
	const api = {
		connection: () => ({
			provider: "jira",
			site: "https://example.test",
			identity: { id: "me" },
		}),
		request: async (
			_id: string,
			path: string,
			_method?: string,
			body?: { jql?: string },
		) => {
			calls.push(body?.jql ?? path);
			if (path === "/rest/api/3/search/jql") {
				const jql = body?.jql ?? "";
				const kind = jql.startsWith("status CHANGED")
					? "done"
					: jql.startsWith("assignee")
						? "progress"
						: "logged";
				return { issues: issues[kind] ?? [] };
			}
			if (path === "/rest/api/3/status")
				return [{ id: "3", statusCategory: { key: "indeterminate" } }];
			if (path.includes("/changelog"))
				return {
					total: 1,
					values: [
						{
							created: "2026-10-26T10:00:00.000+0100",
							items: [{ field: "status", to: "3" }],
						},
					],
				};
			throw new Error(`unexpected ${path}`);
		},
	} as unknown as ForkApi;
	return {
		sqlite,
		calls,
		ctx: { db: drizzle(sqlite) as unknown as HostDb, organizationId: "org" },
		jira: new ForkJiraProvider(api),
	};
}

test("proposals are refused while the option is off, without calling Jira", async () => {
	const f = fixture({});
	try {
		await expect(
			forkTimesheetPropose(f.ctx, f.jira, { connectionId: "jira" }),
		).rejects.toThrow("Turn on timesheet proposals");
		expect(f.calls).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});

test("work in progress joins the proposal from the day it started, and posting checks the daily maximum", async () => {
	const f = fixture({
		progress: [
			{
				key: "APP-9",
				fields: {
					summary: "Open work",
					issuetype: { name: "Task" },
					created: "2026-10-01T09:00:00.000+0200",
				},
			},
		],
	});
	try {
		forkSaveTimesheetSettings(f.ctx, "jira", {
			...forkDefaultTimesheetSettings("Europe/Rome"),
			enabled: true,
			project: "APP",
		});
		const proposal = await forkTimesheetPropose(f.ctx, f.jira, {
			connectionId: "jira",
			from: "2026-10-19",
			to: "2026-10-30",
			now: Date.parse("2026-10-30T18:30:00Z"),
		});
		expect(proposal.tasks.map((task) => task.state)).toEqual(["in_progress"]);
		expect(proposal.entries.every((entry) => entry.date >= "2026-10-26")).toBe(
			true,
		);
		expect(proposal.entries.some((entry) => entry.date === "2026-10-30")).toBe(
			true,
		);
		const [first] = proposal.entries;
		if (!first) throw new Error("no entries");
		await expect(
			forkTimesheetPost(f.ctx, f.jira, {
				proposalId: proposal.id,
				entries: [{ ...first, seconds: 9 * 3600 }],
			}),
		).rejects.toThrow("would go over 8 hours");
	} finally {
		f.sqlite.close();
	}
});

test("without zero-hour tasks Jira proposes equal additional hours on work in progress", async () => {
	const f = fixture({
		progress: [
			{
				key: "APP-1",
				fields: {
					timespent: 36000,
					issuetype: { name: "Story" },
					comment: { total: 100 },
					issuelinks: Array(10).fill({}),
				},
			},
			{ key: "APP-2", fields: { timespent: 3600, issuetype: { name: "Bug" } } },
		],
	});
	try {
		const settings = {
			...forkDefaultTimesheetSettings("Europe/Rome"),
			enabled: true,
			project: "APP",
		};
		forkSaveTimesheetSettings(f.ctx, "jira", settings);
		const input = {
			connectionId: "jira",
			from: "2026-10-26",
			to: "2026-10-30",
			now: Date.parse("2026-10-30T18:30:00Z"),
		};
		const proposal = await forkTimesheetPropose(f.ctx, f.jira, input);
		expect(proposal.tasks).toHaveLength(2);
		const seconds = proposal.tasks.map((t) => t.seconds);
		expect(Math.min(...seconds)).toBeGreaterThan(0);
		expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(
			1800,
		);
		forkSaveTimesheetSettings(f.ctx, "jira", {
			...settings,
			includeInProgress: false,
		});
		const excluded = await forkTimesheetPropose(f.ctx, f.jira, input);
		expect(excluded.entries).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});
