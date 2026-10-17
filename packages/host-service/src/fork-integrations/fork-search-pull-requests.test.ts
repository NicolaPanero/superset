import { expect, test } from "bun:test";
import type {
	ForkConnection,
	ForkPullRequest,
} from "@superset/shared/fork-integrations";
import type { ForkScmProject } from "./fork-projects";
import {
	forkPullRequestSearchInput,
	forkSearchProviderPullRequests,
} from "./fork-search-pull-requests";

const repository = {
	provider: "bitbucket",
	host: "bitbucket.org",
	owner: "team",
	name: "app",
} as const;
const project: ForkScmProject = {
	projectId: "bb",
	name: "App",
	repository,
	connectionId: "bb-account",
	remote: "origin",
};
const account = {
	id: "bb-account",
	provider: "bitbucket",
	enabled: true,
} as ForkConnection;
const pr: ForkPullRequest = {
	repository,
	connectionId: account.id,
	number: 12,
	title: "Fix navigation",
	description: "",
	url: "https://bitbucket.org/team/app/pull-requests/12",
	state: "open",
	author: "Ada",
	sourceBranch: "fix/navigation",
	targetBranch: "main",
	headCommit: "abc",
	updatedAt: "2026-10-17T10:00:00Z",
};

test("Bitbucket projects never enter the GitHub search path", async () => {
	let githubCalls = 0;
	const result = await forkSearchProviderPullRequests(
		forkPullRequestSearchInput.parse({
			projectId: "bb",
			page: 2,
			query: "navigation",
		}),
		{
			projects: [project],
			connections: [account],
			github: async () => {
				githubCalls++;
				throw new Error("Repository has no GitHub remote");
			},
			bitbucket: async (id, repo, input) => {
				expect([id, repo, input.page, input.query]).toEqual([
					account.id,
					repository,
					2,
					"navigation",
				]);
				return { items: [pr], totalCount: 61, nextCursor: "/next" };
			},
		},
	);
	expect(githubCalls).toBe(0);
	expect(result.pullRequests[0]).toMatchObject({
		provider: "bitbucket",
		projectId: "bb",
		prNumber: 12,
	});
	expect(result).toMatchObject({
		totalCount: 61,
		hasNextPage: true,
		warnings: [],
	});
});

test("a missing Bitbucket account preserves GitHub results and explains the unavailable repository", async () => {
	const githubProject: ForkScmProject = {
		...project,
		projectId: "gh",
		connectionId: null,
		repository: { ...repository, provider: "github", host: "github.com" },
	};
	const result = await forkSearchProviderPullRequests(
		forkPullRequestSearchInput.parse({
			projectId: "bb",
			projectIds: ["bb", "gh"],
		}),
		{
			projects: [project, githubProject],
			connections: [],
			bitbucket: async () => {
				throw new Error("No request without a connection");
			},
			github: async (input) => {
				expect(input.projectIds).toEqual(["gh"]);
				return {
					pullRequests: [
						{
							projectId: "gh",
							prNumber: 12,
							title: "Update",
							url: "https://github.com/team/app/pull/12",
							state: "open",
							isDraft: false,
							authorLogin: "ada",
							updatedAt: null,
							additions: null,
							deletions: null,
							checks: [],
							checksStatus: "none",
							headRefName: "update",
						},
					],
					totalCount: 1,
					hasNextPage: false,
					page: 1,
				};
			},
		},
	);
	expect(result.pullRequests.map((row) => row.provider)).toEqual(["github"]);
	expect(result.warnings).toEqual([
		{ repository: "team/app", kind: "connection" },
	]);
});
