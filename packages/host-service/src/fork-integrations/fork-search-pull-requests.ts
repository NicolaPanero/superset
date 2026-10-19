import type {
	ForkConnection,
	ForkPullRequest,
	ForkRepositoryRef,
} from "@superset/shared/fork-integrations";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { z } from "zod";
import type { PullRequestsPage } from "../trpc/router/workspace-creation/procedures/search-pull-requests";
import { workspaceCreationRouter } from "../trpc/router/workspace-creation/workspace-creation";
import type { HostServiceContext } from "../types";
import { ForkApi } from "./fork-api";
import { type ForkScmProject, forkScmProjects } from "./fork-projects";
import { ForkScmProvider } from "./fork-scm";
import { ForkConnectionStore } from "./fork-store";

/** Bitbucket can filter on the viewer as a reviewer, not on review state. */
const BITBUCKET_REVIEW_FILTERS = new Set(["review-requested"]);
const GITHUB_LOGIN = /^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;

export const forkPullRequestSearchInput = z.object({
	projectId: z.string(),
	projectIds: z.array(z.string()).min(1).max(50).optional(),
	query: z.string().max(1000).optional(),
	author: z.string().max(1000).optional(),
	review: z
		.enum([
			"none",
			"required",
			"approved",
			"changes-requested",
			"reviewed-by-me",
			"not-reviewed-by-me",
			"review-requested",
			"team-review-requested",
		])
		.optional(),
	includeClosed: z.boolean().optional(),
	mergedOnly: z.boolean().optional(),
	limit: z.number().int().min(1).max(100).default(30),
	page: z.number().int().min(1).max(1000).default(1),
});

export interface ForkPullRequestsPage extends PullRequestsPage {
	pullRequests: (PullRequestsPage["pullRequests"][number] & {
		provider: "github" | "bitbucket";
		repository?: ForkRepositoryRef;
		connectionId?: string;
	})[];
	warnings: {
		repository: string;
		kind: "connection" | "request" | "review-filter";
		provider?: "github" | "bitbucket";
		projectId?: string;
		unavailable?: boolean;
	}[];
}

export async function forkSearchPullRequests(
	ctx: HostServiceContext,
	input: z.infer<typeof forkPullRequestSearchInput>,
): Promise<ForkPullRequestsPage> {
	const projects = await forkScmProjects(
		ctx,
		input.projectIds ?? [input.projectId],
	);
	const store = new ForkConnectionStore(ctx.db, ctx.organizationId);
	const scm = new ForkScmProvider(
		new ForkApi(store, ctx.credentials, ctx.forkTransport),
	);
	return forkSearchProviderPullRequests(input, {
		projects,
		connections: store.list(),
		bitbucket: (id, repository, query) =>
			scm.searchBitbucket(id, repository, query),
		diffstat: (id, repository, number) => scm.diffstat(id, repository, number),
		checks: (id, repository, commit) =>
			scm.commitChecks(id, repository, commit),
		github: (query) =>
			workspaceCreationRouter.createCaller(ctx).searchPullRequests(query),
	});
}

