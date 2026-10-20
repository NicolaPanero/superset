/**
 * The local branch for a pull request. A branch from another repository gets
 * its own name, so it never adopts a local branch that only shares the name.
 */
export function forkPullRequestBranch(
	pr: { number: number; sourceBranch: string },
	sameRepository: boolean,
): string {
	return sameRepository
		? pr.sourceBranch
		: `pr-${pr.number}/${pr.sourceBranch}`;
}

/**
 * Where to fetch a pull request's source branch so `workspaces.create`
 * finds it: it only resolves local branches and `origin/<branch>`.
 * Null keeps an existing local branch as it is.
 */
export function forkPullRequestFetchTarget(input: {
	branch: string;
	sameRepository: boolean;
	remote: string;
	localBranchExists: boolean;
}): string | null {
	if (input.sameRepository && input.remote === "origin")
		return `refs/remotes/origin/${input.branch}`;
	return input.localBranchExists ? null : `refs/heads/${input.branch}`;
}
