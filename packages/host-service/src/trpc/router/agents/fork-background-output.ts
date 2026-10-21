import { open } from "node:fs/promises";
import { z } from "zod";
import { protectedProcedure } from "../../index";

const OUTPUT_TAIL_BYTES = 64 * 1024;

export async function readOutputTail(
	path: string,
	maxBytes = OUTPUT_TAIL_BYTES,
) {
	const file = await open(path, "r");
	try {
		const info = await file.stat();
		if (!info.isFile()) return null;
		const length = Math.min(info.size, maxBytes);
		const buffer = Buffer.alloc(length);
		await file.read(buffer, 0, length, info.size - length);
		return { text: buffer.toString("utf8"), truncated: info.size > length };
	} finally {
		await file.close();
	}
}

/** Reads only the output file the agent reported for one of its live tasks. */
export const forkBackgroundOutputProcedures = {
	backgroundTaskOutput: protectedProcedure
		.input(
			z.object({
				terminalId: z.string().min(1).max(128),
				taskId: z.string().min(1).max(256),
			}),
		)
		.query(async ({ ctx, input }) => {
			const chatSessionId = ctx.terminalAgentStore.getChat(
				input.terminalId,
			)?.chatSessionId;
			const task = chatSessionId
				? ctx.runtime
						.chat?.()
						?.live.get(chatSessionId)
						?.state.backgroundTasks?.find((item) => item.id === input.taskId)
				: undefined;
			if (!task?.outputPath) return { output: null };
			try {
				return { output: await readOutputTail(task.outputPath) };
			} catch {
				return { output: null };
			}
		}),
};
