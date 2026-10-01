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
	PROJECT_ID,
	REPO,
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

describe("syncPullRequestAfterWrite", () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});

	afterEach(() => {
		warn.mockClear();
	});

	test("evicts the cached content and refreshes the linked workspaces", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const key = pullRequestContentCacheKey(REPO, PR_NUMBER);
		writePullRequestContentCache(key, Promise.resolve({ state: "open" }));
		const refreshed: string[][] = [];

		await syncPullRequestAfterWrite(
			createContext(db, async (ids) => {
				refreshed.push(ids);
			}),
			{
				repo: REPO,
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
				action: "merge",
			},
		);

		expect(readPullRequestContentCache(key)).toBeNull();
		expect(refreshed).toEqual([["ws-newer", "ws-older"]]);
		expect(warn).not.toHaveBeenCalled();
	});

	test("skips the refresh when no live workspace is linked", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		const refreshed: string[][] = [];

		await syncPullRequestAfterWrite(
			createContext(db, async (ids) => {
				refreshed.push(ids);
			}),
			{
				repo: REPO,
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER + 1,
				action: "close",
			},
		);

		expect(refreshed).toEqual([]);
	});

	test("a failed refresh is logged, not thrown", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);

		await syncPullRequestAfterWrite(
			createContext(db, async () => {
				throw new Error("gh timed out");
			}),
			{
				repo: REPO,
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
				action: "reopen",
			},
		);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain("[pull-requests:reopen]");
	});
});
