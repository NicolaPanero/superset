import { z } from "zod";
import { switchClaudeChatAccount } from "../../../chat-v3/forkSwitchChatAccount";
import { protectedProcedure } from "../../index";

export const forkSwitchChatAccountProcedures = {
	switchChatAccount: protectedProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().min(1).max(128),
				chatSessionId: z.string().min(1),
				sessionId: z.string().uuid(),
				targetSelection: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }) => switchClaudeChatAccount(ctx, input)),
};
