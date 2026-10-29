import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	FORK_AGENT_CLI_IDS,
	forkAgentCliChecksEnabled,
	forkAgentCliDeps,
	forkAgentCliStatuses,
	forkSetAgentCliChecks,
	forkSnoozeAgentCliUpdates,
	forkUpdateAgentCli,
} from "../../../fork-integrations/fork-agent-cli-updates";
import { machineOnlyProcedure, router } from "../../index";

const local = machineOnlyProcedure.use(({ ctx, next }) => {
	if (ctx.isLocalCaller === false)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Update agent tools on the host computer",
		});
	return next({ ctx });
});

export const forkAgentCliRouter = router({
	/** The daily notice reads this; `force` is the "Check now" button. */
	status: local
		.input(z.object({ force: z.boolean().optional() }).optional())
		.query(async ({ ctx, input }) => {
			const enabled = forkAgentCliChecksEnabled(ctx);
			const force = input?.force === true;
			if (!enabled && !force) return { enabled, agents: [] };
			return {
				enabled,
				agents: await forkAgentCliStatuses(ctx, forkAgentCliDeps(), { force }),
			};
		}),
	setEnabled: local
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			forkSetAgentCliChecks(ctx, input.enabled);
			return { enabled: input.enabled };
		}),
	snooze: local.mutation(({ ctx }) => {
		forkSnoozeAgentCliUpdates(ctx, Date.now());
		return { ok: true };
	}),
	update: local
		.input(z.object({ agent: z.enum(FORK_AGENT_CLI_IDS) }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await forkUpdateAgentCli(ctx, forkAgentCliDeps(), input.agent);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),
});
