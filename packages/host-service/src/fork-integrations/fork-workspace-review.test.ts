import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { forkProviderFixture } from "../../test/helpers/fork-provider-fixture";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import { createTestDb as createBaseTestDb } from "../trpc/router/pull-requests/shared/test-db";
import type { HostServiceContext } from "../types";
import type { forkFetch } from "./fork-http";
import {
	forkLinkPreparedPrWorkspace,
	forkPreparePrWorkspace,
} from "./fork-prepare-pr-workspace";
import { forkProjectBrowserMetadata } from "./fork-project-browser-metadata";
import { forkServices } from "./fork-services";
import { ForkConnectionStore } from "./fork-store";
import {
	forkReplyToWorkspaceThread,
	forkSetWorkspaceThreadResolution,
	forkWorkspacePullRequest,
	forkWorkspacePullRequestThreads,
} from "./fork-workspace-review";

const template = createBaseTestDb();
ensureForkTables(template.$client);
const snapshot = template.$client.serialize();
template.$client.close();
const databases: Database[] = [];
function createTestDb() {
	const sqlite = Database.deserialize(snapshot);
	databases.push(sqlite);
	return drizzle(sqlite, { schema }) as unknown as HostDb;
}
afterEach(() => {
	for (const db of databases.splice(0)) db.close();
});

test("Bitbucket workspace review loads inline comments and routes replies and resolution to Bitbucket", async () => {
	const db = createTestDb();
	ensureForkTables(db.$client);
	db.insert(projects).values({ id: "project", repoPath: "/repo" }).run();
	db.insert(workspaces)
		.values({
			id: "ws",
			projectId: "project",
			worktreePath: "/workspace",
			branch: "feature",
		})
		.run();
	const store = new ForkConnectionStore(db, "org");
	const account = store.create("bitbucket", "token", null);
	store.save(account, { email: "qa@example.test", token: "bb-one" });
	const fixture = forkProviderFixture();
	fixture.comments.push({
		id: 1,
		user: { display_name: "Ada" },
		content: { raw: "Review old line" },
		inline: { path: "file.ts", from: 3 },
		created_on: "2026-10-19T08:00:00Z",
	});
	const ctx = {
		db,
		organizationId: "org",
		credentials: {},
		forkTransport: fixture.transport,
		git: async () => ({
			raw: async () => "feature\n",
			getRemotes: async () => [
				{ name: "origin", refs: { fetch: "git@bitbucket.org:team/app.git" } },
			],
		}),
	} as unknown as HostServiceContext;
	const pr = await forkWorkspacePullRequest(ctx, "ws");
	expect(
		(
			await forkProjectBrowserMetadata(ctx, [
				{
					id: "project",
					repoUrl: "https://github.com/old/repository",
					repoOwner: "old",
					repoName: "repository",
				},
			])
		)[0],
	).toMatchObject({
		repoUrl: "https://bitbucket.org/team/app",
		repoOwner: null,
		repoName: null,
	});
	expect(pr?.url).toBe("https://bitbucket.org/team/app/pull-requests/7");
	expect(pr?.checks[0]?.conclusion).toBe("success");
	const threads = await forkWorkspacePullRequestThreads(ctx, "ws");
	expect(threads?.reviewThreads[0]).toMatchObject({
		id: "bitbucket:7:1",
		diffSide: "LEFT",
		line: 3,
		path: "file.ts",
	});
	await forkReplyToWorkspaceThread(ctx, {
		workspaceId: "ws",
		commentId: 1,
		body: "Fixed",
	});
	expect(fixture.calls.at(-1)).toMatchObject({
		host: "api.bitbucket.org",
		path: "/2.0/repositories/team/app/pullrequests/7/comments",
		method: "POST",
		body: { parent: { id: 1 }, content: { raw: "Fixed" } },
	});
	await forkSetWorkspaceThreadResolution(ctx, {
		workspaceId: "ws",
		threadId: "bitbucket:7:1",
		resolved: true,
	});
	expect(fixture.calls.at(-1)?.path).toEndWith("/comments/1/resolve");
	await expect(
		forkSetWorkspaceThreadResolution(ctx, {
			workspaceId: "ws",
			threadId: "bitbucket:8:1",
			resolved: true,
		}),
	).rejects.toThrow("Review thread not found");
	expect(fixture.calls.every((c) => c.host === "api.bitbucket.org")).toBe(true);
});

test("Bitbucket draft creation and ready actions send the draft field to the provider", async () => {
	const db = createTestDb();
	ensureForkTables(db.$client);
	const store = new ForkConnectionStore(db, "org"),
		account = store.create("bitbucket", "token", null);
	store.save(account, { email: "qa@example.test", token: "draft-test" });
	const fixture = forkProviderFixture();
	const ctx = {
		db,
		organizationId: "org",
		credentials: {},
		forkTransport: fixture.transport,
	} as unknown as HostServiceContext;
	const repository = {
		provider: "bitbucket" as const,
		host: "bitbucket.org",
		owner: "team",
		name: "app",
	};
	await forkServices(ctx).scm.create(account.id, repository, {
		title: "Draft",
		description: "",
		source: "feature",
		target: "main",
		draft: true,
	});
	expect(fixture.calls.at(-1)?.body).toMatchObject({ draft: true });
	await forkServices(ctx).scm.action(account.id, repository, 7, "set-draft", {
		draft: false,
	});
	expect(fixture.calls.at(-1)).toMatchObject({
		method: "PUT",
		body: { draft: false },
	});
	ctx.forkTransport = (async (url, init) => ({
		...((await fixture.transport(url, init)) as object),
		draft: true,
	})) as typeof forkFetch;
	await expect(
		forkServices(ctx).scm.action(account.id, repository, 7, "merge", {
			head: "a".repeat(40),
		}),
	).rejects.toThrow("Refresh it before merging");
});

test("a Bitbucket PR selected in New Workspace fetches its branch and preserves launch options", async () => {
	const db = createTestDb();
	ensureForkTables(db.$client);
	db.insert(projects).values({ id: "project", repoPath: "/repo" }).run();
	const store = new ForkConnectionStore(db, "org"),
		account = store.create("bitbucket", "token", null);
	store.save(account, { email: "qa@example.test", token: "checkout-test" });
	const fetches: string[][] = [];
	const ctx = {
		db,
		organizationId: "org",
		credentials: {},
		forkTransport: forkProviderFixture().transport,
		git: async () => ({
			getRemotes: async () => [
				{ name: "origin", refs: { fetch: "git@bitbucket.org:team/app.git" } },
			],
			raw: async (args: string[]) => {
				if (args[0] === "rev-parse") throw new Error("Absent");
				return "feature";
			},
			fetch: async (args: string[]) => {
				fetches.push(args);
			},
		}),
	} as unknown as HostServiceContext;
	const input = { projectId: "project", pr: 7, agents: [{ agent: "claude" }] };
	const prepared = await forkPreparePrWorkspace(ctx, input);
	expect(prepared).toMatchObject({
		pr: undefined,
		branch: "feature",
		baseBranch: "main",
		agents: input.agents,
	});
	expect(fetches).toEqual([
		["origin", "refs/heads/feature:refs/heads/feature"],
	]);
	db.insert(workspaces)
		.values({
			id: "new",
			projectId: "project",
			branch: "feature",
			worktreePath: "/new",
		})
		.run();
	forkLinkPreparedPrWorkspace(ctx, prepared, "new");
	expect((await forkWorkspacePullRequest(ctx, "new"))?.number).toBe(7);
});
