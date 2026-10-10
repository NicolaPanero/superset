import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ACP_HARNESSES } from "../../../chat-v3/acpCatalogue";
import { acpDefaultModel } from "../../../chat-v3/acpDefaultModel";
import { acpHarnessFactory } from "../../../chat-v3/acpHarnesses";
import { resolveAgentCli } from "../../../chat-v3/agentCli";
import { buildChatAgentEnv } from "../../../chat-v3/agentEnv";
import { bridgeCursorSession } from "../../../chat-v3/cursorSessionBridge/cursorSessionBridge";
import { workspaces } from "../../../db/schema";
import { defaultNativeStore } from "../../../session-transfer/stores";
import {
	isLiveTerminalSession,
	sessionHasRunningProcess,
} from "../../../terminal/terminal";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { protectedProcedure } from "../../index";
import { listAccountAliases } from "../usage/account-aliases";
import { validateSessionAccount } from "../usage/session-account/session-account";
import { agentAccountOptions } from "./account-selection";
import { forkBackgroundChatProcedures } from "./fork-background-chats";
import { forkChatAccountProcedures } from "./fork-chat-account";
import {
	exitedAgentTerminalIds,
	launchDetails,
	terminalLaunchConfigId,
} from "./fork-launch";
import { forkQuotaRecoveryProcedures } from "./fork-quota-recovery";

/** The fork's agent procedures, served under the `agents` router. */
export const forkAgentProcedures = {
	prepareCursorSurface: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				configId: z.string().min(1),
				sessionId: z.string().uuid(),
				from: z.enum(["cli", "acp"]),
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
			const config = resolveHostAgentConfig(ctx.db, input.configId);
			if (!workspace || !config || config.presetId !== "cursor-agent")
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "agent_config_unavailable",
				});
			defaultNativeStore("cursor-agent", agentLaunchEnv(ctx.db, config));
			if (
				ctx.terminalAgentStore
					.listByWorkspace(input.workspaceId)
					.some(
						(b) =>
							b.agentId === "cursor-agent" &&
							b.agentSessionId === input.sessionId &&
							!b.endedAt,
					)
			)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "source_session_running",
				});
			await bridgeCursorSession({
				cwd: workspace.worktreePath,
				sessionId: input.sessionId,
				from: input.from,
			});
			return { sessionId: input.sessionId };
		}),
	prepareAcpLaunch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				configId: z.string().min(1),
				accountSelection: z.string().min(1).nullable().optional(),
				sourceTerminalId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const source = input.sourceTerminalId
				? ctx.terminalAgentStore
						.listByWorkspace(input.workspaceId)
						.find((b) => b.terminalId === input.sourceTerminalId && !b.endedAt)
				: undefined;
			if (input.sourceTerminalId && !source)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "source_session_unavailable",
				});
			const config = resolveHostAgentConfig(
				ctx.db,
				source
					? (terminalLaunchConfigId(
							input.workspaceId,
							source.terminalId,
							source.agentId,
						) ?? input.configId)
					: input.configId,
			);
			let selection = input.accountSelection;
			if (
				source &&
				(source.agentId === "claude" || source.agentId === "codex")
			) {
				if (
					!source.account ||
					source.account.credentialKind !== "subscription" ||
					!(await validateSessionAccount(source.account))
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "source_account_unverified",
					});
				selection = source.account.selection;
			}
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
			if (!config || !workspace)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "agent_config_unavailable",
				});
			const harness = Object.entries(ACP_HARNESSES).find(
				([, entry]) => entry.binary === config.presetId,
			)?.[0];
			if (!harness || !acpHarnessFactory(harness, ctx.db))
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "acp_unavailable",
				});
			const launch = {
				db: ctx.db,
				cwd: workspace.worktreePath,
				workspaceId: input.workspaceId,
				agentConfigId: config.id,
				accountSelection: selection,
			};
			let env = await buildChatAgentEnv(launch);
			let accountSelection = selection;
			if (
				accountSelection === undefined &&
				(config.presetId === "claude" || config.presetId === "codex")
			) {
				const path =
					env[
						config.presetId === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"
					] || null;
				const options = await agentAccountOptions(config.presetId);
				accountSelection = options.some((v) => v.selection === path)
					? path
					: null;
				if (
					path &&
					!options.some((v) => v.selection === path) &&
					config.presetId === "claude"
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "account_selection_unavailable",
					});
				env = await buildChatAgentEnv({ ...launch, accountSelection });
			}
			const entry = ACP_HARNESSES[harness];
			if (!entry)
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "acp_unavailable",
				});
			await resolveAgentCli({
				binary: entry.binary,
				minVersion: entry.minVersion,
				upgrade: entry.upgrade,
				env: async () => env,
			});
			return {
				agentConfigId: config.id,
				accountSelection,
				harness,
				defaultModelId: await acpDefaultModel(config.presetId),
			};
		}),
	accountOptions: protectedProcedure
		.input(z.object({ agent: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const aliases = listAccountAliases(ctx.db);
			return (await agentAccountOptions(input.agent)).map((option) => {
				const alias =
					aliases.find(
						(alias) =>
							alias.agent === input.agent &&
							alias.selection === option.selection,
					)?.label ?? null;
				return { ...option, alias, label: alias ?? option.label };
			});
		}),
	launchDetails: protectedProcedure
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(({ ctx, input }) =>
			ctx.terminalAgentStore
				.listByWorkspace(input.workspaceId)
				.flatMap((binding) => {
					const details = launchDetails.get(binding.terminalId);
					return details?.workspaceId === input.workspaceId &&
						details.agent === binding.agentId
						? [
								{
									terminalId: binding.terminalId,
									label: details.label,
									model: details.model,
								},
							]
						: [];
				}),
		),
	exitedAgentTerminals: protectedProcedure
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(({ ctx, input }) =>
			exitedAgentTerminalIds(
				ctx.terminalAgentStore.listByWorkspace(input.workspaceId),
				isLiveTerminalSession,
				(terminalId) => sessionHasRunningProcess(terminalId, input.workspaceId),
			),
		),
	...forkBackgroundChatProcedures,
	...forkChatAccountProcedures,
	...forkQuotaRecoveryProcedures,
};
