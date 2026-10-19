export type JiraScope = "mine" | "all";
export type JiraStatus = "all" | "open" | "new" | "indeterminate" | "done";

/** JQL takes status category names or IDs, not the keys the API returns. */
const STATUS_CATEGORY_ID: Record<
	Exclude<JiraStatus, "all" | "open">,
	number
> = {
	new: 2,
	indeterminate: 4,
	done: 3,
};

export function forkJiraQuery({
	search,
	scope,
	status,
	project,
	jql,
	projectKeys = [],
	sprint,
	issueType,
	parent,
	boardFilter,
}: {
	search: string;
	scope: JiraScope;
	status: JiraStatus;
	project: string;
	jql: string;
	projectKeys?: string[];
	sprint?: string;
	boardFilter?: string;
	issueType?: string;
	parent?: string;
}) {
	if (jql.trim()) return jql.trim();
	const terms: string[] = [];
	if (boardFilter) terms.push(`filter = ${JSON.stringify(boardFilter)}`);
	if (scope === "mine") terms.push("assignee = currentUser()");
	if (project) terms.push(`project = ${JSON.stringify(project)}`);
	if (status === "open")
		terms.push(`statusCategory != ${STATUS_CATEGORY_ID.done}`);
	else if (status !== "all")
		terms.push(`statusCategory = ${STATUS_CATEGORY_ID[status]}`);
	if (sprint === "current") terms.push("sprint in openSprints()");
	else if (sprint && /^[1-9]\d{0,9}$/.test(sprint))
		terms.push(`sprint = ${sprint}`);
	if (issueType?.trim())
		terms.push(`issuetype = ${JSON.stringify(issueType.trim())}`);
	if (parent?.trim()) terms.push(`parent = ${JSON.stringify(parent.trim())}`);
	const text = search.trim();
	const keyProject = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(text)?.[1];
	// Jira rejects a key whose project does not exist, so "utf-8" stays text.
	if (
		keyProject &&
		projectKeys.some((key) => key.toUpperCase() === keyProject.toUpperCase())
	)
		terms.push(`key = ${JSON.stringify(text)}`);
	else if (text)
		terms.push(
			`text ~ ${JSON.stringify(text.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&"))}`,
		);
	return `${terms.length ? terms.join(" AND ") : "updated IS NOT EMPTY"} ORDER BY updated DESC`;
}

export function jiraStatusTone(category: string) {
	return category === "done"
		? "text-emerald-500 bg-emerald-500/10"
		: category === "indeterminate"
			? "text-blue-500 bg-blue-500/10"
			: "text-muted-foreground bg-muted";
}

export interface ForkJiraTaskFilters {
	forkTask?: string;
	forkConnection?: string;
	forkView?: "board" | "list";
	forkScope?: JiraScope;
	forkStatus?: JiraStatus;
	forkSprint?: string;
	forkJiraBoard?: string;
	forkJiraProject?: string;
	forkJql?: string;
	forkIssueType?: string;
	forkParent?: string;
	search?: string;
}
