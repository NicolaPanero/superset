import { z } from "zod";
import {
	listParkedChats,
	parkChat,
	unparkChat,
} from "../../../chat-v3/backgroundChats";
import { protectedProcedure } from "../../index";

/** ACP chats whose pane was closed but which keep running in the background. */
export const forkBackgroundChatProcedures = {
	parkChat: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				terminalId: z.string().min(1),
				title: z.string(),
				paneData: z.record(z.string(), z.unknown()),
			}),
		)
		.mutation(({ ctx, input }) => ({
			evicted: parkChat(ctx.db, input).map((chat) => chat.paneData),
		})),
	parkedChats: protectedProcedure
		.input(z.object({ workspaceId: z.string().uuid() }))
		.query(({ ctx, input }) => listParkedChats(ctx.db, input.workspaceId)),
	unparkChat: protectedProcedure
		.input(z.object({ terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			unparkChat(ctx.db, input.terminalId);
		}),
};
