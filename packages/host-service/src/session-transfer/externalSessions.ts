import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { TRANSFER_AGENTS } from "./registry";

/** txcript's harness ids, as Superset's agent presets know them. */
const AGENT_BY_HARNESS = {
	claude_code: "claude",
	codex: "codex",
	cursor: "cursor-agent",
	grok: "grok",
	opencode: "opencode",
} as const;

export type ExternalAgent =
	(typeof AGENT_BY_HARNESS)[keyof typeof AGENT_BY_HARNESS];

export interface ExternalSession {
	agent: ExternalAgent;
	sessionId: string;
	title: string | null;
	/** The first prompt, for chats without a title. */
	preview: string | null;
	timestamp: string;
	updatedAt: string | null;
	cwd: string | null;
	gitBranch: string | null;
	model: string | null;
	/** The login holding it, for Claude and Codex; null is the system default. */
	accountSelection: string | null;
	storeRoot?: string;
}

const listedSchema = z.array(
	z.object({
		harness: z.string(),
		id: z.string().min(1),
		timestamp: z.string(),
		title: z.string().nullable().optional(),
		preview: z.string().nullable().optional(),
		updated_at: z.string().nullable().optional(),
		cwd: z.string().nullable().optional(),
		git_branch: z.string().nullable().optional(),
		model: z.string().nullable().optional(),
	}),
);

export type RunCli = (
	args: string[],
	env: NodeJS.ProcessEnv,
) => Promise<unknown>;

/** txcript's CLI, bundled beside the transfer helper under its own name. */
export function txcriptCliPath(
	execPath = process.execPath,
	exists: (path: string) => boolean = existsSync,
): string {
	const bundled = join(
		dirname(execPath),
		"..",
		"Resources",
		"resources",
		"bin",
		"txcript-cli",
	);
	if (exists(bundled)) return bundled;
	return join(
		process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset"),
		"bin",
		"txcript-cli",
	);
}

export function runTxcriptCli(binary: string): RunCli {
	return (args, env) =>
		new Promise((resolve, reject) => {
			execFile(
				binary,
				args,
				{ env, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
				(error, stdout) => {
					if (error) {
						reject(
							new Error(
								(error as NodeJS.ErrnoException).code === "ENOENT"
									? "session_list_unavailable"
									: "session_list_failed",
							),
						);
						return;
					}
					try {
						resolve(JSON.parse(stdout));
					} catch {
						reject(new Error("session_list_failed"));
					}
				},
			);
		});
}

/**
 * Agent sessions recorded under a folder, from every local login: the
 * default stores first, then each extra Claude profile and Codex home.
 */
export async function listExternalSessions({
	cwd,
	folders = [cwd],
	claudeProfiles,
	codexHomes,
	run,
	baseEnv = process.env,
	limit = 80,
}: {
	cwd: string;
	/** The project's folders; txcript before fork.8 only reads `cwd`. */
	folders?: string[];
	claudeProfiles: string[];
	codexHomes: string[];
	run: RunCli;
	baseEnv?: NodeJS.ProcessEnv;
	limit?: number;
}): Promise<ExternalSession[]> {
	const { CLAUDE_CONFIG_DIR: _claude, ...env } = baseEnv;
	const scans: {
		args: string[];
		env: NodeJS.ProcessEnv;
		selection: string | null;
	}[] = [
		{ args: [], env, selection: null },
		...claudeProfiles.map((dir) => ({
			args: ["--from", "claude_code"],
			env: { ...env, CLAUDE_CONFIG_DIR: dir },
			selection: dir,
		})),
		...codexHomes.map((home) => ({
			args: ["--from", "codex"],
			env: { ...env, CODEX_HOME: home },
			selection: home,
		})),
	];
	const byIdentity = new Map<string, ExternalSession>();
	// `--under` and `--preview` arrived together in txcript fork.8.
	let current = true;
	const list = async (scan: (typeof scans)[number]) => {
		const args = ["list", "--json", "-n", String(limit)];
		if (current)
			try {
				return await run(
					[
						...args,
						...folders.flatMap((folder) => ["--under", folder]),
						"--preview",
						...scan.args,
					],
					scan.env,
				);
			} catch {
				current = false;
			}
		return run([...args, "--cwd", cwd, ...scan.args], scan.env);
	};
	// The first scan settles which flags the CLI takes; the rest run at once.
	const [first, ...rest] = scans;
	const results = first
		? [await list(first), ...(await Promise.all(rest.map(list)))]
		: [];
	for (const [index, scan] of scans.entries()) {
		const listed = listedSchema.parse(results[index]);
		for (const entry of listed) {
			const agent =
				AGENT_BY_HARNESS[entry.harness as keyof typeof AGENT_BY_HARNESS];
			if (!agent) continue;
			const selection =
				agent === "claude" || agent === "codex" ? scan.selection : null;
			const storeRoot = await externalSessionStore(agent, selection, baseEnv);
			const key = `${agent}:${storeRoot}:${entry.id}`;
			const previous = byIdentity.get(key);
			const latest = entry.updated_at ?? entry.timestamp;
			if (
				previous &&
				Date.parse(previous.updatedAt ?? previous.timestamp) >=
					Date.parse(latest)
			)
				continue;
			byIdentity.set(key, {
				storeRoot,
				agent,
				sessionId: entry.id,
				title: entry.title?.trim() || null,
				preview: entry.preview?.trim() || null,
				timestamp: entry.timestamp,
				updatedAt: entry.updated_at ?? null,
				cwd: entry.cwd ?? null,
				gitBranch: entry.git_branch ?? null,
				model: entry.model ?? null,
				accountSelection:
					agent === "claude" || agent === "codex" ? scan.selection : null,
			});
		}
	}
	const recency = (session: ExternalSession) =>
		Date.parse(session.updatedAt ?? session.timestamp);
	return [...byIdentity.values()].sort((a, b) => recency(b) - recency(a));
}

/** The folders of a repository: its main checkout and every worktree. */
export async function projectFolders(cwd: string): Promise<string[]> {
	const listed = await new Promise<string>((resolve) => {
		execFile(
			"git",
			["worktree", "list", "--porcelain"],
			{ cwd, timeout: 10_000 },
			(error, stdout) => resolve(error ? "" : stdout),
		);
	});
	const folders = new Set([cwd]);
	for (const line of listed.split("\n"))
		if (line.startsWith("worktree "))
			folders.add(
				await realpath(line.slice("worktree ".length)).catch(() =>
					line.slice("worktree ".length),
				),
			);
	return [...folders];
}

/** The folder a session ran in: the deepest one holding its cwd. */
export function folderOf(
	sessionCwd: string | null,
	folders: string[],
): string | null {
	if (!sessionCwd) return null;
	return (
		folders
			.filter(
				(folder) =>
					sessionCwd === folder || sessionCwd.startsWith(`${folder}/`),
			)
			.sort((a, b) => b.length - a.length)[0] ?? null
	);
}

export async function externalSessionStore(
	agent: ExternalAgent,
	selection: string | null,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
	const adapter = TRANSFER_AGENTS[agent];
	const profile =
		selection ??
		(agent === "codex" ? env.CODEX_HOME : undefined) ??
		join(env.HOME || homedir(), adapter.home);
	const store = join(profile, adapter.store);
	return realpath(store).catch(() => store);
}
