import { describe, expect, test } from "bun:test";
import {
	findLinkedWorkspaceIds,
	findPullRequestRow,
} from "./linked-workspaces";
import {
	createTestDb,
	PR_NUMBER,
	REPO,
	seedLinkedPullRequest,
} from "./test-db";

describe("findPullRequestRow", () => {
	test("matches by repository and number, whatever the casing", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(
			findPullRequestRow(db, { owner: "OctoCat", name: "HELLO" }, PR_NUMBER)
				?.id,
		).toBe("pr-42");
	});

	test("finds a row a sibling project on the same repository refreshed last", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { rowProjectId: "other-project" });
		expect(findPullRequestRow(db, REPO, PR_NUMBER)?.id).toBe("pr-42");
	});

	test("is undefined for a PR the host has never seen", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findPullRequestRow(db, REPO, PR_NUMBER + 1)).toBeUndefined();
		expect(
			findPullRequestRow(db, { owner: "someone", name: "else" }, PR_NUMBER),
		).toBeUndefined();
	});
});

describe("findLinkedWorkspaceIds", () => {
	test("returns live linked workspaces, most recently active first", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, "pr-42")).toEqual([
			"ws-newer",
			"ws-older",
		]);
	});

	test("is empty when nothing links to the row", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, "pr-unknown")).toEqual([]);
	});
});
