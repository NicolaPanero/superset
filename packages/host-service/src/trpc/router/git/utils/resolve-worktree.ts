import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { resolveFolderWorkspaceRoot } from "../../../../project-folders";
import {
	getPathState,
	inaccessiblePathMessage,
} from "../../../../runtime/path-state";
import type { protectedProcedure } from "../../../index";

export function resolveWorktreePath(
	ctx: Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]["ctx"],
	workspaceId: string,
): string {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	const worktreePath =
		workspace?.worktreePath ?? resolveFolderWorkspaceRoot(ctx.db, workspaceId);
	if (!worktreePath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
	// A worktree deleted outside the app is a routine lifecycle state, not a
	// bug — classify it here so simple-git's construct error can't escape any
	// git.* procedure as a reportable 500.
	const state = getPathState(worktreePath);
	if (state === "inaccessible") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: inaccessiblePathMessage(worktreePath),
		});
	}
	if (state === "missing") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Worktree no longer exists on disk",
			cause: { kind: "WORKTREE_MISSING", worktreePath },
		});
	}
	return worktreePath;
}
