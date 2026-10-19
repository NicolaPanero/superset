import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordCreatedBranch } from "../../src/trpc/router/workspace-cleanup/fork-branch-ownership";
import {
	createBasicScenario,
	createFeatureWorktreeScenario,
} from "../helpers/scenarios";
import { seedWorkspace } from "../helpers/seed";

test("eligibility is checked again after preview even with forced deletion", async () => {
	const f = await createFeatureWorktreeScenario();
	try {
		await recordCreatedBranch(f.repo.git, f.branch, f.featureWorkspaceId);
		const head = await f.repo.git.revparse([f.branch]);
		expect(
			(
				await f.host.trpc.workspaceCleanup.inspect.query({
					workspaceId: f.featureWorkspaceId,
				})
			).branchDeletion?.eligible,
		).toBe(true);
		await f.repo.git.raw([
			"config",
			"--local",
			`branch.${f.branch}.supersetForkCreatedBy`,
			"another-workspace",
		]);
		const deleted = await f.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: f.featureWorkspaceId,
			deleteBranch: true,
			force: true,
		});
		expect(deleted.success).toBe(true);
		expect(deleted.branchDeleted).toBe(false);
		expect(await f.repo.git.revparse([f.branch])).toBe(head);
	} finally {
		await f.dispose();
	}
});

test("a shared worktree preserves a verified branch and its commit after the owner is deleted", async () => {
	const f = await createFeatureWorktreeScenario();
	try {
		await recordCreatedBranch(f.repo.git, f.branch, f.featureWorkspaceId);
		const shared = join(f.repo.repoPath, "shared-checkout"),
			head = await f.repo.git.revparse([f.branch]);
		await f.repo.git.raw(["worktree", "add", "--force", shared, f.branch]);
		expect(
			(
				await f.host.trpc.workspaceCleanup.inspect.query({
					workspaceId: f.featureWorkspaceId,
				})
			).branchDeletion?.reason,
		).toBe("shared");
		const result = await f.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: f.featureWorkspaceId,
			deleteBranch: true,
			force: true,
		});
		expect(result.branchDeleted).toBe(false);
		expect(existsSync(shared)).toBe(true);
		expect(await f.repo.git.revparse([f.branch])).toBe(head);
	} finally {
		await f.dispose();
	}
});

test("another workspace reference protects a branch even without a second checked-out worktree", async () => {
	const f = await createFeatureWorktreeScenario();
	try {
		await recordCreatedBranch(f.repo.git, f.branch, f.featureWorkspaceId);
		seedWorkspace(f.host, {
			projectId: f.projectId,
			branch: f.branch,
			worktreePath: join(f.repo.repoPath, "other-workspace"),
			type: "session",
		});
		expect(
			(
				await f.host.trpc.workspaceCleanup.inspect.query({
					workspaceId: f.featureWorkspaceId,
				})
			).branchDeletion?.reason,
		).toBe("shared");
		expect(
			(
				await f.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: f.featureWorkspaceId,
					deleteBranch: true,
					force: true,
				})
			).branchDeleted,
		).toBe(false);
		expect((await f.repo.git.branchLocal()).all).toContain(f.branch);
	} finally {
		await f.dispose();
	}
});

test("forced local workspace removal preserves uncommitted files, branch and remote-tracking references", async () => {
	const f = await createBasicScenario({
		hostOptions: {
			apiOverrides: {
				"v2Workspace.trackCreated.mutate": () => ({ success: true }),
			},
		},
	});
	try {
		const head = await f.repo.git.revparse(["main"]),
			path = join(f.repo.repoPath, "uncommitted.txt");
		writeFileSync(path, "user work");
		await f.repo.git.raw(["update-ref", "refs/remotes/origin/main", head]);
		const result = await f.host.trpc.workspaceCleanup.destroy.mutate({
			workspaceId: f.workspaceId,
			deleteBranch: true,
			force: true,
		});
		expect(result).toMatchObject({
			success: true,
			worktreeRemoved: false,
			branchDeleted: false,
		});
		expect(readFileSync(path, "utf8")).toBe("user work");
		expect(await f.repo.git.revparse(["main"])).toBe(head);
		expect(await f.repo.git.revparse(["refs/remotes/origin/main"])).toBe(head);
	} finally {
		await f.dispose();
	}
});

test("one global delete-branch choice applies only to eligible branches in a mixed deletion batch", async () => {
	const f = await createFeatureWorktreeScenario({ branch: "owned-batch" });
	try {
		await recordCreatedBranch(f.repo.git, f.branch, f.featureWorkspaceId);
		const importedPath = join(f.repo.repoPath, ".worktrees", "imported");
		await f.repo.git.raw(["worktree", "add", "-b", "imported", importedPath]);
		const head = await f.repo.git.revparse(["imported"]);
		const imported = seedWorkspace(f.host, {
			projectId: f.projectId,
			worktreePath: importedPath,
			branch: "imported",
		});
		const owned = { id: f.featureWorkspaceId, branch: f.branch };
		const previews = await Promise.all(
			[imported, owned].map((ws) =>
				f.host.trpc.workspaceCleanup.inspect.query({ workspaceId: ws.id }),
			),
		);
		expect(previews.map((view) => view.branchDeletion?.eligible)).toEqual([
			false,
			true,
		]);
		const result = [];
		for (const ws of [imported, owned])
			result.push(
				await f.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: ws.id,
					deleteBranch: true,
					force: true,
				}),
			);
		expect(result.map((row) => row.branchDeleted)).toEqual([false, true]);
		expect(await f.repo.git.revparse(["imported"])).toBe(head);
		expect((await f.repo.git.branchLocal()).all).not.toContain(owned.branch);
	} finally {
		await f.dispose();
	}
});

test("deleting an eligible local branch never deletes its remote-tracking reference", async () => {
	const f = await createFeatureWorktreeScenario();
	try {
		await recordCreatedBranch(f.repo.git, f.branch, f.featureWorkspaceId);
		const head = await f.repo.git.revparse([f.branch]);
		const remote = `refs/remotes/origin/${f.branch}`;
		await f.repo.git.raw(["update-ref", remote, head]);
		expect(
			(
				await f.host.trpc.workspaceCleanup.destroy.mutate({
					workspaceId: f.featureWorkspaceId,
					deleteBranch: true,
					force: true,
				})
			).branchDeleted,
		).toBe(true);
		expect((await f.repo.git.branchLocal()).all).not.toContain(f.branch);
		expect(await f.repo.git.revparse([remote])).toBe(head);
	} finally {
		await f.dispose();
	}
});
