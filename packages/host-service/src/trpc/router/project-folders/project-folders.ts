import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { projectFolders } from "../../../db/fork-schema";
import { projects } from "../../../db/schema";
import {
	folderWorkspaceId,
	isolateFolder,
	listProjectFolders,
	listWorkspaceFolders,
} from "../../../project-folders";
import { protectedProcedure, router } from "../../index";

function normalizeFolderPath(input: string): string {
	if (!isAbsolute(input)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The folder path must be absolute",
		});
	}
	const path = resolve(input);
	let isDirectory = false;
	try {
		isDirectory = statSync(path).isDirectory();
	} catch {}
	if (!isDirectory) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The folder does not exist",
		});
	}
	return path;
}

export const projectFoldersRouter = router({
	list: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(({ ctx, input }) => listProjectFolders(ctx.db, input.projectId)),

	/** The project's folders addressed through one workspace. */
	listForWorkspace: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ ctx, input }) =>
			listWorkspaceFolders(ctx.db, input.workspaceId).map((folder) => ({
				...folder,
				workspaceKey: folderWorkspaceId({
					workspaceId: input.workspaceId,
					folderId: folder.id,
				}),
			})),
		),

	add: protectedProcedure
		.input(z.object({ projectId: z.string(), path: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const project = ctx.db
				.select({ repoPath: projects.repoPath })
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			const path = normalizeFolderPath(input.path);
			if (path === resolve(project.repoPath)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This is already the project's main folder",
				});
			}
			const duplicate = ctx.db
				.select({ id: projectFolders.id })
				.from(projectFolders)
				.where(
					and(
						eq(projectFolders.projectId, input.projectId),
						eq(projectFolders.path, path),
					),
				)
				.get();
			if (duplicate) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The folder is already in the project",
				});
			}
			const last = ctx.db
				.select({ position: max(projectFolders.position) })
				.from(projectFolders)
				.where(eq(projectFolders.projectId, input.projectId))
				.get();
			const id = randomUUID();
			ctx.db
				.insert(projectFolders)
				.values({
					id,
					projectId: input.projectId,
					path,
					position: (last?.position ?? -1) + 1,
				})
				.run();
			return { id };
		}),

	setIsolate: protectedProcedure
		.input(z.object({ id: z.string(), isolateInWorktrees: z.boolean() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.update(projectFolders)
				.set({ isolateInWorktrees: input.isolateInWorktrees })
				.where(eq(projectFolders.id, input.id))
				.run();
			return { success: true };
		}),

	/** Gives an existing worktree workspace its own checkout of a git folder. */
	isolate: protectedProcedure
		.input(z.object({ workspaceId: z.string(), folderId: z.string() }))
		.mutation(async ({ ctx, input }) => ({
			isolated: await isolateFolder(ctx, input.workspaceId, input.folderId),
		})),

	remove: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.delete(projectFolders)
				.where(eq(projectFolders.id, input.id))
				.run();
			return { success: true };
		}),
});
