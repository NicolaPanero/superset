import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { terminalColorsSchema } from "@superset/shared/terminal-colors";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import { TransferJobs } from "../../../session-transfer/jobs";
import { LocalLineageStore } from "../../../session-transfer/lineage";
import { lineageResumeLaunch } from "../../../session-transfer/lineage-resume";
import {
	ContextTransferProvider,
	type TransferResult,
} from "../../../session-transfer/provider";
import {
	isVerifiedNativeAgent,
	pinNativeProfile,
	TRANSFER_AGENTS,
} from "../../../session-transfer/registry";
import {
	defaultNativeStore,
	peerSessionReference,
} from "../../../session-transfer/stores";
import { TxcriptTransferProvider } from "../../../session-transfer/txcript";
import { transcriptSession } from "../../../terminal/terminal";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { terminalHarnessSession } from "../../../terminal-agents/harness-session-ref";
import { hasHarnessSession } from "../../../terminal-agents/harness-sessions";
import { claudeSessionFiles } from "../../../terminal-agents/harness-sessions/claude";
import { codexSessionFiles } from "../../../terminal-agents/harness-sessions/codex";
import { getTerminalAgentBinding } from "../../../terminal-agents/persistence";
import { isTrustedTranscriptPath } from "../../../terminal-agents/transcript-path";
import { protectedProcedure, router } from "../../index";
import {
	type AgentRunInput,
	type AgentRunResult,
	runAgentInWorkspace,
	terminalLaunchConfigId,
} from "../agents/agents";
import { toTerminalSessionError } from "../terminal/errors";

type Prepared = {
	result?: Extract<TransferResult, { mode: "native" }>;
	launch: AgentRunInput;
	lineageNodeId?: string;
	launchPromise?: Promise<AgentRunResult>;
};
const jobs = new TransferJobs<Prepared>();
const nodeLaunches = new Map<string, Promise<AgentRunResult>>();
const inputSchema = z.object({
	workspaceId: z.string().uuid(),
	terminalId: z.string().uuid(),
	targetConfigId: z.string().uuid(),
	transferId: z.string().uuid(),
});

