import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { and, eq, inArray } from "drizzle-orm";
import { forkWorkspacePullRequests } from "../db/fork-schema";
import { workspaces } from "../db/schema";
import type { PullRequestWorkspaceSnapshot } from "../runtime/pull-requests/pull-requests";
import type { HostServiceContext } from "../types";
import { forkScmProjects } from "./fork-projects";
import { forkServices } from "./fork-services";

const REFRESH_MS = 60_000;
const DISCOVER_MS = 5 * 60_000;
const refreshing = new Set<string>();
const discovered = new Map<string, number>();

/** Finds the open Bitbucket pull request of a workspace branch and links it. */
async function discover(ctx: HostServiceContext, workspaceId: string) {
	const key = `${ctx.organizationId}:${workspaceId}`;
	const last = discovered.get(key) ?? 0;
	if (Date.now() - last < DISCOVER_MS) return;
	discovered.set(key, Date.now());
	if (discovered.size > 1000) {
		const oldest = discovered.keys().next().value;
		if (oldest) discovered.delete(oldest);
	}
	try {
		const workspace = ctx.db
			.select({ projectId: workspaces.projectId, branch: workspaces.branch })
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		if (!workspace?.projectId || !workspace.branch) return;
		const { scm, store } = forkServices(ctx);
		const accounts = store
			.list()
			.filter((c) => c.provider === "bitbucket" && c.enabled);
		if (accounts.length === 0) return;
		const [project] = await forkScmProjects(ctx, [workspace.projectId]);
		if (project?.repository.provider !== "bitbucket") return;
		const connectionId =
			project.connectionId ??
			accounts.find((c) => c.isDefault)?.id ??
			(accounts.length === 1 ? accounts[0]?.id : undefined);
		if (!connectionId) return;
		const pr = await scm.forBranch(
			connectionId,
			project.repository,
			workspace.branch,
		);
		if (!pr) return;
		ctx.db
			.insert(forkWorkspacePullRequests)
			.values({ scope: ctx.organizationId, workspaceId, pullRequest: pr })
			.onConflictDoNothing()
			.run();
	} catch (error) {
		console.warn("[fork-sidebar] pull request lookup failed", error);
	}
}

function reviewDecision(pr: ForkPullRequest) {
	const reviewers = pr.reviewers ?? [];
	if (reviewers.some((r) => r.state === "changes_requested"))
		return "changes_requested" as const;
	if (reviewers.some((r) => r.state === "approved")) return "approved" as const;
	return reviewers.length ? ("pending" as const) : null;
}

export async function forkRefreshSidebarPullRequest(
	ctx: HostServiceContext,
	workspaceId: string,
	stored: ForkPullRequest,
) {
	const key = `${ctx.organizationId}:${workspaceId}`;
	if (refreshing.has(key)) return;
	refreshing.add(key);
	try {
		const { scm } = forkServices(ctx);
		const pr = await scm.get(
			stored.connectionId,
			stored.repository,
			stored.number,
		);
		const checks =
			pr.state === "open"
				? await scm
						.commitChecks(stored.connectionId, stored.repository, pr.headCommit)
						.catch(() => null)
				: null;
		ctx.db
			.update(forkWorkspacePullRequests)
			.set({
				pullRequest: {
					...pr,
					checksStatus: checks?.status ?? stored.checksStatus ?? "none",
					fetchedAt: Date.now(),
				},
			})
			.where(
				and(
					eq(forkWorkspacePullRequests.scope, ctx.organizationId),
					eq(forkWorkspacePullRequests.workspaceId, workspaceId),
					eq(forkWorkspacePullRequests.pullRequest, stored),
				),
			)
			.run();
	} catch (error) {
		console.warn("[fork-sidebar] pull request refresh failed", error);
	} finally {
		refreshing.delete(key);
	}
}

/**
 * The sidebar reads pull requests from the GitHub sync. A workspace linked to
 * a Bitbucket pull request gets it from the fork's link instead, refreshed
 * in the background at most once a minute.
 */
export function forkWithBitbucketPullRequests(
	ctx: HostServiceContext,
	snapshots: PullRequestWorkspaceSnapshot[],
): PullRequestWorkspaceSnapshot[] {
	const missing = snapshots
		.filter((s) => !s.pullRequest)
		.map((s) => s.workspaceId);
	if (missing.length === 0) return snapshots;
	const linked = new Map(
		ctx.db
			.select()
			.from(forkWorkspacePullRequests)
			.where(
				and(
					eq(forkWorkspacePullRequests.scope, ctx.organizationId),
					inArray(forkWorkspacePullRequests.workspaceId, missing),
				),
			)
			.all()
			.filter((row) => row.pullRequest.repository.provider === "bitbucket")
			.map((row) => [row.workspaceId, row.pullRequest]),
	);
	return snapshots.map((snapshot) => {
		const pr = linked.get(snapshot.workspaceId);
		if (!pr) {
			void discover(ctx, snapshot.workspaceId);
			return snapshot;
		}
		if (pr.state === "open" && Date.now() - (pr.fetchedAt ?? 0) > REFRESH_MS)
			void forkRefreshSidebarPullRequest(ctx, snapshot.workspaceId, pr);
		return {
			...snapshot,
			pullRequest: {
				url: pr.url,
				number: pr.number,
				title: pr.title,
				state: pr.state === "open" && pr.isDraft ? "draft" : pr.state,
				reviewDecision: reviewDecision(pr),
				checksStatus: pr.checksStatus ?? "none",
				checks: [],
				mergedAt: null,
			},
			lastFetchedAt: pr.fetchedAt ? new Date(pr.fetchedAt).toISOString() : null,
		};
	});
}
