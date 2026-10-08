import { describe, expect, test } from "bun:test";
import { listExternalSessions, type RunCli } from "./externalSessions";

describe("listExternalSessions", () => {
	test("lists without previews when the CLI predates them", async () => {
		const run: RunCli = async (args) => {
			if (args.includes("--preview")) throw new Error("session_list_failed");
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

	test("scans each login once and keeps the first copy of a session", async () => {
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
			["cursor-agent", "c1", null, null],
		]);
	});
});
