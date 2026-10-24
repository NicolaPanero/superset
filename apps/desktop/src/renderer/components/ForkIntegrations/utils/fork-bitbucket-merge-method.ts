export function forkBitbucketMergeMethod(
	method: "merge" | "squash" | "rebase",
	supported?: string[],
) {
	const candidates =
		method === "merge"
			? ["merge_commit"]
			: method === "squash"
				? ["squash", "squash_fast_forward"]
				: ["rebase_merge", "rebase_fast_forward"];
	return candidates.find(
		(candidate) => !supported?.length || supported.includes(candidate),
	) as
		| "merge_commit"
		| "squash"
		| "squash_fast_forward"
		| "rebase_merge"
		| "rebase_fast_forward"
		| undefined;
}
