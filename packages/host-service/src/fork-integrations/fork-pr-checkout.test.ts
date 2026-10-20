import { expect, test } from "bun:test";
import {
	forkPullRequestBranch,
	forkPullRequestFetchTarget,
} from "./fork-pr-checkout";

test("a pull request branch is fetched where workspace creation finds it", () => {
	const branch = "feature/login";
	expect(
		forkPullRequestFetchTarget({
			branch,
			sameRepository: true,
			remote: "origin",
			localBranchExists: true,
		}),
	).toBe("refs/remotes/origin/feature/login");
	expect(
		forkPullRequestFetchTarget({
			branch,
			sameRepository: false,
			remote: "origin",
			localBranchExists: false,
		}),
	).toBe("refs/heads/feature/login");
	expect(
		forkPullRequestFetchTarget({
			branch,
			sameRepository: true,
			remote: "upstream",
			localBranchExists: true,
		}),
	).toBeNull();
});

test("a pull request from another repository never reuses a same-named local branch", () => {
	const pr = { number: 7, sourceBranch: "main" };
	expect(forkPullRequestBranch(pr, true)).toBe("main");
	expect(forkPullRequestBranch(pr, false)).toBe("pr-7/main");
});
