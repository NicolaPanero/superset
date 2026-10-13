export function visibleForkAccountOptions<
	T extends { selection: string | null },
>(accounts: readonly T[], showCliOptions: boolean): T[] {
	return accounts.filter(
		(account) => showCliOptions || account.selection !== null,
	);
}
export function forkLaunchAccountSelection<
	T extends { selection: string | null },
>(
	selection: string | null | undefined,
	options: readonly T[],
	showCliOptions: boolean,
): string | null | undefined {
	if (showCliOptions || typeof selection === "string") return selection;
	return (
		options.find((option) => option.selection !== null)?.selection ?? undefined
	);
}
