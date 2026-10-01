import { describe, expect, test } from "bun:test";
import { findLinkedWorkspaceIds } from "./linked-workspaces";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	seedLinkedPullRequest,
} from "./test-db";

describe("findLinkedWorkspaceIds", () => {
	test("returns live linked workspaces, most recently active first", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, PROJECT_ID, PR_NUMBER)).toEqual([
			"ws-newer",
			"ws-older",
		]);
	});

	test("is empty for a PR the host has never seen", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, PROJECT_ID, PR_NUMBER + 1)).toEqual([]);
	});

	test("scopes the PR number to the project", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		expect(findLinkedWorkspaceIds(db, "other-project", PR_NUMBER)).toEqual([]);
	});
});
