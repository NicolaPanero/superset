import { expect, test } from "bun:test";
import { forkPullRequestsSearch, forkTasksSearch } from "./forkRouteSearch";

test("route search keeps only valid fork parameters", () => {
	expect(
		forkTasksSearch({
			forkSource: "jira",
			forkView: "grid",
			forkStatus: "done",
			forkJql: "x".repeat(5000),
		}),
	).toMatchObject({
		forkSource: "jira",
		forkView: undefined,
		forkStatus: "done",
		forkJql: "x".repeat(4000),
	});
	expect(
		forkPullRequestsSearch({
			forkProvider: "gitlab",
			forkProject: "p",
			forkNumber: "1.5",
		}),
	).toEqual({
		forkProvider: undefined,
		forkProject: "p",
		forkNumber: undefined,
	});
	expect(forkPullRequestsSearch({ forkNumber: "12" }).forkNumber).toBe(12);
});
