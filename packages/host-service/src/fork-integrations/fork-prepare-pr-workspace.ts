import {
	type ForkPullRequest,
	forkRepositoryKey,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { forkWorkspacePullRequests } from "../db/fork-schema";
import { projects, workspaces } from "../db/schema";
import type { HostServiceContext } from "../types";
import { forkPullRequestBranch } from "./fork-pr-checkout";
import { forkScmProjects } from "./fork-projects";
import { forkServices } from "./fork-services";

const prepared = new WeakMap<object, ForkPullRequest>();
interface Input {
	projectId: string;
	pr?: number;
	branch?: string;
	name?: string;
	baseBranch?: string;
	skipBranchPrefix?: boolean;
}

export async function forkPreparePrWorkspace<T extends Input>(
	ctx: HostServiceContext,
	input: T,
): Promise<T> {
	if (input.pr === undefined) return input;
	const [project] = await forkScmProjects(ctx, [input.projectId]);
	if (project?.repository.provider !== "bitbucket") return input;
	const { scm, store } = forkServices(ctx);
	const accounts = store
		.list()
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
	const pr = await scm.get(connectionId, project.repository, input.pr);
	const source = pr.sourceRepository ?? pr.repository;
	const sameRepository =
		forkRepositoryKey(source) === forkRepositoryKey(pr.repository);
	const branch = forkPullRequestBranch(pr, sameRepository);
	const row = ctx.db
		.select()
		.from(projects)
		.where(eq(projects.id, input.projectId))
		.get();
	if (!row)
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	const git = await ctx.git(row.repoPath);
	const valid = await git.raw(["check-ref-format", "--branch", branch]).then(
		() => true,
		() => false,
	);
	if (
		!valid ||
		!/^[a-zA-Z0-9_.-]+$/.test(source.owner) ||
		!/^[a-zA-Z0-9_.-]+$/.test(source.name) ||
		source.provider !== "bitbucket" ||
		source.host !== "bitbucket.org"
	)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid pull request branch",
		});
	const localHead = await git
		.raw(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])
		.then(
			(s) => s.trim(),
			() => null,
		);
	const existing = ctx.db
		.select()
		.from(workspaces)
		.where(
			and(
				eq(workspaces.projectId, input.projectId),
				eq(workspaces.branch, branch),
			),
		)
		.get();
	if (localHead && localHead !== pr.headCommit && !existing)
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"The local branch differs from the pull request. Choose another workspace branch.",
		});
	if (!localHead) {
		const from = sameRepository
			? project.remote
			: `https://bitbucket.org/${source.owner}/${source.name}.git`;
		await git.fetch([
			from,
			`refs/heads/${pr.sourceBranch}:refs/heads/${branch}`,
		]);
	}
	const next = {
		...input,
		pr: undefined,
		branch,
		skipBranchPrefix: true,
		name: input.name ?? pr.title,
		baseBranch: pr.targetBranch,
	};
	prepared.set(next, pr);
	return next;
}

export function forkLinkPreparedPrWorkspace(
	ctx: HostServiceContext,
	input: object,
	workspaceId: string,
) {
	const pr = prepared.get(input);
	if (!pr) return;
	ctx.db
		.insert(forkWorkspacePullRequests)
		.values({ scope: ctx.organizationId, workspaceId, pullRequest: pr })
		.onConflictDoUpdate({
			target: [
				forkWorkspacePullRequests.scope,
				forkWorkspacePullRequests.workspaceId,
			],
			set: { pullRequest: pr },
		})
		.run();
	prepared.delete(input);
}
