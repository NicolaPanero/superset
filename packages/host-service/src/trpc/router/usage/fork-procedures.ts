import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../index";
import { listAccountAliases, setAccountAlias } from "./account-aliases";
import { discoverClaudeProfiles, discoverCodexHomes } from "./profiles";

/** The fork's usage procedures, served under the `usage` router. */
export const forkUsageProcedures = {
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
