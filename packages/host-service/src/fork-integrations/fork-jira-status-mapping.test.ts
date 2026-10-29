import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import type { ForkApi } from "./fork-api";
import { ForkJiraProvider } from "./fork-jira";
import {
	forkJiraProjectKey,
	forkJiraStatusMapping,
	forkSetJiraStatusMapping,
} from "./fork-jira-status-mapping";

function jira(status: { id: string; name: string; category: string }) {
	const posted: unknown[] = [];
	const api = {
		connection: () => ({ provider: "jira", site: "https://example.test" }),
		request: async (
			_id: string,
			path: string,
			method?: string,
			body?: unknown,
		) => {
			if (path === "/rest/api/3/field") return [];
			if (method === "POST") {
				posted.push(body);
				return {};
			}
			if (path.includes("/transitions"))
				return {
					transitions: [
						{
							id: "11",
							to: {
								id: "3",
								name: "Code review",
								statusCategory: { key: "indeterminate" },
							},
						},
						{
							id: "12",
							to: {
								id: "7",
								name: "In revisione",
								statusCategory: { key: "indeterminate" },
							},
						},
					],
				};
			return {
				id: "1",
				key: "APP-1",
				fields: {
					summary: "Task",
					status: {
						id: status.id,
						name: status.name,
						statusCategory: { key: status.category },
					},
				},
			};
		},
	} as unknown as ForkApi;
	return { provider: new ForkJiraProvider(api), posted };
}

test("a mapped review status wins over the name heuristic", async () => {
	const { provider, posted } = jira({
		id: "2",
		name: "In corso",
		category: "indeterminate",
	});
	expect(
		await provider.advance("jira", "APP-1", "review", {
			progressStatusId: null,
			reviewStatusId: "7",
		}),
	).toBe(true);
	expect(posted).toEqual([{ transition: { id: "12" } }]);
});

test("an issue already in the mapped status does not move", async () => {
	const { provider, posted } = jira({
		id: "7",
		name: "In revisione",
		category: "indeterminate",
	});
	expect(
		await provider.advance("jira", "APP-1", "review", {
			progressStatusId: null,
			reviewStatusId: "7",
		}),
	).toBe(false);
	expect(posted).toEqual([]);
});

test("mappings are stored per connection and project, and an empty one is removed", () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY); CREATE TABLE workspaces (id text PRIMARY KEY);",
	);
	ensureForkTables(sqlite);
	const ctx = {
		db: drizzle(sqlite) as unknown as HostDb,
		organizationId: "org",
	};
	try {
		expect(forkJiraProjectKey("APP_2-15")).toBe("APP_2");
		forkSetJiraStatusMapping(ctx, {
			connectionId: "jira",
			projectKey: "APP",
			progressStatusId: "2",
			reviewStatusId: null,
		});
		expect(forkJiraStatusMapping(ctx, "jira", "APP")).toEqual({
			progressStatusId: "2",
			reviewStatusId: null,
		});
		expect(forkJiraStatusMapping(ctx, "other", "APP")).toBeNull();
		forkSetJiraStatusMapping(ctx, {
			connectionId: "jira",
			projectKey: "APP",
			progressStatusId: null,
			reviewStatusId: null,
		});
		expect(forkJiraStatusMapping(ctx, "jira", "APP")).toBeNull();
	} finally {
		sqlite.close();
	}
});
