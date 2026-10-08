import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeProjectDirName } from "../terminal-agents/harness-sessions/claude";
import {
	copyClaudeSessionToFolder,
	moveClaudeSession,
} from "./forkMoveClaudeSession";

const SESSION = "11111111-2222-4333-8444-555555555555";
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function login(root: string, name: string, content?: string, mtime = 1) {
	const dir = join(root, name);
	mkdirSync(join(dir, "projects", "-repo"), { recursive: true });
	if (content !== undefined) {
		const file = join(dir, "projects", "-repo", `${SESSION}.jsonl`);
		writeFileSync(file, content);
		utimesSync(file, mtime, mtime);
	}
	return dir;
}

describe("moveClaudeSession", () => {
	test("copies the newest copy and its sidecar into the target login", async () => {
		const root = mkdtempSync(join(tmpdir(), "move-claude-"));
		roots.push(root);
		const work = login(root, "work", "old", 1);
		const home = login(root, "home", "new", 2);
		mkdirSync(join(home, "projects", "-repo", SESSION, "subagents"), {
			recursive: true,
		});
		writeFileSync(
			join(home, "projects", "-repo", SESSION, "subagents", "a"),
			"x",
		);

		const result = await moveClaudeSession({
			sessionId: SESSION,
			configDirs: [work, home],
			targetDir: work,
		});

		expect(result).toEqual({ moved: true, from: home });
		const target = join(work, "projects", "-repo");
		expect(readFileSync(join(target, `${SESSION}.jsonl`), "utf8")).toBe("new");
		expect(readFileSync(join(target, SESSION, "subagents", "a"), "utf8")).toBe(
			"x",
		);
	});

	test("does nothing when the target login already holds the newest copy", async () => {
		const root = mkdtempSync(join(tmpdir(), "move-claude-"));
		roots.push(root);
		const work = login(root, "work", "new", 2);
		const home = login(root, "home", "old", 1);
		expect(
			await moveClaudeSession({
				sessionId: SESSION,
				configDirs: [work, home],
				targetDir: work,
			}),
		).toEqual({ moved: false, reason: "same_account" });
	});
});

describe("moveClaudeSession with shared projects", () => {
	test("does nothing when both logins share one projects folder", async () => {
		const root = mkdtempSync(join(tmpdir(), "move-claude-"));
		roots.push(root);
		const home = login(root, "home", "chat", 2);
		const work = join(root, "work");
		mkdirSync(work);
		symlinkSync(join(home, "projects"), join(work, "projects"));

		expect(
			await moveClaudeSession({
				sessionId: SESSION,
				configDirs: [home, work],
				targetDir: work,
			}),
		).toEqual({ moved: false, reason: "same_account" });
	});
});

describe("copyClaudeSessionToFolder", () => {
	test("copies a session from another folder into this folder's project", async () => {
		const root = mkdtempSync(join(tmpdir(), "move-claude-"));
		roots.push(root);
		const from = join(root, "projects", claudeProjectDirName("/repo/main"));
		mkdirSync(from, { recursive: true });
		writeFileSync(join(from, `${SESSION}.jsonl`), "chat");

		expect(
			await copyClaudeSessionToFolder({
				sessionId: SESSION,
				configDir: root,
				fromCwd: "/repo/main",
				toCwd: "/repo/feature",
			}),
		).toBe(true);
		expect(
			readFileSync(
				join(
					root,
					"projects",
					claudeProjectDirName("/repo/feature"),
					`${SESSION}.jsonl`,
				),
				"utf8",
			),
		).toBe("chat");
	});
});