export const sessionTransferRouter = router({
	context: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db
				.select()
				.from(workspaces)
				.where(
					and(
						eq(workspaces.id, input.workspaceId),
						isNull(workspaces.archivedAt),
					),
				)
				.get();
			if (!workspace)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "workspace_unavailable",
				});
			const transcript = await transcriptSession({
				...input,
				db: ctx.db,
				eventBus: ctx.eventBus,
			});
			if ("error" in transcript) throw toTerminalSessionError(transcript);
			const binding = ctx.terminalAgentStore.get(input.terminalId);
			const config =
				binding &&
				resolveHostAgentConfig(ctx.db, binding.definitionId ?? binding.agentId);
			return new ContextTransferProvider().transfer({
				cwd: workspace.worktreePath,
				transcript: transcript.text ?? "",
				sourceTerminalId: input.terminalId,
				sourceAgentLabel: config?.label ?? binding?.agentId,
			});
		}),
	capabilities: protectedProcedure.query(async () => {
		const engine = await new TxcriptTransferProvider().capabilities();
		return {
			lineageAvailable: true,
			nativeAvailable: engine !== null,
			engineVersion: engine?.engineVersion ?? null,
			adapters: Object.entries(TRANSFER_AGENTS).map(([agent, value]) => ({
				agent,
				harness: value.harness,
				verified: engine?.verifiedAdapters.includes(value.harness) ?? false,
			})),
		};
	}),
	prepare: protectedProcedure
		.input(inputSchema)
		.mutation(async ({ ctx, input }) => {
			const key = `${ctx.organizationId}:${input.transferId}`;
			let prepared: Prepared;
			try {
				prepared = await jobs.run(
					key,
					JSON.stringify(input),
					async (signal) => {
						const lineage = new LocalLineageStore(ctx.db, ctx.organizationId);
						if (lineage.edge(input.workspaceId, input.transferId))
							throw new Error("transfer_already_recorded");
						const workspace = ctx.db
							.select()
							.from(workspaces)
							.where(
								and(
									eq(workspaces.id, input.workspaceId),
									isNull(workspaces.archivedAt),
								),
							)
							.get();
						const binding =
							ctx.terminalAgentStore.get(input.terminalId) ??
							getTerminalAgentBinding(ctx.db, input.terminalId);
						const bound = terminalHarnessSession(ctx.db, input.terminalId);
						const config = resolveHostAgentConfig(ctx.db, input.targetConfigId);
						if (
							!workspace ||
							!binding ||
							binding.workspaceId !== input.workspaceId ||
							!binding.agentSessionId ||
							!bound ||
							!config
						)
							throw new Error("session_unavailable");
						if (
							!binding.endedAt &&
							!["Attached", "Stop", "Failed"].includes(binding.lastEventType)
						)
							throw new Error("source_busy");
						if (
							!isVerifiedNativeAgent(binding.agentId) ||
							!isVerifiedNativeAgent(config.presetId) ||
							binding.agentId === config.presetId ||
							!config.resumeArgs.length
						)
							throw new Error("native_pair_unavailable");
						const cwd = await realpath(workspace.worktreePath);
						const launchEnv = agentLaunchEnv(ctx.db, config);
						// Absolute CLI commands bypass Superset's identity wrapper. Cursor
						// hooks use this native CLI marker to distinguish it from the IDE.
						let env =
							config.presetId === "cursor-agent"
								? { ...launchEnv, CURSOR_AGENT: "1" }
								: launchEnv;
						if (config.presetId === "claude" || config.presetId === "codex") {
							const target = TRANSFER_AGENTS[config.presetId];
							const selected =
								launchEnv[target.profileKey] || process.env[target.profileKey];
							const profile = await realpath(
								selected || join(homedir(), target.home),
							);
							env = pinNativeProfile(
								launchEnv,
								config.presetId,
								selected ? profile : null,
							);
						}
						const targetRoot = await realpath(
							defaultNativeStore(config.presetId, { ...process.env, ...env }),
						);
						const sourceEnv = { ...bound.ref.env };
						const sourceNode = lineage.findSession(
							input.workspaceId,
							binding.agentId,
							binding.agentSessionId,
							input.terminalId,
						);
						const sourceConfig = resolveHostAgentConfig(
							ctx.db,
							sourceNode?.configId ??
								terminalLaunchConfigId(
									input.workspaceId,
									input.terminalId,
									binding.agentId,
								) ??
								binding.definitionId ??
								binding.agentId,
						);
						if (!sourceConfig) throw new Error("source_config_unavailable");
						if (
							binding.account?.directory &&
							(binding.agentId === "claude" || binding.agentId === "codex")
						) {
							sourceEnv[TRANSFER_AGENTS[binding.agentId].profileKey] =
								binding.account.directory;
						}
						if (
							sourceNode &&
							(binding.agentId === "claude" || binding.agentId === "codex")
						)
							sourceEnv[TRANSFER_AGENTS[binding.agentId].profileKey] =
								sourceNode.profileOverride ?? "";
						let sourceReference: string | null;
						let sourceRoot: string;
						if (binding.agentId === "claude" || binding.agentId === "codex") {
							const files =
								binding.agentId === "claude"
									? claudeSessionFiles
									: codexSessionFiles;
							const reported = sourceNode?.reference ?? bound.ref.reportedPath;
							sourceReference =
								reported && isTrustedTranscriptPath(reported)
									? reported
									: files.locate({
											sessionId: binding.agentSessionId,
											worktreePath: cwd,
											env: sourceEnv,
										});
							if (!sourceReference) throw new Error("source_unavailable");
							sourceRoot = dirname(sourceReference);
							const store = TRANSFER_AGENTS[binding.agentId].store;
							while (
								basename(sourceRoot) !== store &&
								dirname(sourceRoot) !== sourceRoot
							)
								sourceRoot = dirname(sourceRoot);
							if (basename(sourceRoot) !== store)
								throw new Error("source_store_unavailable");
						} else {
							sourceRoot = await realpath(
								defaultNativeStore(binding.agentId, {
									...process.env,
									...sourceEnv,
								}),
							);
							sourceReference = peerSessionReference(
								binding.agentId,
								sourceRoot,
								binding.agentSessionId,
								cwd,
							);
						}
						const provider = new TxcriptTransferProvider();
						const result = await provider.transfer({
							signal,
							sourceAgent: binding.agentId,
							sourceSessionId: binding.agentSessionId,
							sourceTerminalId: input.terminalId,
							sourceRoot,
							sourceReference,
							targetAgent: config.presetId,
							targetRoot,
							cwd,
						});
						if (
							result.mode !== "native" ||
							(["claude", "codex", "opencode"].includes(config.presetId) &&
								hasHarnessSession({
									agentId: config.presetId,
									sessionId: result.targetSessionId,
									worktreePath: cwd,
									env,
								}) !== true)
						)
							throw new Error("target_session_unavailable");
						signal.throwIfAborted();
						const canonicalSourceRoot = await realpath(sourceRoot);
						let sourceProfile: string | null = null;
						if (binding.agentId === "claude" || binding.agentId === "codex") {
							const adapter = TRANSFER_AGENTS[binding.agentId];
							const defaultPath = join(homedir(), adapter.home);
							const defaultProfile = await realpath(defaultPath).catch(
								() => defaultPath,
							);
							if (dirname(canonicalSourceRoot) !== defaultProfile)
								sourceProfile = dirname(canonicalSourceRoot);
						}
						const edge = lineage.record({
							id: input.transferId,
							workspaceId: input.workspaceId,
							source: {
								agent: binding.agentId,
								sessionId: binding.agentSessionId,
								storeRoot: canonicalSourceRoot,
								reference: await realpath(sourceReference),
								cwd,
								configId: sourceConfig.id,
								label: sourceConfig.label,
								profileOverride: sourceProfile,
								lastTerminalId: input.terminalId,
							},
							target: {
								agent: config.presetId,
								sessionId: result.targetSessionId,
								storeRoot: targetRoot,
								reference: await realpath(result.reference),
								cwd,
								configId: config.id,
								label: config.label,
								profileOverride:
									config.presetId === "claude" || config.presetId === "codex"
										? env[TRANSFER_AGENTS[config.presetId].profileKey] || null
										: null,
								lastTerminalId: null,
							},
							warnings: result.warnings,
						});
						return {
							result,
							lineageNodeId: edge.targetNodeId,
							launch: {
								workspaceId: input.workspaceId,
								agent: config.id,
								prompt: "",
								resumeSessionId: result.targetSessionId,
								launchSnapshot: { config, env },
							},
						};
					},
				);
			} catch (error) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						error instanceof Error && /^[a-z_]{1,64}$/.test(error.message)
							? error.message
							: "native_transfer_failed",
				});
			}
			if (!prepared.result)
				throw new TRPCError({
					code: "CONFLICT",
					message: "transfer_id_conflict",
				});
			return { transferId: input.transferId, ...prepared.result };
		}),
	lineage: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).optional(),
				cursor: z
					.object({ createdAt: z.number().int(), id: z.string().uuid() })
					.optional(),
			}),
		)
		.query(({ ctx, input }) =>
			new LocalLineageStore(ctx.db, ctx.organizationId).list(
				input.workspaceId,
				input.limit ?? 50,
				input.cursor,
			),
		),
	prepareResume: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				nodeId: z.string().uuid(),
				transferId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const prepared = await jobs.run(
					`${ctx.organizationId}:${input.transferId}`,
					JSON.stringify({ resume: input }),
					async () => {
						const lineage = new LocalLineageStore(ctx.db, ctx.organizationId);
						const node = lineage.node(input.workspaceId, input.nodeId);
						const workspace = ctx.db
							.select()
							.from(workspaces)
							.where(
								and(
									eq(workspaces.id, input.workspaceId),
									isNull(workspaces.archivedAt),
								),
							)
							.get();
						if (!node || !workspace)
							throw new Error("lineage_session_unavailable");
						const launch = await lineageResumeLaunch(
							ctx.db,
							node,
							workspace.worktreePath,
						);
						return { launch, lineageNodeId: node.id };
					},
				);
				return {
					transferId: input.transferId,
					configId: prepared.launch.agent,
				};
			} catch {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "lineage_resume_unavailable",
				});
			}
		}),
	cancel: protectedProcedure
		.input(z.object({ transferId: z.string().uuid() }))
		.mutation(({ ctx, input }) => {
			jobs.cancel(`${ctx.organizationId}:${input.transferId}`);
			return { cancelled: true };
		}),
	launch: protectedProcedure
		.input(
			z.object({
				transferId: z.string().uuid(),
				workspaceId: z.string().uuid(),
				colors: terminalColorsSchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pending = jobs.get(`${ctx.organizationId}:${input.transferId}`);
			if (!pending)
				throw new TRPCError({ code: "NOT_FOUND", message: "transfer_expired" });
			const job = await pending;
			if (job.launch.workspaceId !== input.workspaceId)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "transfer_workspace_mismatch",
				});
			if (
				!ctx.db
					.select({ id: workspaces.id })
					.from(workspaces)
					.where(
						and(
							eq(workspaces.id, input.workspaceId),
							isNull(workspaces.archivedAt),
						),
					)
					.get()
			)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "workspace_unavailable",
				});
			if (!job.launchPromise) {
				const nodeKey = `${ctx.organizationId}:${job.lineageNodeId ?? input.transferId}`;
				let launched = nodeLaunches.get(nodeKey);
				if (!launched) {
					const node = job.lineageNodeId
						? new LocalLineageStore(ctx.db, ctx.organizationId).node(
								input.workspaceId,
								job.lineageNodeId,
							)
						: undefined;
					const existing = node?.lastTerminalId
						? ctx.terminalAgentStore
								.listByWorkspace(input.workspaceId)
								.find(
									(binding) =>
										binding.terminalId === node.lastTerminalId &&
										binding.agentId === node.agent &&
										binding.agentSessionId === node.sessionId &&
										!binding.endedAt,
								)
						: undefined;
					launched = existing
						? Promise.resolve<AgentRunResult>({
								kind: "terminal",
								sessionId: existing.terminalId,
								label: job.launch.launchSnapshot?.config.label ?? "",
							})
						: runAgentInWorkspace(ctx, { ...job.launch, colors: input.colors });
					nodeLaunches.set(nodeKey, launched);
					const current = launched;
					void launched
						.finally(() => {
							if (nodeLaunches.get(nodeKey) === current)
								nodeLaunches.delete(nodeKey);
						})
						.catch(() => {});
				}
				job.launchPromise = launched.then(
					(result) => {
						if (job.lineageNodeId) {
							try {
								new LocalLineageStore(ctx.db, ctx.organizationId).setTerminal(
									input.workspaceId,
									job.lineageNodeId,
									result.sessionId,
								);
							} catch {
								console.error(
									"[session-transfer] Could not update the lineage terminal reference",
								);
							}
						}
						return result;
					},
					(error) => {
						job.launchPromise = undefined;
						throw error;
					},
				);
			}
			return job.launchPromise;
		}),
});
