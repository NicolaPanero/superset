import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	getTerminalBaseEnv,
	waitForTerminalBaseEnv,
} from "../../../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../../../terminal-agents/agent-config";
import { protectedProcedure } from "../../index";
import { applyForkLaunchChoices } from "../agents/fork-launch";
import { listAccountAliases, setAccountAlias } from "./account-aliases";
import { probeAccount } from "./fork-account-probe";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles";

/** The fork's usage procedures, served under the `usage` router. */
export const forkUsageProcedures = {
	verifyAccount: protectedProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string().min(1).max(4096).nullable(),
			}),
		)
		.mutation(async ({ input }) => probeAccount(input.agent, input.selection)),
	launchAccount: protectedProcedure
		.input(
			z.object({
				agent: z.string(),
				selection: z.string().min(1).max(4096).nullable().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			await waitForTerminalBaseEnv();
			const config = resolveHostAgentConfig(ctx.db, input.agent);
			if (!config)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "account_selection_unavailable",
				});
			const env = {
				...getTerminalBaseEnv(),
				...agentLaunchEnv(ctx.db, config),
			};
			const keys =
				config.presetId === "claude"
					? [
							"ANTHROPIC_API_KEY",
							"ANTHROPIC_AUTH_TOKEN",
							"CLAUDE_CODE_OAUTH_TOKEN",
						]
					: config.presetId === "codex"
						? ["OPENAI_API_KEY", "CODEX_API_KEY"]
						: [];
			const environmentOverride = keys.some((key) => !!env[key]);
			if (input.selection !== undefined)
				await applyForkLaunchChoices(ctx.db, {
					agent: input.agent,
					workspaceId: "preflight",
					prompt: "",
					accountSelection: input.selection,
				});
			return { provider: config.presetId, environmentOverride };
		}),
	accountAliases: protectedProcedure.query(({ ctx }) =>
		listAccountAliases(ctx.db),
	),
	setAccountAlias: protectedProcedure
		.input(
			z.object({
				agent: z.enum(["claude", "codex"]),
				selection: z.string().min(1).max(4096).nullable(),
				label: z.string().trim().max(64).nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Alias removal stays available after a profile disappears externally.
			if (input.label?.trim() && input.selection !== null) {
				const profiles =
					input.agent === "claude"
						? (await discoverClaudeProfiles()).map(
								(profile) => profile.configDir,
							)
						: (await discoverCodexHomes()).slice(1).map((home) => home.home);
				if (!profiles.includes(input.selection))
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "account_selection_unavailable",
					});
			}
			try {
				setAccountAlias(ctx.db, input.agent, input.selection, input.label);
			} catch {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "account_alias_unavailable",
				});
			}
			return { success: true as const };
		}),
};