type SearchInput = z.infer<typeof forkPullRequestSearchInput>;
export async function forkSearchProviderPullRequests(
	input: SearchInput,
	providers: {
		projects: ForkScmProject[];
		connections: ForkConnection[];
		bitbucket: ForkScmProvider["searchBitbucket"];
		checks?: ForkScmProvider["commitChecks"];
		diffstat?: ForkScmProvider["diffstat"];
		github: (input: SearchInput) => Promise<PullRequestsPage>;
	},
): Promise<ForkPullRequestsPage> {
	const { projects } = providers;
	const result: ForkPullRequestsPage = {
		pullRequests: [],
		totalCount: 0,
		hasNextPage: false,
		page: input.page,
		warnings: [],
	};
	const github = projects.filter((p) => p.repository.provider === "github");
	const jobs = projects
		.filter((p) => p.repository.provider === "bitbucket")
		.map(async (p) => {
			const repository = `${p.repository.owner}/${p.repository.name}`;
			if (input.review && !BITBUCKET_REVIEW_FILTERS.has(input.review)) {
				result.warnings.push({ repository, kind: "review-filter" });
				return;
			}
			const candidates = providers.connections.filter(
				(c) => c.provider === "bitbucket" && c.enabled,
			);
			const connectionId =
				p.connectionId ??
				candidates.find((c) => c.isDefault)?.id ??
				(candidates.length === 1 ? candidates[0]?.id : undefined);
			const account = candidates.find((c) => c.id === connectionId);
			if (!connectionId || !account) {
				result.warnings.push({ repository, kind: "connection" });
				return;
			}
			if (input.review && !account.identity?.id) {
				result.warnings.push({ repository, kind: "connection" });
				return;
			}
			try {
				const data = await providers.bitbucket(connectionId, p.repository, {
					...input,
					...(input.review ? { reviewer: account.identity?.id } : {}),
				});
				const checks = await Promise.all(
					data.items.map((pr) =>
						pr.state === "open" && providers.checks
							? providers
									.checks(connectionId, p.repository, pr.headCommit)
									.catch(() => null)
							: null,
					),
				);
				const stats: ({ additions: number; deletions: number } | null)[] = [];
				for (let start = 0; start < data.items.length; start += 5) {
					stats.push(
						...(await Promise.all(
							data.items
								.slice(start, start + 5)
								.map(
									(pr) =>
										providers
											.diffstat?.(connectionId, p.repository, pr.number)
											.catch(() => null) ?? null,
								),
						)),
					);
				}
				result.pullRequests.push(
					...data.items.map((pr: ForkPullRequest, index) => ({
						projectId: p.projectId,
						prNumber: pr.number,
						title: pr.title,
						url: pr.url,
						state: pr.state,
						isDraft: pr.isDraft ?? false,
						authorLogin: pr.author,
						updatedAt: pr.updatedAt,
						checks: checks[index]?.checks ?? [],
						checksStatus: checks[index]?.status ?? ("none" as const),
						additions: stats[index]?.additions ?? null,
						deletions: stats[index]?.deletions ?? null,
						headRefName: pr.sourceBranch,
						provider: "bitbucket" as const,
						repository: pr.repository,
						connectionId,
					})),
				);
				result.totalCount += data.totalCount;
				result.hasNextPage ||= !!data.nextCursor;
			} catch (error) {
				console.warn(
					"[forkScm.searchPullRequests] Bitbucket request failed",
					repository,
					error,
				);
				result.warnings.push({
					repository,
					kind: "request",
					provider: "bitbucket",
					projectId: p.projectId,
					unavailable: isForkServiceUnavailable(error),
				});
			}
		});
	const githubAuthors = input.author
		?.split(",")
		.map((author) => author.trim().replace(/^@/, ""))
		.filter((author) => GITHUB_LOGIN.test(author));
	const groups = new Map<string | null, ForkScmProject[]>();
	for (const project of github) {
		if (input.author && !githubAuthors?.length) break;
		const group = groups.get(project.connectionId) ?? [];
		group.push(project);
		groups.set(project.connectionId, group);
	}
	for (const group of groups.values()) {
		const firstGithub = group[0];
		if (!firstGithub) continue;
		jobs.push(
			(async () => {
				try {
					const data = await providers.github({
						...input,
						...(input.author ? { author: githubAuthors?.join(",") } : {}),
						projectId: firstGithub.projectId,
						projectIds: group.map((p) => p.projectId),
					});
					result.pullRequests.push(
						...data.pullRequests.map((pr) => ({
							...pr,
							provider: "github" as const,
						})),
					);
					result.totalCount += data.totalCount;
					result.hasNextPage ||= data.hasNextPage;
					result.repoMismatch = data.repoMismatch;
				} catch (error) {
					console.warn(
						"[forkScm.searchPullRequests] GitHub request failed",
						error,
					);
					for (const p of group)
						result.warnings.push({
							repository: `${p.repository.owner}/${p.repository.name}`,
							kind: "request",
							provider: "github",
							projectId: p.projectId,
							unavailable: isForkServiceUnavailable(error),
						});
				}
			})(),
		);
	}
	await Promise.all(jobs);
	result.pullRequests.sort((a, b) =>
		(b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
	);
	return result;
}
