import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";

async function createGitFixture() {
	const repoPath = realpathSync(
		mkdtempSync(join(tmpdir(), "fork-branch-test-")),
	);
	const git = createUserSimpleGit(repoPath);
	await git.init(["--initial-branch=main"]);
	await git.addConfig("user.name", "Test Runner");
	await git.addConfig("user.email", "test@example.invalid");
	await git.addConfig("commit.gpgsign", "false");
	await git.commit("initial", undefined, { "--allow-empty": null });
	return {
		repoPath,
		git,
		dispose: () => rmSync(repoPath, { recursive: true, force: true }),
	};
}

import { gitDeleteBranchTask } from "../../../workers/tasks/git";
import {
	branchDeletionEligibility,
	recordCreatedBranch,
	updateRenamedBranchOwnership,
} from "./fork-branch-ownership";

test("only proven new branches can be deleted; renamed and copied refs retain precise ownership", async () => {
	const repo = await createGitFixture();
	try {
		const head = await repo.git.revparse(["main"]);
		await repo.git.branch(["imported"]);
		await repo.git.branch(["new"]);
		await recordCreatedBranch(repo.git, "new", "creator");
		expect(
			(
				await gitDeleteBranchTask.handler({
					repoPath: repo.repoPath,
					branch: "imported",
					workspaceId: "creator",
					gitEnv: {},
				})
			).deleted,
		).toBe(false);
		await repo.git.raw(["branch", "-c", "new", "copied"]);
		expect(
			(await branchDeletionEligibility(repo.git, "copied", "creator")).eligible,
		).toBe(false);
		await repo.git.raw(["branch", "-m", "new", "renamed"]);
		expect(
			(await branchDeletionEligibility(repo.git, "renamed", "creator"))
				.eligible,
		).toBe(false);
		await updateRenamedBranchOwnership(repo.git, "new", "renamed", "creator");
		expect(
			(await branchDeletionEligibility(repo.git, "renamed", "creator"))
				.eligible,
		).toBe(true);
		expect(
			(
				await gitDeleteBranchTask.handler({
					repoPath: repo.repoPath,
					branch: "renamed",
					workspaceId: "other",
					gitEnv: {},
				})
			).deleted,
		).toBe(false);
		expect(
			(
				await gitDeleteBranchTask.handler({
					repoPath: repo.repoPath,
					branch: "renamed",
					workspaceId: "creator",
					gitEnv: {},
				})
			).deleted,
		).toBe(true);
		expect(await repo.git.revparse(["imported"])).toBe(head);
		expect(await repo.git.revparse(["copied"])).toBe(head);
	} finally {
		repo.dispose();
	}
});
test("a branch used by another worktree is preserved even after its owner is removed", async () => {
	const repo = await createGitFixture();
	try {
		const own = join(repo.repoPath, "own"),
			shared = join(repo.repoPath, "shared");
		await repo.git.raw(["worktree", "add", "-b", "owned", own]);
		await recordCreatedBranch(repo.git, "owned", "creator");
		expect(
			(await branchDeletionEligibility(repo.git, "owned", "creator", own))
				.eligible,
		).toBe(true);
		await repo.git.raw(["worktree", "add", "--force", shared, "owned"]);
		expect(
			(await branchDeletionEligibility(repo.git, "owned", "creator", own))
				.reason,
		).toBe("shared");
		await repo.git.raw(["worktree", "remove", own]);
		expect(
			(
				await gitDeleteBranchTask.handler({
					repoPath: repo.repoPath,
					branch: "owned",
					workspaceId: "creator",
					gitEnv: {},
				})
			).deleted,
		).toBe(false);
		expect((await repo.git.branchLocal()).all).toContain("owned");
	} finally {
		repo.dispose();
	}
});
