import { expect, test } from "bun:test";
import { forkPullRequestRoute } from "./fork-pull-request-route";

const projects = [
	{ projectKey: "github", repoUrl: "https://github.com/team/app.git" },
	{ projectKey: "bitbucket", repoUrl: "git@bitbucket.org:team/app.git" },
];

test("opens Bitbucket PR links on the matching provider's internal detail route", () => {
	expect(
		forkPullRequestRoute(
			"https://bitbucket.org/Team/App/pull-requests/42/diff#comment-1",
			projects,
		),
	).toEqual({
		to: "/pull-requests/$prNumber",
		params: { prNumber: "42" },
		search: { forkProvider: "bitbucket", project: "bitbucket" },
	});
});

test("uses the workspace project before the project list is available", () => {
	expect(
		forkPullRequestRoute(
			"https://bitbucket.org/team/app/pull-requests/42",
			[],
			"workspace-project",
		)?.search.project,
	).toBe("workspace-project");
});

test("keeps unrelated, invalid and unresolved links out of the Bitbucket route", () => {
	for (const url of [
		"https://github.com/team/app/pull/42",
		"https://bitbucket.org/team/app/pull-requests/new",
		"https://bitbucket.org/team/app/pull-requests/0",
		"https://bitbucket.org/team/app/pull-requests/42invalid",
		"https://bitbucket.org/team/app/pull-requests/9007199254740992",
		"https://bitbucket.org.attacker.example/team/app/pull-requests/42",
		"invalid",
		"https://bitbucket.org/other/app/pull-requests/42",
	])
		expect(forkPullRequestRoute(url, projects)).toBeNull();
});
