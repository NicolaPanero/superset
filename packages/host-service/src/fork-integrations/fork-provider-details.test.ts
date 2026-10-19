import { expect, test } from "bun:test";
import type {
	ForkConnection,
	ForkRepositoryRef,
} from "@superset/shared/fork-integrations";
import type { ForkApi } from "./fork-api";
import { ForkJiraProvider } from "./fork-jira";
import { ForkScmProvider } from "./fork-scm";

const repository: ForkRepositoryRef = {
	provider: "bitbucket",
	host: "bitbucket.org",
	owner: "team",
	name: "app",
};
function api(
	provider: "jira" | "bitbucket",
	request: (
		id: string,
		path: string,
		method?: string,
		body?: unknown,
	) => Promise<unknown>,
) {
	return {
		connection: () =>
			({ provider, site: "https://example.atlassian.net" }) as ForkConnection,
		request,
	} as unknown as ForkApi;
}

test("Bitbucket diff counts include every page and cache requests within the same account", async () => {
	let calls = 0;
	const scm = new ForkScmProvider(
		api("bitbucket", async (_id, path) => {
			calls++;
			return path.includes("page=2")
				? { values: [{ lines_added: 7, lines_removed: 2 }] }
				: {
						values: [{ lines_added: 3, lines_removed: 1 }],
						next: "https://api.bitbucket.org/2.0/repositories/team/app/pullrequests/4/diffstat?page=2",
					};
		}),
	);
	expect(await scm.diffstat("details-one", repository, 4)).toEqual({
		additions: 10,
		deletions: 3,
	});
	await scm.diffstat("details-one", repository, 4);
	expect(calls).toBe(2);
	await scm.diffstat("details-two", repository, 4);
	expect(calls).toBe(4);
});

test("a comment on a removed line sends the old-side coordinate to Bitbucket", async () => {
	let sent: unknown;
	const scm = new ForkScmProvider(
		api("bitbucket", async (_id, _path, _method, body) => {
			sent = body;
			return {};
		}),
	);
	await scm.action("details", repository, 4, "comment", {
		path: "src/login.ts",
		line: 12,
		side: "old",
		body: "Keep validation",
	});
	expect(sent).toEqual({
		content: { raw: "Keep validation" },
		inline: { path: "src/login.ts", from: 12 },
	});
});

test("Jira discovers the sprint field and returns transition destination and required fields", async () => {
	const jira = new ForkJiraProvider(
		api("jira", async (_id, path) => {
			if (path === "/rest/api/3/field")
				return [
					{
						id: "customfield_98765",
						schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint" },
					},
				];
			if (path.includes("transitions"))
				return {
					transitions: [
						{
							id: "move",
							name: "Start",
							to: {
								id: "progress",
								name: "Working",
								statusCategory: { key: "indeterminate" },
							},
							fields: { resolution: { name: "Resolution", required: true } },
						},
					],
				};
			expect(path).toContain("customfield_98765");
			return {
				id: "1",
				key: "APP-1",
				fields: {
					summary: "Fix",
					status: { id: "todo", name: "To Do" },
					customfield_98765: [{ name: "Sprint 7", state: "active" }],
				},
			};
		}),
	);
	expect((await jira.get("details-jira", "APP-1")).sprint).toBe("Sprint 7");
	expect((await jira.transitions("details-jira", "APP-1"))[0]).toMatchObject({
		to: { id: "progress", category: "indeterminate" },
		fields: [{ id: "resolution", required: true }],
	});
});
