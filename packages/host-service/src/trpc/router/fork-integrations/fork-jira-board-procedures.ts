import { z } from "zod";
import { ForkJiraBoards } from "../../../fork-integrations/fork-jira-boards";
import { forkServices } from "../../../fork-integrations/fork-services";
import { queryProcedure } from "../../index";

export const forkJiraBoardProcedures = {
	boardContext: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				connectionId: z.string().min(1).max(200),
				boardId: z.number().int().positive().optional(),
				project: z.string().max(100).optional(),
			}),
		)
		.query(({ ctx, input }) =>
			new ForkJiraBoards(forkServices(ctx).api).context(
				input.connectionId,
				input.boardId,
				input.project,
			),
		),
};
