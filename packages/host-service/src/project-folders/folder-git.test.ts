import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { simpleGit } from "simple-git";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import { gitRouter } from "../trpc/router/git";
import { projectFoldersRouter } from "../trpc/router/project-folders";
import { workspaceRouter } from "../trpc/router/workspace";
import type { HostServiceContext } from "../types";

const root = mkdtempSync(join(tmpdir(), "folder-git-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("git procedures on an extra project folder", () => {
	test("status, stage and commit work through the folder's workspace key", async () => {
		const db = drizzle(new Database(":memory:"), {
			schema,
		}) as unknown as HostDb;
		migrate(db as never, {
			migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
		});
		const main = join(root, "main");
		const extra = join(root, "extra");
		mkdirSync(main);
		mkdirSync(extra);
		const git = simpleGit(extra);
		await git.init(["-b", "main"]);
		await git.addConfig("user.email", "t@example.com");
		await git.addConfig("user.name", "t");
		await git.addConfig("commit.gpgsign", "false");
		writeFileSync(join(extra, "a.txt"), "one\n");
		await git.add(".");
		await git.commit("init");
		writeFileSync(join(extra, "a.txt"), "two\n");

		db.insert(projects).values({ id: "p1", repoPath: main, name: "p" }).run();
		db.insert(workspaces)
			.values({
				id: "w1",
				projectId: "p1",
				worktreePath: main,
				branch: "main",
				name: "w",
			})
			.run();
		const ctx = {
			db,
			isAuthenticated: true,
			userId: "u",
			credentials: {
				getCredentials: async () => ({ env: {} }),
				getToken: async () => null,
			},
			eventBus: { broadcastGitChanged: () => {} },
		} as unknown as HostServiceContext;

		const folders = projectFoldersRouter.createCaller(ctx);
		await folders.add({ projectId: "p1", path: extra });
		const [folder] = await folders.listForWorkspace({ workspaceId: "w1" });
		const workspaceId = folder?.workspaceKey ?? "";

		const view = await workspaceRouter
			.createCaller(ctx)
			.get({ id: workspaceId });
		expect(view.worktreePath).toBe(extra);

		const gitApi = gitRouter.createCaller(ctx);
		const before = await gitApi.getStatus({ workspaceId });
		expect(before.currentBranch.name).toBe("main");
		expect(before.unstaged.map((file) => file.path)).toEqual(["a.txt"]);

		await gitApi.stageFile({ workspaceId, filePath: "a.txt" });
		const staged = await gitApi.getStatus({ workspaceId });
		expect(staged.staged.map((file) => file.path)).toEqual(["a.txt"]);

		await gitApi.commit({ workspaceId, message: "change a" });
		const after = await gitApi.getStatus({ workspaceId });
		expect(after.staged).toEqual([]);
		expect(after.unstaged).toEqual([]);
		expect((await git.log()).latest?.message).toBe("change a");
	}, 60_000);
});
