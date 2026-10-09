import { resolve } from "node:path";
import type { SimpleGit } from "simple-git";

export interface BranchDeletion {
	branch: string | null;
	eligible: boolean;
	reason: "created" | "project_checkout" | "unverified" | "shared";
}

export async function recordCreatedBranch(
	git: SimpleGit,
	branch: string,
	workspaceId: string,
) {
	await git.raw([
		"config",
		"--local",
		`branch.${branch}.supersetForkCreatedBy`,
		workspaceId,
	]);
	await git.raw([
		"config",
		"--local",
		`branch.${branch}.supersetForkRef`,
		`refs/heads/${branch}`,
	]);
}

export async function branchDeletionEligibility(
	git: SimpleGit,
	branch: string | null,
	workspaceId: string,
	ownPath?: string,
): Promise<BranchDeletion> {
	const preserved: BranchDeletion = {
		branch,
		eligible: false,
		reason: "unverified",
	};
	if (!branch) return preserved;
	try {
		const [owner, ref, trees] = await Promise.all([
			git.raw([
				"config",
				"--local",
				"--get",
				`branch.${branch}.supersetForkCreatedBy`,
			]),
			git.raw([
				"config",
				"--local",
				"--get",
				`branch.${branch}.supersetForkRef`,
			]),
			git.raw(["worktree", "list", "--porcelain", "-z"]),
		]);
		if (owner.trim() !== workspaceId || ref.trim() !== `refs/heads/${branch}`)
			return preserved;
		let path = "";
		for (const field of trees.split("\0")) {
			if (field.startsWith("worktree ")) path = field.slice(9);
			if (
				field === `branch refs/heads/${branch}` &&
				(!ownPath || resolve(path) !== resolve(ownPath))
			)
				return { branch, eligible: false, reason: "shared" };
		}
		return { branch, eligible: true, reason: "created" };
	} catch {
		return preserved;
	}
}

export async function updateRenamedBranchOwnership(
	git: SimpleGit,
	from: string,
	to: string,
	workspaceId: string,
) {
	try {
		const [owner, ref] = await Promise.all([
			git.raw([
				"config",
				"--local",
				"--get",
				`branch.${to}.supersetForkCreatedBy`,
			]),
			git.raw(["config", "--local", "--get", `branch.${to}.supersetForkRef`]),
		]);
		if (owner.trim() === workspaceId && ref.trim() === `refs/heads/${from}`)
			await recordCreatedBranch(git, to, workspaceId);
	} catch {
		/* Missing provenance preserves the branch. */
	}
}
