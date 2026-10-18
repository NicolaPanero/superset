import { expect, test } from "bun:test";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	forkKeepUnavailablePullRequests,
	forkPullRequestSearch,
} from "./searchPullRequests";

test("unified PR search probes each host once and keeps the released-host fallback", async () => {
	let version = 2;
	let probes = 0;
	let legacyCalls = 0;
	let unifiedCalls = 0;
	const page = { pullRequests: [], totalCount: 0, hasNextPage: false, page: 1 };
	const client = {
		forkConnections: {
			list: {
				query: async () => {
					probes++;
					return { version };
				},
			},
		},
		forkScm: {
			searchPullRequests: {
				query: async () => {
					unifiedCalls++;
					return { ...page, warnings: [] };
				},
			},
		},
		workspaceCreation: {
			searchPullRequests: {
				query: async () => {
					legacyCalls++;
					return page;
				},
			},
		},
	} as unknown as HostServiceClient;
	await forkPullRequestSearch(client).query({ projectId: "project" });
	await forkPullRequestSearch(client).query({ projectId: "project" });
	expect([probes, unifiedCalls, legacyCalls]).toEqual([1, 2, 0]);
	version = 1;
	await forkPullRequestSearch({ ...client }).query({ projectId: "project" });
	expect([probes, unifiedCalls, legacyCalls]).toEqual([2, 2, 1]);
});

test("an offline refresh keeps cached rows only for the unreachable project", () => {
	const rows = ["bb", "gh"].map((projectId) => ({
		projectId,
		prNumber: 12,
		updatedAt: "2026-10-17",
	}));
	const previous = {
		pullRequests: rows,
		totalCount: 2,
		hasNextPage: false,
		page: 1,
		warnings: [],
	} as unknown as Parameters<typeof forkKeepUnavailablePullRequests>[0];
	const failed = {
		...previous,
		pullRequests: [],
		totalCount: 0,
		warnings: [
			{
				repository: "team/app",
				kind: "request" as const,
				projectId: "bb",
				unavailable: true,
			},
		],
	};
	expect(
		forkKeepUnavailablePullRequests(failed, previous).pullRequests.map(
			(pr) => pr.projectId,
		),
	).toEqual(["bb"]);
	expect(
		forkKeepUnavailablePullRequests({ ...failed, warnings: [] }, previous)
			.pullRequests,
	).toEqual([]);
});
