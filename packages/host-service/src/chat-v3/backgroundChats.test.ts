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
	sqlite.exec("PRAGMA foreign_keys = ON");
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

test("parking preserves the account, native chat, model and pending prompt payload", () => {
	const db = open();
	const paneData = {
		terminalId: "a",
		agentSurface: "acp",
		acpAccountSelection: "/profiles/work",
		acpAgentConfigId: "config",
		acpSessionId: "runtime-id",
		agent: { id: "claude", sessionId: "native-id" },
		model: { id: "sonnet" },
		pendingPrompt: [{ type: "text", text: "pending task" }],
	};
	parkChat(db, { ...chat("a"), paneData });
	expect(listParkedChats(db, "ws")[0]?.paneData).toEqual(paneData);
});
test("the background limit belongs to each workspace independently", () => {
	const db = open();
	db.insert(schema.workspaces)
		.values({
			id: "other",
			worktreePath: "/other",
			branch: "main",
			type: "session",
		})
		.run();
	parkChat(db, { ...chat("other-pane"), workspaceId: "other" }, 1, 1);
	parkChat(db, chat("a"), 2, 1);
	parkChat(db, chat("b"), 3, 1);
	expect(listParkedChats(db, "other").map((row) => row.terminalId)).toEqual([
		"other-pane",
	]);
	expect(listParkedChats(db, "ws").map((row) => row.terminalId)).toEqual(["b"]);
});
test("deleting a workspace discards its parked panes without touching another workspace", () => {
	const db = open();
	db.insert(schema.workspaces)
		.values({
			id: "other",
			worktreePath: "/other",
			branch: "main",
			type: "session",
		})
		.run();
	parkChat(db, chat("a"));
	parkChat(db, { ...chat("b"), workspaceId: "other" });
	db.$client.prepare("DELETE FROM workspaces WHERE id = ?").run("ws");
	expect(listParkedChats(db, "ws")).toEqual([]);
	expect(listParkedChats(db, "other")).toHaveLength(1);
	unparkChat(db, "does-not-exist");
	expect(listParkedChats(db, "other")).toHaveLength(1);
});
