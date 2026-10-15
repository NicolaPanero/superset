import { basename, dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import {
	projectFolders,
	workspaceFolderWorktrees,
	workspaces,
} from "../db/schema.ts";
import { createGitEnvResolver } from "../runtime/git/git.ts";
import type { HostServiceContext } from "../types.ts";
import { getHostWorkerPool } from "../workers/host-worker-pool.ts";
import { gitAddFolderWorktreeTask } from "../workers/tasks/folder-worktrees.ts";
import { gitWorktreeRemoveTask } from "../workers/tasks/git.ts";
import { isGitRepoPath } from "./project-folders.ts";

type FolderWorktreeContext = Pick<HostServiceContext, "db" | "credentials">;

type GitEnv = Record<string, string>;

/** Git work runs in the worker pool; tests swap these for in-process versions. */
export const folderWorktreeGit = {
	add(input: {
		repoPath: string;
		worktreePath: string;
		branch: string;
		gitEnv: GitEnv;
	}) {
		return getHostWorkerPool().run(gitAddFolderWorktreeTask, input, {
			timeoutMs: 120_000,
		});
	},
	remove(input: { repoPath: string; worktreePath: string; gitEnv: GitEnv }) {
		return getHostWorkerPool().run(
			gitWorktreeRemoveTask,
			{ ...input, force: false },
			{ timeoutMs: 120_000 },
		);
	},
};

function worktreePathFor(
	workspaceWorktreePath: string,
	folder: { id: string; path: string },
): string {
	const name = `${basename(workspaceWorktreePath)}--${basename(folder.path)}-${folder.id.slice(0, 6)}`;
	return join(dirname(workspaceWorktreePath), name);
}

/**
 * Gives a worktree workspace its own checkout of one extra git folder, on the
 * workspace's branch. Returns false when the folder stays shared.
 */
export async function isolateFolder(
	ctx: FolderWorktreeContext,
	workspaceId: string,
	folderId: string,
): Promise<boolean> {
	const workspace = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (workspace?.type !== "worktree" || !workspace.projectId) return false;
	const folder = ctx.db
		.select()
		.from(projectFolders)
		.where(
			and(
				eq(projectFolders.id, folderId),
				eq(projectFolders.projectId, workspace.projectId),
			),
		)
		.get();
	if (!folder?.isolateInWorktrees || !isGitRepoPath(folder.path)) return false;
	const existing = ctx.db
		.select({ path: workspaceFolderWorktrees.worktreePath })
		.from(workspaceFolderWorktrees)
		.where(
			and(
				eq(workspaceFolderWorktrees.workspaceId, workspaceId),
				eq(workspaceFolderWorktrees.folderId, folderId),
			),
		)
		.get();
	if (existing) return true;

	const worktreePath = worktreePathFor(workspace.worktreePath, folder);
	await folderWorktreeGit.add({
		repoPath: folder.path,
		worktreePath,
		branch: workspace.branch,
		gitEnv: await createGitEnvResolver(ctx.credentials)(folder.path),
	});
	ctx.db
		.insert(workspaceFolderWorktrees)
		.values({ workspaceId, folderId, worktreePath, branch: workspace.branch })
		.run();
	return true;
}

/**
 * Best effort for every extra git folder of the workspace's project: a folder
 * that cannot get a worktree stays shared and the failure is returned.
 */
export async function provisionFolderWorktrees(
	ctx: FolderWorktreeContext,
	workspaceId: string,
): Promise<string[]> {
	let folders: (typeof projectFolders.$inferSelect)[];
	try {
		const workspace = ctx.db
			.select({ projectId: workspaces.projectId })
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (!workspace?.projectId) return [];
		folders = ctx.db
			.select()
			.from(projectFolders)
			.where(eq(projectFolders.projectId, workspace.projectId))
			.all();
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
	const failures: string[] = [];
	for (const folder of folders) {
		try {
			await isolateFolder(ctx, workspaceId, folder.id);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push(`${folder.path}: ${message}`);
		}
	}
	return failures;
}

/**
 * Removes the workspace's folder worktrees. Never forces: a worktree with
 * uncommitted work stays on disk and is reported. Branches are kept.
 */
export async function removeFolderWorktrees(
	ctx: FolderWorktreeContext,
	workspaceId: string,
): Promise<string[]> {
	let rows: { folderId: string; worktreePath: string; folderPath: string }[];
	try {
		rows = ctx.db
			.select({
				folderId: workspaceFolderWorktrees.folderId,
				worktreePath: workspaceFolderWorktrees.worktreePath,
				folderPath: projectFolders.path,
			})
			.from(workspaceFolderWorktrees)
			.innerJoin(
				projectFolders,
				eq(projectFolders.id, workspaceFolderWorktrees.folderId),
			)
			.where(eq(workspaceFolderWorktrees.workspaceId, workspaceId))
			.all();
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
	const warnings: string[] = [];
	for (const row of rows) {
		try {
			const result = await folderWorktreeGit.remove({
				repoPath: row.folderPath,
				worktreePath: row.worktreePath,
				gitEnv: await createGitEnvResolver(ctx.credentials)(row.folderPath),
			});
			if (result.stillRegistered || result.removeError) {
				throw new Error(result.removeError ?? "worktree is still registered");
			}
			ctx.db
				.delete(workspaceFolderWorktrees)
				.where(
					and(
						eq(workspaceFolderWorktrees.workspaceId, workspaceId),
						eq(workspaceFolderWorktrees.folderId, row.folderId),
					),
				)
				.run();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			warnings.push(`Kept ${row.worktreePath}: ${message}`);
		}
	}
	return warnings;
}
