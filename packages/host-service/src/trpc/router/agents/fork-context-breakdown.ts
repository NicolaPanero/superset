import { z } from "zod";
import { protectedProcedure } from "../../index";

/** On demand, never during a turn: the chat does not wait for this. */
export const forkContextBreakdownProcedures = {
	contextBreakdown: protectedProcedure
		.input(z.object({ terminalId: z.string().min(1).max(128) }))
		.query(async ({ ctx, input }) => {
			const chatSessionId = ctx.terminalAgentStore.getChat(
				input.terminalId,
			)?.chatSessionId;
			const live = chatSessionId
				? ctx.runtime.chat?.()?.live.get(chatSessionId)
				: null;
			const usage = live ? await live.contextBreakdown() : null;
			return { usage: usage as ForkContextBreakdown | null };
		}),
};

export interface ForkContextBreakdown {
	categories: {
		name: string;
		tokens: number;
		color?: string;
		kind?: "used" | "free" | "buffer" | "deferred";
		isDeferred?: boolean;
	}[];
	totalTokens: number;
	maxTokens: number;
	rawMaxTokens?: number;
	percentage: number;
	autoCompactThreshold?: number;
	isAutoCompactEnabled?: boolean;
	memoryFiles?: { path: string; type: string; tokens: number }[];
	mcpTools?: {
		name: string;
		serverName: string;
		tokens: number;
		isLoaded?: boolean;
	}[];
}
