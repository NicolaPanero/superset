import { z } from "zod";
import {
	MAX_ATTACHMENT_RETENTION_DAYS,
	readAttachmentRetentionDays,
	sweepWorkspaceAttachments,
	writeAttachmentRetentionDays,
} from "../../../fork-attachments/fork-attachment-retention";
import { protectedProcedure, router } from "../../index";

export const forkAttachmentsRouter = router({
	retention: protectedProcedure.query(() => ({
		days: readAttachmentRetentionDays(),
	})),
	setRetention: protectedProcedure
		.input(
			z.object({
				days: z.number().int().min(0).max(MAX_ATTACHMENT_RETENTION_DAYS),
			}),
		)
		.mutation(({ ctx, input }) => {
			writeAttachmentRetentionDays(input.days);
			return {
				days: input.days,
				...sweepWorkspaceAttachments(ctx.db, input.days),
			};
		}),
});
