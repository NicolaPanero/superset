export function forkBaseBranchChoice(
	branchName: string | null,
	defaultBranchName: string | undefined,
): string | null {
	return branchName ?? defaultBranchName ?? null;
}
