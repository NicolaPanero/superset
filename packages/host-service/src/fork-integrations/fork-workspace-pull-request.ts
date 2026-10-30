import {
	type ForkRepositoryRef,
	forkRepositoryKey,
	parseForkRemote,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	forkIntegrationBindings,
	forkWorkspacePullRequests,
} from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import { forkReadWorkspaceBranch } from "../workspaces/fork-sync-workspace-branch";
import {
	forkAdvanceLinkedTasks,
	forkLinkedTasks,
	forkPullRequestTitle,
} from "./fork-jira-workflow";
import { forkScmProjects } from "./fork-projects";
import { forkServices as services } from "./fork-services";

/** Opens (or finds) the pull request for a workspace branch on Bitbucket or GitHub. */
export async function forkCreateWorkspacePullRequest(
	ctx: HostServiceContext,
	input: {
		connectionId: string;
		repository: ForkRepositoryRef;
		workspaceId: string;
		title: string;
		description: string;
		target: string;
		draft?: boolean;
	},
) {
	const workspace = await forkReadWorkspaceBranch(ctx, input.workspaceId);
	if (!workspace?.projectId || !workspace.branch || workspace.branch === "HEAD")
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	const git = await ctx.git(workspace.worktreePath);
	const binding = ctx.db
		.select()
		.from(forkIntegrationBindings)
		.where(
			and(
				eq(forkIntegrationBindings.scope, ctx.organizationId),
				eq(forkIntegrationBindings.projectId, workspace.projectId),
			),
		)
		.get();
	const remote = binding?.remote ?? "origin";
	const actual = parseForkRemote(
		(await git.getRemotes(true)).find((r) => r.name === remote)?.refs.push ??
			"",
	);
	if (
		!actual ||
		forkRepositoryKey(actual) !== forkRepositoryKey(input.repository)
	)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The selected repository does not match this workspace",
		});
	const { scm } = services(ctx);
	scm.assert(input.connectionId, input.repository);
	ctx.db
		.insert(forkIntegrationBindings)
		.values({
			scope: ctx.organizationId,
			projectId: workspace.projectId,
			repository: input.repository,
			connectionId: input.connectionId,
			remote,
		})
		.onConflictDoUpdate({
			target: [
				forkIntegrationBindings.scope,
				forkIntegrationBindings.projectId,
			],
			set: {
				connectionId: input.connectionId,
				repository: input.repository,
				remote,
			},
		})
		.run();
	let pr = await scm.forBranch(
		input.connectionId,
		input.repository,
		workspace.branch,
		input.target,
	);
	if (!pr) {
		await (await ctx.git(workspace.worktreePath)).push(
			remote,
			workspace.branch,
		);
		const tasks = forkLinkedTasks(ctx, workspace.id);
		const description = [
			input.description,
			...tasks.map((t) => `[${t.key}](${t.url})`),
		]
			.filter(Boolean)
			.join("\n\n");
		pr = await scm.create(input.connectionId, input.repository, {
			title: forkPullRequestTitle(ctx, workspace.id, input.title),
			description,
			source: workspace.branch,
			target: input.target,
			draft: input.draft,
		});
		await forkAdvanceLinkedTasks(ctx, workspace.id, "review");
	}
	ctx.db
		.insert(forkWorkspacePullRequests)
		.values({
			scope: ctx.organizationId,
			workspaceId: workspace.id,
			pullRequest: pr,
		})
		.onConflictDoUpdate({
			target: [
				forkWorkspacePullRequests.scope,
				forkWorkspacePullRequests.workspaceId,
			],
			set: { pullRequest: pr },
		})
		.run();
	return pr;
}

/**
 * The upstream Changes panel creates GitHub pull requests only. For a
 * Bitbucket project it opens one through the project's Bitbucket account.
 */
export async function forkBitbucketWorkspacePullRequest(
	ctx: HostServiceContext,
	input: {
		workspaceId: string;
		projectId: string;
		title: string;
		body?: string;
		base: string;
		draft?: boolean;
	},
): Promise<{ number: number; url: string } | null> {
	const [project] = await forkScmProjects(ctx, [input.projectId]);
	if (project?.repository.provider !== "bitbucket") return null;
	const accounts = services(ctx)
		.store.list()
		.filter((c) => c.provider === "bitbucket" && c.enabled);
	const connectionId =
		project.connectionId ??
		accounts.find((c) => c.isDefault)?.id ??
		(accounts.length === 1 ? accounts[0]?.id : undefined);
	if (!connectionId)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Connect a Bitbucket account in Fork Settings",
		});
	const pr = await forkCreateWorkspacePullRequest(ctx, {
		connectionId,
		repository: project.repository,
		workspaceId: input.workspaceId,
		title: input.title,
		description: input.body ?? "",
		target: input.base,
		draft: input.draft,
	});
	return { number: pr.number, url: pr.url };
}
