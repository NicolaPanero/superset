const string = (value: unknown) =>
	typeof value === "string" ? value : undefined;

function oneOf<T extends string>(value: unknown, choices: readonly T[]) {
	return choices.includes(value as T) ? (value as T) : undefined;
}

export type ForkTasksSearch = {
	forkSource?: "jira" | "superset";
	forkTask?: string;
	forkConnection?: string;
	forkView?: "board" | "list";
	forkScope?: "mine" | "all";
	forkStatus?: "all" | "open" | "new" | "indeterminate" | "done";
	forkSprint?: string;
	forkJiraBoard?: string;
	forkJiraProject?: string;
	forkJql?: string;
	forkIssueType?: string;
	forkParent?: string;
};

export function forkTasksSearch(
	search: Record<string, unknown>,
): ForkTasksSearch {
	return {
		forkSource: oneOf(search.forkSource, ["jira", "superset"]),
		forkTask: string(search.forkTask),
		forkConnection: string(search.forkConnection),
		forkView: oneOf(search.forkView, ["board", "list"]),
		forkScope: oneOf(search.forkScope, ["mine", "all"]),
		forkStatus: oneOf(search.forkStatus, [
			"all",
			"open",
			"new",
			"indeterminate",
			"done",
		]),
		forkJiraProject: string(search.forkJiraProject),
		forkSprint:
			search.forkSprint === "current" ||
			(typeof search.forkSprint === "string" &&
				/^[1-9]\d{0,9}$/.test(search.forkSprint))
				? search.forkSprint
				: undefined,
		forkJiraBoard:
			typeof search.forkJiraBoard === "string" &&
			/^[1-9]\d{0,9}$/.test(search.forkJiraBoard)
				? search.forkJiraBoard
				: undefined,
		forkJql: string(search.forkJql)?.slice(0, 4000),
		forkIssueType: string(search.forkIssueType)?.slice(0, 200),
		forkParent: string(search.forkParent)?.slice(0, 100),
	};
}

export type ForkPullRequestsSearch = {
	forkProvider?: "bitbucket";
	forkProject?: string;
	forkNumber?: number;
};

export function forkPullRequestsSearch(
	search: Record<string, unknown>,
): ForkPullRequestsSearch {
	const number = Number(search.forkNumber);
	return {
		forkProvider: oneOf(search.forkProvider, ["bitbucket"]),
		forkProject: string(search.forkProject),
		forkNumber: Number.isSafeInteger(number) && number > 0 ? number : undefined,
	};
}
