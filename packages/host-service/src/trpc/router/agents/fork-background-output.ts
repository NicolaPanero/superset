import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { resolveSupersetHomeDir } from "@superset/agent-setup";
import { z } from "zod";
import { protectedProcedure } from "../../index";

const OUTPUT_TAIL_BYTES = 64 * 1024;

export function forkBackgroundOutputRoots(profile?: string | null): string[] {
	const home = homedir();
	return [
		tmpdir(),
		"/tmp",
		...(process.env.CLAUDE_CODE_TMPDIR ? [process.env.CLAUDE_CODE_TMPDIR] : []),
		join(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects"),
		join(process.env.CODEX_HOME || join(home, ".codex"), "sessions"),
		join(home, ".cursor", "chats"),
		join(home, ".cursor", "acp-sessions"),
		join(home, ".grok", "sessions"),
		join(resolveSupersetHomeDir(), "tmp"),
		...(profile ? [join(profile, "projects"), join(profile, "sessions")] : []),
	];
}

function within(file: string, root: string): boolean {
	const rel = relative(root, file);
	return (
		rel === "" ||
		(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
	);
}

export async function readOutputTail(
	path: string,
	maxBytes = OUTPUT_TAIL_BYTES,
	roots = forkBackgroundOutputRoots(),
) {
	if (!isAbsolute(path)) return null;
	const target = resolve(path);
	const candidates = await Promise.all(
		roots.map(async (item) => {
			const root = resolve(item);
			const canonicalRoot = await realpath(root).catch(() => null);
			return canonicalRoot ? { root, canonicalRoot } : null;
		}),
	);
	const trusted = candidates
		.flatMap((item) =>
			item
				? [
						item,
						{ root: item.canonicalRoot, canonicalRoot: item.canonicalRoot },
					]
				: [],
		)
		.filter((item) => within(target, item.root))
		.sort((a, b) => b.root.length - a.root.length)[0];
	if (!trusted) return null;
	const { root, canonicalRoot } = trusted;
	const suffix = relative(root, target);
	let component = canonicalRoot;
	for (const part of suffix.split(sep).filter(Boolean)) {
		component = join(component, part);
		if ((await lstat(component)).isSymbolicLink()) return null;
	}
	const canonical = await realpath(target);
	if (canonical !== component || !within(canonical, canonicalRoot)) return null;
	const before = await lstat(canonical);
	if (!before.isFile()) return null;
	const file = await open(
		canonical,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
	);
	try {
		const info = await file.stat();
		if (
			!info.isFile() ||
			info.dev !== before.dev ||
			info.ino !== before.ino ||
			(await realpath(target)) !== canonical
		)
			return null;
		const limit = Math.max(
			0,
			Math.min(OUTPUT_TAIL_BYTES, Math.floor(maxBytes)),
		);
		const length = Math.min(info.size, limit);
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await file.read(
			buffer,
			0,
			length,
			info.size - length,
		);
		return {
			text: buffer.subarray(0, bytesRead).toString("utf8"),
			truncated: info.size > length,
		};
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
			const session = chatSessionId
				? ctx.runtime.chat?.()?.live.get(chatSessionId)
				: undefined;
			const task = session?.state.backgroundTasks?.find(
				(item) => item.id === input.taskId,
			);
			if (!task?.outputPath) return { output: null };
			try {
				return {
					output: await readOutputTail(
						task.outputPath,
						OUTPUT_TAIL_BYTES,
						forkBackgroundOutputRoots(session?.launchOptions?.accountSelection),
					),
				};
			} catch {
				return { output: null };
			}
		}),
};
