import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	FORK_INTEGRATIONS_VERSION,
	forkRepositoryKey,
	forkTaskBranch,
	parseForkRemote,
} from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	forkExternalTaskLinks,
	forkIntegrationBindings,
	forkIntegrationSettings,
	forkWorkspacePullRequests,
} from "../../../db/fork-schema";
import { projects, workspaces } from "../../../db/schema";
import { ForkApi, SYSTEM_GITHUB } from "../../../fork-integrations/fork-api";
import { ForkGitCredentialProvider } from "../../../fork-integrations/fork-credentials";
import { forkFetch } from "../../../fork-integrations/fork-http";
import { ForkJiraProvider } from "../../../fork-integrations/fork-jira";
import {
	discoverForkBroker,
	forkOAuthStatus,
	revokeForkGrant,
	startForkOAuth,
} from "../../../fork-integrations/fork-oauth";
import { ForkScmProvider } from "../../../fork-integrations/fork-scm";
import { ForkConnectionStore } from "../../../fork-integrations/fork-store";
import { createGitFactory } from "../../../runtime/git";
import type { HostServiceContext } from "../../../types";
import { machineOnlyProcedure, queryProcedure, router } from "../../index";
import { createFromClone } from "../project/handlers";
import { workspacesRouter } from "../workspaces/workspaces";

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
function services(ctx: HostServiceContext) {
	const store = new ForkConnectionStore(ctx.db, ctx.organizationId);
	const credentials =
		ctx.credentials instanceof ForkGitCredentialProvider
			? ctx.credentials.fallback
			: ctx.credentials;
	const api = new ForkApi(store, credentials);
	return {
		store,
		api,
		scm: new ForkScmProvider(api),
		jira: new ForkJiraProvider(api),
	};
}
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
			let repository = binding?.repository ?? null;
			if (!repository) {
				try {
					repository = parseForkRemote(
						(
							await (await ctx.git(workspace.worktreePath)).getRemotes(true)
						).find((r) => r.name === remote)?.refs.fetch ?? "",
					);
				} catch {}
			}
			const { scm, store } = services(ctx);
			const candidates = store
				.list()
				.filter((c) => c.provider === repository?.provider && c.enabled);
			const connectionId =
				binding?.connectionId ??
				candidates.find((c) => c.isDefault)?.id ??
				(candidates.length === 1 ? candidates[0]?.id : undefined);
			let pullRequest = linked,
				defaultBranch: string | null = null,
				error: string | null = null;
			if (repository && connectionId) {
				try {
					defaultBranch = await scm.defaultBranch(connectionId, repository);
					pullRequest = linked
						? await scm.get(connectionId, repository, linked.number)
						: workspace.branch
							? await scm.forBranch(connectionId, repository, workspace.branch)
							: null;
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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.get();
			if (!workspace?.projectId || !workspace.branch)
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
				(await git.getRemotes(true)).find((r) => r.name === remote)?.refs
					.push ?? "",
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
				const tasks = ctx.db
					.select()
					.from(forkExternalTaskLinks)
					.where(
						and(
							eq(forkExternalTaskLinks.scope, ctx.organizationId),
							eq(forkExternalTaskLinks.workspaceId, workspace.id),
						),
					)
					.all();
				const description = [
					input.description,
					...tasks.map((t) => `[${t.task.key}](${t.task.url})`),
				]
					.filter(Boolean)
					.join("\n\n");
				pr = await scm.create(input.connectionId, input.repository, {
					title: input.title,
					description,
					source: workspace.branch,
					target: input.target,
				});
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
		}),
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
					remote: "origin",
				})
				.onConflictDoUpdate({
					target: [
						forkIntegrationBindings.scope,
						forkIntegrationBindings.projectId,
					],
					set: {
						connectionId: input.connectionId,
						repository: input.repository,
					},
				})
				.run();
			const source = pr.sourceRepository ?? input.repository;
			repository.parse(source);
			scm.assert(input.connectionId, source);
			const tracking = `superset-pr/${pr.number}`;
			await (await ctx.git(project.repoPath)).fetch([
				`https://${source.host}/${source.owner}/${source.name}.git`,
				`+refs/heads/${pr.sourceBranch}:refs/remotes/${tracking}`,
			]);
			const result = await workspacesRouter.createCaller(ctx).create({
				id: input.workspaceId,
				projectId: input.projectId,
				branch: pr.sourceBranch,
				skipBranchPrefix: true,
				baseBranch: tracking,
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
	defaultBranch: read
		.input(z.object({ connectionId, repository }))
		.query(({ ctx, input }) =>
			services(ctx).scm.defaultBranch(input.connectionId, input.repository),
		),
	repositories: read
		.input(z.object({ connectionId, cursor: z.string().max(4000).optional() }))
		.query(({ ctx, input }) =>
			services(ctx).scm.repositories(input.connectionId, input.cursor),
		),
	projects: read.query(async ({ ctx }) => {
		const bindings = ctx.db
			.select()
			.from(forkIntegrationBindings)
			.where(eq(forkIntegrationBindings.scope, ctx.organizationId))
			.all();
		const result = [];
		for (const p of ctx.db
			.select()
			.from(projects)
			.all()
			.filter((p) => !p.deletedAt)) {
			const binding = bindings.find((b) => b.projectId === p.id);
			let ref =
				binding?.repository ?? (p.repoUrl ? parseForkRemote(p.repoUrl) : null);
			let remote = binding?.remote ?? "origin";
			if (!ref) {
				try {
					const remotes = await (await ctx.git(p.repoPath)).getRemotes(true);
					const found = remotes.find((r) => r.name === "origin") ?? remotes[0];
					if (found) {
						ref = parseForkRemote(found.refs.fetch);
						remote = found.name;
					}
				} catch {}
			}
			if (ref)
				result.push({
					projectId: p.id,
					name: p.name,
					repository: ref,
					connectionId: binding?.connectionId ?? null,
					remote,
				});
		}
		return result;
	}),
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
					"comment",
					"edit",
				]),
				body: z.string().max(65000).optional(),
				title: z.string().min(1).max(500).optional(),
				method: z
					.enum(["merge", "squash", "rebase", "merge_commit", "fast_forward"])
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
				branch: forkTaskBranch(task.key, task.title),
				skipBranchPrefix: true,
			});
			const link = {
				connectionId: input.connectionId,
				taskId: task.id,
				key: task.key,
				title: task.title,
				url: task.url,
			};
			ctx.db
				.insert(forkExternalTaskLinks)
				.values({
					scope: ctx.organizationId,
					workspaceId: result.workspace.id,
					taskKey: `${input.connectionId}:${task.id}`,
					task: link,
				})
				.onConflictDoUpdate({
					target: [
						forkExternalTaskLinks.scope,
						forkExternalTaskLinks.workspaceId,
						forkExternalTaskLinks.taskKey,
					],
					set: { task: link },
				})
				.run();
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
		.query(({ ctx, input }) =>
			ctx.db
				.select()
				.from(forkExternalTaskLinks)
				.where(
					and(
						eq(forkExternalTaskLinks.scope, ctx.organizationId),
						eq(forkExternalTaskLinks.workspaceId, input.workspaceId),
					),
				)
				.all()
				.map((l) => l.task),
		),
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
			ctx.db
				.insert(forkExternalTaskLinks)
				.values({
					scope: ctx.organizationId,
					workspaceId: input.workspaceId,
					taskKey: `${input.connectionId}:${task.id}`,
					task: link,
				})
				.onConflictDoUpdate({
					target: [
						forkExternalTaskLinks.scope,
						forkExternalTaskLinks.workspaceId,
						forkExternalTaskLinks.taskKey,
					],
					set: { task: link },
				})
				.run();
			return { task: link, branch: forkTaskBranch(task.key, task.title) };
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
