import { expect, test } from "bun:test";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import {
	forkListRepositories,
	forkUniqueRepositories,
} from "./fork-repository-picker";

test("repository discovery keeps Bitbucket usable when the GitHub account fails", async () => {
	const accounts = [
		{ id: "github", provider: "github" },
		{ id: "bitbucket", provider: "bitbucket" },
	] as ForkConnection[];
	const client = {
		forkScm: {
			repositories: {
				query: async ({ connectionId }: { connectionId: string }) => {
					if (connectionId === "github")
						throw new Error("gh authentication error");
					return {
						items: [
							{
								fullName: "team/app",
								cloneUrl: "https://bitbucket.org/team/app.git",
								provider: "bitbucket",
								connectionId,
							},
						],
						nextCursor: "/next",
					};
				},
			},
		},
	} as unknown as HostServiceClient;
	const page = await forkListRepositories(client, accounts, {}, true);
	expect(page.items).toMatchObject([
		{ provider: "bitbucket", connectionId: "bitbucket" },
	]);
	expect(page.errors).toEqual(["github"]);
	expect(page.nextCursors).toEqual({ github: null, bitbucket: "/next" });
});

test("repository duplicates keep the preferred account and distinguish providers", () => {
	const preferred = {
		fullName: "team/app",
		cloneUrl: "https://bitbucket.org/team/app.git",
		provider: "bitbucket" as const,
		connectionId: "preferred",
	};
	expect(
		forkUniqueRepositories([
			preferred,
			{ ...preferred, connectionId: "other" },
			{ ...preferred, provider: "github" },
		]),
	).toEqual([preferred, { ...preferred, provider: "github" }]);
});

test("offline repository refresh preserves cached repositories without requesting account setup", async () => {
	const account = { id: "bb", provider: "bitbucket" } as ForkConnection;
	const client = {
		forkScm: {
			repositories: {
				query: async () => {
					throw { data: { code: "BAD_GATEWAY" } };
				},
			},
		},
	} as unknown as HostServiceClient;
	const cached = [
		{
			provider: "bitbucket" as const,
			connectionId: "bb",
			fullName: "team/app",
			cloneUrl: "https://bitbucket.org/team/app.git",
		},
	];
	const result = await forkListRepositories(
		client,
		[account],
		{},
		true,
		cached,
	);
	expect(result.items).toEqual(cached);
	expect(result.unavailable).toEqual([account.id]);
});
