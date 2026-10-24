import { expect, test } from "bun:test";
import { forkBitbucketMergeMethod } from "./fork-bitbucket-merge-method";

test("quick merge maps to a supported Bitbucket strategy without changing the requested method", () => {
	expect(forkBitbucketMergeMethod("merge", ["merge_commit"])).toBe(
		"merge_commit",
	);
	expect(forkBitbucketMergeMethod("squash", ["squash_fast_forward"])).toBe(
		"squash_fast_forward",
	);
	expect(forkBitbucketMergeMethod("rebase", ["rebase_fast_forward"])).toBe(
		"rebase_fast_forward",
	);
	expect(
		forkBitbucketMergeMethod("rebase", ["merge_commit", "squash"]),
	).toBeUndefined();
});
