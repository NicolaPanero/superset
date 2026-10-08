import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

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
	timestamp: string;
	cwd: string | null;
	gitBranch: string | null;
	model: string | null;
	/** The login holding it, for Claude and Codex; null is the system default. */
	accountSelection: string | null;
}

const listedSchema = z.array(
	z.object({
		harness: z.string(),
		id: z.string().min(1),
		timestamp: z.string(),
		title: z.string().nullable().optional(),
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
	claudeProfiles,
	codexHomes,
	run,
	baseEnv = process.env,
	limit = 300,
}: {
	cwd: string;
	claudeProfiles: string[];
	codexHomes: string[];
	run: RunCli;
	baseEnv?: NodeJS.ProcessEnv;
	limit?: number;
}): Promise<ExternalSession[]> {
	const { CLAUDE_CONFIG_DIR: _claude, CODEX_HOME: _codex, ...env } = baseEnv;
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
	const seen = new Set<string>();
	const sessions: ExternalSession[] = [];
	for (const scan of scans) {
		const listed = listedSchema.parse(
			await run(
				["list", "--json", "--cwd", cwd, "-n", String(limit), ...scan.args],
				scan.env,
			),
		);
		for (const entry of listed) {
			const agent =
				AGENT_BY_HARNESS[entry.harness as keyof typeof AGENT_BY_HARNESS];
			const key = `${agent}:${entry.id}`;
			if (!agent || seen.has(key)) continue;
			seen.add(key);
			sessions.push({
				agent,
				sessionId: entry.id,
				title: entry.title?.trim() || null,
				timestamp: entry.timestamp,
				cwd: entry.cwd ?? null,
				gitBranch: entry.git_branch ?? null,
				model: entry.model ?? null,
				accountSelection:
					agent === "claude" || agent === "codex" ? scan.selection : null,
			});
		}
	}
	return sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
