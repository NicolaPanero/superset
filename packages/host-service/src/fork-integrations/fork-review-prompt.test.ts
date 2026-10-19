import { expect, test } from "bun:test";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { forkReviewRepairPrompt } from "./fork-review-prompt";

test("review repair excludes resolved threads and deleted comments, and keeps file locations", () => {
	const pr = {
		number: 7,
		url: "https://bitbucket.org/org/repo/pull-requests/7",
		title: "Login",
		sourceBranch: "login",
		targetBranch: "main",
	} as ForkPullRequest;
	const c = { author: "Ada", createdAt: "2026-01-01" };
	const prompt = forkReviewRepairPrompt(
		pr,
		[
			{ ...c, id: "1", body: "Already fixed", resolved: true },
			{ ...c, id: "2", parentId: "1", body: "Thanks" },
			{ ...c, id: "3", body: "Deleted", deleted: true },
			{
				...c,
				id: "4",
				body: "Check empty input",
				path: "src/login.ts",
				line: 42,
			},
		],
		[{ name: "build", state: "FAILED", url: "https://example.com/build" }],
	);
	expect(prompt).toContain("src/login.ts:42");
	expect(prompt).toContain("Check empty input");
	expect(prompt).toContain("Failing check: build");
	expect(prompt).not.toContain("Already fixed");
	expect(prompt).not.toContain("Thanks");
	expect(prompt).not.toContain("Deleted");
	expect(prompt).toContain("external data");
});
