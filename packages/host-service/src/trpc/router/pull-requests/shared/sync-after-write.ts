import type { HostServiceContext } from "../../../../types";
import { findLinkedWorkspaceIds } from "./linked-workspaces";
import { evictPullRequestContent } from "./pull-request-content-cache";

interface SyncPullRequestAfterWriteInput {
	repo: { owner: string; name: string };
	projectId: string;
	prNumber: number;
	/** Names the write in the warning when the refresh fails. */
	action: "merge" | "close" | "reopen";
}

/**
 * After GitHub accepted a state change, bring the host's own copies in line
 * before the caller's refetch lands: the content cache would replay the
 * pre-write `gh pr view` for up to its TTL, and the `pull_requests` row the
 * sidebar chips read would wait for the next sweep. The refresh is scoped to
 * the workspaces linked to this PR and rides the per-workspace sync queue, so
 * it registers nothing and coalesces with a sweep already in flight.
 */
export async function syncPullRequestAfterWrite(
	ctx: Pick<HostServiceContext, "db" | "runtime">,
	input: SyncPullRequestAfterWriteInput,
): Promise<void> {
	evictPullRequestContent(input.repo, input.prNumber);

	const workspaceIds = findLinkedWorkspaceIds(
		ctx.db,
		input.projectId,
		input.prNumber,
	);
	if (workspaceIds.length === 0) return;

	// GitHub already applied the change: a refresh hiccup (gh timeout, rate
	// limit) must not surface as a failed action; the sweep heals the row.
	try {
		await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
			workspaceIds,
		);
	} catch (error) {
		console.warn(
			`[pull-requests:${input.action}] GitHub applied the change but the workspace refresh failed`,
			{
				projectId: input.projectId,
				prNumber: input.prNumber,
				workspaceIds,
				error,
			},
		);
	}
}
