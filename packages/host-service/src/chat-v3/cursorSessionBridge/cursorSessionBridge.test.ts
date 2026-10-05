import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bridgeCursorSession,
	type SnapshotDatabase,
} from "./cursorSessionBridge";

const id = "63d4050a-44d9-4e84-badf-b0ea3de8ac9f";
const cwd = "/test/repository";
const openDatabase = (path: string, readonly = true) => {
	const db = new Database(path, { readonly, readwrite: !readonly });
	return {
		prepare: (sql: string) => db.query(sql),
		backup: async (dest: string) => {
			db.query("VACUUM INTO ?").run(dest);
		},
		close: () => db.close(),
	} as unknown as SnapshotDatabase;
};

describe("Cursor surface bridge", () => {
	let root: string;
	let cliDir: string;
	let acpDir: string;
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "superset-cursor-bridge-"));
		cliDir = join(
			root,
			"chats",
			createHash("md5").update(cwd).digest("hex"),
			id,
		);
		acpDir = join(root, "acp-sessions", id);
		await mkdir(cliDir, { recursive: true });
		const db = new Database(join(cliDir, "store.db"));
		db.exec(
			"CREATE TABLE blobs(id TEXT PRIMARY KEY,data BLOB);CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);INSERT INTO meta VALUES('name','conversation');",
		);
		db.close();
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});
	it("round trips one conversation and includes the latest message", async () => {
		await bridgeCursorSession(
			{ cwd, sessionId: id, from: "cli", cursorRoot: root },
			openDatabase,
		);
		expect(
			JSON.parse(await readFile(join(acpDir, "meta.json"), "utf8")),
		).toEqual({ schemaVersion: 1, cwd });
		const db = new Database(join(acpDir, "store.db"));
		db.query("INSERT INTO blobs VALUES(?,?)").run(
			"latest",
			Buffer.from("ACP reply"),
		);
		db.close();
		await bridgeCursorSession(
			{ cwd, sessionId: id, from: "acp", cursorRoot: root },
			openDatabase,
		);
		const copied = new Database(join(cliDir, "store.db"), { readonly: true });
		expect(
			copied.query("SELECT data FROM blobs WHERE id='latest'").get(),
		).toEqual({ data: Buffer.from("ACP reply") });
		expect(
			copied.query("SELECT value FROM meta WHERE key='name'").get(),
		).toEqual({ value: "conversation" });
		copied.close();
	});
	it("rejects path traversal, another workspace, links and an open target", async () => {
		await expect(
			bridgeCursorSession(
				{ cwd, sessionId: "../../foreign", from: "cli", cursorRoot: root },
				openDatabase,
			),
		).rejects.toThrow();
		await bridgeCursorSession(
			{ cwd, sessionId: id, from: "cli", cursorRoot: root },
			openDatabase,
		);
		await expect(
			bridgeCursorSession(
				{ cwd: "/other", sessionId: id, from: "acp", cursorRoot: root },
				openDatabase,
			),
		).rejects.toThrow("cursor_session_workspace_mismatch");
		const busy = new Database(join(cliDir, "store.db"));
		busy.exec(
			"PRAGMA journal_mode=WAL; BEGIN IMMEDIATE; INSERT INTO meta VALUES('pending','busy');",
		);
		await expect(
			bridgeCursorSession(
				{ cwd, sessionId: id, from: "acp", cursorRoot: root },
				openDatabase,
			),
		).rejects.toThrow("cursor_target_store_busy");
		busy.exec("ROLLBACK");
		busy.close();
		await rm(acpDir, { recursive: true });
		await symlink(cliDir, acpDir);
		await expect(
			bridgeCursorSession(
				{ cwd, sessionId: id, from: "cli", cursorRoot: root },
				openDatabase,
			),
		).rejects.toThrow("cursor_store_symlink");
	});
});
