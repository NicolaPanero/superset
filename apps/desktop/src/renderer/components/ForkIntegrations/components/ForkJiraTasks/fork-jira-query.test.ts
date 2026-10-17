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
		}),
	).toBe(
		'assignee = currentUser() AND project = "APP" AND statusCategory = "indeterminate" AND key = "APP-42" ORDER BY updated DESC',
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
