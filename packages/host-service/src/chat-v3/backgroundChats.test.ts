import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { HostDb } from "../db";
import { ensureForkTables } from "../db/fork-tables";
import * as schema from "../db/schema";
import { listParkedChats, parkChat, unparkChat } from "./backgroundChats";

const connections: Database[] = [];
afterEach(() => {
	for (const db of connections.splice(0)) db.close();
});

function open() {
	const sqlite = new Database(":memory:");
	connections.push(sqlite);
	const db = drizzle(sqlite, { schema });
	runMigrations(db, resolve(import.meta.dir, "../../drizzle"));
	ensureForkTables(sqlite);
	db.insert(schema.workspaces)
		.values({ id: "ws", worktreePath: "/poc", branch: "main", type: "session" })
		.run();
	return db as unknown as HostDb;
}

const chat = (terminalId: string) => ({
	terminalId,
	workspaceId: "ws",
	title: terminalId,
	paneData: { terminalId, agentSurface: "acp" },
});

describe("background chats", () => {
	test("lists newest first, replaces a re-parked chat and forgets an unparked one", () => {
		const db = open();
		parkChat(db, chat("a"), 1);
		parkChat(db, chat("b"), 2);
		parkChat(db, chat("a"), 3);
		expect(listParkedChats(db, "ws").map((row) => row.terminalId)).toEqual([
			"a",
			"b",
		]);
		unparkChat(db, "a");
		expect(listParkedChats(db, "ws").map((row) => row.terminalId)).toEqual([
			"b",
		]);
	});

	test("returns the oldest chats past the limit", () => {
		const db = open();
		parkChat(db, chat("a"), 1, 2);
		parkChat(db, chat("b"), 2, 2);
		const evicted = parkChat(db, chat("c"), 3, 2);
		expect(evicted.map((row) => row.terminalId)).toEqual(["a"]);
		expect(listParkedChats(db, "ws").map((row) => row.terminalId)).toEqual([
			"c",
			"b",
		]);
	});
});
