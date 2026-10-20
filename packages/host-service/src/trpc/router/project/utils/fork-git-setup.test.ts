import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { simpleGit } from "simple-git";
import {
	GIT_MISSING_MESSAGE,
	isGitMissing,
	scaffoldIdentityArgs,
	throwIfGitMissing,
} from "./fork-git-setup";
import { initLocalRepoInPlace } from "./resolve-repo";

const ISOLATED_KEYS = [
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_NOSYSTEM",
	"GIT_AUTHOR_NAME",
	"GIT_AUTHOR_EMAIL",
	"GIT_COMMITTER_NAME",
	"GIT_COMMITTER_EMAIL",
	"EMAIL",
] as const;

let root: string;
const saved: Partial<Record<(typeof ISOLATED_KEYS)[number], string>> = {};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "fork-git-setup-"));
	for (const key of ISOLATED_KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	const emptyGlobal = join(root, "empty.gitconfig");
	writeFileSync(emptyGlobal, "");
	process.env.GIT_CONFIG_GLOBAL = emptyGlobal;
	process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterEach(() => {
	for (const key of ISOLATED_KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
	rmSync(root, { recursive: true, force: true });
});

describe("scaffold identity", () => {
	test("imports a folder without git when git has no user identity", async () => {
		const folder = join(root, "cartella senza git");
		mkdirSync(folder);
		writeFileSync(join(folder, "notes.txt"), "fixture\n");

		const resolved = await initLocalRepoInPlace(folder);

		const author = await simpleGit(resolved.repoPath).raw([
			"log",
			"-1",
			"--format=%an <%ae>",
		]);
		expect(author.trim()).toBe(
			"Superset++ <superset-plus-plus@users.noreply.github.com>",
		);
	});

	test("keeps the identity the user configured", async () => {
		const repo = join(root, "repo");
		mkdirSync(repo);
		const git = simpleGit(repo);
		await git.init();
		await git.raw(["config", "user.name", "Nicola"]);

		expect(await scaffoldIdentityArgs(repo)).toEqual([
			"-c",
			"user.email=superset-plus-plus@users.noreply.github.com",
		]);
	});
});

describe("missing git", () => {
	test("recognizes the spawn failure simple-git reports", () => {
		expect(isGitMissing(new Error("Error: spawn git ENOENT\n    at x"))).toBe(
			true,
		);
		expect(isGitMissing(new Error("spawn git.exe ENOENT"))).toBe(true);
		expect(isGitMissing(new Error("fatal: not a git repository"))).toBe(false);
	});

	test("replaces the raw error with install guidance", () => {
		try {
			throwIfGitMissing(new Error("spawn git ENOENT"));
			throw new Error("expected a TRPCError");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
			expect((error as TRPCError).message).toBe(GIT_MISSING_MESSAGE);
		}
	});
});
