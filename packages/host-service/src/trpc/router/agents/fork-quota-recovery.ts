import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	readRecovery,
	recoveryControllers,
	recoveryKey,
	writeRecovery,
} from "../../../chat-v3/forkQuotaRecoveryStore";
import type { HostDb } from "../../../db";
import { workspaces } from "../../../db/schema";
import { protectedProcedure } from "../../index";

const location = z.object({
	workspaceId: z.string().uuid(),
	terminalId: z.string().min(1).max(128),
});
function workspaceExists(db: HostDb, id: string) {
	if (
		!db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.id, id))
			.get()
	)
		throw new TRPCError({ code: "NOT_FOUND" });
}
export const forkQuotaRecoveryProcedures = {
	quotaRecovery: protectedProcedure.input(location).query(({ ctx, input }) => {
		workspaceExists(ctx.db, input.workspaceId);
		const row = readRecovery(ctx.db, input.workspaceId, input.terminalId);
		const live = recoveryControllers.get(
			recoveryKey(input.workspaceId, input.terminalId),
		);
		return {
			supported: true,
			switchAccounts: row?.switchAccounts ?? false,
			resumeAtReset: row?.resumeAtReset ?? false,
			...(live?.status ?? { phase: "idle" as const }),
		};
	}),
	setQuotaRecovery: protectedProcedure
		.input(
			location.extend({
				switchAccounts: z.boolean().optional(),
				resumeAtReset: z.boolean().optional(),
				clearSelection: z.boolean().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			workspaceExists(ctx.db, input.workspaceId);
			writeRecovery(ctx.db, input.workspaceId, input.terminalId, {
				...(input.switchAccounts !== undefined
					? { switchAccounts: input.switchAccounts }
					: {}),
				...(input.resumeAtReset !== undefined
					? { resumeAtReset: input.resumeAtReset }
					: {}),
				...(input.clearSelection
					? { hasSelection: false, accountSelection: null }
					: {}),
			});
			recoveryControllers
				.get(recoveryKey(input.workspaceId, input.terminalId))
				?.changed();
			return { saved: true };
		}),
};
