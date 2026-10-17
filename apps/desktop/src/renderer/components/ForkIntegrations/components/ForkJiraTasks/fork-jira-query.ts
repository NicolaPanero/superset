export type JiraScope = "mine" | "all";
export type JiraStatus = "all" | "new" | "indeterminate" | "done";

export function forkJiraQuery({
	search,
	scope,
	status,
	project,
	jql,
}: {
	search: string;
	scope: JiraScope;
	status: JiraStatus;
	project: string;
	jql: string;
}) {
	if (jql.trim()) return jql.trim();
	const terms: string[] = [];
	if (scope === "mine") terms.push("assignee = currentUser()");
	if (project) terms.push(`project = ${JSON.stringify(project)}`);
	if (status !== "all")
		terms.push(`statusCategory = ${JSON.stringify(status)}`);
	const text = search.trim();
	if (/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(text))
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
	forkJiraProject?: string;
	forkJql?: string;
	search?: string;
}
