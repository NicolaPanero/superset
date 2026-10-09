import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { terminalColorsSchema } from "@superset/shared/terminal-colors";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { bridgeCursorSession } from "../../../chat-v3/cursorSessionBridge/cursorSessionBridge";
import { copyClaudeSessionToFolder } from "../../../chat-v3/forkMoveClaudeSession";
import { workspaces } from "../../../db/schema";
import { chatProvenance } from "../../../session-transfer/chatProvenance";
import {
	externalSessionStore,
	folderOf,
	listExternalSessions,
	projectFolders,
	runTxcriptCli,
	txcriptCliPath,
} from "../../../session-transfer/externalSessions";
import { TransferJobs } from "../../../session-transfer/jobs";
import {
	type LineageNode,
	LocalLineageStore,
} from "../../../session-transfer/lineage";
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
	type ResolvedHostAgentConfig,
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
	agentAccountOptions,
	selectedAccountEnv,
} from "../agents/account-selection";
import {
	type AgentRunInput,
	type AgentRunResult,
	runAgentInWorkspace,
} from "../agents/agents";
import { terminalLaunchConfigId } from "../agents/fork-launch";
import { toTerminalSessionError } from "../terminal/errors";
import { discoverClaudeProfiles, discoverCodexHomes } from "../usage/profiles";

type Prepared = {
	result?: Extract<TransferResult, { mode: "native" }>;
	launch: AgentRunInput;
	lineageNodeId?: string;
	launchPromise?: Promise<AgentRunResult>;
};
const jobs = new TransferJobs<Prepared>();
const chatJobs = new TransferJobs<
	Extract<TransferResult, { mode: "native" }>
>();
const nodeLaunches = new Map<string, Promise<AgentRunResult>>();
const inputSchema = z.object({
	workspaceId: z.string().uuid(),
	terminalId: z.string().uuid(),
	targetConfigId: z.string().uuid(),
	transferId: z.string().uuid(),
});

async function pinTargetProfile(
	config: ResolvedHostAgentConfig,
	launchEnv: Record<string, string>,
	selection?: string | null,
) {
	// Absolute CLI commands bypass Superset's identity wrapper. Cursor
	// hooks use this native CLI marker to distinguish it from the IDE.
	if (config.presetId === "cursor-agent")
		return { ...launchEnv, CURSOR_AGENT: "1" };
	if (config.presetId !== "claude" && config.presetId !== "codex")
		return launchEnv;
	if (selection !== undefined)
		return selectedAccountEnv(config, launchEnv, selection);
	const target = TRANSFER_AGENTS[config.presetId];
	const selected =
		launchEnv[target.profileKey] || process.env[target.profileKey];
	const profile = await realpath(selected || join(homedir(), target.home));
	return pinNativeProfile(
		launchEnv,
		config.presetId,
		selected ? profile : null,
	);
}

