import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { HostServiceContext } from "../../../../types";
import {
	pullRequestContentCacheKey,
	readPullRequestContentCache,
	writePullRequestContentCache,
} from "./pull-request-content-cache";
import { syncPullRequestAfterWrite } from "./sync-after-write";
import {
	createTestDb,
	PR_NUMBER,
	REPO,
	readPullRequestRow,
	seedLinkedPullRequest,
} from "./test-db";

function createContext(
	db: HostServiceContext["db"],
	refreshPullRequestsByWorkspaces: (ids: string[]) => Promise<void>,
): Pick<HostServiceContext, "db" | "runtime"> {
	return {
		db,
		runtime: { pullRequests: { refreshPullRequestsByWorkspaces } },
	} as unknown as Pick<HostServiceContext, "db" | "runtime">;
}

function recordingContext(db: HostServiceContext["db"]) {
	const refreshed: string[][] = [];
	const ctx = createContext(db, async (ids) => {
		refreshed.push(ids);
	});
	return { ctx, refreshed };
}

describe("syncPullRequestAfterWrite", () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});

	afterEach(() => {
		warn.mockClear();
	});

	test("evicts the cached content, records the merge, then refreshes the linked workspaces", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const key = pullRequestContentCacheKey(REPO, PR_NUMBER);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "merge",
		});

		expect(readPullRequestContentCache(key)).toBeNull();
		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(readPullRequestRow(db)?.mergedAt).toBeGreaterThan(0);
		expect(refreshed).toEqual([["ws-newer", "ws-older"]]);
		expect(warn).not.toHaveBeenCalled();
	});

	test("records close, and reopen keeps a draft a draft", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { isDraft: true });
		const { ctx } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "close",
		});
		expect(readPullRequestRow(db)).toMatchObject({
			state: "closed",
			mergedAt: null,
		});

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "reopen",
		});
		expect(readPullRequestRow(db)).toMatchObject({ state: "draft" });
	});

	test("finds the row when a sibling project on the same repository owns it", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/tmp/repo", { rowProjectId: "other-project" });
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER,
			action: "merge",
		});

		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(refreshed).toEqual([["ws-newer", "ws-older"]]);
	});

	test("skips the refresh when no live workspace is linked", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const { ctx, refreshed } = recordingContext(db);

		await syncPullRequestAfterWrite(ctx, {
			repo: REPO,
			prNumber: PR_NUMBER + 1,
			action: "close",
		});

		expect(refreshed).toEqual([]);
	});

	test("a failed refresh is logged, not thrown, and the row keeps the written state", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);

		await syncPullRequestAfterWrite(
			createContext(db, async () => {
				throw new Error("gh timed out");
			}),
			{ repo: REPO, prNumber: PR_NUMBER, action: "merge" },
		);

		expect(readPullRequestRow(db)).toMatchObject({ state: "merged" });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain("[pull-requests:merge]");
	});
});
