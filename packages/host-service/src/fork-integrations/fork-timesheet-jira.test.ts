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
	forkTimesheetSettingsFor,
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
		).rejects.toThrow("Timesheet proposals are no longer available");
		expect(f.calls).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});

test("saved enabled settings cannot restore proposals or bulk posting", async () => {
	const f = fixture({});
	try {
		for (let i = 0; i < 2; i++)
			forkSaveTimesheetSettings(f.ctx, "jira", {
				...forkDefaultTimesheetSettings(),
				enabled: true,
			});
		expect(forkTimesheetSettingsFor(f.ctx, "jira").enabled).toBe(false);
		await expect(
			forkTimesheetPropose(f.ctx, f.jira, { connectionId: "jira" }),
		).rejects.toThrow("Timesheet proposals are no longer available");
		await expect(
			forkTimesheetPost(f.ctx, f.jira, {
				proposalId: "previously-saved",
				entries: [],
			}),
		).rejects.toThrow("Timesheet proposals are no longer available");
		expect(f.calls).toEqual([]);
	} finally {
		f.sqlite.close();
	}
});
