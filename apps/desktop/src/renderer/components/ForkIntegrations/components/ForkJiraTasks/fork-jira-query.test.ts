import { expect, test } from "bun:test";
import { forkJiraQuery } from "./fork-jira-query";

const filters = {
	search: "",
	scope: "mine" as const,
	status: "all" as const,
	project: "",
	jql: "",
};
test("Jira search builds server-side filters and keeps quoted text out of the JQL grammar", () => {
	expect(
		forkJiraQuery({
			...filters,
			search: "APP-42",
			status: "indeterminate",
			project: "APP",
			projectKeys: ["APP"],
		}),
	).toBe(
		'assignee = currentUser() AND project = "APP" AND statusCategory = 4 AND key = "APP-42" ORDER BY updated DESC',
	);
	expect(
		forkJiraQuery({ ...filters, search: "utf-8", projectKeys: ["APP"] }),
	).toBe(
		'assignee = currentUser() AND text ~ "utf\\\\-8" ORDER BY updated DESC',
	);
	const query = forkJiraQuery({
		...filters,
		search: 'fix" OR assignee = attacker',
	});
	expect(query).toContain('text ~ "fix\\\\\\" OR assignee = attacker"');
	expect(
		forkJiraQuery({ ...filters, jql: "project = APP ORDER BY priority DESC" }),
	).toBe("project = APP ORDER BY priority DESC");
	expect(forkJiraQuery({ ...filters, scope: "all" })).toBe(
		"updated IS NOT EMPTY ORDER BY updated DESC",
	);
});

test("the default Jira view lists unfinished issues and can narrow to the current sprint", () => {
	expect(forkJiraQuery({ ...filters, status: "open", sprint: "current" })).toBe(
		"assignee = currentUser() AND statusCategory != 3 AND sprint in openSprints() ORDER BY updated DESC",
	);
});

test("issue type and parent filters are quoted independently from JQL grammar", () => {
	expect(
		forkJiraQuery({
			...filters,
			issueType: 'Bug" OR assignee = attacker',
			parent: "APP-7",
		}),
	).toContain(
		'issuetype = "Bug\\" OR assignee = attacker" AND parent = "APP-7"',
	);
});

test("a selected board and sprint narrow the task query", () => {
	expect(
		forkJiraQuery({
			...filters,
			scope: "all",
			status: "all",
			boardFilter: "15563",
			sprint: "1636",
		}),
	).toBe('filter = "15563" AND sprint = 1636 ORDER BY updated DESC');
});
