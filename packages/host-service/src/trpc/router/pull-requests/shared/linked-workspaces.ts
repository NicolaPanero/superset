import { and, desc, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { pullRequests, workspaces } from "../../../../db/schema";

/**
 * Reverse (PR -> workspaces) lookup. `workspaces.pullRequestId` is the single
 * "currently linked" pointer per workspace (see db/schema.ts) with no unique
 * constraint, so more than one live workspace can point at one PR (two
 * worktrees on the same branch, a stale duplicate). Most recently active
 * first, so a caller that wants exactly one takes index 0 deterministically.
 */
export function findLinkedWorkspaceIds(
	db: HostDb,
	projectId: string,
	prNumber: number,
): string[] {
	const pr = db
		.select({ id: pullRequests.id })
		.from(pullRequests)
		.where(
			and(
				eq(pullRequests.projectId, projectId),
				eq(pullRequests.prNumber, prNumber),
			),
		)
		.get();
	if (!pr) return [];

	return db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(eq(workspaces.pullRequestId, pr.id), isNull(workspaces.archivedAt)),
		)
		.orderBy(desc(workspaces.updatedAt), desc(workspaces.createdAt))
		.all()
		.map((row) => row.id);
}
