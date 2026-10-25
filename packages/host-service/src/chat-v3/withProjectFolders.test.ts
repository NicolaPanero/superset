import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
	HarnessAdapter,
	HarnessStartOptions,
} from "@superset/chat-runtime";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import { projectFolders } from "../db/fork-schema";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { projects, workspaces } from "../db/schema";
import { withProjectFolders } from "./withProjectFolders";

const root = mkdtempSync(join(tmpdir(), "chat-folders-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function setup() {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, {
		schema,
	}) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
	});
	ensureForkTables(sqlite);
	const main = join(root, "main");
	const extra = join(root, "extra");
	mkdirSync(main, { recursive: true });
	mkdirSync(extra, { recursive: true });
	db.insert(projects).values({ id: "p1", repoPath: main, name: "p" }).run();
	db.insert(workspaces)
		.values({
			id: "w1",
			projectId: "p1",
			worktreePath: main,
			branch: "main",
			name: "w",
		})
		.run();
	db.insert(projectFolders)
		.values([
			{ id: "f1", projectId: "p1", path: extra, position: 0 },
			{ id: "f2", projectId: "p1", path: join(root, "gone"), position: 1 },
		])
		.run();
	return { db, main, extra };
}

function fakeAdapter() {
	const started: HarnessStartOptions[] = [];
	const adapter = {
		start(options: HarnessStartOptions) {
			started.push(options);
			return (async function* () {})();
		},
		fork: async () => "forked",
	} as unknown as HarnessAdapter;
	return { adapter, started };
}

describe("withProjectFolders", () => {
	test("adds the existing project folders to start options", () => {
		const { db, main, extra } = setup();
		const { adapter, started } = fakeAdapter();
		const wrapped = withProjectFolders(
			db,
			() => adapter,
		)({
			sessionId: "s",
			scopeId: "w1",
			harness: "claude-code",
			cwd: main,
		});

		wrapped.start({ cwd: main });

		expect(started).toEqual([{ cwd: main, additionalDirectories: [extra] }]);
		expect(wrapped.fork).toBeDefined();
	});

	test("leaves start options alone for a workspace without folders", () => {
		const { db, main } = setup();
		const { adapter, started } = fakeAdapter();
		const wrapped = withProjectFolders(
			db,
			() => adapter,
		)({
			sessionId: "s",
			scopeId: "missing",
			harness: "claude-code",
			cwd: main,
		});

		wrapped.start({ cwd: main });

		expect(started).toEqual([{ cwd: main }]);
	});
});
