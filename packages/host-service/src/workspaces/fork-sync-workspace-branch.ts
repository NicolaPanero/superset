import { and, eq, isNull } from "drizzle-orm";
import { forkWorkspacePullRequests } from "../db/fork-schema";
import { workspaces } from "../db/schema";
import type { HostServiceContext } from "../types";
import {
	getLocalWorkspace,
	updateLocalWorkspace,
} from "./local-workspace-store";

type Context = Pick<HostServiceContext, "db" | "eventBus">;

export function forkSyncWorkspaceBranch(
	ctx: Context,
	workspaceId: string,
	branch: string,
) {
	const row = getLocalWorkspace(ctx.db, workspaceId);
	if (!row || row.archivedAt !== null || !row.projectId || !branch) return row;
	if (row.branch !== branch) {
		ctx.db
			.update(workspaces)
			.set({
				pullRequestId: null,
				suppressedPullRequestId: null,
				upstreamOwner: null,
				upstreamRepo: null,
				upstreamBranch: null,
			})
			.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
			.run();
		updateLocalWorkspace(ctx, workspaceId, { branch });
	}
	const current = getLocalWorkspace(ctx.db, workspaceId);
	const links = ctx.db
		.select()
		.from(forkWorkspacePullRequests)
		.where(eq(forkWorkspacePullRequests.workspaceId, workspaceId))
		.all();
	for (const link of links) {
		if (
			link.pullRequest.sourceBranch === branch ||
			(branch !== "HEAD" &&
				link.pullRequest.sourceBranch === current?.upstreamBranch)
		)
			continue;
		ctx.db
			.delete(forkWorkspacePullRequests)
			.where(
				and(
					eq(forkWorkspacePullRequests.scope, link.scope),
					eq(forkWorkspacePullRequests.workspaceId, workspaceId),
				),
			)
			.run();
	}
	return current;
}

export async function forkReadWorkspaceBranch(
	ctx: Pick<HostServiceContext, "db" | "eventBus" | "git">,
	workspaceId: string,
) {
	const row = getLocalWorkspace(ctx.db, workspaceId);
	if (!row || !row.projectId || row.archivedAt !== null) return row;
	const git = await ctx.git(row.worktreePath);
	const branch = (
		await git
			.raw(["symbolic-ref", "--short", "HEAD"])
			.catch(() => git.raw(["rev-parse", "--abbrev-ref", "HEAD"]))
	).trim();
	return forkSyncWorkspaceBranch(ctx, workspaceId, branch);
}

export function forkPublishWorkspaceBranch(
	ctx: Context,
	workspaceId: string,
	branch: string,
) {
	const row = forkSyncWorkspaceBranch(ctx, workspaceId, branch);
	if (!row || row.archivedAt !== null) return;
	ctx.db
		.update(workspaces)
		.set({ pullRequestId: null })
		.where(eq(workspaces.id, workspaceId))
		.run();
	updateLocalWorkspace(ctx, workspaceId, { branch });
}
