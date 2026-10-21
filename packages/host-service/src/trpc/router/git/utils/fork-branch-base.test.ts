import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { HostServiceContext } from "../../../../types";
import { gitRouter } from "../git";
import { forkDetectBranchBase, forkSetBranchBase } from "./fork-branch-base";
import { resolveBaseComparison } from "./git-helpers";
import { getGitStatusSnapshot } from "./git-status";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "fork-branch-base-"));
	roots.push(root);
	const git = simpleGit(root);
	await git.init();
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	await writeFile(join(root, "tracked.txt"), "initial\n");
	await git.add("tracked.txt");
	await git.commit("initial");
	await git.raw(["update-ref", "refs/remotes/origin/main", "HEAD"]);
	await git.raw([
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		"refs/remotes/origin/main",
	]);
	await git.checkout(["-b", "develop", "main"]);
	await writeFile(join(root, "history.txt"), "existing development work\n");
	await git.add("history.txt");
	await git.commit("develop history");
	await git.raw(["update-ref", "refs/remotes/origin/develop", "HEAD"]);
	await git.checkout(["-b", "feature/work", "develop"]);
	const changed: string[] = [];
	const caller = gitRouter.createCaller({
		isAuthenticated: true,
		git: async () => git,
		eventBus: {
			broadcastGitChanged: (workspaceId: string) => changed.push(workspaceId),
		},
		db: {
			query: {
				workspaces: {
					findFirst: () => ({ sync: () => ({ worktreePath: root }) }),
				},
			},
		},
	} as unknown as HostServiceContext);
	return { root, git, caller, changed };
}

test("each feature follows its own main or develop origin instead of the repository default", async () => {
	const { git, root } = await fixture();
	const detected = await forkDetectBranchBase(git);
	expect(detected).toMatchObject({
		baseBranch: "develop",
		source: "reflog",
		needsSelection: false,
	});
	const old = await getGitStatusSnapshot({ git, worktreePath: root });
	const fixed = await getGitStatusSnapshot({
		git,
		worktreePath: root,
		baseBranch: detected.baseBranch ?? undefined,
	});
	expect(old.snapshot.againstBase.map((file) => file.path)).toEqual([
		"history.txt",
	]);
	expect(fixed.snapshot.againstBase).toEqual([]);
	await git.checkout(["-b", "feature/from-main", "main"]);
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: "main",
		source: "reflog",
		needsSelection: false,
	});
});

test("an explicit per-branch choice takes priority over the creation reflog", async () => {
	const { git } = await fixture();
	await forkSetBranchBase(git, { baseBranch: "main" });
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: "main",
		source: "configured",
		needsSelection: false,
	});
});

test("the repository's default branch compares with its own remote without asking for an origin", async () => {
	const { git } = await fixture();
	await git.checkout("main");
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: "main",
		source: "default",
		needsSelection: false,
	});
});

test("creation from HEAD uses a matching checkout record to recover the source branch", async () => {
	const { git } = await fixture();
	await git.checkout("develop");
	await git.checkout(["-b", "feature/implicit"]);
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: "develop",
		source: "reflog",
		needsSelection: false,
	});
});

test("missing origin evidence requires a choice and HEAD comparison retains only local changes", async () => {
	const { git, root } = await fixture();
	await git.raw([
		"reflog",
		"expire",
		"--expire=all",
		"refs/heads/feature/work",
	]);
	await writeFile(join(root, "tracked.txt"), "local change\n");
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: null,
		needsSelection: true,
	});
	const result = await getGitStatusSnapshot({
		git,
		worktreePath: root,
		baseBranch: "HEAD",
	});
	expect(result.snapshot.againstBase).toEqual([]);
	expect(result.snapshot.unstaged).toMatchObject([
		{ path: "tracked.txt", additions: 1, deletions: 1 },
	]);
});

test("remembering an inferred base cannot overwrite a concurrent manual choice", async () => {
	const { git } = await fixture();
	await Promise.all([
		forkSetBranchBase(git, { baseBranch: "main" }),
		forkSetBranchBase(git, {
			baseBranch: "develop",
			expectedBranch: "feature/work",
			onlyIfUnset: true,
		}),
	]);
	expect((await git.raw(["config", "branch.feature/work.base"])).trim()).toBe(
		"main",
	);
});

test("a delayed inferred base cannot be saved onto a different checked-out branch", async () => {
	const { git } = await fixture();
	await git.checkout("main");
	expect(
		await forkSetBranchBase(git, {
			baseBranch: "develop",
			expectedBranch: "feature/work",
			onlyIfUnset: true,
		}),
	).toEqual({ baseBranch: null });
	expect(await git.raw(["config", "branch.main.base"]).catch(() => "")).toBe(
		"",
	);
});

test("origin detection is opt-in and saved bases keep the legacy procedure shape", async () => {
	const { caller, changed } = await fixture();
	expect(await caller.getBaseBranch({ workspaceId: "test" })).toEqual({
		baseBranch: null,
	});
	const base = await caller.getBaseBranch({
		workspaceId: "test",
		inferOrigin: true,
	});
	expect(base).toMatchObject({ baseBranch: "develop", source: "reflog" });
	await caller.setBaseBranch({
		workspaceId: "test",
		baseBranch: base.baseBranch,
		expectedBranch: base.currentBranch,
		onlyIfUnset: true,
	});
	expect(await caller.getBaseBranch({ workspaceId: "test" })).toEqual({
		baseBranch: "develop",
	});
	expect(changed).toEqual(["test"]);
});

test("explicit local bases without a remote and remote-qualified bases resolve to existing refs", async () => {
	const { git } = await fixture();
	await git.branch(["stack-base", "develop"]);
	expect(await resolveBaseComparison(git, "stack-base")).toMatchObject({
		baseRef: "refs/heads/stack-base",
		fetchTarget: null,
	});
	expect(await resolveBaseComparison(git, "origin/develop")).toMatchObject({
		baseRef: "refs/remotes/origin/develop",
		fetchTarget: { remote: "origin", branch: "develop" },
	});
	await git.branch(["-D", "develop"]);
	expect(await forkDetectBranchBase(git)).toMatchObject({
		baseBranch: "origin/develop",
		source: "reflog",
	});
});
