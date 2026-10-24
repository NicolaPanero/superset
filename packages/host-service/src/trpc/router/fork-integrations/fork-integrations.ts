import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
	FORK_INTEGRATIONS_VERSION,
	forkRepositoryKey,
	forkTaskBranch,
	parseForkRemote,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	forkExternalTaskLinks,
	forkIntegrationBindings,
	forkIntegrationSettings,
	forkWorkspacePullRequests,
} from "../../../db/fork-schema";
import { projects, workspaces } from "../../../db/schema";
import { SYSTEM_GITHUB } from "../../../fork-integrations/fork-api";
import { forkAvailability } from "../../../fork-integrations/fork-availability";
import { ForkGitCredentialProvider } from "../../../fork-integrations/fork-credentials";
import { forkFetch } from "../../../fork-integrations/fork-http";
import {
	forkAdvanceLinkedTasks,
	forkLinkedTasks,
	forkLinkTask,
} from "../../../fork-integrations/fork-jira-workflow";
import {
	discoverForkBroker,
	forkOAuthStatus,
	revokeForkGrant,
	startForkOAuth,
} from "../../../fork-integrations/fork-oauth";
import {
	forkPullRequestBranch,
	forkPullRequestFetchTarget,
} from "../../../fork-integrations/fork-pr-checkout";
import { forkScmProjects } from "../../../fork-integrations/fork-projects";
import { forkReviewRepairPrompt } from "../../../fork-integrations/fork-review-prompt";
import {
	forkPullRequestSearchInput,
	forkSearchPullRequests,
} from "../../../fork-integrations/fork-search-pull-requests";
import { forkServices as services } from "../../../fork-integrations/fork-services";
import { forkCreateWorkspacePullRequest } from "../../../fork-integrations/fork-workspace-pull-request";
import { createGitFactory } from "../../../runtime/git";
import { machineOnlyProcedure, queryProcedure, router } from "../../index";
import { runAgentInWorkspace } from "../agents";
import { createFromClone } from "../project/handlers";
import { workspacesRouter } from "../workspaces/workspaces";
import { forkJiraAutomationProcedures } from "./fork-jira-automations";
import { forkJiraBoardProcedures } from "./fork-jira-board-procedures";

const exec = promisify(execFile);
const provider = z.enum(["github", "bitbucket", "jira"]);
const connectionId = z.string().min(1).max(200);
const coordinate = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[a-zA-Z0-9_.-]+$/)
	.refine((v) => v !== "." && v !== "..");
