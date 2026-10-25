import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { simpleGit } from "simple-git";
import type { HostDb } from "../db";
import { projectFolders } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import type { HostServiceContext } from "../types";
import { folderWorkspaceId } from "./folder-workspace-id";
import {
	folderWorktreeGit,
	isolateFolder,
	provisionFolderWorktrees,
	removeFolderWorktrees,
} from "./folder-worktrees";
import {
	listWorkspaceFolders,
	resolveFolderWorkspaceRoot,
} from "./project-folders";

const root = mkdtempSync(join(tmpdir(), "folder-worktrees-"));
const originalGit = { ...folderWorktreeGit };
afterAll(() => {
	Object.assign(folderWorktreeGit, originalGit);
	rmSync(root, { recursive: true, force: true });
});

folderWorktreeGit.add = async ({ repoPath, worktreePath, branch }) => {
	const git = simpleGit(repoPath);
	const exists = (await git.raw(["branch", "--list", branch])).trim();
	await git.raw(
		exists
			? ["worktree", "add", worktreePath, branch]
			: ["worktree", "add", "--no-track", "-b", branch, worktreePath],
	);
	return { created: true };
};
folderWorktreeGit.remove = async ({ repoPath, worktreePath }) => {
	try {
		await simpleGit(repoPath).raw(["worktree", "remove", worktreePath]);
		return { stillRegistered: false };
	} catch (error) {
		return {
			stillRegistered: true,
			removeError: error instanceof Error ? error.message : String(error),
		};
	}
};

async function initRepo(path: string) {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init(["-b", "main"]);
	await git.addConfig("user.email", "t@example.com");
	await git.addConfig("user.name", "t");
	writeFileSync(join(path, "a.txt"), "a");
	await git.add(".");
	await git.commit("init");
}

async function setup(type: "worktree" | "local" = "worktree") {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	ensureForkTables(sqlite);
	const dir = mkdtempSync(join(root, "case-"));
	const main = join(dir, "main");
	const workspaceDir = join(dir, "worktrees", "feature");
	const extra = join(dir, "extra");
	mkdirSync(workspaceDir, { recursive: true });
	await initRepo(main);
	await initRepo(extra);
	db.insert(projects).values({ id: "p1", repoPath: main, name: "p" }).run();
	db.insert(workspaces)
		.values({
			id: "w1",
			projectId: "p1",
			worktreePath: workspaceDir,
			branch: "feature",
			name: "w",
			type,
		})
		.run();
	db.insert(projectFolders)
		.values({ id: "f1abcdef", projectId: "p1", path: extra })
		.run();
	const ctx = {
		db,
		credentials: { getCredentials: async () => ({ env: {} }) },
	} as unknown as HostServiceContext;
	return { db, ctx, extra, workspaceDir };
}

describe("folder worktrees", () => {
	test("isolates a git folder on the workspace branch and resolves to it", async () => {
		const { db, ctx, extra } = await setup();

		const failures = await provisionFolderWorktrees(ctx, "w1");

		expect(failures).toEqual([]);
		const [folder] = listWorkspaceFolders(db, "w1");
		expect(folder?.isolated).toBe(true);
		expect(folder?.name).toBe("extra");
		expect(folder?.sourcePath).toBe(extra);
		expect(folder?.path).not.toBe(extra);
		expect(existsSync(folder?.path ?? "")).toBe(true);
		expect(
			await simpleGit(folder?.path).revparse(["--abbrev-ref", "HEAD"]),
		).toBe("feature");
		expect(
			resolveFolderWorkspaceRoot(
				db,
				folderWorkspaceId({ workspaceId: "w1", folderId: "f1abcdef" }),
			),
		).toBe(folder?.path ?? null);
	});

	test("keeps the folder shared for local workspaces and when opted out", async () => {
		const local = await setup("local");
		expect(await isolateFolder(local.ctx, "w1", "f1abcdef")).toBe(false);

		const optedOut = await setup();
		optedOut.db.update(projectFolders).set({ isolateInWorktrees: false }).run();
		expect(await isolateFolder(optedOut.ctx, "w1", "f1abcdef")).toBe(false);
		expect(listWorkspaceFolders(optedOut.db, "w1")[0]?.isolated).toBe(false);
	});

	test("removes a clean worktree and keeps one with uncommitted work", async () => {
		const clean = await setup();
		await provisionFolderWorktrees(clean.ctx, "w1");
		const cleanPath = listWorkspaceFolders(clean.db, "w1")[0]?.path ?? "";
		expect(await removeFolderWorktrees(clean.ctx, "w1")).toEqual([]);
		expect(existsSync(cleanPath)).toBe(false);
		expect(listWorkspaceFolders(clean.db, "w1")[0]?.isolated).toBe(false);

		const dirty = await setup();
		await provisionFolderWorktrees(dirty.ctx, "w1");
		const dirtyPath = listWorkspaceFolders(dirty.db, "w1")[0]?.path ?? "";
		writeFileSync(join(dirtyPath, "new.txt"), "work");
		const warnings = await removeFolderWorktrees(dirty.ctx, "w1");
		expect(warnings).toHaveLength(1);
		expect(existsSync(join(dirtyPath, "new.txt"))).toBe(true);
	});
});
