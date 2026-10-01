import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { projects, pullRequests, workspaces } from "../../../../db/schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../../drizzle");

export function createTestDb(): HostDb {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

export const PROJECT_ID = "project-1";
export const PR_NUMBER = 42;
export const REPO = { owner: "octocat", name: "hello" };

/**
 * One project with PR #42 linked from two live workspaces (newest activity
 * first: ws-newer, ws-older), one archived workspace still pointing at it,
 * and one unlinked workspace.
 */
export function seedLinkedPullRequest(
	db: HostDb,
	repoPath = "/tmp/repo",
	options: { rowProjectId?: string; isDraft?: boolean } = {},
) {
	const rowProjectId = options.rowProjectId ?? PROJECT_ID;
	db.insert(projects).values({ id: PROJECT_ID, repoPath }).run();
	if (rowProjectId !== PROJECT_ID) {
		db.insert(projects)
			.values({ id: rowProjectId, repoPath: `${repoPath}-sibling` })
			.run();
	}
	db.insert(pullRequests)
		.values({
			id: "pr-42",
			projectId: rowProjectId,
			isDraft: options.isDraft ?? false,
			repoProvider: "github",
			repoOwner: REPO.owner,
			repoName: REPO.name,
			prNumber: PR_NUMBER,
			url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${PR_NUMBER}`,
			title: "Linked PR",
			state: "open",
			headBranch: "feature/x",
			headSha: "abc123",
		})
		.run();
	db.insert(workspaces)
		.values([
			{
				id: "ws-older",
				projectId: PROJECT_ID,
				worktreePath: `${repoPath}-older`,
				branch: "feature/x",
				pullRequestId: "pr-42",
				updatedAt: 1,
			},
			{
				id: "ws-newer",
				projectId: PROJECT_ID,
				worktreePath: `${repoPath}-newer`,
				branch: "feature/x",
				pullRequestId: "pr-42",
				updatedAt: 2,
			},
			{
				id: "ws-archived",
				projectId: PROJECT_ID,
				worktreePath: `${repoPath}-archived`,
				branch: "feature/x",
				pullRequestId: "pr-42",
				updatedAt: 3,
				archivedAt: 1_700_000_000_000,
			},
			{
				id: "ws-unlinked",
				projectId: PROJECT_ID,
				worktreePath: `${repoPath}-unlinked`,
				branch: "main",
				updatedAt: 4,
			},
		])
		.run();
}

export function readPullRequestRow(db: HostDb) {
	return db
		.select({
			state: pullRequests.state,
			mergedAt: pullRequests.mergedAt,
			projectId: pullRequests.projectId,
		})
		.from(pullRequests)
		.where(eq(pullRequests.id, "pr-42"))
		.get();
}
