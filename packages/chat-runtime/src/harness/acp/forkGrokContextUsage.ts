import { z } from "zod";

const contextSchema = z.object({
	used: z.number().nonnegative(),
	total: z.number().positive(),
});

export function forkGrokContextUsage(
	response: unknown,
): { used: number; size: number } | null {
	const envelope = z
		.object({ result: z.object({ context: contextSchema }) })
		.safeParse(response);
	const direct = z.object({ context: contextSchema }).safeParse(response);
	const context = envelope.success
		? envelope.data.result.context
		: direct.success
			? direct.data.context
			: null;
	return context ? { used: context.used, size: context.total } : null;
}