async function convertNative(
	lineage: LocalLineageStore,
	input: {
		transferId: string;
		workspaceId: string;
		cwd: string;
		signal: AbortSignal;
		source: {
			agent: LineageNode["agent"];
			sessionId: string;
			root: string;
			reference: string;
			configId: string;
			label: string;
			terminalId: string;
		};
		target: {
			config: ResolvedHostAgentConfig;
			env: Record<string, string>;
			root: string;
			terminalId: string | null;
		};
	},
) {
	const { cwd, signal, source, target } = input;
	const presetId = target.config.presetId;
	if (!isVerifiedNativeAgent(presetId))
		throw new Error("native_pair_unavailable");
	const result = await new TxcriptTransferProvider().transfer({
		signal,
		sourceAgent: source.agent,
		sourceSessionId: source.sessionId,
		sourceTerminalId: source.terminalId,
		sourceRoot: source.root,
		sourceReference: source.reference,
		targetAgent: presetId,
		targetRoot: target.root,
		cwd,
	});
	if (
		result.mode !== "native" ||
		(["claude", "codex", "opencode"].includes(presetId) &&
			hasHarnessSession({
				agentId: presetId,
				sessionId: result.targetSessionId,
				worktreePath: cwd,
				env: target.env,
			}) !== true)
	)
		throw new Error("target_session_unavailable");
	signal.throwIfAborted();
	const canonicalSourceRoot = await realpath(source.root);
	let sourceProfile: string | null = null;
	if (source.agent === "claude" || source.agent === "codex") {
		const adapter = TRANSFER_AGENTS[source.agent];
		const defaultPath = join(homedir(), adapter.home);
		const defaultProfile = await realpath(defaultPath).catch(() => defaultPath);
		if (dirname(canonicalSourceRoot) !== defaultProfile)
			sourceProfile = dirname(canonicalSourceRoot);
	}
	const edge = lineage.record({
		id: input.transferId,
		workspaceId: input.workspaceId,
		source: {
			agent: source.agent,
			sessionId: source.sessionId,
			storeRoot: canonicalSourceRoot,
			reference: await realpath(source.reference),
			cwd,
			configId: source.configId,
			label: source.label,
			profileOverride: sourceProfile,
			lastTerminalId: source.terminalId,
		},
		target: {
			agent: presetId,
			sessionId: result.targetSessionId,
			storeRoot: target.root,
			reference: await realpath(result.reference),
			cwd,
			configId: target.config.id,
			label: target.config.label,
			profileOverride:
				presetId === "claude" || presetId === "codex"
					? target.env[TRANSFER_AGENTS[presetId].profileKey] || null
					: null,
			lastTerminalId: target.terminalId,
		},
		warnings: result.warnings,
	});
	return { result, lineageNodeId: edge.targetNodeId };
}

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
						const env = await pinTargetProfile(config, launchEnv);
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
						const { result, lineageNodeId } = await convertNative(lineage, {
							transferId: input.transferId,
							workspaceId: input.workspaceId,
							cwd,
							signal,
							source: {
								agent: binding.agentId,
								sessionId: binding.agentSessionId,
								root: sourceRoot,
								reference: sourceReference,
								configId: sourceConfig.id,
								label: sourceConfig.label,
								terminalId: input.terminalId,
							},
							target: { config, env, root: targetRoot, terminalId: null },
						});
						return {
							result,
							lineageNodeId,
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
	prepareFromChat: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				transferId: z.string().uuid(),
				sourceTerminalId: z.string().uuid(),
				sourceConfigId: z.string().min(1),
				sourceSessionId: z.string().min(1).max(128),
				sourceAccountSelection: z.string().min(1).nullable().optional(),
				targetConfigId: z.string().min(1),
				targetAccountSelection: z.string().min(1).nullable().optional(),
				targetTerminalId: z.string().uuid(),
				/** A session started outside Superset, so never opened as a chat. */
				sourceExternal: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await chatJobs.run(
					`${ctx.organizationId}:${input.transferId}`,
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
						const sourceConfig = resolveHostAgentConfig(
							ctx.db,
							input.sourceConfigId,
						);
						const config = resolveHostAgentConfig(ctx.db, input.targetConfigId);
						if (!workspace || !sourceConfig || !config)
							throw new Error("session_unavailable");
						const sourceAgent = sourceConfig.presetId;
						if (
							!isVerifiedNativeAgent(sourceAgent) ||
							!isVerifiedNativeAgent(config.presetId) ||
							sourceAgent === config.presetId ||
							!config.resumeArgs.length
						)
							throw new Error("native_pair_unavailable");
						const cwd = await realpath(workspace.worktreePath);
						const sourceEnv = await pinTargetProfile(
							sourceConfig,
							agentLaunchEnv(ctx.db, sourceConfig),
							input.sourceAccountSelection,
						);
						let sourceReference: string | null;
						let sourceRoot: string;
						if (sourceAgent === "claude" || sourceAgent === "codex") {
							const files =
								sourceAgent === "claude"
									? claudeSessionFiles
									: codexSessionFiles;
							sourceReference = files.locate({
								sessionId: input.sourceSessionId,
								worktreePath: cwd,
								env: sourceEnv,
							});
							if (!sourceReference) throw new Error("source_unavailable");
							sourceRoot = dirname(sourceReference);
							const store = TRANSFER_AGENTS[sourceAgent].store;
							while (
								basename(sourceRoot) !== store &&
								dirname(sourceRoot) !== sourceRoot
							)
								sourceRoot = dirname(sourceRoot);
							if (basename(sourceRoot) !== store)
								throw new Error("source_store_unavailable");
						} else {
							// Cursor keeps ACP chats apart from its CLI store, which is
							// the one the converter reads.
							if (sourceAgent === "cursor-agent" && !input.sourceExternal)
								await bridgeCursorSession({
									cwd: workspace.worktreePath,
									sessionId: input.sourceSessionId,
									from: "acp",
								});
							sourceRoot = await realpath(
								defaultNativeStore(sourceAgent, {
									...process.env,
									...sourceEnv,
								}),
							);
							sourceReference = peerSessionReference(
								sourceAgent,
								sourceRoot,
								input.sourceSessionId,
								cwd,
							);
						}
						const env = await pinTargetProfile(
							config,
							agentLaunchEnv(ctx.db, config),
							input.targetAccountSelection,
						);
						const targetRoot = await realpath(
							defaultNativeStore(config.presetId, { ...process.env, ...env }),
						);
						const { result } = await convertNative(lineage, {
							transferId: input.transferId,
							workspaceId: input.workspaceId,
							cwd,
							signal,
							source: {
								agent: sourceAgent,
								sessionId: input.sourceSessionId,
								root: sourceRoot,
								reference: sourceReference,
								configId: sourceConfig.id,
								label: sourceConfig.label,
								terminalId: input.sourceTerminalId,
							},
							target: {
								config,
								env,
								root: targetRoot,
								terminalId: input.targetTerminalId,
							},
						});
						if (config.presetId === "cursor-agent")
							await bridgeCursorSession({
								cwd: workspace.worktreePath,
								sessionId: result.targetSessionId,
								from: "cli",
							});
						return result;
					},
				);
				return { transferId: input.transferId, ...result };
			} catch (error) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						error instanceof Error && /^[a-z_]{1,64}$/.test(error.message)
							? error.message
							: "native_transfer_failed",
				});
			}
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
	externalSessions: protectedProcedure
		.input(z.object({ workspaceId: z.string().uuid() }))
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
			const cwd = await realpath(workspace.worktreePath);
			const folders = await projectFolders(cwd);
			const codexHomes = await discoverCodexHomes();
			const baseEnv = { ...process.env, CODEX_HOME: codexHomes[0]?.home };
			const sessions = await listExternalSessions({
				cwd,
				folders,
				claudeProfiles: (await discoverClaudeProfiles()).map(
					(profile) => profile.configDir,
				),
				codexHomes: codexHomes.slice(1).map((home) => home.home),
				baseEnv,
				run: runTxcriptCli(txcriptCliPath()),
			}).catch((error: Error) => {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: error.message,
				});
			});
			const known = new Set<string>();
			for (const edge of new LocalLineageStore(ctx.db, ctx.organizationId).list(
				input.workspaceId,
				100,
			).items)
				for (const node of [edge.source, edge.target])
					known.add(`${node.agent}:${node.storeRoot}:${node.sessionId}`);
			const workspaceByFolder = new Map<string, string>();
			for (const row of ctx.db
				.select({ id: workspaces.id, path: workspaces.worktreePath })
				.from(workspaces)
				.where(isNull(workspaces.archivedAt))
				.all()) {
				const path = await realpath(row.path).catch(() => null);
				if (path && folders.includes(path) && !workspaceByFolder.has(path))
					workspaceByFolder.set(path, row.id);
			}
			workspaceByFolder.set(cwd, input.workspaceId);
			const active = new Map<string, string>();
			for (const workspaceId of new Set(workspaceByFolder.values())) {
				for (const binding of ctx.terminalAgentStore.listByWorkspace(
					workspaceId,
				)) {
					if (
						!binding.agentSessionId ||
						binding.endedAt ||
						!isVerifiedNativeAgent(binding.agentId)
					)
						continue;
					const managed =
						binding.agentId === "claude" || binding.agentId === "codex";
					if (managed && !binding.account) continue;
					const store = await externalSessionStore(
						binding.agentId,
						binding.account?.selection ?? null,
						baseEnv,
					);
					const key = `${binding.agentId}:${store}:${binding.agentSessionId}`;
					active.set(key, binding.terminalId);
					known.add(key);
				}
			}
			return sessions.map((session) => {
				const folder = folderOf(session.cwd, folders) ?? cwd;
				return {
					...session,
					folder,
					workspaceId: workspaceByFolder.get(folder) ?? null,
					inSuperset: known.has(
						`${session.agent}:${session.storeRoot}:${session.sessionId}`,
					),
					terminalId:
						active.get(
							`${session.agent}:${session.storeRoot}:${session.sessionId}`,
						) ?? null,
				};
			});
		}),
	bringClaudeChat: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				sessionId: z.string().uuid(),
				accountSelection: z.string().nullable(),
				sourceCwd: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
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
			const options = await agentAccountOptions("claude");
			if (
				!workspace ||
				!options.some((option) => option.selection === input.accountSelection)
			)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "session_unavailable",
				});
			await copyClaudeSessionToFolder({
				sessionId: input.sessionId,
				configDir: input.accountSelection ?? join(homedir(), ".claude"),
				fromCwd: input.sourceCwd,
				toCwd: await realpath(workspace.worktreePath),
			});
			return { sessionId: input.sessionId };
		}),
	chatProvenance: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				sessionId: z.string().min(1),
			}),
		)
		.query(({ ctx, input }) =>
			chatProvenance(
				new LocalLineageStore(ctx.db, ctx.organizationId),
				input.workspaceId,
				input,
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
			chatJobs.cancel(`${ctx.organizationId}:${input.transferId}`);
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
