import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { HostDb } from "../db/index.ts";
import {
	projectFolders,
	workspaceFolderWorktrees,
	workspaces,
} from "../db/schema.ts";
import { parseFolderWorkspaceId } from "./folder-workspace-id.ts";

export interface ProjectFolderInfo {
	id: string;
	projectId: string;
	path: string;
	name: string;
	position: number;
	exists: boolean;
	isGitRepo: boolean;
	isolateInWorktrees: boolean;
}

export function isGitRepoPath(path: string): boolean {
	return existsSync(join(path, ".git"));
}

export function toProjectFolderInfo(row: {
	id: string;
	projectId: string;
	path: string;
	position: number;
	isolateInWorktrees: boolean;
}): ProjectFolderInfo {
	const exists = existsSync(row.path);
	return {
		id: row.id,
		projectId: row.projectId,
		path: row.path,
		position: row.position,
		isolateInWorktrees: row.isolateInWorktrees,
		name: basename(row.path),
		exists,
		isGitRepo: exists && isGitRepoPath(row.path),
	};
}

export function listProjectFolders(
	db: HostDb,
	projectId: string,
): ProjectFolderInfo[] {
	return db
		.select()
		.from(projectFolders)
		.where(eq(projectFolders.projectId, projectId))
		.orderBy(asc(projectFolders.position), asc(projectFolders.createdAt))
		.all()
		.map(toProjectFolderInfo);
}

/**
 * Root path of a folder-workspace id, or null when `id` is not one or the
 * folder no longer belongs to the workspace's project.
 */
export function resolveFolderWorkspaceRoot(
	db: HostDb,
	id: string,
): string | null {
	const ref = parseFolderWorkspaceId(id);
	if (!ref) return null;
	const workspace = db
		.select({ projectId: workspaces.projectId })
		.from(workspaces)
		.where(eq(workspaces.id, ref.workspaceId))
		.get();
	if (!workspace?.projectId) return null;
	const folder = db
		.select({ path: projectFolders.path })
		.from(projectFolders)
		.where(
			and(
				eq(projectFolders.id, ref.folderId),
				eq(projectFolders.projectId, workspace.projectId),
			),
		)
		.get();
	if (!folder) return null;
	return folderWorktreePath(db, ref.workspaceId, ref.folderId) ?? folder.path;
}

export interface WorkspaceFolderInfo extends ProjectFolderInfo {
	/** Where this workspace works in the folder: its own worktree when isolated. */
	sourcePath: string;
	isolated: boolean;
}

export function listWorkspaceFolders(
	db: HostDb,
	workspaceId: string,
): WorkspaceFolderInfo[] {
	const workspace = db
		.select({ projectId: workspaces.projectId })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace?.projectId) return [];
	const rows = db
		.select()
		.from(projectFolders)
		.where(eq(projectFolders.projectId, workspace.projectId))
		.orderBy(asc(projectFolders.position), asc(projectFolders.createdAt))
		.all();
	return rows.map((row) => {
		const worktreePath = folderWorktreePath(db, workspaceId, row.id);
		return {
			...toProjectFolderInfo({ ...row, path: worktreePath ?? row.path }),
			name: basename(row.path),
			sourcePath: row.path,
			isolated: worktreePath !== null,
		};
	});
}

/**
 * The parent workspace row as seen through one of its project folders: same
 * row, with the folder as its root. Null when `id` is not a folder id.
 */
export function readFolderWorkspaceView(db: HostDb, id: string) {
	const ref = parseFolderWorkspaceId(id);
	if (!ref) return null;
	const root = resolveFolderWorkspaceRoot(db, id);
	if (!root) return null;
	const workspace = db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, ref.workspaceId))
		.get();
	if (!workspace) return null;
	return { ...workspace, id, worktreePath: root };
}

export function folderWorktreePath(
	db: HostDb,
	workspaceId: string,
	folderId: string,
): string | null {
	return (
		db
			.select({ path: workspaceFolderWorktrees.worktreePath })
			.from(workspaceFolderWorktrees)
			.where(
				and(
					eq(workspaceFolderWorktrees.workspaceId, workspaceId),
					eq(workspaceFolderWorktrees.folderId, folderId),
				),
			)
			.get()?.path ?? null
	);
}
