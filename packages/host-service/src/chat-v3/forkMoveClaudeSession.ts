import { cp, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { claudeProjectDirName } from "../terminal-agents/harness-sessions/claude";

export type MoveClaudeSessionResult =
	| { moved: true; from: string }
	| { moved: false; reason: "same_account" | "session_not_found" };

/**
 * Copies a Claude Code session into another login's config directory so the
 * same conversation resumes there. Each login keeps its sessions under its
 * own `projects/`; the newest copy found in any login is the source.
 */
export async function moveClaudeSession({
	sessionId,
	configDirs,
	targetDir,
}: {
	sessionId: string;
	configDirs: string[];
	targetDir: string;
}): Promise<MoveClaudeSessionResult> {
	let newest: { dir: string; project: string; mtimeMs: number } | null = null;
	for (const dir of new Set([...configDirs, targetDir])) {
		const projects = join(dir, "projects");
		const entries = await readdir(projects).catch(() => [] as string[]);
		for (const project of entries) {
			const file = await stat(join(projects, project, `${sessionId}.jsonl`))
				.then((info) => (info.isFile() ? info : null))
				.catch(() => null);
			if (file && (!newest || file.mtimeMs > newest.mtimeMs))
				newest = { dir, project, mtimeMs: file.mtimeMs };
		}
	}
	if (!newest) return { moved: false, reason: "session_not_found" };
	if (newest.dir === targetDir) return { moved: false, reason: "same_account" };

	const from = join(newest.dir, "projects", newest.project);
	const to = join(targetDir, "projects", newest.project);
	await cp(join(from, `${sessionId}.jsonl`), join(to, `${sessionId}.jsonl`));
	// Subagent transcripts and large tool results live beside the session.
	const sidecar = join(from, sessionId);
	if (
		await stat(sidecar).then(
			(info) => info.isDirectory(),
			() => false,
		)
	)
		await cp(sidecar, join(to, sessionId), { recursive: true });
	return { moved: true, from: newest.dir };
}

/**
 * Copies a Claude Code session started in another folder of the project into
 * this folder's project directory, where a resume in this folder looks.
 */
export async function copyClaudeSessionToFolder({
	sessionId,
	configDir,
	fromCwd,
	toCwd,
}: {
	sessionId: string;
	configDir: string;
	fromCwd: string;
	toCwd: string;
}): Promise<boolean> {
	const from = join(configDir, "projects", claudeProjectDirName(fromCwd));
	const to = join(configDir, "projects", claudeProjectDirName(toCwd));
	if (from === to) return false;
	const file = `${sessionId}.jsonl`;
	if (
		!(await stat(join(from, file)).then(
			(info) => info.isFile(),
			() => false,
		))
	)
		return false;
	await cp(join(from, file), join(to, file));
	if (
		await stat(join(from, sessionId)).then(
			(info) => info.isDirectory(),
			() => false,
		)
	)
		await cp(join(from, sessionId), join(to, sessionId), { recursive: true });
	return true;
}
