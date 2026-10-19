import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { forkIntegrationBindings } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import { fetchPullRequestContent } from "../trpc/router/pull-requests/shared/fetch-pull-request-content";
import { fetchPullRequestDiff } from "../trpc/router/pull-requests/shared/fetch-pull-request-diff";
import { evictPullRequestContent } from "../trpc/router/pull-requests/shared/pull-request-content-cache";
import type { HostServiceContext } from "../types";
import { ForkGitCredentialProvider } from "./fork-credentials";
import { forkRequestContext } from "./fork-request-context";
import { forkWithRequestScope } from "./fork-request-scope";
import { ForkConnectionStore } from "./fork-store";

test("simultaneous GitHub and Bitbucket requests scope GitHub API and gh to their own checkout", async () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(
		"CREATE TABLE projects (id text PRIMARY KEY, repo_path text); CREATE TABLE workspaces (id text PRIMARY KEY, project_id text, worktree_path text); INSERT INTO projects VALUES ('gh', '/gh'), ('bb', '/bb'), ('gh-default', '/gh-default'); INSERT INTO workspaces VALUES ('ws-gh', 'gh', '/gh-worktree');",
	);
	ensureForkTables(sqlite);
	const db = drizzle(sqlite) as unknown as HostDb;
	try {
		const store = new ForkConnectionStore(db, "org");
		const primary = store.create("github", "token", null);
		store.save(primary, { token: "default-gh" });
		store.keepDefaultBefore("github");
		const bound = store.create("github", "token", null);
		store.save(bound, { token: "bound-gh" });
		const bb = store.create("bitbucket", "token", null);
		store.save(bb, { token: "bb-only" });
		db.insert(forkIntegrationBindings)
			.values([
				{
					scope: "org",
					projectId: "gh",
					repository: {
						provider: "github",
						host: "github.com",
						owner: "team",
						name: "app",
					},
					connectionId: bound.id,
					remote: "origin",
				},
				{
					scope: "org",
					projectId: "bb",
					repository: {
						provider: "bitbucket",
						host: "bitbucket.org",
						owner: "team",
						name: "app",
					},
					connectionId: bb.id,
					remote: "origin",
				},
			])
			.run();
		const cwd: unknown[] = [];
		let calls = 0;
		const fallback = {
			getCredentials: async () => ({ env: {} }),
			getToken: async () => "system-gh",
			credentialRemedy: () => "Reconnect",
		};
		const ctx = {
			db,
			credentials: new ForkGitCredentialProvider(fallback, store),
			github: async () => ({ auth: async () => ({ token: "default-gh" }) }),
			execGh: async (args: string[], options: { cwd?: string }) => {
				calls++;
				cwd.push(options);
				await Promise.resolve();
				if (args[1] === "diff") return `diff for ${options.cwd}`;
				return {
					number: 7,
					title: `PR for ${options.cwd}`,
					body: "",
					url: "https://github.com/team/app/pull/7",
					state: "OPEN",
					headRefName: "feature",
					baseRefName: "main",
					headRepositoryOwner: { login: "team" },
					isCrossRepository: false,
					isDraft: false,
				};
			},
		} as unknown as HostServiceContext;
		const [gh, bbCtx, workspaceCtx] = [
			forkRequestContext(ctx, { projectId: "gh" }),
			forkRequestContext(ctx, { projectId: "bb" }),
			forkRequestContext(ctx, { workspaceId: "ws-gh" }),
		];
		const auth = await Promise.all([
			gh.github().then((api) => api.auth()),
			bbCtx.github().then((api) => api.auth()),
			workspaceCtx.github().then((api) => api.auth()),
			forkRequestContext(gh, { projectId: "gh-default" })
				.github()
				.then((api) => api.auth()),
		]);
		expect(auth).toMatchObject([
			{ token: "bound-gh" },
			{ token: "default-gh" },
			{ token: "bound-gh" },
			{ token: "default-gh" },
		]);
		await gh.execGh(["api", "user"]);
		await bbCtx.execGh(["api", "user"]);
		expect(cwd).toEqual([{ cwd: "/gh" }, { cwd: "/bb" }]);
		expect(forkRequestContext(ctx, {}).credentials).toBe(ctx.credentials);
		const repo = { owner: "team", name: "app" };
		const read = (context: HostServiceContext) =>
			forkWithRequestScope(context, async () => {
				await Promise.resolve();
				const [content, diff] = await Promise.all([
					fetchPullRequestContent(repo, 7),
					fetchPullRequestDiff("team/app", 7),
				]);
				return { title: content.title, patch: diff.patch };
			});
		const expected: [
			{ title: string; patch: string },
			{ title: string; patch: string },
		] = [
			{ title: "PR for /gh", patch: "diff for /gh" },
			{ title: "PR for /bb", patch: "diff for /bb" },
		];
		expect(await Promise.all([read(gh), read(bbCtx)])).toEqual(expected);
		const fetched = calls;
		expect(await Promise.all([read(gh), read(bbCtx)])).toEqual(expected);
		expect(calls).toBe(fetched);
		forkWithRequestScope(gh, () => evictPullRequestContent(repo, 7));
		await read(bbCtx);
		expect(calls).toBe(fetched);
		await read(gh);
		expect(calls).toBe(fetched + 1);
		store.save({ ...bound, enabled: false });
		await expect(gh.github()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	} finally {
		sqlite.close();
	}
});
