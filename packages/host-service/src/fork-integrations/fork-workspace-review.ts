import {
	type ForkComment,
	type ForkPullRequest,
	forkRepositoryKey,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { forkWorkspacePullRequests } from "../db/fork-schema";
import { workspaces } from "../db/schema";
import type {
	CheckRun,
	IssueComment,
	PullRequestReviewDecision,
	PullRequestReviewThread,
} from "../trpc/router/git/types";
import type { HostServiceContext } from "../types";
import { forkScmProjects } from "./fork-projects";
import { forkServices } from "./fork-services";

export async function forkWorkspaceReviewTarget(
	ctx: HostServiceContext,
	workspaceId: string,
) {
	const workspace = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace?.projectId) return null;
	const [project] = await forkScmProjects(ctx, [workspace.projectId]);
	if (project?.repository.provider !== "bitbucket") return null;
	const { scm, store } = forkServices(ctx);
	const accounts = store
		.list()
		.filter((c) => c.enabled && c.provider === "bitbucket");
	const connectionId =
		project.connectionId ??
		accounts.find((c) => c.isDefault)?.id ??
		(accounts.length === 1 ? accounts[0]?.id : undefined);
	if (!connectionId) return null;
	const stored = ctx.db
		.select()
		.from(forkWorkspacePullRequests)
		.where(
			and(
				eq(forkWorkspacePullRequests.scope, ctx.organizationId),
				eq(forkWorkspacePullRequests.workspaceId, workspaceId),
			),
		)
		.get()?.pullRequest;
	const matching =
		stored &&
		forkRepositoryKey(stored.repository) ===
			forkRepositoryKey(project.repository)
			? stored
			: null;
	const pr = matching
		? await scm.get(connectionId, project.repository, matching.number)
		: workspace.branch
			? await scm.forBranch(connectionId, project.repository, workspace.branch)
			: null;
	if (!pr) return null;
	if (stored)
		ctx.db
			.update(forkWorkspacePullRequests)
			.set({ pullRequest: pr })
			.where(
				and(
					eq(forkWorkspacePullRequests.scope, ctx.organizationId),
					eq(forkWorkspacePullRequests.workspaceId, workspaceId),
					eq(forkWorkspacePullRequests.pullRequest, stored),
				),
			)
			.run();
	else
		ctx.db
			.insert(forkWorkspacePullRequests)
			.values({ scope: ctx.organizationId, workspaceId, pullRequest: pr })
			.onConflictDoNothing()
			.run();
	return { pr, scm, connectionId, repository: project.repository };
}

export async function forkWorkspacePullRequest(
	ctx: HostServiceContext,
	workspaceId: string,
) {
	const target = await forkWorkspaceReviewTarget(ctx, workspaceId);
	if (!target) return null;
	const { pr, scm, connectionId, repository } = target;
	const status = await scm.commitChecks(
		connectionId,
		repository,
		pr.headCommit,
	);
	const checks: CheckRun[] = status.checks.map((check) => ({
		name: check.name,
		status: check.status === "pending" ? "pending" : "completed",
		conclusion:
			check.status === "pending"
				? null
				: check.status === "success"
					? "success"
					: "failure",
		detailsUrl: check.url || null,
		startedAt: null,
		completedAt: null,
	}));
	const reviewDecision: PullRequestReviewDecision | null = pr.reviewers?.some(
		(r) => r.state === "changes_requested",
	)
		? "changes_requested"
		: pr.reviewers?.some((r) => r.state === "approved")
			? "approved"
			: "review_required";
	return {
		number: pr.number,
		url: pr.url,
		title: pr.title,
		body: pr.description as string | null,
		state: pr.state,
		isDraft: pr.isDraft ?? false,
		reviewDecision,
		mergeable: "unknown" as const,
		headRefName: pr.sourceBranch,
		updatedAt: pr.updatedAt,
		checks,
		repoOwner: repository.owner,
		repoName: repository.name,
	};
}

export function forkWorkspaceReviewThreads(
	pr: ForkPullRequest,
	comments: ForkComment[],
) {
	const byId = new Map(comments.map((comment) => [comment.id, comment]));
	const groups = new Map<
		string,
		{ root: ForkComment; comments: ForkComment[] }
	>();
	for (const comment of comments) {
		let root = comment;
		const seen = new Set<string>();
		while (root.parentId && !seen.has(root.id)) {
			seen.add(root.id);
			const parent = byId.get(root.parentId);
			if (!parent) break;
			root = parent;
		}
		const group = groups.get(root.id) ?? { root, comments: [] };
		if (!comment.deleted) group.comments.push(comment);
		groups.set(root.id, group);
	}
	const reviewThreads: PullRequestReviewThread[] = [];
	const conversationComments: IssueComment[] = [];
	for (const { root, comments: thread } of groups.values()) {
		if (!thread.length) continue;
		thread.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		if (root.path && root.line != null)
			reviewThreads.push({
				id: `bitbucket:${pr.number}:${root.id}`,
				isResolved: root.resolved ?? false,
				isOutdated: false,
				diffSide: root.side === "old" ? "LEFT" : "RIGHT",
				line: root.line,
				path: root.path,
				comments: thread.map((c) => ({
					id: c.id,
					databaseId: Number(c.id),
					author: { login: c.author, avatarUrl: "" },
					body: c.body,
					createdAt: c.createdAt,
				})),
			});
		else
			for (const c of thread)
				conversationComments.push({
					id: Number(c.id),
					user: { login: c.author, avatarUrl: "" },
					body: c.body,
					createdAt: c.createdAt,
					htmlUrl: `${pr.url}#comment-${c.id}`,
				});
	}
	return { reviewThreads, conversationComments };
}

export async function forkWorkspacePullRequestThreads(
	ctx: HostServiceContext,
	workspaceId: string,
) {
	const target = await forkWorkspaceReviewTarget(ctx, workspaceId);
	if (!target) return null;
	const comments: ForkComment[] = [];
	let cursor: string | undefined;
	do {
		const page = await target.scm.comments(
			target.connectionId,
			target.repository,
			target.pr.number,
			cursor,
		);
		comments.push(...page.items);
		cursor = page.nextCursor ?? undefined;
	} while (cursor);
	return forkWorkspaceReviewThreads(target.pr, comments);
}

export async function forkSetWorkspaceThreadResolution(
	ctx: HostServiceContext,
	input: { workspaceId: string; threadId: string; resolved: boolean },
) {
	const target = await forkWorkspaceReviewTarget(ctx, input.workspaceId);
	if (!target) return null;
	const match = /^bitbucket:(\d+):(\d+)$/.exec(input.threadId);
	if (!match || Number(match[1]) !== target.pr.number)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Review thread not found",
		});
	await target.scm.action(
		target.connectionId,
		target.repository,
		target.pr.number,
		input.resolved ? "resolve" : "unresolve",
		{ commentId: match[2] },
	);
	return { threadId: input.threadId, isResolved: input.resolved };
}

export async function forkReplyToWorkspaceThread(
	ctx: HostServiceContext,
	input: { workspaceId: string; commentId: number; body: string },
) {
	const target = await forkWorkspaceReviewTarget(ctx, input.workspaceId);
	if (!target) return null;
	const result = (await target.scm.action(
		target.connectionId,
		target.repository,
		target.pr.number,
		"reply",
		{ commentId: String(input.commentId), body: input.body },
	)) as { id: number };
	return { id: result.id };
}
