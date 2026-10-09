import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	folderOf,
	listExternalSessions,
	type RunCli,
} from "./externalSessions";

describe("listExternalSessions", () => {
	test("reads only the workspace folder when the CLI predates --under", async () => {
		const seen: string[][] = [];
		const run: RunCli = async (args) => {
			seen.push(args);
			if (args.includes("--under")) throw new Error("session_list_failed");
			return [
				{ harness: "codex", id: "x1", timestamp: "2026-01-01T00:00:00Z" },
			];
		};
		const sessions = await listExternalSessions({
			cwd: "/repo",
			claudeProfiles: [],
			codexHomes: [],
			run,
		});
		expect(sessions.map((s) => [s.sessionId, s.preview])).toEqual([
			["x1", null],
		]);
	});

	test("keeps independent account copies of a session", async () => {
		const calls: { args: string[]; claude?: string }[] = [];
		const run: RunCli = async (args, env) => {
			calls.push({ args, claude: env.CLAUDE_CONFIG_DIR });
			if (env.CLAUDE_CONFIG_DIR === "/work")
				return [
					{
						harness: "claude_code",
						id: "shared",
						timestamp: "2026-01-02T00:00:00Z",
					},
					{
						harness: "claude_code",
						id: "work-only",
						timestamp: "2026-01-03T00:00:00Z",
						title: " Fix ",
					},
				];
			if (env.CLAUDE_CONFIG_DIR) return [];
			return [
				{
					harness: "claude_code",
					id: "shared",
					timestamp: "2026-01-02T00:00:00Z",
				},
				{
					harness: "cursor",
					id: "c1",
					timestamp: "2026-01-01T00:00:00Z",
					model: "composer",
				},
				{ harness: "pi", id: "p1", timestamp: "2026-01-04T00:00:00Z" },
			];
		};

		const sessions = await listExternalSessions({
			cwd: "/repo",
			claudeProfiles: ["/work"],
			codexHomes: [],
			run,
			baseEnv: { CLAUDE_CONFIG_DIR: "/ambient", HOME: "/home" },
		});

		expect(calls.map((call) => call.claude)).toEqual([undefined, "/work"]);
		expect(calls[1]?.args).toContain("claude_code");
		expect(
			sessions.map((s) => [s.agent, s.sessionId, s.accountSelection, s.title]),
		).toEqual([
			["claude", "work-only", "/work", "Fix"],
			["claude", "shared", null, null],
			["claude", "shared", "/work", null],
			["cursor-agent", "c1", null, null],
		]);
	});
});

describe("folderOf", () => {
	test("picks the deepest project folder holding the session", () => {
		const folders = ["/repo", "/repo/.wt/feature", "/other"];
		expect(folderOf("/repo/.wt/feature/src", folders)).toBe(
			"/repo/.wt/feature",
		);
		expect(folderOf("/repo/src", folders)).toBe("/repo");
		expect(folderOf("/repository", folders)).toBeNull();
	});
});

test("default Codex scan and session identity use the effective CODEX_HOME", async () => {
	const sessions = await listExternalSessions({
		cwd: "/repo",
		claudeProfiles: [],
		codexHomes: [],
		baseEnv: { HOME: "/home", CODEX_HOME: "/account" },
		run: async (_args, env) => {
			expect(env.CODEX_HOME).toBe("/account");
			return [
				{ harness: "codex", id: "same", timestamp: "2026-10-09T00:00:00Z" },
			];
		},
	});
	expect(sessions[0]?.storeRoot).toBe("/account/sessions");
	expect(sessions[0]?.accountSelection).toBeNull();
});

test("aliases of one session store collapse to the latest recorded version", async () => {
	const base = await mkdtemp(join(tmpdir(), "superset-session-identity-"));
	try {
		await mkdir(join(base, "original", "projects"), { recursive: true });
		await symlink(join(base, "original"), join(base, "alias"));
		const sessions = await listExternalSessions({
			cwd: "/repo",
			claudeProfiles: [join(base, "original"), join(base, "alias")],
			codexHomes: [],
			baseEnv: { HOME: base },
			run: async (_args, env) =>
				!env.CLAUDE_CONFIG_DIR
					? []
					: [
							{
								harness: "claude_code",
								id: "same",
								timestamp: "2026-10-08T00:00:00Z",
								updated_at: env.CLAUDE_CONFIG_DIR.endsWith("alias")
									? "2026-10-09T00:00:00Z"
									: "2026-10-08T00:00:00Z",
								title: env.CLAUDE_CONFIG_DIR.endsWith("alias")
									? "Latest"
									: "Earlier",
							},
						],
		});
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.title).toBe("Latest");
		expect(sessions[0]?.storeRoot).toBe(
			await realpath(join(base, "original", "projects")),
		);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});
