import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { projects, workspaces } from "../../../db/schema";
import {
	folderWorkspaceId,
	parseFolderWorkspaceId,
	resolveFolderWorkspaceRoot,
} from "../../../project-folders";
import type { HostServiceContext } from "../../../types";
import { createCallerFactory } from "../../index";
import { projectFoldersRouter } from "./project-folders";

const root = mkdtempSync(join(tmpdir(), "project-folders-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function setup() {
	const db = drizzle(new Database(":memory:"), {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../../drizzle"),
	});
	const dir = mkdtempSync(join(root, "case-"));
	const repoPath = join(dir, "main");
	mkdirSync(repoPath);
	db.insert(projects).values({ id: "p1", repoPath, name: "demo" }).run();
	db.insert(workspaces)
		.values({
			id: "w1",
			projectId: "p1",
			worktreePath: repoPath,
			branch: "main",
			name: "w1",
		})
		.run();
	const ctx = {
		db,
		userId: "alice",
		isAuthenticated: true,
	} as unknown as HostServiceContext;
	return {
		db,
		dir,
		repoPath,
		api: createCallerFactory(projectFoldersRouter)(ctx),
	};
}

describe("folder workspace ids", () => {
	test("round-trip and reject plain workspace ids", () => {
		const id = folderWorkspaceId({ workspaceId: "w1", folderId: "f1" });
		expect(parseFolderWorkspaceId(id)).toEqual({
			workspaceId: "w1",
			folderId: "f1",
		});
		expect(parseFolderWorkspaceId("w1")).toBeNull();
		expect(parseFolderWorkspaceId("pf~w1")).toBeNull();
	});
});

describe("projectFolders router", () => {
	test("adds, lists, resolves and removes a folder", async () => {
		const { api, db, dir } = setup();
		const extra = join(dir, "extra");
		mkdirSync(join(extra, ".git"), { recursive: true });

		const { id } = await api.add({ projectId: "p1", path: extra });
		const [folder] = await api.list({ projectId: "p1" });
		expect(folder).toMatchObject({
			id,
			path: extra,
			name: "extra",
			isGitRepo: true,
			exists: true,
		});

		const [viaWorkspace] = await api.listForWorkspace({ workspaceId: "w1" });
		expect(viaWorkspace?.workspaceKey).toBe(
			folderWorkspaceId({ workspaceId: "w1", folderId: id }),
		);
		expect(
			resolveFolderWorkspaceRoot(db, viaWorkspace?.workspaceKey ?? ""),
		).toBe(extra);

		await api.remove({ id });
		expect(await api.list({ projectId: "p1" })).toEqual([]);
		expect(
			resolveFolderWorkspaceRoot(db, viaWorkspace?.workspaceKey ?? ""),
		).toBeNull();
	});

	test("rejects the main folder, duplicates, relative and missing paths", async () => {
		const { api, repoPath, dir } = setup();
		const extra = join(dir, "extra");
		mkdirSync(extra);
		await api.add({ projectId: "p1", path: extra });

		await expect(
			api.add({ projectId: "p1", path: repoPath }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			api.add({ projectId: "p1", path: extra }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			api.add({ projectId: "p1", path: "relative/dir" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			api.add({ projectId: "p1", path: join(dir, "missing") }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
