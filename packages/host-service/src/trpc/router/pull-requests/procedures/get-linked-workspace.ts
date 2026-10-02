import { z } from "zod";
import { protectedProcedure } from "../../../index";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../../workspace-creation/shared/project-helpers";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

/**
 * Whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one. A
 * project whose repository cannot be resolved answers "none" rather than
 * failing: the composer's fallback is the same either way.
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		let repo: ResolvedGithubRepo;
		try {
			repo = await resolveGithubRepo(ctx, input.projectId);
		} catch {
			return { workspaceId: null };
		}
		const rows = findPullRequestRows(ctx.db, repo, input.prNumber);
		const [workspaceId = null] = findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		);
		return { workspaceId };
	});