const repository = z.object({
	provider: z.enum(["github", "bitbucket"]),
	host: z.string().min(1).max(253),
	owner: coordinate,
	name: coordinate,
});
const target = z.object({
	connectionId,
	repository,
	number: z.number().int().positive(),
});
const taskTarget = z.object({
	connectionId,
	key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/),
});
const local = machineOnlyProcedure.use(({ ctx, next }) => {
	if (ctx.isLocalCaller === false)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Manage these credentials on the host computer",
		});
	return next({ ctx });
});
const read = queryProcedure.meta({ timeoutMs: 30_000 });
export const forkConnectionsRouter = router({
	availability: read.query(async ({ ctx }) => {
		const { store, api } = services(ctx);
		return forkAvailability(store).check(store.list(), (connection) =>
			api.request(
				connection.id,
				connection.provider === "jira" ? "/rest/api/3/myself" : "/user",
			),
		);
	}),
	setBrokerUrl: local
		.input(z.object({ url: z.string().url() }))
		.mutation(async ({ ctx, input }) => {
			const metadata = await discoverForkBroker(input.url);
			const brokerUrl = input.url.replace(/\/$/, "");
			ctx.db
				.insert(forkIntegrationSettings)
				.values({ scope: ctx.organizationId, brokerUrl })
				.onConflictDoUpdate({
					target: forkIntegrationSettings.scope,
					set: { brokerUrl },
				})
				.run();
			return metadata;
		}),
	setDefault: local
		.input(z.object({ id: connectionId }))
		.mutation(({ ctx, input }) => {
			const { store, api } = services(ctx),
				selected = api.connection(input.id);
			for (const c of store
				.list()
				.filter((c) => c.provider === selected.provider))
				store.save({ ...c, isDefault: c.id === selected.id });
			return store.save({ ...selected, isDefault: true });
		}),
	list: read.query(({ ctx }) => {
		const { store, api } = services(ctx);
		const rows = store.list();
		if (!rows.some((c) => c.id === SYSTEM_GITHUB))
			rows.unshift(api.connection(SYSTEM_GITHUB));
		return {
			version: FORK_INTEGRATIONS_VERSION,
			brokerUrl:
				ctx.db
					.select()
					.from(forkIntegrationSettings)
					.where(eq(forkIntegrationSettings.scope, ctx.organizationId))
					.get()?.brokerUrl ?? null,
			connections: rows,
			jiraConfigured: rows.some((c) => c.provider === "jira" && c.enabled),
		};
	}),
	verify: local
		.input(z.object({ id: connectionId }))
		.mutation(({ ctx, input }) => services(ctx).api.verify(input.id)),
	saveToken: local
		.input(
			z.object({
				id: connectionId.optional(),
				provider,
				email: z.string().email().optional(),
				token: z.string().min(1).max(8192),
				site: z.string().url().optional(),
				cloudId: z.string().max(200).optional(),
				label: z.string().max(100).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { store, api } = services(ctx);
			if (input.provider !== "github" && !input.email)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Enter your Atlassian email",
				});
			let site: string | null = null,
				cloudId = input.cloudId;
			if (input.provider === "jira") {
				if (!input.site)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Enter the Jira site URL",
					});
				const url = new URL(input.site);
				if (
					url.protocol !== "https:" ||
					!/^[a-z0-9-]+\.atlassian\.net$/i.test(url.hostname) ||
					url.username ||
					url.password
				)
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Enter a Jira Cloud site URL",
					});
				site = url.origin;
				if (!cloudId) {
					const tenant = await forkFetch<{ cloudId: string }>(
						`${site}/_edge/tenant_info`,
					);
					cloudId = tenant.cloudId;
				}
			}
			const previous = input.id ? store.get(input.id)?.connection : null;
			if (
				input.id &&
				(!previous ||
					previous.provider !== input.provider ||
					previous.mode === "system")
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid connection",
				});
			if (previous?.provider === "jira" && previous.site !== site)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Add another account for a different Jira site",
				});
			if (!previous) store.keepDefaultBefore(input.provider);
			const c = previous ?? store.create(input.provider, "token", site);
			store.save(
				{
					...c,
					mode: "token",
					identity: null,
					verifiedAt: null,
					label: input.label || c.label,
					site,
					enabled: true,
					state: "configured",
					error: null,
					expiresAt: null,
					brokerUrl: null,
				},
				{ token: input.token, email: input.email, cloudId },
			);
			return api.verify(c.id);
		}),
	disconnect: local
		.input(z.object({ id: connectionId, logoutCli: z.boolean().optional() }))
		.mutation(async ({ ctx, input }) => {
			const { store, api } = services(ctx);
			const c = api.connection(input.id);
			if (!store.get(input.id)) store.save(c);
			await revokeForkGrant(store, input.id);
			if (input.logoutCli && c.mode === "system" && c.identity?.login)
				await exec(
					"gh",
					[
						"auth",
						"logout",
						"--hostname",
						"github.com",
						"--user",
						c.identity.login,
					],
					{ timeout: 15_000 },
				);
			return { ok: true };
		}),
	enableSystemGithub: local.mutation(({ ctx }) => {
		const { store, api } = services(ctx);
		const old = store.get(SYSTEM_GITHUB)?.connection;
		if (old)
			store.save({ ...old, enabled: true, state: "configured", error: null });
		return api.verify(SYSTEM_GITHUB);
	}),
	broker: read
		.input(z.object({ url: z.string().url() }))
		.query(({ input }) => discoverForkBroker(input.url)),
	startOAuth: local
		.input(
			z.object({
				url: z.string().url(),
				providers: z.array(provider).min(1).max(3),
				connectionId: connectionId.optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			startForkOAuth(
				services(ctx).store,
				input.url,
				input.providers,
				input.connectionId,
			),
		),
	oauthStatus: read
		.input(z.object({ attemptId: z.string().uuid() }))
		.query(({ ctx, input }) =>
			forkOAuthStatus(services(ctx).store.scope, input.attemptId),
		),
	bind: local
		.input(
			z.object({
				projectId: z.string().uuid(),
				connectionId,
				repository,
				remote: coordinate.default("origin"),
			}),
		)
		.mutation(({ ctx, input }) => {
			services(ctx).scm.assert(input.connectionId, input.repository);
			ctx.db
				.insert(forkIntegrationBindings)
				.values({ scope: ctx.organizationId, ...input })
				.onConflictDoUpdate({
					target: [
						forkIntegrationBindings.scope,
						forkIntegrationBindings.projectId,
					],
					set: {
						connectionId: input.connectionId,
						repository: input.repository,
						remote: input.remote,
					},
				})
				.run();
			return { ok: true };
		}),
});
export const forkScmRouter = router({
	clone: local
		.input(
			z.object({
				connectionId,
				url: z.string().min(1).max(4000),
				parentDir: z.string().min(1),
				name: z.string().min(1).max(200),
			}),
		)
		.mutation(async ({ ctx, input, signal }) => {
			const repository = parseForkRemote(input.url);
			if (!repository)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a supported repository",
				});
			const { store, scm } = services(ctx);
			scm.assert(input.connectionId, repository);
			const fallback =
				ctx.credentials instanceof ForkGitCredentialProvider
					? ctx.credentials.fallback
					: ctx.credentials;
			const credentials = new ForkGitCredentialProvider(
				fallback,
				store,
				input.connectionId,
			);
			const result = await createFromClone(
				{ ...ctx, credentials, git: createGitFactory(credentials) },
				{ ...input, signal },
			);
			store.db
				.insert(forkIntegrationBindings)
				.values({
					scope: store.scope,
					projectId: result.projectId,
					repository,
					connectionId: input.connectionId,
					remote: "origin",
				})
				.run();
			return result;
		}),
	workspace: read
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.get();
			const linked =
				ctx.db
					.select()
					.from(forkWorkspacePullRequests)
					.where(
						and(
							eq(forkWorkspacePullRequests.scope, ctx.organizationId),
							eq(forkWorkspacePullRequests.workspaceId, input.workspaceId),
						),
					)
					.get()?.pullRequest ?? null;
			if (!workspace?.projectId)
				return {
					pullRequest: linked,
					repository: null,
					projectId: null,
					branch: workspace?.branch ?? null,
					remote: "origin",
					connectionId: undefined as string | undefined,
					defaultBranch: null as string | null,
					error: null as string | null,
				};
			const project = (await forkScmProjects(ctx, [workspace.projectId]))[0];
			const remote = project?.remote ?? "origin";
			const repository = project?.repository ?? null;
			const { scm, store } = services(ctx);
			const candidates = store
				.list()
				.filter((c) => c.provider === repository?.provider && c.enabled);
			const connectionId =
				project?.connectionId ??
				candidates.find((c) => c.isDefault)?.id ??
				(candidates.length === 1 ? candidates[0]?.id : undefined);
			const matchingLink =
				linked &&
				repository &&
				forkRepositoryKey(linked.repository) === forkRepositoryKey(repository)
					? linked
					: null;
			let pullRequest = matchingLink,
				defaultBranch: string | null = null,
				error: string | null = null;
			if (repository && connectionId) {
				try {
					defaultBranch = await scm.defaultBranch(connectionId, repository);
					pullRequest = matchingLink
						? await scm.get(connectionId, repository, matchingLink.number)
						: workspace.branch
							? await scm.forBranch(connectionId, repository, workspace.branch)
							: null;
					// A declined or merged link must not hide a newer open pull request.
					if (pullRequest && pullRequest.state !== "open" && workspace.branch)
						pullRequest =
							(await scm.forBranch(
								connectionId,
								repository,
								workspace.branch,
							)) ?? pullRequest;
					if (pullRequest)
						store.db
							.insert(forkWorkspacePullRequests)
							.values({
								scope: store.scope,
								workspaceId: workspace.id,
								pullRequest,
							})
							.onConflictDoUpdate({
								target: [
									forkWorkspacePullRequests.scope,
									forkWorkspacePullRequests.workspaceId,
								],
								set: { pullRequest },
							})
							.run();
				} catch (e) {
					error =
						e instanceof Error ? e.message : "Could not load pull request";
				}
			}
			return {
				pullRequest,
				repository,
				projectId: workspace.projectId,
				branch: workspace.branch,
				remote,
				connectionId,
				defaultBranch,
				error,
			};
		}),
	createForWorkspace: local
		.input(
			z.object({
				connectionId,
				repository,
				workspaceId: z.string().uuid(),
				title: z.string().min(1).max(500),
				description: z.string().max(65000).default(""),
				target: z.string().min(1).max(250),
				draft: z.boolean().optional(),
			}),
		)
		.mutation(({ ctx, input }) => forkCreateWorkspacePullRequest(ctx, input)),
	checkout: local
		.input(
			target.extend({
				projectId: z.string().uuid(),
				workspaceId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!project)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			const existing = ctx.db
				.select({
					workspaceId: forkWorkspacePullRequests.workspaceId,
					pullRequest: forkWorkspacePullRequests.pullRequest,
					branch: workspaces.branch,
					path: workspaces.worktreePath,
				})
				.from(forkWorkspacePullRequests)
				.innerJoin(
					workspaces,
					eq(workspaces.id, forkWorkspacePullRequests.workspaceId),
				)
				.where(
					and(
						eq(forkWorkspacePullRequests.scope, ctx.organizationId),
						eq(workspaces.projectId, input.projectId),
						isNull(workspaces.archivedAt),
					),
				)
				.all()
				.find(
					(row) =>
						row.pullRequest.number === input.number &&
						forkRepositoryKey(row.pullRequest.repository) ===
							forkRepositoryKey(input.repository),
				);
			if (existing) {
				const currentBranch = (
					await (
						await ctx.git(existing.path)
					)
						.revparse(["--abbrev-ref", "HEAD"])
						.catch(() => "")
				).trim();
				const source = existing.pullRequest.sourceRepository;
				const expected = forkPullRequestBranch(
					existing.pullRequest,
					!source ||
						forkRepositoryKey(source) === forkRepositoryKey(input.repository),
				);
				if (
					currentBranch === existing.branch &&
					(currentBranch === existing.pullRequest.sourceBranch ||
						currentBranch === expected)
				)
					return { workspaceId: existing.workspaceId };
			}
			const { scm } = services(ctx),
				pr = await scm.get(input.connectionId, input.repository, input.number);
			const git = await ctx.git(project.repoPath),
				remotes = await git.getRemotes(true);
			const remote = remotes.find((r) => {
				const ref = parseForkRemote(r.refs.fetch);
				return (
					ref && forkRepositoryKey(ref) === forkRepositoryKey(input.repository)
				);
			});
			if (
				!remote ||
				!/^[a-zA-Z0-9_./-]+$/.test(pr.sourceBranch) ||
				pr.sourceBranch.startsWith("-") ||
				pr.sourceBranch.includes("..")
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Cannot check out this pull request from the selected remote",
				});
			ctx.db
				.insert(forkIntegrationBindings)
				.values({
					scope: ctx.organizationId,
					projectId: project.id,
					repository: input.repository,
					connectionId: input.connectionId,
					remote: remote.name,
				})
				.onConflictDoUpdate({
					target: [
						forkIntegrationBindings.scope,
						forkIntegrationBindings.projectId,
					],
					set: {
						remote: remote.name,
						connectionId: input.connectionId,
						repository: input.repository,
					},
				})
				.run();
			const source = pr.sourceRepository ?? input.repository;
			repository.parse(source);
			scm.assert(input.connectionId, source);
			const github = input.repository.provider === "github";
			const sameRepository =
				(!github || !!pr.sourceRepository) &&
				forkRepositoryKey(source) === forkRepositoryKey(input.repository);
			const branch = forkPullRequestBranch(pr, sameRepository);
			const localBranchExists = await git
				.raw(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`])
				.then((out) => /^[0-9a-f]{40,}/.test(out.trim()))
				.catch(() => false);
			const destination = forkPullRequestFetchTarget({
				branch,
				sameRepository,
				remote: remote.name,
				localBranchExists,
			});
			// A GitHub fork may be private or deleted; the base repository keeps its head.
			const fetched = github ? input.repository : source;
			const from = sameRepository
				? remote.name
				: `https://${fetched.host}/${fetched.owner}/${fetched.name}.git`;
			const sourceRef =
				github && !sameRepository
					? `refs/pull/${pr.number}/head`
					: `refs/heads/${pr.sourceBranch}`;
			if (destination) await git.fetch([from, `+${sourceRef}:${destination}`]);
			const result = await workspacesRouter.createCaller(ctx).create({
				id: input.workspaceId,
				projectId: input.projectId,
				branch,
				skipBranchPrefix: true,
				name: pr.title,
			});
			ctx.db
				.insert(forkWorkspacePullRequests)
				.values({
					scope: ctx.organizationId,
					workspaceId: result.workspace.id,
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
			return { workspaceId: result.workspace.id };
		}),
	fixFindings: local
		.input(
			target.extend({
				projectId: z.string().uuid(),
				agent: z.string().min(1).max(200),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<{ workspaceId: string }> => {
			const { scm } = services(ctx);
			const pr = await scm.get(
				input.connectionId,
				input.repository,
				input.number,
			);
			const comments =
				[] as import("@superset/shared/fork-integrations").ForkComment[];
			let cursor: string | undefined;
			do {
				const page = await scm.comments(
					input.connectionId,
					input.repository,
					input.number,
					cursor,
				);
				comments.push(...page.items);
				cursor = page.nextCursor ?? undefined;
			} while (cursor && comments.length < 1000);
			const checks = await scm.checks(
				input.connectionId,
				input.repository,
				input.number,
			);
			const result = await forkScmRouter
				.createCaller(ctx)
				.checkout({ ...input, workspaceId: randomUUID() });
			await runAgentInWorkspace(ctx, {
				workspaceId: result.workspaceId,
				agent: input.agent,
				prompt: forkReviewRepairPrompt(pr, comments, checks),
			});
			return result;
		}),
	defaultBranch: read
		.input(z.object({ connectionId, repository }))
		.query(({ ctx, input }) =>
			services(ctx).scm.defaultBranch(input.connectionId, input.repository),
		),
	repositories: read
		.input(z.object({ connectionId, cursor: z.string().max(4000).optional() }))
		.query(async ({ ctx, input }) => {
			const { scm } = services(ctx);
			const hints =
				scm.assert(input.connectionId).provider === "bitbucket"
					? (await forkScmProjects(ctx))
							.filter((p) => p.repository.provider === "bitbucket")
							.map((p) => p.repository.owner)
					: [];
			return scm.repositories(input.connectionId, input.cursor, hints);
		}),
	searchPullRequests: read
		.input(forkPullRequestSearchInput)
		.query(({ ctx, input }) => forkSearchPullRequests(ctx, input)),
	projects: read.query(({ ctx }) => forkScmProjects(ctx)),

	list: read
		.input(
			z.object({
				connectionId,
				repository,
				state: z.enum(["open", "closed", "all"]).default("open"),
				cursor: z.string().max(4000).optional(),
			}),
		)
		.query(({ ctx, input }) =>
			services(ctx).scm.list(
				input.connectionId,
				input.repository,
				input.state,
				input.cursor,
			),
		),
	get: read
		.input(target)
		.query(({ ctx, input }) =>
			services(ctx).scm.get(input.connectionId, input.repository, input.number),
		),
	diff: read
		.input(target)
		.query(({ ctx, input }) =>
			services(ctx).scm.diff(
				input.connectionId,
				input.repository,
				input.number,
			),
		),
	comments: read
		.input(target.extend({ cursor: z.string().max(4000).optional() }))
		.query(({ ctx, input }) =>
			services(ctx).scm.comments(
				input.connectionId,
				input.repository,
				input.number,
				input.cursor,
			),
		),
	checks: read
		.input(target)
		.query(({ ctx, input }) =>
			services(ctx).scm.checks(
				input.connectionId,
				input.repository,
				input.number,
			),
		),
	create: local
		.input(
			z.object({
				connectionId,
				repository,
				title: z.string().min(1).max(500),
				description: z.string().max(65000).default(""),
				source: z.string().min(1).max(250),
				target: z.string().min(1).max(250),
				draft: z.boolean().optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			services(ctx).scm.create(input.connectionId, input.repository, input),
		),
	action: local
		.input(
			target.extend({
				action: z.enum([
					"merge",
					"close",
					"reopen",
					"approve",
					"unapprove",
					"request-changes",
					"unrequest-changes",
					"comment",
					"reply",
					"resolve",
					"unresolve",
					"edit",
					"set-draft",
				]),
				side: z.enum(["old", "new"]).optional(),
				commentId: z
					.string()
					.regex(/^\d{1,20}$/)
					.optional(),
				body: z.string().max(65000).optional(),
				draft: z.boolean().optional(),
				title: z.string().min(1).max(500).optional(),
				method: z
					.enum([
						"merge",
						"squash",
						"rebase",
						"merge_commit",
						"fast_forward",
						"squash_fast_forward",
						"rebase_fast_forward",
						"rebase_merge",
					])
					.optional(),
				head: z.string().max(100).optional(),
				path: z.string().max(2000).optional(),
				line: z.number().int().positive().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { scm } = services(ctx);
			await scm.action(
				input.connectionId,
				input.repository,
				input.number,
				input.action,
				input,
			);
			return { ok: true };
		}),
});
export const forkTasksRouter = router({
	...forkJiraAutomationProcedures,
	...forkJiraBoardProcedures,
	createWorkspace: local
		.input(
			taskTarget.extend({
				projectId: z.string().uuid(),
				workspaceId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const task = await services(ctx).jira.get(input.connectionId, input.key);
			const result = await workspacesRouter.createCaller(ctx).create({
				id: input.workspaceId,
				projectId: input.projectId,
				checkout: "worktree",
				name: `${task.key} ${task.title}`,
				branch: forkTaskBranch(task.key, task.title, task.type?.name),
			});
			forkLinkTask(ctx, result.workspace.id, {
				connectionId: input.connectionId,
				taskId: task.id,
				key: task.key,
				title: task.title,
				url: task.url,
			});
			void forkAdvanceLinkedTasks(ctx, result.workspace.id, "progress");
			return { workspaceId: result.workspace.id };
		}),
	list: read
		.input(
			z.object({
				connectionId,
				jql: z.string().max(4000).default(""),
				cursor: z.string().max(4000).optional(),
			}),
		)
		.query(({ ctx, input }) =>
			services(ctx).jira.list(input.connectionId, input.jql, input.cursor),
		),
	get: read
		.input(taskTarget)
		.query(({ ctx, input }) =>
			services(ctx).jira.get(input.connectionId, input.key),
		),
	projects: read
		.input(z.object({ connectionId }))
		.query(({ ctx, input }) => services(ctx).jira.projects(input.connectionId)),
	transitions: read
		.input(taskTarget)
		.query(({ ctx, input }) =>
			services(ctx).jira.transitions(input.connectionId, input.key),
		),
	editMetadata: read
		.input(taskTarget)
		.query(({ ctx, input }) =>
			services(ctx).jira.editMetadata(input.connectionId, input.key),
		),
	assignees: read
		.input(taskTarget.extend({ query: z.string().max(200).default("") }))
		.query(({ ctx, input }) =>
			services(ctx).jira.assignees(input.connectionId, input.key, input.query),
		),
	comments: read
		.input(taskTarget)
		.query(({ ctx, input }) =>
			services(ctx).jira.comments(input.connectionId, input.key),
		),
	edit: local
		.input(
			taskTarget.extend({
				title: z.string().min(1).max(500).optional(),
				description: z.string().max(65000).optional(),
				assigneeId: z.string().nullable().optional(),
				priorityId: z.string().optional(),
				labels: z.array(z.string().max(200)).max(100).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			services(ctx).jira.edit(input.connectionId, input.key, input),
		),
	transition: local
		.input(
			taskTarget.extend({
				transitionId: z.string().min(1),
				fields: z.record(z.string(), z.unknown()).default({}),
			}),
		)
		.mutation(({ ctx, input }) =>
			services(ctx).jira.transition(
				input.connectionId,
				input.key,
				input.transitionId,
				input.fields,
			),
		),
	comment: local
		.input(taskTarget.extend({ body: z.string().min(1).max(65000) }))
		.mutation(({ ctx, input }) =>
			services(ctx).jira.comment(input.connectionId, input.key, input.body),
		),
	remove: local
		.input(taskTarget)
		.mutation(({ ctx, input }) =>
			services(ctx).jira.remove(input.connectionId, input.key),
		),
	links: read
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(({ ctx, input }) => forkLinkedTasks(ctx, input.workspaceId)),
	link: local
		.input(taskTarget.extend({ workspaceId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.get();
			if (!workspace)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			const task = await services(ctx).jira.get(input.connectionId, input.key);
			const link = {
				connectionId: input.connectionId,
				taskId: task.id,
				key: task.key,
				title: task.title,
				url: task.url,
			};
			forkLinkTask(ctx, input.workspaceId, link);
			return {
				task: link,
				branch: forkTaskBranch(task.key, task.title, task.type?.name),
			};
		}),
	/** Workspaces linked to an issue, newest first. */
	workspaces: read
		.input(z.object({ connectionId, taskId: z.string().min(1).max(200) }))
		.query(({ ctx, input }) =>
			ctx.db
				.select({ id: workspaces.id, name: workspaces.name })
				.from(forkExternalTaskLinks)
				.innerJoin(
					workspaces,
					eq(workspaces.id, forkExternalTaskLinks.workspaceId),
				)
				.where(
					and(
						eq(forkExternalTaskLinks.scope, ctx.organizationId),
						eq(
							forkExternalTaskLinks.taskKey,
							`${input.connectionId}:${input.taskId}`,
						),
					),
				)
				.all(),
		),
	/** Links a workspace started from an issue, then moves the issue to work in progress. */
	startWork: local
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				connectionId,
				taskId: z.string().min(1).max(200),
				key: taskTarget.shape.key,
				title: z.string().max(500),
				url: z.string().url().max(2000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspaceId } = input;
			const workspace = ctx.db
				.select({ id: workspaces.id })
				.from(workspaces)
				.where(eq(workspaces.id, workspaceId))
				.get();
			if (!workspace)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			const task = await services(ctx).jira.get(input.connectionId, input.key);
			forkLinkTask(ctx, workspaceId, {
				connectionId: input.connectionId,
				taskId: task.id,
				key: task.key,
				title: task.title,
				url: task.url,
			});
			await forkAdvanceLinkedTasks(ctx, workspaceId, "progress");
			return { ok: true };
		}),
	unlink: local
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				connectionId,
				taskId: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.db
				.delete(forkExternalTaskLinks)
				.where(
					and(
						eq(forkExternalTaskLinks.scope, ctx.organizationId),
						eq(forkExternalTaskLinks.workspaceId, input.workspaceId),
						eq(
							forkExternalTaskLinks.taskKey,
							`${input.connectionId}:${input.taskId}`,
						),
					),
				)
				.run();
			return { ok: true };
		}),
});
