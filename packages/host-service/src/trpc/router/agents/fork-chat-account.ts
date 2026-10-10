import { homedir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { moveClaudeSession } from "../../../chat-v3/forkMoveClaudeSession";
import { writeRecovery } from "../../../chat-v3/forkQuotaRecoveryStore";
import { protectedProcedure } from "../../index";
import { discoverClaudeProfiles } from "../usage/profiles";
import { agentAccountOptions } from "./account-selection";

/** Moving a chat between logins of the same agent, for the chat's account menu. */
export const forkChatAccountProcedures = {
	moveChatToAccount: protectedProcedure
		.input(
			z.object({
				agent: z.literal("claude"),
				sessionId: z.string().uuid(),
				targetSelection: z.string().nullable(),
				workspaceId: z.string().uuid().optional(),
				terminalId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const options = await agentAccountOptions(input.agent);
			if (!options.some((option) => option.selection === input.targetSelection))
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "account_selection_unavailable",
				});
			const systemDir = join(homedir(), ".claude");
			const result = await moveClaudeSession({
				sessionId: input.sessionId,
				configDirs: [
					systemDir,
					...(await discoverClaudeProfiles()).map(
						(profile) => profile.configDir,
					),
				],
				targetDir: input.targetSelection ?? systemDir,
			});
			if (!result.moved && result.reason === "session_not_found")
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "session_not_found",
				});
			if (input.workspaceId && input.terminalId)
				writeRecovery(ctx.db, input.workspaceId, input.terminalId, {
					hasSelection: false,
					accountSelection: null,
				});
			return { moved: result.moved };
		}),
};
