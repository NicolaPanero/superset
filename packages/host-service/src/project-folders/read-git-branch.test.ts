import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { readGitBranch } from "./project-folders.ts";

const root = mkdtempSync(join(tmpdir(), "read-git-branch-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("reads the branch of a repository and of its linked worktree", async () => {
	const repo = join(root, "repo");
	mkdirSync(repo);
	const git = simpleGit(repo);
	await git.init(["-b", "main"]);
	await git.addConfig("user.email", "t@example.com");
	await git.addConfig("user.name", "t");
	await git.addConfig("commit.gpgsign", "false");
	writeFileSync(join(repo, "a.txt"), "one\n");
	await git.add(".");
	await git.commit("init");
	const worktree = join(root, "worktree");
	await git.raw(["worktree", "add", "-b", "fork/feature", worktree]);

	expect(readGitBranch(repo)).toBe("main");
	expect(readGitBranch(worktree)).toBe("fork/feature");

	await simpleGit(worktree).raw(["checkout", "--detach"]);
	expect(readGitBranch(worktree)).toBeNull();
	expect(readGitBranch(join(root, "missing"))).toBeNull();
});
